const YEAR_SEQUENCE = [
  "A", "B", "C", "D", "E", "F", "G", "H", "J", "K", "L", "M", "N", "P", "R", "S", "T", "V", "W", "X", "Y",
  "1", "2", "3", "4", "5", "6", "7", "8", "9",
];

const WMI = {
  WP0: { manufacturer: "Dr. Ing. h.c. F. Porsche AG", origin: "Germany", vehicleType: "Passenger car" },
  WP1: { manufacturer: "Dr. Ing. h.c. F. Porsche AG", origin: "Germany", vehicleType: "Multipurpose passenger vehicle" },
};

const FAMILIES = {
  "99": { model: "911", validFrom: 1998 },
  "98": { model: "718", label: "Boxster / Cayman", validFrom: 1997 },
  "97": { model: "Panamera", validFrom: 2010 },
  Y1: { model: "Taycan", validFrom: 2020 },
  "9Y": { model: "Cayenne", validFrom: 2018 },
  "92": { model: "Cayenne", validFrom: 2003 },
  "95": { model: "Macan", validFrom: 2014 },
  "96": { model: "911", label: "911 Carrera", validFrom: 1989, validTo: 1994 },
  "91": { model: "911", validFrom: 1980, validTo: 1989 },
};

const PLANTS = {
  S: { city: "Stuttgart-Zuffenhausen", country: "Germany" },
  K: { city: "Osnabrück", country: "Germany" },
  L: { city: "Leipzig", country: "Germany" },
  N: { city: "Neckarsulm", country: "Germany" },
};

function candidateYears(code, currentYear = new Date().getFullYear()) {
  const offset = YEAR_SEQUENCE.indexOf(code);
  if (offset < 0) return [];

  const years = [];
  for (let year = 1980 + offset; year <= currentYear + 1; year += 30) years.push(year);
  return years;
}

function chooseYear(code, family, currentYear) {
  const candidates = candidateYears(code, currentYear);
  if (!candidates.length) return { year: null, candidates: [] };

  const compatible = family
    ? candidates.filter((year) => year >= family.validFrom && (!family.validTo || year <= family.validTo))
    : candidates;

  const pool = compatible.length ? compatible : candidates;
  return { year: pool.at(-1), candidates };
}

function generationFor(model, year) {
  if (!year) return "Unknown generation";

  if (model === "911") {
    if (year >= 2019) return "992 generation";
    if (year >= 2012) return "991 generation";
    if (year >= 2005) return "997 generation";
    if (year >= 1998) return "996 generation";
    if (year >= 1994) return "993 generation";
    if (year >= 1989) return "964 generation";
    return "G-series";
  }
  if (model === "718") {
    if (year >= 2017) return "982 generation";
    if (year >= 2013) return "981 generation";
    if (year >= 2005) return "987 generation";
    return "986 generation";
  }
  if (model === "Panamera") return year >= 2024 ? "Third generation" : year >= 2017 ? "971 generation" : "970 generation";
  if (model === "Cayenne") return year >= 2018 ? "E3 generation" : year >= 2011 ? "E2 generation" : "E1 generation";
  if (model === "Macan") return "95B generation";
  if (model === "Taycan") return "J1 platform";
  return "Porsche model family";
}

export function normalizeVin(value = "") {
  return String(value).toUpperCase().replace(/[\s-]/g, "");
}

export function validateVin(value) {
  const vin = normalizeVin(value);
  if (!vin) return { valid: false, vin, error: "Enter a VIN to begin." };
  if (vin.length !== 17) return { valid: false, vin, error: `A VIN needs exactly 17 characters. You have ${vin.length}.` };
  if (/[^A-HJ-NPR-Z0-9]/.test(vin)) return { valid: false, vin, error: "VINs cannot contain I, O, Q, or special characters." };
  if (!WMI[vin.slice(0, 3)]) return { valid: false, vin, error: "That VIN does not begin with a recognized Porsche manufacturer code (WP0 or WP1)." };
  return { valid: true, vin, error: "" };
}

export function decodeVin(value, options = {}) {
  const validation = validateVin(value);
  if (!validation.valid) return validation;

  const vin = validation.vin;
  const wmiCode = vin.slice(0, 3);
  const marketCode = vin.slice(3, 6);
  const familyCode = vin.slice(6, 8);
  const checkOrMarket = vin[8];
  const yearCode = vin[9];
  const plantCode = vin[10];
  const serial = vin.slice(11);
  const wmi = WMI[wmiCode];
  const family = FAMILIES[familyCode] ?? { model: "Porsche", label: "Unmapped model family", validFrom: 1980 };
  const yearResult = chooseYear(yearCode, family, options.currentYear);
  const plant = PLANTS[plantCode] ?? { city: "Unmapped Porsche plant", country: wmi.origin };
  const isRestOfWorld = marketCode === "ZZZ" || checkOrMarket === "Z";
  const generation = generationFor(family.model, yearResult.year);
  const olderCandidates = yearResult.candidates.filter((year) => year !== yearResult.year);

  const segments = [
    { value: wmiCode, positions: "1–3", label: "Manufacturer", meaning: `${wmiCode} · Porsche AG` },
    { value: marketCode, positions: "4–6", label: "Market descriptor", meaning: isRestOfWorld ? "ZZZ · Rest-of-world filler" : `${marketCode} · Vehicle descriptor` },
    { value: familyCode, positions: "7–8", label: "Model family", meaning: `${familyCode} · ${family.label ?? family.model}` },
    { value: checkOrMarket, positions: "9", label: isRestOfWorld ? "Market filler" : "Check digit", meaning: isRestOfWorld ? `${checkOrMarket} · RoW format` : `${checkOrMarket} · Validation character` },
    { value: yearCode, positions: "10", label: "Model year", meaning: `${yearCode} · ${yearResult.year ?? "Unknown"}` },
    { value: plantCode, positions: "11", label: "Assembly plant", meaning: `${plantCode} · ${plant.city}` },
    { value: serial, positions: "12–17", label: "Production serial", meaning: serial },
  ];

  return {
    valid: true,
    vin,
    manufacturer: wmi.manufacturer,
    origin: wmi.origin,
    vehicleType: wmi.vehicleType,
    model: family.model,
    familyLabel: family.label ?? family.model,
    generation,
    year: yearResult.year,
    yearCode,
    yearCandidates: yearResult.candidates,
    olderYearCandidates: olderCandidates,
    plant: plant.city,
    plantCountry: plant.country,
    serial,
    wmiCode,
    familyCode,
    market: isRestOfWorld ? "Rest of world" : "North America / regulated",
    marketCode,
    checkOrMarket,
    segments,
    confidence: FAMILIES[familyCode] ? "Chassis match" : "Partial match",
  };
}

export { candidateYears, generationFor };
