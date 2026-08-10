import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/advanced-decode.js";
import { normalizeMarketCheck, numberFrom } from "../api/_lib/marketcheck.js";
import { normalizeOneAuto } from "../api/_lib/oneauto.js";

const providerFixture = {
  vin: "WP0ZZZ99ZMS216267",
  year: 2021,
  make: "Porsche",
  model: "911",
  trim: "Carrera 4S",
  trim_confidence: "high",
  version: "992",
  engine: "3.0L Twin-Turbo H6",
  transmission_description: "8-speed PDK",
  drivetrain: "AWD",
  exterior_color: { code: "M7S", name: "Agate Grey Metallic", base: "Gray", confidence: "high", msrp: "840" },
  interior_color: { code: "KA", name: "Black leather", base: "Black", confidence: "high" },
  msrp: 120600,
  installed_options_msrp: "$18,950",
  delivery_charges: "1,350",
  combined_msrp: 140900,
  options_packages: "Premium Package | Sport Chrono Package",
  installed_options_details: [
    { code: "0I2", name: "Extended Range Fuel Tank", msrp: "230", type: "option", confidence: "high", verified: true },
    {
      code: "8LH",
      name: "Sport Chrono Package",
      msrp: "$2,790",
      type: "package",
      confidence: "medium",
      verified: false,
      rule: "OEM sticker",
      option_package_equipment: [{ category: "Performance", item: "Mode switch", attribute: "Drive modes", value: "Sport Plus", type: "Optional" }],
    },
  ],
  available_options_details: [
    { code: "NOT-INSTALLED", name: "Catalog-only option", msrp: "999", type: "option" },
  ],
  high_value_features: {
    performance: [{ category: "Performance", description: "Rear axle steering" }],
  },
  features: {
    comfort: [{ category: "Comfort", feature_type: "Interior", description: "Heated front seats" }],
  },
  installed_equipment: {
    wheels: [{ category: "Wheels", item: "Carrera S wheels", attribute: "Diameter", value: "20/21 inch", location: "Front/rear" }],
  },
  record_confidence: 0.94,
  record_source: "OEM sticker",
  updated_at_date: "2026-07-01",
};

test("normalizes VIN-level factory colors, pricing, options, and equipment", () => {
  const result = normalizeMarketCheck(providerFixture);

  assert.equal(result.vin, "WP0ZZZ99ZMS216267");
  assert.equal(result.colors.exterior.name, "Agate Grey Metallic");
  assert.equal(result.colors.exterior.price, 840);
  assert.equal(result.colors.interior.code, "KA");
  assert.equal(result.pricing.optionsMsrp, 18950);
  assert.equal(result.pricing.combinedMsrp, 140900);
  assert.deepEqual(result.packages, ["Premium Package", "Sport Chrono Package"]);
  assert.equal(result.installedOptions.length, 2);
  assert.equal(result.installedOptions[0].verified, true);
  assert.equal(result.installedOptions[1].price, 2790);
  assert.equal(result.installedOptions[1].equipment[0].item, "Mode switch");
  assert.equal(result.highValueFeatures[0].description, "Rear axle steering");
  assert.equal(result.installedEquipment[0].value, "20/21 inch");
  assert.equal(result.summary.installedOptionCount, 2);
  assert.equal(result.summary.verifiedOptionCount, 1);
  assert.equal(result.summary.hasBuildRecord, true);
});

test("never promotes available catalog options to installed options", () => {
  const result = normalizeMarketCheck({
    vin: "WP0ZZZ99ZMS216267",
    available_options_details: providerFixture.available_options_details,
  });

  assert.deepEqual(result.installedOptions, []);
  assert.equal(result.summary.hasBuildRecord, false);
});

