# BillOff-Lading — Detention Recovery & BOL-Verified Broker Fit Platform

**BillOff-Lading** turns dead freight paperwork (signed Bills of Lading, Rate Confirmations, and ELD timestamps) into two high-leverage weapons for 1–100 truck carriers: an automated **Ghost-Clerk Detention Recovery Relay** that files and chases detention claims from a white-labeled carrier billing address, and an **Open-Market BOL-Verified Broker & Lane Fit Search Engine** that ranks broker arrangements by real dock turn times, rate-con fairness, and verified detention payout percentages.

### User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and product choices have been confirmed from your Preliminary Design Review (`[DEC-01]` through `[DEC-13]`), your Phase 1 selections, and your 4 technical/spec refinements:

- **Confirmed Scope & Conversion Hierarchy (Default Worked Example + Secondary Live BOL Scanner Tab)**: The Demo Moment defaults to **Worked Example (Load #4417)** so cold visitors immediately absorb the 10-second proof story, with a clean secondary tab toggle right beside it (`Try Live BOL Scanner & Claim Builder`). Running a custom scan or adjusting the Broker Fit calculator automatically queues the result into the adjacent inline email capture bar (*"Send this claim packet + my 90-day audit to you@yourfleet.com"*).
- **Confirmed Persistence (Cloud Firestore with Strict Write-Only Lead Rules)**: Upon plan approval, we will trigger the interactive Firebase provisioning workflow to set up Cloud Firestore and deploy hardened write-only security rules for the `leads` collection (`email`, `timestamp`, `source`, `tier`, `channel`, `search_query`), backed by a seamless local ledger fallback and `sessionStorage` idempotency guard.
- **Confirmed Server-Side AI Extraction (`gemini-2.5-flash`)**: All Rate Confirmation and signed BOL document parsing runs through an Express backend endpoint (`/api/bol/analyze`) using `@google/genai` with `gemini-2.5-flash`, structured JSON output, and automatic Zero-PII carrier scrubbing (`[DEC-10]`).
- **Confirmed Clamped `BrokerFitScore` Math & Locked Design Tokens**: All four inputs to the True-Yield Broker Fit formula are clamped to `[0, 1]` before applying the `0.40 / 0.30 / 0.20 / 0.10` weights and scaling to `0..100`. Navigation is strictly capped at 3 anchor links (`How it works`, `Pricing`, `FAQ`), and all 8 CSS color tokens (`--text-muted: #6E6659`, `--accent-hover: #8F4208`) and typography rules (`17px` body, `60ch` measure) are locked verbatim.

---

### 1. Overview & Core Concept

- **What It Does**:
  1. **Validation & Founding-Fleet Capture**: Converts visiting owner-operators and fleet dispatchers through a field-office dispatch narrative, Worked Example (#4417 in Joliet, IL), 3-tier pricing architecture, and inline email capture forms with honeypot bot protection and channel/query attribution.
  2. **The Front-Office Radar (BOL-Verified Broker & Lane Search Engine)**: Allows carriers to search by Broker MC#, Origin $\rightarrow$ Destination corridor, or Receiver Facility to inspect verified dock dwell times, rate-con notice windows, detention payout rates, and the deterministic **True-Yield Broker Fit Score** ($0\text{–}100$). Includes interactive sliders to simulate custom broker terms.
  3. **The Back-Office Hammer (Live BOL OCR & Ghost-Clerk Claim Generator)**: Available via the secondary tab in the Demo section (`Try Live BOL Scanner & Claim Builder`), letting carriers upload a Rate Confirmation or signed BOL image/PDF (or load realistic freight presets) to watch the Zero-PII pipeline extract arrival/departure timestamps, strip private carrier identity, compute billable detention dollars, and draft a white-labeled **Ghost-Clerk Claim Packet** with a Day 7 / 14 / 30 follow-up schedule.
- **Target Audience / Persona**: Owner-operators, dispatchers, and back-office managers at 1–100 truck dry van, reefer, and flatbed fleets who lose thousands per truck annually to unpaid receiver detention and surprise 5-hour grocery dock sits.
- **Key Value**: Recovers $200–$500+ detention invoices without burning broker relationships via white-labeled Ghost-Clerk follow-ups, while preventing bad loads upfront through crowd-verified dock truth telemetry.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Hero & Attribution Flow**: Visitor lands on the page (`?ref=` or `utm_source=` automatically captured), reads the core value proposition and the $3.6B industry detention proof metric, and can immediately request their free 90-day BOL detention audit via the hero inline form (`source: 'hero_inline'` or `'nav_cta'`).
  2. **Worked Example (Default Tab) $\rightarrow$ Live BOL Scanner & Ghost-Clerk Claim Builder (Secondary Tab)**:
     - **Tab 1 (Default — `Worked Example: Load #4417`)**: Visitor immediately sees the side-by-side timeline of Load #4417 (6 hrs 33 min dwell in Joliet, IL) and the $275.00 Ghost-Clerk claim filed the same day with Day 7 / 14 / 30 follow-ups.
     - **Tab 2 (`Try Live BOL Scanner & Claim Builder`)**: Visitor uploads a BOL/Rate Con image or selects a sample packet, tweaks arrival/departure timestamps, free time, hourly detention rate, and white-labeled billing alias (`billing@yourfleet.com`), and generates a copy-ready Day-0 Claim + follow-up sequence. Running a scan or editing a claim automatically queues that packet summary into the inline email capture bar below (*"Send this claim packet + my 90-day audit to you@yourfleet.com"*).
  3. **Open-Market Broker & Lane Fit Radar Flow**: Visitor searches a corridor (e.g., `Joliet, IL → Atlanta, GA`, `Chicago, IL → Dallas, TX`) or Broker MC# (`MC #481920`), clicks benchmark chips, or adjusts the **True-Yield Fit Calculator** sliders (`payoutRatePct`, `avgDwellMins`, `detentionRateDollars`, `noticeWindowHrs`) to test a broker's terms. Submitting a search or adjusting sliders queues that exact `search_query` into the inline audit unlock form (`source: 'broker_search_gate'`).
  4. **Pricing Tier Selection & Final Conversion Flow**: Clicking any of the 3 pricing tiers (*Tier 1: Dock & Broker Audit — Free*, *Tier 2: Recovery + Search — $99/truck/mo*, *Tier 3: Back-Claims — 20% of recovery*) pre-selects that tier pill, smooth-scrolls to the Final CTA section, focuses the email input, and stores the lead with `source: 'pricing_tier_cta'`.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: **Field-Office Dispatch & Manila Ledger** (`[DEC-01]`) — utilitarian, high-trust, zero-fluff freight documentation aesthetic inspired by stamped shipping manifests, clipboard rate confirmations, and amber clearance marker lights at dawn.
  - *Color Palette & Mood (Locked 8-Token Spec)*:
    - Dominant Canvas (60%): Warm Manila Paper (`--background: #FAF8F3`)
    - Structural Surfaces (30%): Crisp Manifest White (`--surface: #FFFFFF`), Subtle Hover (`--surface-hover: #F3EFE6`), Hairline Rule (`--border: #E4DDD0`), Deep Charcoal Ink (`--text-primary: #241F18`), Muted Dispatch Ink (`--text-muted: #6E6659`)
    - High-Intent Accent (10%): Amber Marker-Light (`--accent: #B4540A`, `--accent-hover: #8F4208`) concentrated on primary CTAs, active tab/chip states, clock emblems, and verified dollar figures.
  - *Typography & Hierarchy*:
    - Display & Section Headings: `Barlow Semi Condensed` (600 SemiBold / 700 Bold) with tight tracking and `text-wrap: balance` to prevent orphan headline words.
    - Body & Dispatch Copy: `Inter` (400 Regular / 500 Medium / 600 SemiBold) locked at **`17px`** (`1.6` line-height, **`60ch`** measure).
    - Telemetry, Timestamps & Dollar Figures: `font-variant-numeric: tabular-nums` enforced across all dwell times, MC numbers, fit scores, and invoice totals.
  - *Component Styling & Layout*:
    - **Strict 3-Link Top Bar Contract**: 2-color Dock Door + Stamped BOL + Clock vector SVG emblem & `BillOff-Lading` wordmark on the left; **at most 3 anchor links** (`How it works`, `Pricing`, `FAQ`) in the center; **1 primary CTA button** (`Get my free detention audit`) on the right.
    - Flat, single-elevation cards with `1px solid var(--border)` (`#E4DDD0`) borders and `6px` border radius. Zero nested card sandwiches or thick left accent borders.
- **Interactive Feedback & Motion**:
  - Micro-interactions settle within `180ms` (`cubic-bezier(0.16, 1, 0.3, 1)`).
  - Clear validation states for email formatting, loading indicators during Gemini BOL OCR extraction, instant clamped recalculation of the True-Yield Broker Fit formula, and a persistent bottom verification banner confirming when a lead is written to Firestore (`leads` collection) with its full 6-field payload.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Ghost-Clerk White-Label Email Relay (`[DEC-09]`)**
  - *Chosen Approach*: Keep the carrier-facing brand 100% **BillOff-Lading**, while formatting all outbound detention claim packets from a neutral carrier accounting alias (`billing@[carrier-domain]` or `ap-desk@ladingledger.com`) with zero BillOff-Lading branding in the broker-facing email preview.
  - *Why*: Protects the carrier's relationship with dispatchers and brokers who might otherwise bristle at an aggressive third-party collections brand.
- **Decision 2: Zero-PII BOL Aggregation Pipeline (`[DEC-10]`)**
  - *Chosen Approach*: When a carrier analyzes a Rate Con or signed BOL in the Live OCR Scanner tab, the extraction pipeline explicitly strips/masks the carrier's company name, MC#, driver signature, and linehaul rate before computing the anonymized Broker & Facility Scorecard update.
  - *Why*: Proves to skeptical owner-operators that uploading their paperwork will never expose their direct shipper lanes or linehaul rates to competing fleets.
- **Decision 3: Clamped Deterministic True-Yield & Broker Fit Scoring (`[DEC-11]`)**
  - *Chosen Approach*: Normalize all four broker/dock telemetry inputs to `[0, 1]` using `Math.max(0, Math.min(1, ...))` before computing the weighted 0–100 composite score so grocery dock holds $> 360\text{ mins}$ or long notice windows never underflow or overflow:
    $$\text{payoutNorm} = \text{clamp}\left(\frac{\text{PayoutRatePct}}{100},\, 0,\, 1\right), \quad \text{dwellNorm} = \text{clamp}\left(1 - \frac{\text{AvgDwellMins}}{360},\, 0,\, 1\right)$$
    $$\text{rateNorm} = \text{clamp}\left(\frac{\text{DetentionRateDollars}}{100},\, 0,\, 1\right), \quad \text{noticeNorm} = \text{clamp}\left(\frac{\text{NoticeWindowHrs}}{48},\, 0,\, 1\right)$$
    $$\text{BrokerFitScore} = \text{round}\Big(\big(0.40 \cdot \text{payoutNorm} + 0.30 \cdot \text{dwellNorm} + 0.20 \cdot \text{rateNorm} + 0.10 \cdot \text{noticeNorm}\big) \times 100\Big)$$
  - *Why*: Eliminates unit-scale mismatches (0–100% vs. 0–1) and guarantees bounded, predictable 0–100 scores across extreme slider inputs.
- **Decision 4: Write-Only Firestore Lead Ingress + Session Idempotency (`[DEC-03]`, `[DEC-05]`, `[DEC-13]`)**
  - *Chosen Approach*: Provision Cloud Firestore with security rules permitting public `create` only when all 6 required keys (`email`, `timestamp`, `source`, `tier`, `channel`, `search_query`) pass strict type, regex, enum, and `request.time` validation, while blocking all public `read`, `update`, and `delete` operations.
  - *Why*: Prevents lead list scraping while capturing high-intent search queries and custom BOL scan summaries (`search_query`) directly from the landing page.

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                     BillOff-Lading Client Application (React)                │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ Top Navigation Bar (Emblem+Wordmark | How it works · Pricing · FAQ |   │  │
│  │                     [Get my free detention audit])                     │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│               │                               │                              │
│               ▼                               ▼                              │
│  ┌─────────────────────────────────┐  ┌───────────────────────────────────┐  │
│  │ Validation & Conversion Funnel  │  │ Demo Moment & Interactive Radar   │  │
│  │ • Hero + $3.6B Proof + Form     │  │ • Tab 1 (Default): Worked Example │  │
│  │ • 01-04 Problem Open-Row List   │  │   Load #4417 + Same-Day Claim     │  │
│  │ • 3-Step How It Works           │  │ • Tab 2: [Try Live BOL Scanner &  │  │
│  │ • 6-Card Fleet Benefits Grid    │  │   Claim Builder] (Zero-PII +      │  │
│  │ • 3-Tier Pricing + Selection    │  │   Ghost-Clerk Packet Generator)   │  │
│  │ • Accordion FAQ + Final Dark CTA│  │ • Open-Market Broker & Lane Radar │  │
│  └───────────────┬─────────────────┘  │   + Clamped True-Yield Calculator │  │
└──────────────────┼────────────────────┴─────────┬───────────────────┬─────┘  │
                   │                              │                   │
       submitFleetLead()             Queues search_query        POST /api/bol/analyze
      (Honeypot + Dedupe)         (Claim or Lane Fit Match)     (Image/Text/Preset)
                   │                              │                   │
                   ▼                              ▼                   ▼
┌──────────────────────────────────────────────────────┐  ┌────────────────────┐
│ Cloud Firestore (/leads/{leadId}) + Local Fallback   │  │ Express API Server │
│ • Strict 6-Key Write-Only Security Rules             │  │ • Token-Bucket     │
│ • Server Timestamp (request.time) Verification       │  │   Rate Limiter     │
│ • Zero Public Read / Update / Delete                 │  │ • @google/genai    │
└──────────────────────────────────────────────────────┘  │   gemini-2.5-flash │
                                                          │   Structured JSON  │
                                                          └────────────────────┘
```

- **Data Model & State**:
  - **Firestore Lead Entity (`/leads/{leadId}`)**:
    - `email` (`string`, 5–254 chars, RFC-5322 regex validated, lowercased)
    - `timestamp` (`timestamp`, must equal `request.time` via `serverTimestamp()`)
    - `source` (`'nav_cta' | 'hero_inline' | 'broker_search_gate' | 'post_demo_inline' | 'pricing_tier_cta' | 'final_cta_inline'`)
    - `tier` (`'Dock & Broker Audit — Free' | 'Recovery + Search — $99/truck/mo' | 'Back-Claims — 20% of recovery' | null`)
    - `channel` (`string | null`, $\le 120$ chars from `?ref=`, `?utm_source=`, or `document.referrer`)
    - `search_query` (`string | null`, $\le 100$ chars capturing the lane, Broker MC#, or custom BOL scan summary queued before signup)
  - **Broker & Lane Fit Benchmark Records**:
    - Curated, searchable multi-corridor dataset (Midwest, Southeast, Texas, Regional dry van, reefer, and flatbed lanes) with `mcNumber`, `brokerName`, `origin`, `destination`, `equipment`, `avgDwellMins`, `sampleSizeBols`, `detentionRateDollars`, `freeTimeHours`, `noticeWindowHours`, `verifiedPayoutRate`, and dynamically computed clamped `BrokerFitScore` ($0\text{–}100$).
  - **Extracted BOL & Claim Draft State**:
    - Structured extraction output containing `loadNumber`, `rateConId`, `brokerMc`, `brokerName`, `facilityLocation`, `arrivalTime`, `departureTime`, `noticeSentTime`, `freeTimeMins`, `detentionRatePerHour`, `noticeWindowHours`, `redactedCarrierPii` confirmation array, computed `billableMins`, `amountDueDollars`, and generated Ghost-Clerk Day-0 / Day-7 / Day-14 / Day-30 email templates.

- **Interactive Component & State Mapping**:
  - **Email Capture Forms (Hero, Post-Demo/Radar, Final CTA)**: Validate email format client-side, inspect hidden `company_dot_number` honeypot input, check `sessionStorage` idempotency key, write to Cloud Firestore `leads` collection (with automatic fallback to `localStorage` if offline/unprovisioned), and update the bottom verification bar.
  - **Demo Section Tabs (`Worked Example: Load #4417` vs. `Try Live BOL Scanner & Claim Builder`)**: Defaults to the static Load #4417 side-by-side proof so cold traffic is never overwhelmed; clicking `Try Live BOL Scanner & Claim Builder` opens the interactive OCR upload / preset analyzer and Ghost-Clerk claim customizer, and automatically populates the adjacent email capture prompt (*"Send this claim packet + my 90-day audit to you@yourfleet.com"*) via `committedSearchQuery`.
  - **Open-Market Broker & Lane Fit Radar + Clamped Calculator**: Filters the broker index by text query (lane, city, state, or MC#) or preset chips, and provides interactive sliders using the clamped `0..1` normalization formula to compute `BrokerFitScore` in real time, queuing the active lane or simulated broker profile into `committedSearchQuery` (`source: 'broker_search_gate'`).
