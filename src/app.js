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

const vinFromUrl = new URLSearchParams(window.location.search).get("vin");
if (vinFromUrl) input.value = normalizeVin(vinFromUrl);
updateInputState();
submitVin({ scroll: false });
