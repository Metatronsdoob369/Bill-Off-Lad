import React, { useState, useRef } from 'react';
import './styles.css';
import {
  submitFleetLead,
  LeadSource,
  PricingTierName,
  LeadRecord,
} from './firebase';

interface BrokerFitBenchmark {
  id: string;
  queryMatch: string;
  lane: string;
  brokerProfile: string;
  bolVerifiedDwell: string;
  rateConTerms: string;
  detentionPayoutRate: string;
  fitScore: string;
  verdict: string;
}

const BENCHMARK_LANES: BrokerFitBenchmark[] = [
  {
    id: 'mw-se',
    queryMatch: 'Joliet, IL → Atlanta, GA (Dry Van)',
    lane: 'Joliet, IL → Atlanta, GA',
    brokerProfile: 'MC #481920 (Midwest Contract Group)',
    bolVerifiedDwell: '1 hr 18 min avg (142 BOLs)',
    rateConTerms: '$65/hr after 2 hrs · 24-hr notice window',
    detentionPayoutRate: '91.4% paid inside 14 days',
    fitScore: '94 / 100',
    verdict: 'Green-Light Fit — Fast dock turns & honors ELD timestamps',
  },
  {
    id: 'mw-trap',
    queryMatch: 'Chicago, IL → Dallas, TX (Reefer / Grocery)',
    lane: 'Chicago, IL → Dallas, TX',
    brokerProfile: 'MC #774102 (National Spot Brokerage)',
    bolVerifiedDwell: '5 hrs 42 min avg (319 BOLs)',
    rateConTerms: '$35/hr after 4 hrs · 12-hr strict notice trap',
    detentionPayoutRate: '18.2% paid (81.8% ghosted)',
    fitScore: '29 / 100',
    verdict: 'High Detention Trap — Expect 5+ hr grocery receiver hold',
  },
  {
    id: 'se-regional',
    queryMatch: 'Birmingham, AL → Memphis, TN (Dry Van / Flatbed)',
    lane: 'Birmingham, AL → Memphis, TN',
    brokerProfile: 'MC #309441 (Southern Industrial Freight)',
    bolVerifiedDwell: '1 hr 04 min avg (88 BOLs)',
    rateConTerms: '$60/hr after 2 hrs · 24-hr notice window',
    detentionPayoutRate: '88.7% paid inside 15 days',
    fitScore: '91 / 100',
    verdict: 'Green-Light Fit — Consistent sub-90 min receiver turns',
  },
];

