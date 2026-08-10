function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text && text.toLowerCase() !== "null" ? text : null;
}

export function normalizeOneAuto(data = {}, vin) {
  const record = data.result && typeof data.result === "object" ? data.result : data;
  const installedOptions = Array.isArray(record.options)
    ? record.options.map((option) => ({
      code: cleanText(option?.factory_code),
      name: cleanText(option?.factory_desc),
      price: null,
      salePrice: null,
      type: /package/i.test(String(option?.factory_desc || "")) ? "package" : "option",
      confidence: "Factory record",
      verified: false,
      rule: "OE build sheet",
      equipment: [],
    })).filter((option) => option.code || option.name)
    : [];

  const result = {
    vin: cleanText(record.vin) || cleanText(vin),
    provider: "One Auto API",
    source: "Global OE build sheet",
    recordConfidence: null,
    updatedAt: null,
    vehicle: {
      year: null,
      make: cleanText(record.manufacturer_desc),
      model: cleanText(record.model_desc),
      trim: cleanText(record.derivative_desc),
      trimConfidence: null,
      version: null,
      versionConfidence: null,
      bodyType: null,
      engine: null,
      transmission: null,
      transmissionConfidence: null,
      drivetrain: null,
      fuelType: null,
    },
    colors: { exterior: null, interior: null },
    pricing: {
      currency: "USD",
      baseMsrp: null,
      optionsMsrp: null,
      delivery: null,
      combinedMsrp: null,
      label: null,
      taxes: [],
      discounts: [],
    },
    packages: installedOptions.filter((option) => option.type === "package").map((option) => option.name).filter(Boolean),
    installedOptions,
    features: [],
    highValueFeatures: [],
    installedEquipment: [],
  };

  result.summary = {
    installedOptionCount: installedOptions.length,
    verifiedOptionCount: 0,
    hasColors: false,
    hasPricing: false,
    hasBuildRecord: installedOptions.length > 0,
  };

  return result;
}
