import "./styles.css";
import { decodeVin, normalizeVin } from "./decoder.js";

const $ = (selector) => document.querySelector(selector);
const form = $("#decode-form");
const input = $("#vin-input");
const resultSection = $("#result");
const errorElement = $("#vin-error");
const inputShell = $("#input-shell");
const charCount = $("#char-count");
const toast = $("#toast");
let currentResult = null;
let toastTimer;
let factoryRequest;

function setText(selector, value) {
  $(selector).textContent = value;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2400);
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const helper = document.createElement("textarea");
  helper.value = value;
  helper.setAttribute("readonly", "");
  helper.style.position = "fixed";
  helper.style.opacity = "0";
  document.body.append(helper);
  helper.select();
  document.execCommand("copy");
  helper.remove();
}

function updateInputState() {
  const clean = normalizeVin(input.value);
  if (input.value !== clean) input.value = clean;
  charCount.textContent = `${clean.length}/17`;
  charCount.classList.toggle("is-complete", clean.length === 17);
  if (errorElement.textContent) {
    errorElement.textContent = "";
    inputShell.classList.remove("has-error");
    input.removeAttribute("aria-invalid");
  }
}

function buildVinStrip(data) {
  const strip = $("#vin-strip");
  const legend = $("#segment-legend");
  strip.replaceChildren();
  legend.replaceChildren();

  data.segments.forEach((segment, index) => {
    const group = document.createElement("div");
    group.className = `vin-segment segment-${index + 1}`;
    group.style.setProperty("--length", segment.value.length);
    group.innerHTML = `<span>${segment.value}</span><small>${segment.positions}</small>`;
    strip.append(group);

    const item = document.createElement("div");
    item.className = `legend-item segment-${index + 1}`;
    item.innerHTML = `<span class="legend-number">${String(index + 1).padStart(2, "0")}</span><div><strong>${segment.label}</strong><p>${segment.meaning}</p></div>`;
    legend.append(item);
  });
}

function buildDetails(data) {
  const details = [
    ["Manufacturer", "Porsche AG", data.manufacturer],
    ["Model family", data.model, `Chassis identifier ${data.familyCode}`],
    ["Model year", String(data.year ?? "Unknown"), `Year code ${data.yearCode}`],
    ["Generation", data.generation, "Inferred from family + year"],
    ["Assembly plant", data.plant, `${data.plantCountry} · Plant code ${data.vin[10]}`],
    ["Vehicle class", data.vehicleType, `Manufacturer code ${data.wmiCode}`],
    ["Market format", data.market, data.marketCode === "ZZZ" ? "ZZZ filler used on European / RoW VINs" : `Descriptor ${data.marketCode}`],
    ["Production serial", data.serial, "Sequential production identifier"],
  ];

  const grid = $("#detail-grid");
  grid.replaceChildren();
  details.forEach(([label, value, note]) => {
    const item = document.createElement("div");
    item.className = "detail-item";
    item.innerHTML = `<dt>${label}</dt><dd>${value}</dd><span>${note}</span>`;
    grid.append(item);
  });
}

const COLOR_SWATCHES = {
  black: "#151515",
  white: "#f4f2e9",
  silver: "#aaaeb0",
  gray: "#777b7c",
  grey: "#777b7c",
  red: "#9f2426",
  blue: "#285080",
  green: "#415c43",
  yellow: "#e7ca39",
  orange: "#d8662e",
  brown: "#614b3f",
  beige: "#c9b999",
  gold: "#ad8b47",
  purple: "#5e456c",
};

function cleanLabel(value) {
  return value ? String(value).replaceAll("_", " ") : "—";
}

