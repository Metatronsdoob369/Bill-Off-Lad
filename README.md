# BillOff-Lading

> **Detention Recovery via Ghost-Clerk Relay + Open-Market BOL-Verified Broker & Lane Fit Index**  
> Built for 1–100 truck fleets and owner-operators who leave billable detention money and driver clock hours at shipper and receiver docks.

---

## ⚡ Quickstart (Zero-Dependency Standalone Run)

The entire application runs **100% standalone** without requiring external API keys, database credentials, or paid map APIs:

```bash
# 1. Install dependencies
npm install

# 2. Run the full unit & integration test suite (18 tests)
npm test

# 3. Verify production compilation
npm run build

# 4. Start the development server
npm run dev
# -> http://localhost:3000
```

---

## 🧪 Proven Build & Test Suite (18 Automated Vitest Tests)

This repository includes a test suite covering the entire core domain logic:

```bash
npx vitest run
```

### Test Coverage Breakdown:
1. **`tests/geotrans.test.ts` (6 tests)**:
   - WGS84 ellipsoid geodetic-to-planar UTM projection (Zone 16T / 41.525°N, -88.0817°W Joliet reference).
   - 1-meter (5-digit) precision and 100-meter cluster footprint MGRS coordinate generation.
   - 150m Automated Boundary Enclosure classification (`< 50m` Dock Apron, `< 150m` Staging Area, `> 150m` Off-Site).
   - Pure 2D Euclidean planar distance computation (`computePlanarDockOffsetMeters`) with zero Map API calls.
   - Dynamic ELD Breadcrumb Trajectory series evaluation over time.
   - Spatial Facility Intelligence retrieval keyed by 100m Cluster ID (`16T-EN-099-976`).

2. **`tests/broker-fit.test.ts` (4 tests)**:
   - Deterministic Clamped True-Yield scoring formula (`computeClampedBrokerFitScore`).
   - Four-factor normalization: 40% Verified Payout Rate + 30% Dock Dwell + 20% Hourly Rate + 10% Notice Window.
   - Mathematical clamping (`[0, 1]`) preventing score corruption on extreme or malicious inputs.
   - Consistent evaluation of standard freight benchmark lanes.

3. **`tests/pdf-suite.test.ts` (5 tests)**:
   - Full 3-page carrier claim and settlement PDF suite generation.
   - Form 101-A: Claim Evidence Packet with Page-1 verification badge and vector geofence plot.
   - Form 102-B: Revised Rate Con Addendum (`#RC-88214-REV1`) & Factoring Invoice.
   - Form 103-C: Driver Weekly Detention & Payroll Settlement Worksheet.
   - 36pt coordinate calibration grid overlay (`render-grid` style) and alignment offsets.

4. **`tests/server-ocr.test.ts` (3 tests)**:
   - Deterministic regex & rule-based BOL/Rate-Con parser (`extractDeterministicBolFallback`).
   - Zero-PII scrubbing (`DEC-10`): Carrier name, MC/DOT, driver signature, and gross linehaul rate redaction.
   - Safe parsing of unstructured, smudged, or handwritten timestamps without throwing.

---

## 🤖 Graceful Fallbacks & Offline Capability

- **Gemini 2.5 Flash OCR (`server.ts`)**:
  - When `GEMINI_API_KEY` is present, uses `gemini-2.5-flash` with structured JSON schema.
  - When `GEMINI_API_KEY` is omitted (local dev, CI runner, air-gapped machine), automatically falls back to `extractDeterministicBolFallback` in `src/bolParser.ts`.
- **Cloud Firestore Persistence (`src/firebase.ts`)**:
  - Automatically loads credentials from `firebase-applet-config.json` when present.
  - When offline or unconfigured, seamlessly falls back to `sessionStorage` with honeypot bot trap filtering and deduplication.
- **Local GeoTrans Coordinate Math (`src/geotrans.ts`)**:
  - 100% client-side NGA/DMA TM8358.2 WGS84 math. Zero external Google Maps, Mapbox, or GIS API calls required.

---

## 📄 Pro Carrier PDF Form Suite & Custom Blank Form Stencil

Located in `src/pdfSuite.ts`, carriers can generate individual forms or a complete 3-page packet:

| Form ID | Title | Purpose |
| :--- | :--- | :--- |
| **Form 101-A** | **Claim Evidence Packet** | Page-1 Automated Boundary Stamp (`STATUS: DOCK APRON VERIFIED < 50m`), ELD Timestamp Ledger, and vector Geofence Plot. |
| **Form 102-B** | **Revised Rate Con Addendum** | Factoring-ready accessorial invoice (`#RC-88214-REV1`) with 1-click digital approval portal link. |
| **Form 103-C** | **Driver Settlement Worksheet** | Ruled payroll worksheet breaking down Driver Direct Settlement Share (`75%`) vs. Fleet Office Net Share (`25%`). |

### Custom Blank Form / Letterhead Matching:
- Upload any scanned company worksheet or invoice (`PNG` or `JPG`).
- Choose **Full-Page Blank Form Overlay** or **Top-Right Letterhead Stamp**.
- Toggle the **36pt Coordinate Calibration Grid** and adjust Horizontal (`X`) and Vertical (`Y`) offset sliders to align text to existing paper forms.

---

## 🚀 CI / CD Automation (`.github/workflows/ci.yml`)

Every push and pull request to `main` executes:
1. `npm ci`
2. `npm run lint` (TypeScript type safety)
3. `npm test` (18 Vitest unit & integration tests)
4. `npm run build` (Vite production bundle verification)

---

## 📂 Project Structure

```
├── .github/workflows/
│   └── ci.yml               # Automated GitHub Actions test & build pipeline
├── tests/
│   ├── geotrans.test.ts     # Local WGS84 / UTM / MGRS / Enclosure tests
│   ├── broker-fit.test.ts   # Clamped 0..100 Broker Fit algorithm tests
│   ├── pdf-suite.test.ts    # 3-form carrier PDF suite tests
│   └── server-ocr.test.ts   # BOL OCR & Zero-PII scrubber tests
├── src/
│   ├── App.tsx              # Conversion funnel, Claim Builder, & Radar
│   ├── geotrans.ts          # Zero-API local coordinate & spatial engine
│   ├── bolParser.ts         # Deterministic BOL parser & PII scrubber
│   ├── pdfSuite.ts          # 3-page vector PDF suite & custom stencil
│   ├── firebase.ts          # Firestore client with offline fallback
│   ├── styles.css           # 8-token Manila & Amber field-office palette
│   └── main.tsx             # React DOM entry point
├── server.ts                # Express backend + Vite middleware + Rate limiting
├── firestore.rules          # Hardened Cloud Firestore security rules
├── package.json             # Dependencies, scripts, and Vitest runner
└── .env.example             # Documented environment variables
```

---

## ⚖️ License

MIT License. Designed and engineered for high-yield flatbed, dry van, and reefer motor carriers.
