import { validateVin } from "../src/decoder.js";
import { normalizeMarketCheck } from "./_lib/marketcheck.js";
import { normalizeOneAuto } from "./_lib/oneauto.js";

const REQUEST_TIMEOUT_MS = 12_000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 12;
const recentRequests = new Map();

function send(res, status, body, cache = false) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (cache) {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Vercel-CDN-Cache-Control", "public, s-maxage=2592000, stale-while-revalidate=86400");
  } else {
    res.setHeader("Cache-Control", "no-store");
  }
  res.end(JSON.stringify(body));
}

function clientIp(req) {
  return String(req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress || "unknown")
    .split(",")[0]
    .trim();
}

function isRateLimited(req) {
  const now = Date.now();
  const key = clientIp(req);
  const active = (recentRequests.get(key) || []).filter((time) => now - time < RATE_WINDOW_MS);
  active.push(now);
  recentRequests.set(key, active);

  if (recentRequests.size > 1_000) {
    for (const [ip, entries] of recentRequests) {
      if (!entries.some((time) => now - time < RATE_WINDOW_MS)) recentRequests.delete(ip);
    }
  }
  return active.length > RATE_LIMIT;
}

function providerFailure(status) {
  if (status === 400 || status === 422) {
    return { status: 404, code: "build_record_not_found", message: "No VIN-level factory build record was found." };
  }
  if (status === 429) {
    return { status: 503, code: "provider_rate_limited", message: "The build-record service is busy. Try again shortly." };
  }
  if (status === 401 || status === 403) {
    return { status: 502, code: "provider_auth_error", message: "The build-record service is not available right now." };
  }
  return { status: 502, code: "provider_error", message: "The build-record service could not complete this decode." };
}

async function requestJson(url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      headers: { Accept: "application/json", ...options.headers },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return { error: providerFailure(response.status) };
    return { data: await response.json() };
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    return {
      error: {
        status: 502,
        code: timedOut ? "provider_timeout" : "provider_error",
        message: timedOut
          ? "The build-record service took too long to respond."
          : "The build-record service could not complete this decode.",
      },
    };
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return send(res, 405, { error: { code: "method_not_allowed", message: "Use GET for this endpoint." } });
  }

  const validation = validateVin(req.query?.vin);
  if (!validation.valid) {
    return send(res, 400, { error: { code: "invalid_vin", message: validation.error } });
  }

  if (isRateLimited(req)) {
    res.setHeader("Retry-After", "60");
    return send(res, 429, { error: { code: "rate_limited", message: "Too many advanced decodes. Try again in one minute." } });
  }

  const marketCheckKey = process.env.MARKETCHECK_API_KEY;
  const oneAutoKey = process.env.ONEAUTO_API_KEY;
  if (!marketCheckKey && !oneAutoKey) {
    return send(res, 503, {
      error: {
        code: "provider_not_configured",
        message: "Advanced factory build records are not connected yet.",
      },
    });
  }

  let lastFailure;

  if (marketCheckKey) {
    const endpoint = new URL(
      `https://api.marketcheck.com/v2/decode/car/neovin/${encodeURIComponent(validation.vin)}/specs`,
    );
    endpoint.searchParams.set("api_key", marketCheckKey);
    endpoint.searchParams.set("include_generic", "true");
    const result = await requestJson(endpoint);
    if (result.data) {
      const normalized = normalizeMarketCheck(result.data);
      if (normalized.summary.hasBuildRecord) return send(res, 200, { data: normalized }, true);
      lastFailure = {
        status: 404,
        code: "build_record_incomplete",
        message: "The provider decoded the vehicle, but did not return VIN-specific factory options or colors.",
      };
    } else {
      lastFailure = result.error;
    }
  }

  if (oneAutoKey) {
    const endpoint = new URL("https://api.oneautoapi.com/oneauto/oebuildsheetfromvin");
    endpoint.searchParams.set("vehicle_identification_number", validation.vin);
    const result = await requestJson(endpoint, { headers: { "x-api-key": oneAutoKey } });
    if (result.data) {
      const normalized = normalizeOneAuto(result.data, validation.vin);
      if (normalized.summary.hasBuildRecord) return send(res, 200, { data: normalized }, true);
      lastFailure = {
        status: 404,
        code: "build_record_incomplete",
        message: "The global build-sheet provider did not return fitted options for this VIN.",
      };
    } else {
      lastFailure = result.error;
    }
  }

  const failure = lastFailure || providerFailure(502);
  return send(res, failure.status, { error: { code: failure.code, message: failure.message } });
}