function titleCase(value) {
  return cleanLabel(value).replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function confidenceLabel(value) {
  if (typeof value === "number") return `${Math.round(value * 100)}% record confidence`;
  return value ? `${titleCase(value)} confidence` : "Confidence not stated";
}

function money(value, currency = "USD") {
  if (typeof value !== "number") return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return value.toLocaleString("en-US");
  }
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function showFactoryState(state, error = {}) {
  const section = $("#factory-build");
  const loading = $("#factory-loading");
  const unavailable = $("#factory-unavailable");
  const content = $("#factory-content");
  loading.hidden = state !== "loading";
  unavailable.hidden = state !== "unavailable";
  content.hidden = state !== "content";
  section.setAttribute("aria-busy", state === "loading" ? "true" : "false");

  if (state === "unavailable") {
    const notConfigured = error.code === "provider_not_configured";
    const notFound = ["build_record_not_found", "build_record_incomplete"].includes(error.code);
    $("#factory-error-title").textContent = notConfigured
      ? "Advanced build data is being connected"
      : notFound
        ? "No VIN-specific build record found"
        : "Factory build record unavailable";
    $("#factory-error-message").textContent = error.message ||
      "The provider could not return factory configuration data. The basic VIN decode above remains valid.";
    $("#factory-retry").hidden = notConfigured || notFound;
  }
}

function buildIdentity(data) {
  const values = [
    ["Factory trim", data.vehicle.trim, data.vehicle.trimConfidence],
    ["Version", data.vehicle.version, data.vehicle.versionConfidence],
    ["Engine", data.vehicle.engine],
    ["Transmission", data.vehicle.transmission, data.vehicle.transmissionConfidence],
    ["Drivetrain", data.vehicle.drivetrain],
    ["Body", data.vehicle.bodyType],
  ].filter(([, value]) => value);
  const grid = $("#build-identity");
  grid.replaceChildren();
  values.forEach(([label, value, confidence]) => {
    const item = element("div", "build-identity-item");
    item.append(element("span", "", label), element("strong", "", value));
    if (confidence) item.append(element("small", "", `${titleCase(confidence)} confidence`));
    grid.append(item);
  });
  grid.hidden = values.length === 0;
}

function swatchFor(color) {
  const searchable = `${color?.base || ""} ${color?.name || ""}`.toLowerCase();
  const match = Object.keys(COLOR_SWATCHES).find((name) => searchable.includes(name));
  return COLOR_SWATCHES[match] || "#b8b8b1";
}

function buildColors(data) {
  const colors = [
    ["Exterior paint", data.colors.exterior],
    ["Interior", data.colors.interior],
  ];
  const grid = $("#color-grid");
  grid.replaceChildren();
  colors.forEach(([label, color]) => {
    const card = element("div", `color-card${color ? "" : " is-empty"}`);
    const swatch = element("span", "color-swatch");
    swatch.style.setProperty("--swatch", color ? swatchFor(color) : "transparent");
    const copy = element("div", "color-copy");
    copy.append(element("span", "color-label", label));
    copy.append(element("strong", "", color?.name || "Not returned"));
    const meta = [color?.code ? `Code ${color.code}` : null, color?.base, typeof color?.price === "number" ? money(color.price, data.pricing.currency) : null, color?.confidence ? `${titleCase(color.confidence)} confidence` : null]
      .filter(Boolean)
      .join(" · ");
    if (meta) copy.append(element("small", "", meta));
    card.append(swatch, copy);
    grid.append(card);
  });
}

function buildPricing(data) {
  const { pricing } = data;
  const prices = [
    ["Base MSRP", pricing.baseMsrp],
    ["Added options", pricing.optionsMsrp],
    ["Delivery", pricing.delivery],
    ...pricing.taxes.map((tax) => [tax.name || "Tax", tax.amount]),
    ...pricing.discounts.map((discount) => [discount.name || "Discount", discount.amount]),
    ["Total MSRP", pricing.combinedMsrp],
  ];
  const grid = $("#price-grid");
  grid.replaceChildren();
  prices.forEach(([label, value], index) => {
    const item = element("div", index === prices.length - 1 ? "price-item price-total" : "price-item");
    item.append(element("dt", "", label), element("dd", "", money(value, pricing.currency)));
    grid.append(item);
  });
  $("#pricing-section").hidden = !data.summary.hasPricing;
}

function buildOptions(data) {
  const packages = $("#package-list");
  packages.replaceChildren();
  data.packages.forEach((name) => {
    const badge = element("span", "package-badge");
    badge.append(element("small", "", "Package"), document.createTextNode(name));
    packages.append(badge);
  });
  packages.hidden = data.packages.length === 0;

  const body = $("#options-body");
  body.replaceChildren();
  data.installedOptions.forEach((option) => {
    const row = document.createElement("tr");
    const codeCell = element("td", "option-code", option.code || "—");
    codeCell.dataset.label = "Code";
    const nameCell = element("td", "option-name", option.name || "Unnamed option");
    nameCell.dataset.label = "Factory option";
    if (option.rule) nameCell.append(element("small", "", option.rule));
    if (option.equipment?.length) {
      const included = element("ul", "option-includes");
      option.equipment.forEach((equipment) => {
        const description = [equipment.item, equipment.attribute, equipment.value, equipment.location].filter(Boolean).join(" · ");
        included.append(element("li", "", description));
      });
      nameCell.append(included);
    }
    const typeCell = element("td", "", option.type ? titleCase(option.type) : "—");
    typeCell.dataset.label = "Type";
    const priceCell = element("td", "option-price", money(option.price, data.pricing.currency));
    priceCell.dataset.label = "MSRP";
    const evidence = option.verified ? "Verified" : option.confidence ? titleCase(option.confidence) : "Provider match";
    const evidenceCell = element("td", option.verified ? "evidence verified" : "evidence", evidence);
    evidenceCell.dataset.label = "Evidence";
    row.append(codeCell, nameCell, typeCell, priceCell, evidenceCell);
    body.append(row);
  });

  $("#option-count").textContent = `${data.summary.installedOptionCount} installed option${data.summary.installedOptionCount === 1 ? "" : "s"}`;
  $("#empty-options").hidden = data.installedOptions.length !== 0;
  $(".options-table-wrap").hidden = data.installedOptions.length === 0;
}

function buildEquipment(data) {
  const groups = new Map();
  const add = (group, description, kind) => {
    if (!description) return;
    const key = group || "Other equipment";
    if (!groups.has(key)) groups.set(key, []);
    const uniqueKey = description.toLowerCase();
    if (!groups.get(key).some((item) => item.uniqueKey === uniqueKey)) {
      groups.get(key).push({ description, kind, uniqueKey });
    }
  };

  data.highValueFeatures.forEach((feature) => add(feature.category || feature.group, feature.description, "Highlight"));
  data.features.forEach((feature) => add(feature.category || feature.group, feature.description, feature.status || feature.type));
  data.installedEquipment.forEach((equipment) => {
    const detail = [equipment.item, equipment.attribute, equipment.value, equipment.location].filter(Boolean).join(" · ");
    add(equipment.category || equipment.group, detail, equipment.type || "Equipment");
  });

  const container = $("#equipment-groups");
  container.replaceChildren();
  for (const [group, items] of groups) {
    const details = element("details", "equipment-group");
    const summary = document.createElement("summary");
    summary.append(element("strong", "", titleCase(group)), element("span", "", `${items.length} item${items.length === 1 ? "" : "s"}`));
    const list = element("ul", "");
    items.forEach((item) => {
      const row = document.createElement("li");
      row.append(element("span", "", item.description));
      if (item.kind) row.append(element("small", "", titleCase(item.kind)));
      list.append(row);
    });
    details.append(summary, list);
    container.append(details);
  }
  $("#equipment-section").hidden = groups.size === 0;
}

function renderFactoryBuild(data) {
  $("#factory-source").textContent = data.source || data.provider;
  $("#factory-confidence").textContent = confidenceLabel(data.recordConfidence);
  buildIdentity(data);
  buildColors(data);
  buildPricing(data);
  buildOptions(data);
  buildEquipment(data);
  showFactoryState("content");
}

async function loadFactoryBuild(vin) {
  factoryRequest?.abort();
  factoryRequest = new AbortController();
  const request = factoryRequest;
  showFactoryState("loading");

  try {
    const url = new URL("/api/advanced-decode", window.location.origin);
    url.searchParams.set("vin", vin);
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: request.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(payload.error?.message), payload.error || {});
    if (request !== factoryRequest) return;
    renderFactoryBuild(payload.data);
  } catch (error) {
    if (error.name === "AbortError" || request !== factoryRequest) return;
    showFactoryState("unavailable", error);
  }
}

