function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text && text.toLowerCase() !== "null" ? text : null;
}

function numberFrom(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const numeric = value.replace(/[^0-9.-]/g, "");
  if (!/[0-9]/.test(numeric)) return null;
  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : null;
}

function colorFrom(value) {
  if (!value || typeof value !== "object") return null;
  const color = {
    name: cleanText(value.name),
    code: cleanText(value.code),
    base: cleanText(value.base),
    confidence: cleanText(value.confidence),
    price: numberFrom(value.msrp),
  };
  return color.name || color.code ? color : null;
}

function arrayFrom(value) {
  if (Array.isArray(value)) return value;
  if (!cleanText(value)) return [];
  return String(value)
    .split(/\s*[|;,]\s*/)
    .map(cleanText)
    .filter(Boolean);
}

function mapInstalledOptions(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((option) => ({
      code: cleanText(option?.code),
      name: cleanText(option?.name),
      price: numberFrom(option?.msrp),
      salePrice: numberFrom(option?.sale_price),
      type: cleanText(option?.type),
      confidence: cleanText(option?.confidence),
      verified: option?.verified === true,
      rule: cleanText(option?.rule),
      equipment: Array.isArray(option?.option_package_equipment)
        ? option.option_package_equipment.map((equipment) => ({
          category: cleanText(equipment?.category),
          item: cleanText(equipment?.item),
          attribute: cleanText(equipment?.attribute),
          location: cleanText(equipment?.location),
          value: cleanText(equipment?.value),
          type: cleanText(equipment?.type),
        })).filter((equipment) => equipment.item || equipment.value)
        : [],
    }))
    .filter((option) => option.name || option.code);
}

function flattenRecord(value, mapper) {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([group, items]) => {
    if (!Array.isArray(items)) return [];
    return items.map((item) => mapper(group, item)).filter(Boolean);
  });
}

function mapFeatures(value) {
  return flattenRecord(value, (group, feature) => {
    const description = cleanText(feature?.description);
    if (!description) return null;
    return {
      group: cleanText(group),
      category: cleanText(feature?.category),
      type: cleanText(feature?.feature_type),
      status: cleanText(feature?.type),
      description,
    };
  });
}

function mapEquipment(value) {
  return flattenRecord(value, (group, equipment) => {
    const item = cleanText(equipment?.item);
    const valueText = cleanText(equipment?.value);
    if (!item && !valueText) return null;
    return {
      group: cleanText(group),
      category: cleanText(equipment?.category),
      item,
      attribute: cleanText(equipment?.attribute),
      location: cleanText(equipment?.location),
      value: valueText,
      type: cleanText(equipment?.type),
    };
  });
}

function confidenceFrom(value) {
  const number = numberFrom(value);
  if (number === null) return null;
  return Math.max(0, Math.min(number > 1 ? number / 100 : number, 1));
}

export function normalizeMarketCheck(data = {}) {
  const installedOptions = mapInstalledOptions(data.installed_options_details);
  const features = mapFeatures(data.features);
  const highValueFeatures = mapFeatures(data.high_value_features);
  const installedEquipment = mapEquipment(data.installed_equipment);
  const exterior = colorFrom(data.exterior_color);
  const interior = colorFrom(data.interior_color);

  const result = {
    vin: cleanText(data.vin),
    provider: "MarketCheck NeoVIN",
    source: cleanText(data.record_source) || "MarketCheck NeoVIN",
    recordConfidence: confidenceFrom(data.record_confidence),
    updatedAt: cleanText(data.updated_at_date),
    vehicle: {
      year: numberFrom(data.year),
      make: cleanText(data.make),
      model: cleanText(data.model),
      trim: cleanText(data.trim),
      trimConfidence: cleanText(data.trim_confidence),
      version: cleanText(data.version),
      versionConfidence: cleanText(data.version_confidence),
      bodyType: cleanText(data.body_type),
      engine: cleanText(data.engine),
      transmission: cleanText(data.transmission_description) || cleanText(data.transmission),
      transmissionConfidence: cleanText(data.transmission_confidence),
      drivetrain: cleanText(data.drivetrain),
      fuelType: cleanText(data.fuel_type),
    },
    colors: { exterior, interior },
    pricing: {
      currency: /^[A-Z]{3}$/.test(String(data.currency || "").toUpperCase())
        ? String(data.currency).toUpperCase()
        : "USD",
      baseMsrp: numberFrom(data.msrp),
      optionsMsrp: numberFrom(data.installed_options_msrp),
      delivery: numberFrom(data.delivery_charges),
      combinedMsrp: numberFrom(data.combined_msrp),
      label: cleanText(data.msrp_label),
      taxes: Array.isArray(data.taxes)
        ? data.taxes.map((tax) => ({ name: cleanText(tax?.name), amount: numberFrom(tax?.amount) })).filter((tax) => tax.name || tax.amount !== null)
        : [],
      discounts: Array.isArray(data.discounts)
        ? data.discounts.map((discount) => ({ name: cleanText(discount?.name), amount: numberFrom(discount?.amount) })).filter((discount) => discount.name || discount.amount !== null)
        : [],
    },
    packages: arrayFrom(data.options_packages),
    installedOptions,
    features,
    highValueFeatures,
    installedEquipment,
  };

  result.summary = {
    installedOptionCount: installedOptions.length,
    verifiedOptionCount: installedOptions.filter((option) => option.verified).length,
    hasColors: Boolean(exterior || interior),
    hasPricing: [
      result.pricing.baseMsrp,
      result.pricing.optionsMsrp,
      result.pricing.delivery,
      result.pricing.combinedMsrp,
    ].some((value) => value !== null) || result.pricing.taxes.length > 0 || result.pricing.discounts.length > 0,
    hasBuildRecord: Boolean(
      installedOptions.length ||
        result.packages.length ||
        exterior ||
        interior ||
        result.pricing.optionsMsrp !== null ||
        result.pricing.combinedMsrp !== null,
    ),
  };

  return result;
}

export { numberFrom };