test("normalizes global Porsche OE build-sheet codes as installed options", () => {
  const result = normalizeOneAuto({
    success: true,
    result: {
      manufacturer_desc: "Porsche",
      model_desc: "911",
      derivative_desc: "Carrera 4S Coupe",
      options: [
        { factory_code: "8LH", factory_desc: "Sport Chrono Package" },
        { factory_code: "0I2", factory_desc: "Extended Range Fuel Tank" },
      ],
    },
  }, "WP0ZZZ99ZMS216267");

  assert.equal(result.provider, "One Auto API");
  assert.equal(result.vehicle.model, "911");
  assert.equal(result.installedOptions.length, 2);
  assert.equal(result.installedOptions[0].code, "8LH");
  assert.equal(result.summary.hasBuildRecord, true);
});

test("parses provider price strings without inventing missing values", () => {
  assert.equal(numberFrom("$12,345.50"), 12345.5);
  assert.equal(numberFrom(null), null);
  assert.equal(numberFrom("not stated"), null);
});

function mockResponse() {
  return {
    headers: new Map(),
    setHeader(name, value) { this.headers.set(name, value); },
    end(value) { this.body = JSON.parse(value); },
  };
}

test("advanced endpoint validates Porsche VINs before calling a provider", async () => {
  const response = mockResponse();
  await handler({ method: "GET", query: { vin: "NOT-A-VIN" }, headers: {}, socket: {} }, response);
  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error.code, "invalid_vin");
});

test("advanced endpoint reports missing provider configuration safely", async () => {
  const previous = process.env.MARKETCHECK_API_KEY;
  const previousOneAuto = process.env.ONEAUTO_API_KEY;
  delete process.env.MARKETCHECK_API_KEY;
  delete process.env.ONEAUTO_API_KEY;
  const response = mockResponse();
  await handler({
    method: "GET",
    query: { vin: "WP0ZZZ99ZMS216267" },
    headers: { "x-forwarded-for": "192.0.2.10" },
    socket: {},
  }, response);
  if (previous) process.env.MARKETCHECK_API_KEY = previous;
  if (previousOneAuto) process.env.ONEAUTO_API_KEY = previousOneAuto;

  assert.equal(response.statusCode, 503);
  assert.equal(response.body.error.code, "provider_not_configured");
  assert.doesNotMatch(JSON.stringify(response.body), /MARKETCHECK_API_KEY/);
});

test("advanced endpoint can use the global Porsche build-sheet fallback", async () => {
  const previousMarketCheck = process.env.MARKETCHECK_API_KEY;
  const previousOneAuto = process.env.ONEAUTO_API_KEY;
  const previousFetch = global.fetch;
  delete process.env.MARKETCHECK_API_KEY;
  process.env.ONEAUTO_API_KEY = "test-key";
  let requestedUrl;
  let requestedOptions;
  global.fetch = async (url, options) => {
    requestedUrl = new URL(url);
    requestedOptions = options;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        result: {
          manufacturer_desc: "Porsche",
          model_desc: "911",
          derivative_desc: "Carrera 4S Coupe",
          options: [{ factory_code: "8LH", factory_desc: "Sport Chrono Package" }],
        },
      }),
    };
  };

  const response = mockResponse();
  await handler({
    method: "GET",
    query: { vin: "WP0ZZZ99ZMS216267" },
    headers: { "x-forwarded-for": "192.0.2.11" },
    socket: {},
  }, response);

  global.fetch = previousFetch;
  if (previousMarketCheck) process.env.MARKETCHECK_API_KEY = previousMarketCheck;
  else delete process.env.MARKETCHECK_API_KEY;
  if (previousOneAuto) process.env.ONEAUTO_API_KEY = previousOneAuto;
  else delete process.env.ONEAUTO_API_KEY;

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.installedOptions[0].code, "8LH");
  assert.equal(requestedUrl.hostname, "api.oneautoapi.com");
  assert.equal(requestedUrl.searchParams.get("vehicle_identification_number"), "WP0ZZZ99ZMS216267");
  assert.equal(requestedOptions.headers["x-api-key"], "test-key");
});