function renderResult(data, { scroll = true } = {}) {
  currentResult = data;
  setText("#result-year", data.year ?? "Unknown");
  setText("#result-model", data.model);
  setText("#result-generation", data.generation);
  setText("#result-plant", data.plant);
  setText("#confidence-label", data.confidence);
  setText("#stat-year", data.year ?? "—");
  setText("#stat-chassis", data.familyCode);
  setText("#stat-serial", data.serial);
  setText("#stat-market", data.market === "Rest of world" ? "RoW" : "NA");
  setText("#note-year", data.year ?? "this year");

  const alternatives = data.olderYearCandidates.length
    ? `The same letter also appears in ${data.olderYearCandidates.join(" and ")}. `
    : "";
  setText(
    "#year-explanation",
    `VIN year codes repeat every 30 years. ${alternatives}The ${data.familyCode} model-family identifier was introduced later, so ${data.year} is the compatible model year for this chassis.`,
  );

  const mark = $(".note-mark");
  mark.textContent = data.yearCode;
  buildVinStrip(data);
  buildDetails(data);
  loadFactoryBuild(data.vin);
  resultSection.hidden = false;
  // Force a layout pass before the visible state is applied. This keeps deep-linked
  // VIN results visible even when the page is restored or rendered offscreen.
  void resultSection.offsetWidth;
  resultSection.classList.add("is-visible");

  const url = new URL(window.location.href);
  url.searchParams.set("vin", data.vin);
  window.history.replaceState({}, "", url);
  document.title = `${data.year} Porsche ${data.model} · ${data.vin} | VIN/17`;

  if (scroll) requestAnimationFrame(() => resultSection.scrollIntoView({ behavior: "smooth", block: "start" }));
}

