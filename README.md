# VIN/17

A free, transparent Porsche VIN decoder focused on information that can be responsibly derived from the 17-character identifier itself.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. The supplied test VIN, `WP0ZZZ99ZMS216267`, is preloaded and also works as a shareable query:

```text
http://localhost:5173/?vin=WP0ZZZ99ZMS216267
```

## Verify

```bash
npm test
npm run build
```

## Scope

The decoder logic runs in the browser and does not submit VINs to a third-party decoding API. It decodes Porsche WMI, model-family and year identifiers, rest-of-world VIN structure, known assembly plants, and production sequence. It deliberately does not invent paint, engine, transmission, options, service history, or ownership data—those require a manufacturer build record or a licensed historical database.

This is an independent research tool and is not affiliated with or endorsed by Porsche AG.