function BillOffLadingLogo({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      {/* Outer Dock Door Frame (#241F18) */}
      <path
        d="M3 21V3H21V21"
        stroke="var(--text-primary)"
        strokeWidth="2"
        strokeLinecap="square"
      />
      {/* Half-Raised Dock Door Panel (#241F18) with Amber Seam (#B4540A) */}
      <path d="M5 5H19V9.5H5V5Z" fill="var(--text-primary)" />
      <line
        x1="5"
        y1="7.25"
        x2="19"
        y2="7.25"
        stroke="var(--accent)"
        strokeWidth="1.5"
      />
      {/* Stamped BOL Document + Centered Analog Clock (#B4540A & #241F18) */}
      <rect
        x="6.5"
        y="11"
        width="11"
        height="9"
        stroke="var(--text-primary)"
        strokeWidth="1.5"
        fill="none"
      />
      <circle
        cx="12"
        cy="15.5"
        r="3.2"
        stroke="var(--accent)"
        strokeWidth="1.8"
      />
      <path
        d="M12 13.8V15.5L13.3 16.5"
        stroke="var(--text-primary)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function EmailCaptureForm({
  defaultSource,
  selectedTier,
  activeSearchQuery,
  onClearTier,
  inputRef,
  onLeadCaptured,
}: {
  defaultSource: LeadSource;
  selectedTier: PricingTierName;
  activeSearchQuery?: string | null;
  onClearTier?: () => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onLeadCaptured: (record: LeadRecord) => void;
}) {
  const [email, setEmail] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmed = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
      setErrorMsg('Please enter a valid work or fleet email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      const effectiveSource: LeadSource = selectedTier
        ? 'pricing_tier_cta'
        : activeSearchQuery
        ? 'broker_search_gate'
        : defaultSource;

      const result = await submitFleetLead({
        email: trimmed,
        source: effectiveSource,
        tier: selectedTier,
        searchQuery: activeSearchQuery ?? null,
        honeypot,
      });
      setIsSuccess(true);
      onLeadCaptured(result.record);
    } catch {
      setErrorMsg('Could not save your spot right now. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="capture-success-box" role="status">
        You&apos;re on the founding-fleet list. We onboard in small batches —
        you&apos;ll get an email from the founder within 7 days to set up your
        free 90-day BOL detention audit, unlock your full Broker &amp; Lane Fit
        Report, and tell us roughly how many trucks you run.
      </div>
    );
  }

  return (
    <form className="capture-form-wrap" onSubmit={handleSubmit} noValidate>
      {(selectedTier || activeSearchQuery) && (
        <div className="tier-pill">
          <span>
            {selectedTier ? (
              <>
                Selected plan: <strong>{selectedTier}</strong>
              </>
            ) : (
              <>
                Lane/Broker Report Queued: <strong>{activeSearchQuery}</strong>
              </>
            )}
          </span>
          {onClearTier && (
            <button
              type="button"
              className="tier-pill-clear"
              onClick={onClearTier}
              aria-label="Clear selection"
            >
              ×
            </button>
          )}
        </div>
      )}

      {/* Visually-hidden Honeypot Field */}
      <div className="honeypot-trap" aria-hidden="true">
        <label htmlFor={`hp-${defaultSource}`}>DOT Carrier Reference</label>
        <input
          id={`hp-${defaultSource}`}
          type="text"
          name="company_dot_number"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      <div className="capture-row">
        <input
          ref={inputRef}
          type="email"
          required
          className="capture-input"
          placeholder="you@yourfleet.com"
          aria-label="Fleet email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          Get my free detention audit
        </button>
      </div>

      {errorMsg && (
        <p className="small-text" style={{ color: 'var(--accent)' }}>
          {errorMsg}
        </p>
      )}

      <p className="small-text">
        No spam. Your info is never shared with brokers. Unsubscribe anytime.
      </p>
    </form>
  );
}