function submitVin({ scroll = true } = {}) {
  const data = decodeVin(input.value);
  if (!data.valid) {
    errorElement.textContent = data.error;
    inputShell.classList.add("has-error");
    input.setAttribute("aria-invalid", "true");
    input.focus();
    return;
  }
  input.value = data.vin;
  updateInputState();
  renderResult(data, { scroll });
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  submitVin();
});
input.addEventListener("input", updateInputState);

$("#copy-button").addEventListener("click", async () => {
  if (!currentResult) return;
  try {
    await copyText(currentResult.vin);
    showToast("VIN copied to clipboard");
  } catch {
    showToast("Copy is unavailable in this browser");
  }
});

$("#share-button").addEventListener("click", async () => {
  if (!currentResult) return;
  const shareData = {
    title: `${currentResult.year} Porsche ${currentResult.model} VIN decode`,
    text: `${currentResult.year} Porsche ${currentResult.model} (${currentResult.generation})`,
    url: window.location.href,
  };
  if (navigator.share) {
    try { await navigator.share(shareData); } catch (error) { if (error.name !== "AbortError") showToast("Could not open sharing"); }
  } else {
    try {
      await copyText(window.location.href);
      showToast("Result link copied");
    } catch {
      showToast("Copy is unavailable in this browser");
    }
  }
});

$("#decode-another").addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
  setTimeout(() => { input.focus(); input.select(); }, 450);
});

$("#factory-retry").addEventListener("click", () => {
  if (currentResult) loadFactoryBuild(currentResult.vin);
});

const vinFromUrl = new URLSearchParams(window.location.search).get("vin");
if (vinFromUrl) input.value = normalizeVin(vinFromUrl);
updateInputState();
submitVin({ scroll: false });
