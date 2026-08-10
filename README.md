# VIN/17

A transparent Porsche VIN decoder with two deliberately separate layers:

- A free local decoder for identity fields encoded in the VIN.
- A licensed VIN-level build-record lookup for factory colors, installed options, equipment, and original MSRP details.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. The supplied test VIN, `WP0ZZZ99ZMS216267`, is preloaded and also works as a shareable query:

```text
http://localhost:5173/?vin=WP0ZZZ99ZMS216267
```

Vite alone serves the local VIN decoder. To run the serverless advanced-decoder endpoint too, add at least one provider key and use Vercel's local runtime:

```bash
vercel env pull .env.local
vercel dev
```

The advanced endpoint supports a detailed primary provider and a global Porsche fallback:

```text
MARKETCHECK_API_KEY=your_private_key
ONEAUTO_API_KEY=your_private_key
```

At least one is required. MarketCheck NeoVIN is queried first because it can return individual option MSRP, colors, pricing totals, confidence, and nested equipment. One Auto API is queried as a fallback because its OE build-sheet endpoint explicitly supports Porsche worldwide, including Europe/RoW VINs, but its public response contract returns fitted option codes/descriptions without window-sticker pricing.

Never expose these values through a `VITE_` variable. The browser calls `/api/advanced-decode`; the function validates Porsche VINs, applies a best-effort per-IP rate limit, queries the configured providers, strips each response to the fields used by the app, and caches successful immutable build records at the Vercel CDN.

## Verify

```bash
npm test
npm run build
npm run test:e2e
```

## Data integrity

The core logic runs in the browser and decodes Porsche WMI, model-family and year identifiers, rest-of-world VIN structure, known assembly plants, and production sequence. For the advanced layer, a VIN is submitted to a configured provider only after local validation.

Only `installed_options_details` is shown under **Added options**. `available_options_details` is intentionally ignored because it describes the model's catalog, not necessarily this car. Provider confidence and verification fields stay visible, and the app reports an unavailable/incomplete record instead of inventing missing build data.

This is an independent research tool and is not affiliated with or endorsed by Porsche AG.