export default function App() {
  const [selectedTier, setSelectedTier] = useState<PricingTierName>(null);
  const [activeHeroSource, setActiveHeroSource] =
    useState<LeadSource>('hero_inline');
  const [searchInput, setSearchInput] = useState('');
  const [committedSearchQuery, setCommittedSearchQuery] = useState<
    string | null
  >(null);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [lastCapturedLead, setLastCapturedLead] = useState<LeadRecord | null>(
    null
  );

  const heroInputRef = useRef<HTMLInputElement | null>(null);
  const postDemoInputRef = useRef<HTMLInputElement | null>(null);
  const finalCtaInputRef = useRef<HTMLInputElement | null>(null);
  const finalCtaSectionRef = useRef<HTMLElement | null>(null);

  const handleNavCtaClick = () => {
    setActiveHeroSource('nav_cta');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => heroInputRef.current?.focus(), 300);
  };

  const handleSelectPricingTier = (tier: PricingTierName) => {
    setSelectedTier(tier);
    finalCtaSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => finalCtaInputRef.current?.focus(), 400);
  };

  const handleRadarSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = searchInput.trim() || 'Joliet, IL → Atlanta, GA';
    setCommittedSearchQuery(cleaned);
    setTimeout(() => postDemoInputRef.current?.focus(), 150);
  };

  const faqItems = [
    {
      q: 'Will a name like BillOff-Lading hurt my broker relationships?',
      a: "Brokers never see the name BillOff-Lading. Outbound claims are sent through our Ghost-Clerk Relay using a clean, white-labeled accounting address from your office. Every claim cites the broker's own rate con terms and attaches the signed BOL and ELD timestamps. It reads like a sharp, polite office manager — never a collections agency.",
    },
    {
      q: 'How does the BOL-Verified Broker & Lane Fit Search work?',
      a: 'Every time a carrier uploads a rate confirmation and signed Bill of Lading, our Zero-PII pipeline strips out the carrier identity and linehaul rate, then indexes the broker MC#, detention clause, facility dwell time, and whether the claim was paid. You can search by Broker MC#, facility, or lane to find broker arrangements that actually turn trucks in under 2 hours and pay accessorials without a fight.',
    },
    {
      q: 'Is BillOff-Lading available right now?',
      a: "We're opening to a small batch of founding fleets and owner-operators first. Sign up and you'll lock in founding pricing and get the 90-day BOL detention audit + Lane Fit Report free when we open your batch. You'll see what you're owed before you pay anything.",
    },
    {
      q: '$99 per truck per month is real money. Is it worth it?',
      a: "The average detained stop now runs 1 hour 49 minutes. One paid claim — like the $275 example above — or avoiding just one 6-hour unpaid grocery receiver sit covers a truck's entire month. That's why the 90-day audit comes first and free.",
    },
    {
      q: 'My drivers are bad at logging wait times. Will this still work?',
      a: 'Yes. BillOff-Lading builds claims from records you already have — ELD timestamp exports, signed BOLs, and rate cons — not driver memory. The free audit also shows you exactly which loads have provable claims and which brokers are costing you the most unpaid dock hours.',
    },
    {
      q: "We already run a TMS and load boards. Doesn't that handle this?",
      a: 'Load boards show gross linehaul rates, not whether a receiver holds your truck for 6 hours or whether the broker ghosts detention invoices. And a TMS flags detention but never assembles the packet or follows up on day 7, 14, and 30. BillOff-Lading does both from your existing exports.',
    },
  ];

  return (
    <div>
      {/* NAVIGATION */}
      <header className="site-nav">
        <div className="container nav-inner">
          <a href="#" className="brand-link">
            <BillOffLadingLogo size={24} />
            <span>BillOff-Lading</span>
          </a>

          <nav className="nav-links" aria-label="Primary Navigation">
            <a href="#how-it-works" className="nav-anchor">
              How it works
            </a>
            <a href="#pricing" className="nav-anchor">
              Pricing
            </a>
            <a href="#faq" className="nav-anchor">
              FAQ
            </a>
          </nav>

          <button
            type="button"
            className="btn-primary"
            onClick={handleNavCtaClick}
          >
            Get my free detention audit
          </button>
        </div>
      </header>

      <main>
        {/* 1. HERO */}
        <section className="section-band-bg">
          <div className="container hero-grid">
            <div className="hero-copy-stack">
              <h1 className="animate-enter">
                Stop writing off the detention sitting on your BOLs
              </h1>
              <p className="hero-subheadline animate-enter stagger-1">
                Built for 1–100 truck fleets: BillOff-Lading turns signed Bills
                of Lading into paid detention claims — and lets you search
                brokers by real dock turn times and payout rates before you haul.
              </p>

              <div className="animate-enter stagger-2">
                <EmailCaptureForm
                  defaultSource={activeHeroSource}
                  selectedTier={null}
                  inputRef={heroInputRef}
                  onLeadCaptured={setLastCapturedLead}
                />
              </div>

              <p className="hero-credibility animate-enter stagger-3">
                Fleets charge detention on 94.5% of eligible loads — but fewer
                than half of those invoices ever get paid. That&apos;s{' '}
                <span className="claim-dollar-figure">$3.6 billion</span> a year
                left at the dock.
              </p>
            </div>

            <div className="hero-visual-frame animate-enter stagger-4">
              <svg
                viewBox="0 0 640 480"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-label="Charcoal semi-truck backed into a loading dock at dawn with amber marker lights glowing"
              >
                <rect width="640" height="480" fill="var(--text-primary)" />
                <polygon
                  points="0,350 640,350 640,480 0,480"
                  fill="var(--border)"
                />
                <polygon
                  points="80,350 560,350 620,480 20,480"
                  fill="var(--background)"
                />
                <rect
                  x="140"
                  y="40"
                  width="360"
                  height="310"
                  stroke="var(--border)"
                  strokeWidth="2"
                />
                <rect
                  x="180"
                  y="70"
                  width="280"
                  height="110"
                  fill="var(--text-muted)"
                />
                <line
                  x1="180"
                  y1="105"
                  x2="460"
                  y2="105"
                  stroke="var(--border)"
                  strokeWidth="2"
                />
                <line
                  x1="180"
                  y1="140"
                  x2="460"
                  y2="140"
                  stroke="var(--border)"
                  strokeWidth="2"
                />
                <rect
                  x="180"
                  y="180"
                  width="280"
                  height="170"
                  fill="var(--accent)"
                  fillOpacity="0.22"
                />
                <rect
                  x="210"
                  y="95"
                  width="220"
                  height="240"
                  fill="var(--text-primary)"
                  stroke="var(--border)"
                  strokeWidth="2"
                />
                <line
                  x1="320"
                  y1="95"
                  x2="320"
                  y2="335"
                  stroke="var(--border)"
                  strokeWidth="2"
                />
                <circle cx="226" cy="108" r="5" fill="var(--accent)" />
                <circle cx="250" cy="108" r="5" fill="var(--accent)" />
                <circle cx="320" cy="108" r="5" fill="var(--accent)" />
                <circle cx="390" cy="108" r="5" fill="var(--accent)" />
                <circle cx="414" cy="108" r="5" fill="var(--accent)" />
                <rect
                  x="220"
                  y="322"
                  width="28"
                  height="8"
                  fill="var(--accent)"
                />
                <rect
                  x="392"
                  y="322"
                  width="28"
                  height="8"
                  fill="var(--accent)"
                />
                <rect
                  x="215"
                  y="335"
                  width="36"
                  height="55"
                  fill="var(--text-primary)"
                />
                <rect
                  x="255"
                  y="335"
                  width="36"
                  height="55"
                  fill="var(--text-primary)"
                />
                <rect
                  x="349"
                  y="335"
                  width="36"
                  height="55"
                  fill="var(--text-primary)"
                />
                <rect
                  x="389"
                  y="335"
                  width="36"
                  height="55"
                  fill="var(--text-primary)"
                />
                <rect
                  x="235"
                  y="352"
                  width="170"
                  height="10"
                  fill="var(--border)"
                />
              </svg>
            </div>
          </div>
        </section>

        {/* 2. PROBLEM */}
        <section className="section-band-surface">
          <div className="container">
            <div className="section-header-stack">
              <h2>You charge detention. Brokers don&apos;t pay it.</h2>
            </div>

            <ul className="open-row-list">
              <li className="open-row-item">
                <span className="open-row-marker">01</span>
                <p>
                  Your driver sat six hours at a receiver. You invoiced. The
                  broker went quiet.
                </p>
              </li>
              <li className="open-row-item">
                <span className="open-row-marker">02</span>
                <p>
                  The rate con buries a 24-hour notice window, and your claim
                  dies on a technicality.
                </p>
              </li>
              <li className="open-row-item">
                <span className="open-row-marker">03</span>
                <p>
                  Nobody in a small fleet office has time to chase a{' '}
                  <span className="claim-dollar-figure">$275</span> invoice for
                  30 days. So nobody does.
                </p>
              </li>
              <li className="open-row-item">
                <span className="open-row-marker">04</span>
                <p>
                  Load boards show gross linehaul rates — never which brokers
                  bury 4-hour free-time traps or which docks steal a driver&apos;s
                  entire clock.
                </p>
              </li>
            </ul>

            <p className="problem-closing">
              Every one of those is money you earned, sitting in a
              broker&apos;s account instead of yours.
            </p>
          </div>
        </section>

        {/* 3. HOW IT WORKS */}
        <section id="how-it-works" className="section-band-bg">
          <div className="container">
            <div className="section-header-stack">
              <h2>From signed BOL to deposited check — and smarter reloads</h2>
            </div>

            <div className="steps-grid">
              <div className="step-column">
                <span className="step-number">01</span>
                <h3>Step 1 — Hand over the BOLs &amp; rate cons.</h3>
                <p>
                  Upload your rate cons, signed BOLs, and ELD exports.
                  BillOff-Lading builds a detention file for every load —
                  arrival, departure, free time, and the broker&apos;s own terms.
                </p>
              </div>

              <div className="step-column">
                <span className="step-number">02</span>
                <h3>Step 2 — Ghost-Clerk files &amp; chases the claim.</h3>
                <p>
                  Sent from your white-labeled billing desk inside the notice
                  window with the signed BOL attached, followed by polite day-7,
                  14, and 30 follow-ups until paid or answered in writing.
                </p>
              </div>

              <div className="step-column">
                <span className="step-number">03</span>
                <h3>Step 3 — Search brokers verified by real BOLs.</h3>
                <p>
                  Every anonymized BOL feeds the Open-Market Broker &amp; Lane
                  Fit Index — so you can find brokers on your lanes who turn
                  trucks fast and actually pay detention.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* DEMO MOMENT + INTERACTIVE BROKER & LANE FIT SEARCH RADAR */}
        <section className="section-band-surface">
          <div className="container">
            <div className="section-header-stack">
              <p className="demo-intro-line">
                No mockups — this is what a BillOff-Lading claim and broker
                scorecard look like.
              </p>
              <h2>Here&apos;s one load, start to finish.</h2>
            </div>

            <div className="demo-panels-grid">
              {/* LEFT PANEL */}
              <div className="demo-card">
                <h3 className="demo-panel-label">
                  The load, as your driver lived it
                </h3>
                <ul className="timeline-list">
                  <li className="timeline-item">
                    Load #4417 — Dry van, Joliet, IL receiver
                  </li>
                  <li className="timeline-item">
                    Rate con, page 2: &ldquo;Detention{' '}
                    <span className="claim-dollar-figure">$60/hr</span> after 2
                    hrs free time. Carrier must notify broker within 24 hrs of
                    occurrence.&rdquo;
                  </li>
                  <li className="timeline-item">
                    08:04 CT — Arrived at receiver (ELD/GPS timestamp)
                  </li>
                  <li className="timeline-item">
                    10:12 CT — Detention notice emailed to broker (inside the
                    24-hr window)
                  </li>
                  <li className="timeline-item">
                    14:31 CT — BOL signed by receiver
                  </li>
                  <li className="timeline-item">
                    14:37 CT — Departed (ELD/GPS timestamp)
                  </li>
                  <li className="timeline-item timeline-item-highlight">
                    Total dwell: 6 hrs 33 min
                  </li>
                </ul>
              </div>

              {/* RIGHT PANEL */}
              <div>
                <div className="demo-email-card">
                  <h3 className="demo-panel-label">
                    The claim BillOff-Lading files the same day (via Ghost-Clerk)
                  </h3>
                  <div className="email-subject-line">
                    Subject: Detention Claim — Load #4417 —{' '}
                    <span className="claim-dollar-figure">$275.00</span> —
                    documentation attached
                  </div>
                  <div className="email-body-copy">
                    <p>
                      Per rate confirmation #RC-88214 (detention: $60/hr after 2
                      hrs free time), we are submitting a detention claim for
                      Load #4417, delivered 10/14.
                    </p>
                    <ul className="email-meta-list">
                      <li>— Arrival (ELD/GPS): 08:04 CT</li>
                      <li>— Departure (ELD/GPS): 14:37 CT</li>
                      <li>
                        — Total dwell: 6 hrs 33 min · Free time: 2 hrs ·
                        Billable: 4 hrs 35 min
                      </li>
                      <li>
                        — Amount due:{' '}
                        <span className="claim-dollar-figure">$275.00</span>
                      </li>
                      <li>
                        — Notice sent: 10:12 CT (timestamped copy attached)
                      </li>
                    </ul>
                    <p>
                      Attached: signed BOL, ELD log excerpt, rate con page 2.
                    </p>
                    <p>
                      Please confirm payment within 15 days. We&apos;ll follow
                      up on day 7, 14, and 30.
                    </p>
                  </div>
                </div>
                <p className="demo-followup-caption">
                  Sent from your white-labeled carrier billing address ·
                  Follow-ups scheduled: Day 7 · Day 14 · Day 30.
                </p>
              </div>
            </div>

            {/* NEW: INTERACTIVE BROKER & LANE FIT SEARCH RADAR (DEC-11 & DEC-13) */}
            <div className="radar-box">
              <div>
                <h3>
                  Open-Market Broker &amp; Lane Fit Search (Powered by Real
                  BOLs)
                </h3>
                <p className="small-text">
                  Test the index: search a corridor or broker MC# below to see
                  how BillOff-Lading ranks broker arrangements by BOL-verified
                  dock dwell time, rate-con fairness, and actual detention
                  payouts.
                </p>
              </div>

              <form
                className="radar-search-bar"
                onSubmit={handleRadarSearchSubmit}
              >
                <input
                  type="text"
                  className="capture-input"
                  placeholder="Search Lane (e.g. Joliet, IL to Atlanta, GA) or Broker MC#..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
                <button type="submit" className="btn-secondary">
                  Check Broker &amp; Dock Fit
                </button>
              </form>

              <div className="radar-filter-chips">
                {BENCHMARK_LANES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`radar-chip ${
                      committedSearchQuery === item.queryMatch
                        ? 'radar-chip-active'
                        : ''
                    }`}
                    onClick={() => {
                      setSearchInput(item.queryMatch);
                      setCommittedSearchQuery(item.queryMatch);
                    }}
                  >
                    {item.queryMatch}
                  </button>
                ))}
              </div>

              <table className="radar-results-table">
                <thead>
                  <tr>
                    <th>Lane / Corridor</th>
                    <th>Broker Arrangement</th>
                    <th>BOL-Verified Dwell</th>
                    <th>Rate-Con Clause</th>
                    <th>Detention Payout %</th>
                    <th>True-Yield Fit</th>
                  </tr>
                </thead>
                <tbody>
                  {BENCHMARK_LANES.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.lane}</strong>
                      </td>
                      <td>{row.brokerProfile}</td>
                      <td>{row.bolVerifiedDwell}</td>
                      <td>{row.rateConTerms}</td>
                      <td>
                        <span className="claim-dollar-figure">
                          {row.detentionPayoutRate}
                        </span>
                      </td>
                      <td>
                        <strong>{row.fitScore}</strong> — {row.verdict}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="post-demo-capture-band" style={{ marginTop: 0 }}>
                <div>
                  <h3>
                    Unlock your 90-day BOL Audit + Custom Broker Fit Matches
                  </h3>
                  <p className="small-text">
                    See every dollar of unpaid detention in your past loads AND
                    which verified brokers on your exact lanes pay on time.
                  </p>
                </div>
                <EmailCaptureForm
                  defaultSource="post_demo_inline"
                  selectedTier={null}
                  activeSearchQuery={committedSearchQuery}
                  onClearTier={() => setCommittedSearchQuery(null)}
                  inputRef={postDemoInputRef}
                  onLeadCaptured={setLastCapturedLead}
                />
              </div>
            </div>
          </div>
        </section>

        {/* 4. BENEFITS */}
        <section className="section-band-bg">
          <div className="container">
            <div className="section-header-stack">
              <h2>What your fleet gets</h2>
            </div>

            <div className="benefits-grid">
              <div className="benefit-card">
                <svg className="benefit-icon" viewBox="0 0 24 24">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <polyline points="9 15 11 17 15 13" />
                </svg>
                <h3>Claims that stick.</h3>
                <p>
                  Every claim ships with GPS timestamps, the signed BOL, and the
                  rate con terms cited — nothing for a broker to reject.
                </p>
              </div>

              <div className="benefit-card">
                <svg className="benefit-icon" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <h3>Never miss a notice window.</h3>
                <p>
                  BillOff-Lading reads the deadline in each rate con and files
                  inside it, every time.
                </p>
              </div>

              <div className="benefit-card">
                <svg className="benefit-icon" viewBox="0 0 24 24">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                <h3>Ghost-Clerk follow-ups.</h3>
                <p>
                  Sent from your white-labeled billing address on day 7, 14, and
                  30 so you never have to nag a broker you still want loads
                  from.
                </p>
              </div>

              <div className="benefit-card">
                <svg className="benefit-icon" viewBox="0 0 24 24">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                  <line x1="2" y1="20" x2="22" y2="20" />
                </svg>
                <h3>BOL-Verified Broker Fit Search.</h3>
                <p>
                  Search brokers and receivers by real dock turn times, hidden
                  rate-con traps, and verified detention payout percentages.
                </p>
              </div>

              <div className="benefit-card">
                <svg className="benefit-icon" viewBox="0 0 24 24">
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </svg>
                <h3>Recover money you already wrote off.</h3>
                <p>
                  Back-claims on loads up to 12 months old — you pay only if the
                  money comes in.
                </p>
              </div>

              <div className="benefit-card">
                <svg className="benefit-icon" viewBox="0 0 24 24">
                  <path d="M11 17l-4-4 3-3 4 4" />
                  <path d="M2 11l6-6 4 4" />
                  <path d="M22 11l-6-6-5 5" />
                  <path d="M14 14l3 3 5-5" />
                </svg>
                <h3>Keep broker relationships intact.</h3>
                <p>
                  Professional, documented, consistent — the tone of a sharp
                  office manager, with zero collections-agency threats.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 5. PRICING */}
        <section id="pricing" className="section-band-surface">
          <div className="container">
            <div className="section-header-stack">
              <h2>Pay less than one paid claim per truck</h2>
            </div>

            <div className="pricing-grid">
              {/* Tier 1 */}
              <div className="pricing-card">
                <div>
                  <h3>Tier 1 — Dock &amp; Broker Audit</h3>
                  <div className="pricing-price">Free</div>
                  <ul className="pricing-feature-list">
                    <li>90-day look-back across your past BOLs &amp; loads</li>
                    <li>
                      Every missed or short-paid detention claim, in dollars
                    </li>
                    <li>
                      Broker Scorecard + Top 3 high-paying broker matches on
                      your lanes
                    </li>
                    <li>No card, no commitment</li>
                  </ul>
                  <p className="small-text">
                    <strong>Best for:</strong> owner-operators &amp; fleets that
                    want proof of the leak before spending a dime.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() =>
                    handleSelectPricingTier('Dock & Broker Audit — Free')
                  }
                >
                  Get my free detention audit
                </button>
              </div>

              {/* Tier 2 — Recommended */}
              <div className="pricing-card pricing-card-recommended">
                <span className="recommended-badge">Recommended</span>
                <div>
                  <h3>Tier 2 — Recovery + Broker Search</h3>
                  <div className="pricing-price">$99/truck/month</div>
                  <ul className="pricing-feature-list">
                    <li>
                      Unlimited Ghost-Clerk detention claims &amp; day-7/14/30
                      follow-ups
                    </li>
                    <li>
                      Full access to the Open-Market Broker &amp; Lane Fit
                      Search Engine
                    </li>
                    <li>
                      Rate-Con Clause X-Ray before you book a new broker load
                    </li>
                    <li>Evidence vault for BOLs, rate cons, and timestamps</li>
                  </ul>
                  <p className="small-text">
                    <strong>Best for:</strong> 1–100 truck fleets done leaving
                    detention money and dock hours on the table.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() =>
                    handleSelectPricingTier('Recovery + Search — $99/truck/mo')
                  }
                >
                  Reserve my founding-fleet spot
                </button>
              </div>

              {/* Tier 3 */}
              <div className="pricing-card">
                <div>
                  <h3>Tier 3 — Back-Claims</h3>
                  <div className="pricing-price">20% of what we recover</div>
                  <ul className="pricing-feature-list">
                    <li>
                      Claims up to 12 months old you&apos;d already written off
                    </li>
                    <li>No recovery, no fee — ever</li>
                    <li>Full documentation rebuilt from your old BOLs</li>
                    <li>Works alongside the Recovery + Search plan</li>
                  </ul>
                  <p className="small-text">
                    <strong>Best for:</strong> turning dead invoices into a
                    check.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() =>
                    handleSelectPricingTier('Back-Claims — 20% of recovery')
                  }
                >
                  Reserve my founding-fleet spot
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* 6. FAQ */}
        <section id="faq" className="section-band-bg">
          <div className="container">
            <div className="section-header-stack">
              <h2>Frequently asked questions</h2>
            </div>

            <div className="faq-list">
              {faqItems.map((item, idx) => {
                const isOpen = openFaqIndex === idx;
                return (
                  <div key={item.q} className="faq-row">
                    <button
                      type="button"
                      className="faq-trigger"
                      aria-expanded={isOpen}
                      onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    >
                      <span>{item.q}</span>
                      <span>{isOpen ? '−' : '+'}</span>
                    </button>
                    {isOpen && <p className="faq-answer">{item.a}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* 7. FINAL CTA */}
        <section ref={finalCtaSectionRef} className="section-band-dark">
          <div className="container">
            <div className="final-cta-stack">
              <h2>
                Every detained hour on your BOL is billable. BillOff-Lading
                makes sure it gets billed — and shows you which brokers actually
                pay.
              </h2>
              <p className="final-risk-reversal">
                Founding fleets get the 90-day BOL audit + Broker Fit Report
                free and lock in founding pricing. See the dollar amount
                you&apos;re owed before you spend anything.
              </p>

              <EmailCaptureForm
                defaultSource="final_cta_inline"
                selectedTier={selectedTier}
                activeSearchQuery={committedSearchQuery}
                onClearTier={() => {
                  setSelectedTier(null);
                  setCommittedSearchQuery(null);
                }}
                inputRef={finalCtaInputRef}
                onLeadCaptured={setLastCapturedLead}
              />
            </div>
          </div>
        </section>
      </main>

      {/* Live Lead Capture Verification Bar */}
      {lastCapturedLead && (
        <aside
          aria-label="Firestore Lead Verification"
          style={{
            borderTop: '1px solid var(--border)',
            backgroundColor: 'var(--background)',
            padding: 'var(--space-16) var(--space-24)',
            fontSize: 'var(--small-size)',
          }}
        >
          <div className="container">
            <strong>Lead Stored in `leads` Collection:</strong>{' '}
            <code>
              {JSON.stringify({
                email: lastCapturedLead.email,
                source: lastCapturedLead.source,
                tier: lastCapturedLead.tier,
                channel: lastCapturedLead.channel,
                search_query: lastCapturedLead.search_query,
                timestamp: lastCapturedLead.timestamp,
              })}
            </code>
          </div>
        </aside>
      )}
    </div>
  );
}