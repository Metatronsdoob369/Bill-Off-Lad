import React, { useState, useRef, useEffect } from 'react';
import './styles.css';
import { ClockHero, BrokerBoard, StampedBol } from './LanderShowpieces';
import {
  submitFleetLead,
  LeadSource,
  PricingTierName,
  LeadRecord,
} from './firebase';
import { evaluateDockProximity, DockProximityResult } from './geotrans';
import {
  DispatchWorkbench,
  WorkbenchTabId,
  BENCHMARK_LANES,
  BrokerFitBenchmark,
  YARD_SCENARIOS,
  JOLIET_DOCK,
  BillOffLadingLogo,
  computeClampedBrokerFitScore,
} from './Workbench';

export { computeClampedBrokerFitScore };

function EmailCaptureForm({
  defaultSource,
  selectedTier,
  activeSearchQuery,
  buttonLabel = 'Get my free detention audit',
  onClearTier,
  inputRef,
  onLeadCaptured,
  onOpenWorkbench,
}: {
  defaultSource: LeadSource;
  selectedTier: PricingTierName;
  activeSearchQuery?: string | null;
  buttonLabel?: string;
  onClearTier?: () => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onLeadCaptured: (record: LeadRecord) => void;
  onOpenWorkbench: () => void;
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
        <p style={{ marginBottom: 'var(--space-16)' }}>
          You&apos;re on the founding-fleet list. We onboard in small batches —
          you&apos;ll get an email from the founder within 7 days to set up your
          free 90-day audit and tell us roughly how many trucks you run.
        </p>
        <button
          type="button"
          className="btn-primary"
          onClick={onOpenWorkbench}
        >
          Open Unlocked Dispatch Workbench (/app) →
        </button>
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
                Queued for your fleet: <strong>{activeSearchQuery}</strong>
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
          {buttonLabel}
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
  // Option A Route & Auto-Unlock Controller (/ vs /app)
  const [currentView, setCurrentView] = useState<'lander' | 'app'>(() =>
    window.location.pathname === '/app' || window.location.hash === '#/app'
      ? 'app'
      : 'lander'
  );
  const [initialWorkbenchTab, setInitialWorkbenchTab] =
    useState<WorkbenchTabId>('claim');
  const [isWorkbenchUnlocked, setIsWorkbenchUnlocked] = useState<boolean>(() =>
    Boolean(sessionStorage.getItem('bol_workbench_unlocked'))
  );

  // Compact 2-Tab Proof Teaser Switcher on / (Strict Lock #4)
  const [landerTeaserTab, setLanderTeaserTab] = useState<'gps' | 'radar'>(
    'gps'
  );

  // Shared Geospatial Proximity & Live Walk Test State
  const [selectedYardScenario, setSelectedYardScenario] = useState('bumper');
  const [liveGpsStatus, setLiveGpsStatus] = useState<string | null>(null);
  const [proximity, setProximity] = useState<DockProximityResult>(() =>
    evaluateDockProximity(
      JOLIET_DOCK.lat,
      JOLIET_DOCK.lon,
      YARD_SCENARIOS[0].truckLat,
      YARD_SCENARIOS[0].truckLon
    )
  );

  // Shared 100m MGRS Facility Cluster & Clamped [0, 1] True-Yield State
  const [selectedCluster, setSelectedCluster] = useState<BrokerFitBenchmark>(
    BENCHMARK_LANES[0]
  );
  const [simPayout, setSimPayout] = useState(BENCHMARK_LANES[0].payoutRatePct);
  const [simDwell, setSimDwell] = useState(BENCHMARK_LANES[0].avgDwellMins);
  const [simRate, setSimRate] = useState(
    BENCHMARK_LANES[0].detentionRateDollars
  );
  const [simNotice, setSimNotice] = useState(
    BENCHMARK_LANES[0].noticeWindowHrs
  );

  // Lead Capture & Navigation State
  const [selectedTier, setSelectedTier] = useState<PricingTierName>(null);
  const [activeHeroSource, setActiveHeroSource] =
    useState<LeadSource>('hero_inline');
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

  useEffect(() => {
    const handlePopState = () => {
      const isApp =
        window.location.pathname === '/app' || window.location.hash === '#/app';
      setCurrentView(isApp ? 'app' : 'lander');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateToView = (
    view: 'lander' | 'app',
    tabOverride?: WorkbenchTabId
  ) => {
    if (tabOverride) {
      setInitialWorkbenchTab(tabOverride);
    }
    setCurrentView(view);
    window.history.pushState({}, '', view === 'app' ? '/app' : '/');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLeadCaptured = (record: LeadRecord) => {
    setLastCapturedLead(record);
    sessionStorage.setItem('bol_workbench_unlocked', 'true');
    setIsWorkbenchUnlocked(true);
  };

  const handleSelectScenario = (scenarioId: string) => {
    setSelectedYardScenario(scenarioId);
    setLiveGpsStatus(null);
    const found =
      YARD_SCENARIOS.find((s) => s.id === scenarioId) || YARD_SCENARIOS[0];
    const nextProx = evaluateDockProximity(
      JOLIET_DOCK.lat,
      JOLIET_DOCK.lon,
      found.truckLat,
      found.truckLon
    );
    setProximity(nextProx);
    setCommittedSearchQuery(
      `Dock Proof: ${nextProx.feetFromDock} ft (${nextProx.trailerLengths53Ft} Truck Lengths) · ${nextProx.mgrs1m}`
    );
  };

  const handleRunLiveWalkTest = (simulate35FtWalk: boolean) => {
    if (!navigator.geolocation) {
      setLiveGpsStatus(
        "Device GPS unavailable — running simulated +35 ft (Half a 53' Trailer) walk."
      );
      const fallbackResult = evaluateDockProximity(
        JOLIET_DOCK.lat,
        JOLIET_DOCK.lon,
        JOLIET_DOCK.lat + 0.000096, // ~35 ft (10.7m)
        JOLIET_DOCK.lon
      );
      setProximity(fallbackResult);
      return;
    }

    setLiveGpsStatus('Acquiring hardware GPS lock (Zero Map APIs)...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const baseLat = pos.coords.latitude;
        const baseLon = pos.coords.longitude;
        // +0.000096 deg latitude ≈ +35 feet (Half a 53' trailer)
        const targetLat = simulate35FtWalk ? baseLat + 0.000096 : baseLat;
        const result = evaluateDockProximity(
          baseLat,
          baseLon,
          targetLat,
          baseLon
        );
        setProximity(result);
        setLiveGpsStatus(
          simulate35FtWalk
            ? "Live GPS Walk Test (+35 ft / Half a 53' Trailer simulated from your hardware GPS lock)"
            : 'Hardware GPS locked as Virtual Dock Bumper (0 ft reference).'
        );
      },
      () => {
        const result = evaluateDockProximity(
          JOLIET_DOCK.lat,
          JOLIET_DOCK.lon,
          JOLIET_DOCK.lat + 0.000096,
          JOLIET_DOCK.lon
        );
        setProximity(result);
        setLiveGpsStatus(
          "Simulated +35 ft (Half a 53' Trailer) offset verified locally."
        );
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  const handleSelectCluster = (cluster: BrokerFitBenchmark) => {
    setSelectedCluster(cluster);
    setSimPayout(cluster.payoutRatePct);
    setSimDwell(cluster.avgDwellMins);
    setSimRate(cluster.detentionRateDollars);
    setSimNotice(cluster.noticeWindowHrs);
    setCommittedSearchQuery(
      `${cluster.facilityClusterId} · ${cluster.lane} (${cluster.brokerProfile})`
    );
  };

  const liveBrokerFitScore = computeClampedBrokerFitScore({
    payoutRatePct: simPayout,
    avgDwellMins: simDwell,
    detentionRateDollars: simRate,
    noticeWindowHrs: simNotice,
  });

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

  // RENDER STANDALONE 4-TAB DISPATCH WORKBENCH (/app)
  if (currentView === 'app') {
    return (
      <DispatchWorkbench
        isUnlocked={isWorkbenchUnlocked}
        initialTab={initialWorkbenchTab}
        selectedYardScenario={selectedYardScenario}
        onSelectYardScenario={handleSelectScenario}
        proximity={proximity}
        liveGpsStatus={liveGpsStatus}
        onRunLiveWalkTest={handleRunLiveWalkTest}
        selectedCluster={selectedCluster}
        onSelectCluster={handleSelectCluster}
        simPayout={simPayout}
        setSimPayout={setSimPayout}
        simDwell={simDwell}
        setSimDwell={setSimDwell}
        simRate={simRate}
        setSimRate={setSimRate}
        simNotice={simNotice}
        setSimNotice={setSimNotice}
        onUnlockSuccess={handleLeadCaptured}
        onBackToLander={() => navigateToView('lander')}
      />
    );
  }

  // RENDER CONVERSION LANDER (/) WITH COMPACT 2-TAB PROOF TEASER SWITCHER
  return (
    <div>
      {/* NAVIGATION: Strictly 3 links + 1 primary CTA */}
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
        {/* 1. HERO — B · The Clock Is Running */}
        <ClockHero
          captureSlot={
            <EmailCaptureForm
              defaultSource={activeHeroSource}
              selectedTier={null}
              inputRef={heroInputRef}
              onLeadCaptured={handleLeadCaptured}
              onOpenWorkbench={() => navigateToView('app', 'claim')}
            />
          }
          credibility={
            <>
              Fleets charge detention on 94.5% of eligible loads — but fewer
              than half of those invoices ever get paid. That&apos;s{' '}
              <span className="claim-dollar-figure">$3.6 billion</span> a year
              left at the dock.
            </>
          }
        />

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
                  bury 4-hour free-time traps or which docks steal a
                  driver&apos;s entire clock.
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
                  arrival, departure, free time, and the broker&apos;s own
                  terms.
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

        {/* C · BROKER BOARD */}
        <BrokerBoard onOpenRadar={() => navigateToView('app', 'radar')} />

        {/* A · STAMPED BOL */}
        <StampedBol />

        {/* WORKED EXAMPLE (LOAD #4417 = $275.00) + COMPACT 2-TAB PROOF TEASER SWITCHER */}
        <section className="section-band-surface">
          <div className="container">
            <div className="demo-header-row">
              <div>
                <p className="demo-intro-line">
                  No mockups — this is what a BillOff-Lading claim and broker
                  scorecard look like.
                </p>
                <h2>Here&apos;s one load, start to finish.</h2>
              </div>

              <button
                type="button"
                className="btn-secondary"
                onClick={() => navigateToView('app', 'claim')}
              >
                Launch Dispatch Workbench (/app) →
              </button>
            </div>

            {/* STATIC WORKED EXAMPLE: LOAD #4417 ($275.00 VERBATIM) */}
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
                    08:02 CT — Arrived at receiver (ELD/GPS timestamp)
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
                    Total dwell: 6 hrs 35 min
                  </li>
                </ul>
              </div>

              {/* RIGHT PANEL */}
              <div>
                <div className="demo-email-card">
                  <h3 className="demo-panel-label">
                    The claim BillOff-Lading files the same day (via
                    Ghost-Clerk)
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
                      <li>— Arrival (ELD/GPS): 08:02 CT</li>
                      <li>— Departure (ELD/GPS): 14:37 CT</li>
                      <li>
                        — Total dwell: 6 hrs 35 min · Free time: 2 hrs ·
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

            {/* COMPACT 2-TAB PROOF TEASER SWITCHER ON / (Strict Lock #4) */}
            <div className="radar-box">
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'space-between',
                  alignItems: 'flex-end',
                  gap: 'var(--space-16)',
                }}
              >
                <div>
                  <p className="demo-intro-line">
                    Live Engineering Proof — Test Our Sub-Meter Geospatial Math
                    &amp; Broker Friction Index
                  </p>
                  <h3>
                    Verify the dock-bumper GPS &amp; lane radar right here.
                  </h3>
                </div>

                <div
                  className="demo-tab-switcher"
                  role="tablist"
                  aria-label="Live Claim Proof Teasers"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={landerTeaserTab === 'gps'}
                    className={`demo-tab-btn ${
                      landerTeaserTab === 'gps' ? 'demo-tab-btn-active' : ''
                    }`}
                    onClick={() => setLanderTeaserTab('gps')}
                  >
                    1. Test 53&apos; Trailer Dock GPS
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={landerTeaserTab === 'radar'}
                    className={`demo-tab-btn ${
                      landerTeaserTab === 'radar' ? 'demo-tab-btn-active' : ''
                    }`}
                    onClick={() => setLanderTeaserTab('radar')}
                  >
                    2. Test 100m MGRS Broker &amp; Facility Radar
                  </button>
                </div>
              </div>

              {/* TEASER TAB 1: 53' TRAILER DOCK GPS & +35 FT WALK TEST */}
              {landerTeaserTab === 'gps' ? (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-24)',
                  }}
                >
                  <div className="radar-filter-chips">
                    {YARD_SCENARIOS.map((scen) => (
                      <button
                        key={scen.id}
                        type="button"
                        className={`radar-chip ${
                          selectedYardScenario === scen.id
                            ? 'radar-chip-active'
                            : ''
                        }`}
                        onClick={() => handleSelectScenario(scen.id)}
                      >
                        {scen.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '6px 16px' }}
                      onClick={() => handleRunLiveWalkTest(false)}
                    >
                      Lock My Current Spot (0 ft Dock)
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ padding: '6px 16px' }}
                      onClick={() => handleRunLiveWalkTest(true)}
                    >
                      Test +35 ft Walk (Half a 53&apos; Trailer)
                    </button>
                  </div>

                  {liveGpsStatus && (
                    <p
                      className="small-text"
                      style={{ color: 'var(--accent)', fontWeight: 600 }}
                    >
                      {liveGpsStatus}
                    </p>
                  )}

                  <div className="steps-grid">
                    <div className="benefit-card">
                      <span className="small-text">
                        Distance from Dock Bumper
                      </span>
                      <div className="step-number">
                        {proximity.feetFromDock} ft ({proximity.metersFromDock}
                        m)
                      </div>
                      <span className="small-text tabular-nums">
                        <strong>{proximity.trailerLengths53Ft}</strong> Truck
                        Lengths (53&apos; rig scale)
                      </span>
                    </div>

                    <div className="benefit-card">
                      <span className="small-text">
                        150m Automated Boundary Verdict
                      </span>
                      <h3 style={{ color: 'var(--accent)' }}>
                        {proximity.dispatcherVerdict}
                      </h3>
                      <span className="small-text tabular-nums">
                        {proximity.boundaryStatus}
                      </span>
                    </div>

                    <div className="benefit-card">
                      <span className="small-text">
                        1-Meter Dock Stamp &amp; 100m Cluster
                      </span>
                      <h3 className="tabular-nums">{proximity.mgrs1m}</h3>
                      <span className="small-text tabular-nums">
                        Facility Cluster Key:{' '}
                        <strong>{proximity.mgrs100mClusterId}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="email-meta-list">
                    <strong>
                      Timestamp-to-Offset Visual Geofence Plot (Embedded on Page
                      1 of Claim PDF):
                    </strong>
                    <svg
                      viewBox="0 0 720 135"
                      style={{
                        width: '100%',
                        height: 'auto',
                        marginTop: 'var(--space-8)',
                      }}
                    >
                      <rect
                        width="720"
                        height="135"
                        fill="var(--surface)"
                        stroke="var(--border)"
                      />
                      <line
                        x1="40"
                        y1="40"
                        x2="680"
                        y2="40"
                        stroke="var(--accent)"
                        strokeDasharray="6 4"
                        strokeWidth="1.5"
                      />
                      <text
                        x="50"
                        y="32"
                        fill="var(--accent)"
                        fontSize="11"
                        fontWeight="600"
                      >
                        150m Facility Boundary Gate (492 ft)
                      </text>
                      <line
                        x1="40"
                        y1="88"
                        x2="680"
                        y2="88"
                        stroke="var(--border)"
                        strokeWidth="1.5"
                      />
                      <text x="50" y="81" fill="var(--text-muted)" fontSize="11">
                        50m Dock Bumper Apron (164 ft)
                      </text>
                      <polyline
                        fill="none"
                        stroke="var(--text-primary)"
                        strokeWidth="2.5"
                        points="90,56 210,112 510,112 640,22"
                      />
                      <circle cx="90" cy="56" r="5" fill="var(--accent)" />
                      <text
                        x="65"
                        y="73"
                        fill="var(--text-primary)"
                        fontSize="11"
                        fontWeight="600"
                      >
                        T+0m: 394 ft (Bullpen)
                      </text>
                      <circle cx="210" cy="112" r="5" fill="var(--accent)" />
                      <circle cx="510" cy="112" r="5" fill="var(--accent)" />
                      <text
                        x="220"
                        y="128"
                        fill="var(--accent)"
                        fontSize="11"
                        fontWeight="700"
                      >
                        T+15m to T+210m: {proximity.feetFromDock} ft —{' '}
                        {proximity.boundaryStatus}
                      </text>
                      <circle
                        cx="640"
                        cy="22"
                        r="5"
                        fill="var(--text-primary)"
                      />
                      <text
                        x="545"
                        y="18"
                        fill="var(--text-primary)"
                        fontSize="11"
                      >
                        T+225m: 607 ft (Departed)
                      </text>
                    </svg>
                  </div>
                </div>
              ) : (
                /* TEASER TAB 2: 100M MGRS BROKER & FACILITY RADAR */
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-24)',
                  }}
                >
                  <div className="radar-filter-chips">
                    {BENCHMARK_LANES.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`radar-chip ${
                          selectedCluster.id === item.id
                            ? 'radar-chip-active'
                            : ''
                        }`}
                        onClick={() => handleSelectCluster(item)}
                      >
                        {item.facilityClusterId} · {item.lane}
                      </button>
                    ))}
                  </div>

                  <div className="demo-panels-grid">
                    <div className="benefit-card">
                      <h3>
                        Cluster {selectedCluster.facilityClusterId} —{' '}
                        {selectedCluster.facilityName}
                      </h3>
                      <p className="small-text">
                        <strong>Broker Arrangement:</strong>{' '}
                        {selectedCluster.brokerProfile}
                      </p>
                      <p className="small-text">
                        <strong>Average Dwell Forecast:</strong>{' '}
                        {selectedCluster.fridayForecast}
                      </p>
                      <p className="small-text">
                        <strong>Broker Friction Index:</strong>{' '}
                        <span className="claim-dollar-figure">
                          {selectedCluster.detentionPayoutRate}
                        </span>
                      </p>
                      <div className="email-meta-list">
                        <strong>Pre-Flight Rate Negotiation Advisory:</strong>
                        <span>{selectedCluster.preFlightAdvisory}</span>
                      </div>
                    </div>

                    <div className="benefit-card">
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'baseline',
                        }}
                      >
                        <h3>True-Yield Broker Fit Calculator</h3>
                        <span className="step-number">
                          {liveBrokerFitScore} / 100
                        </span>
                      </div>

                      <div className="sliders-grid">
                        <label className="slider-control">
                          <span>
                            Verified Payout: <strong>{simPayout}%</strong>
                          </span>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={simPayout}
                            onChange={(e) =>
                              setSimPayout(Number(e.target.value))
                            }
                          />
                        </label>

                        <label className="slider-control">
                          <span>
                            BOL Avg Dwell: <strong>{simDwell} mins</strong>
                          </span>
                          <input
                            type="range"
                            min={30}
                            max={480}
                            step={5}
                            value={simDwell}
                            onChange={(e) =>
                              setSimDwell(Number(e.target.value))
                            }
                          />
                        </label>

                        <label className="slider-control">
                          <span>
                            Detention Rate: <strong>${simRate}/hr</strong>
                          </span>
                          <input
                            type="range"
                            min={20}
                            max={100}
                            step={5}
                            value={simRate}
                            onChange={(e) => setSimRate(Number(e.target.value))}
                          />
                        </label>

                        <label className="slider-control">
                          <span>
                            Notice Window: <strong>{simNotice} hrs</strong>
                          </span>
                          <input
                            type="range"
                            min={2}
                            max={48}
                            step={2}
                            value={simNotice}
                            onChange={(e) =>
                              setSimNotice(Number(e.target.value))
                            }
                          />
                        </label>
                      </div>

                      <p className="small-text">
                        {liveBrokerFitScore >= 75
                          ? 'Green-Light Fit — Fast dock turns & high accessorial recovery.'
                          : liveBrokerFitScore >= 50
                          ? 'Caution — Pad linehaul rate or enforce strict ELD notice.'
                          : 'High Detention Trap — Severe unpaid dock sit risk.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* INLINE EMAIL CAPTURE BAR + LAUNCH DISPATCH WORKBENCH (/app) CTA */}
              <div className="post-demo-capture-band" style={{ marginTop: 0 }}>
                <div style={{ maxWidth: '460px' }}>
                  <h3>
                    Unlock the 4-Tab Dispatch Workbench + Your Free 90-Day Audit
                  </h3>
                  <p
                    className="small-text"
                    style={{ marginBottom: 'var(--space-12)' }}
                  >
                    Enter your fleet email to unlock full vector PDF exports
                    (Forms 101-A, 102-B, 103-C) and live BOL OCR — or preview
                    the workbench right now.
                  </p>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() =>
                      navigateToView(
                        'app',
                        landerTeaserTab === 'radar' ? 'radar' : 'gps'
                      )
                    }
                  >
                    Launch Dispatch Workbench (/app) →
                  </button>
                </div>

                <EmailCaptureForm
                  defaultSource="post_demo_inline"
                  selectedTier={null}
                  activeSearchQuery={committedSearchQuery}
                  onClearTier={() => setCommittedSearchQuery(null)}
                  inputRef={postDemoInputRef}
                  onLeadCaptured={handleLeadCaptured}
                  onOpenWorkbench={() => navigateToView('app', 'claim')}
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
                onLeadCaptured={handleLeadCaptured}
                onOpenWorkbench={() => navigateToView('app', 'claim')}
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
