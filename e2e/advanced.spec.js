import { expect, test } from "@playwright/test";

const factoryRecord = {
  data: {
    vin: "WP0ZZZ99ZMS216267",
    provider: "MarketCheck NeoVIN",
    source: "OEM sticker",
    recordConfidence: 0.94,
    vehicle: {
      year: 2021,
      make: "Porsche",
      model: "911",
      trim: "Carrera 4S",
      trimConfidence: "high",
      version: "992",
      versionConfidence: "high",
      bodyType: "Coupe",
      engine: "3.0L Twin-Turbo H6",
      transmission: "8-speed PDK",
      transmissionConfidence: "high",
      drivetrain: "AWD",
      fuelType: "Gasoline",
    },
    colors: {
      exterior: { code: "M7S", name: "Agate Grey Metallic", base: "Gray", confidence: "high", price: 840 },
      interior: { code: "KA", name: "Black leather", base: "Black", confidence: "high", price: null },
    },
    pricing: { currency: "USD", baseMsrp: 120600, optionsMsrp: 3020, delivery: 1350, combinedMsrp: 124970, label: "oem_msrp", taxes: [], discounts: [] },
    packages: ["Sport Chrono Package"],
    installedOptions: [
      { code: "0I2", name: "Extended Range Fuel Tank", price: 230, salePrice: null, type: "option", confidence: "high", verified: true, rule: null, equipment: [] },
      { code: "8LH", name: "Sport Chrono Package", price: 2790, salePrice: null, type: "package", confidence: "medium", verified: false, rule: "OEM sticker", equipment: [{ item: "Mode switch", attribute: "Drive modes", value: "Sport Plus", location: null }] },
    ],
    features: [{ group: "comfort", category: "Comfort", type: "Interior", status: "Standard", description: "Heated front seats" }],
    highValueFeatures: [{ group: "performance", category: "Performance", type: null, description: "Rear axle steering" }],
    installedEquipment: [{ group: "wheels", category: "Wheels", item: "Carrera S wheels", attribute: "Diameter", location: "Front/rear", value: "20/21 inch" }],
    summary: { installedOptionCount: 2, verifiedOptionCount: 1, hasColors: true, hasPricing: true, hasBuildRecord: true },
  },
};

async function mockAdvancedDecode(page, payload = factoryRecord, status = 200) {
  await page.route("**/api/advanced-decode?**", (route) => route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  }));
}

test("renders every VIN-specific option and keeps catalog-only data out", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await mockAdvancedDecode(page);
  await page.goto("/?vin=WP0ZZZ99ZMS216267");

  await expect(page.locator("#factory-content")).toBeVisible();
  await expect(page.locator("#factory-source")).toHaveText("OEM sticker");
  await expect(page.locator("#color-grid")).toContainText("Agate Grey Metallic");
  await expect(page.locator("#option-count")).toHaveText("2 installed options");
  await expect(page.locator("#options-body tr")).toHaveCount(2);
  await expect(page.locator("#options-body")).toContainText("Extended Range Fuel Tank");
  await expect(page.locator("#options-body")).toContainText("Sport Chrono Package");
  await expect(page.locator("body")).not.toContainText("Catalog-only option");
  expect(pageErrors).toEqual([]);
});

test("advanced failure stays honest without breaking the local VIN decode", async ({ page }) => {
  await mockAdvancedDecode(page, {
    error: { code: "build_record_not_found", message: "No VIN-level factory build record was found." },
  }, 404);
  await page.goto("/?vin=WP0ZZZ99ZMS216267");

  await expect(page.locator("#result-title")).toContainText("2021 Porsche 911");
  await expect(page.locator("#factory-unavailable")).toBeVisible();
  await expect(page.locator("#factory-error-title")).toHaveText("No VIN-specific build record found");
  await expect(page.locator("#factory-retry")).toBeHidden();
});

test("advanced build record has no horizontal overflow on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAdvancedDecode(page);
  await page.goto("/?vin=WP0ZZZ99ZMS216267");
  await expect(page.locator("#factory-content")).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.locator("#options-body tr")).toHaveCount(2);
});
