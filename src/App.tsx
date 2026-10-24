import React, { useState, useRef } from 'react';
import './styles.css';
import {
  submitFleetLead,
  LeadSource,
  PricingTierName,
  LeadRecord,
} from './firebase';
import {
  computePlanarDockOffsetMeters,
  computeEldBreadcrumbPlot,
  getSpatialFacilityIntelligence,
  evaluateBoundaryEnclosure,
} from './geotrans';
import {
  generateCarrierPdfSuite,
  PdfFormTemplateType,
  CustomTemplateMode,
} from './pdfSuite';

interface BrokerFitBenchmark {
  id: string;
  queryMatch: string;
  lane: string;
  facilityClusterId: string;
  fridayForecast: string;
  brokerProfile: string;
  bolVerifiedDwell: string;
  avgDwellMins: number;
  rateConTerms: string;
  detentionRateDollars: number;
  noticeWindowHrs: number;
  detentionPayoutRate: string;
  payoutRatePct: number;
  disputedPct: number;
  verdict: string;
}

/**
 * Deterministic Clamped True-Yield & Broker Fit Scoring Formula (DEC-11)
 * Normalizes all 4 inputs to [0, 1] before computing the 0..100 composite score.
 */
export function computeClampedBrokerFitScore(params: {
  payoutRatePct: number;
  avgDwellMins: number;
  detentionRateDollars: number;
  noticeWindowHrs: number;
}): number {
  const payoutNorm = Math.max(0, Math.min(1, params.payoutRatePct / 100));
  const dwellNorm = Math.max(0, Math.min(1, 1 - params.avgDwellMins / 360));
  const rateNorm = Math.max(0, Math.min(1, params.detentionRateDollars / 100));
  const noticeNorm = Math.max(0, Math.min(1, params.noticeWindowHrs / 48));
  return Math.round(
    (0.4 * payoutNorm + 0.3 * dwellNorm + 0.2 * rateNorm + 0.1 * noticeNorm) *
      100
  );
}

const BENCHMARK_LANES: BrokerFitBenchmark[] = [
  {
    id: 'mw-se',
    queryMatch: 'Joliet, IL → Atlanta, GA (Dry Van)',
    lane: 'Joliet, IL → Atlanta, GA',
    facilityClusterId: '16T-EN-099-976',
    fridayForecast: 'Facility 16T-EN-099-976 averages 3.4 hrs dwell on Friday afternoons',
    brokerProfile: 'MC #481920 (Midwest Contract Group)',
    bolVerifiedDwell: '1 hr 18 min avg (142 BOLs)',
    avgDwellMins: 78,
    rateConTerms: '$65/hr after 2 hrs · 24-hr notice window',
    detentionRateDollars: 65,
    noticeWindowHrs: 24,
    detentionPayoutRate: '91.4% Approved / 8.6% Disputed',
    payoutRatePct: 91.4,
    disputedPct: 8.6,
    verdict: 'Green-Light Fit — Fast dock turns & honors ELD timestamps',
  },
  {
    id: 'mw-trap',
    queryMatch: 'Chicago, IL → Dallas, TX (Reefer / Grocery)',
    lane: 'Chicago, IL → Dallas, TX',
    facilityClusterId: '14S-PB-113-147',
    fridayForecast: 'Facility 14S-PB-113-147 averages 5.7 hrs dwell on Friday unloads',
    brokerProfile: 'MC #774102 (National Spot Brokerage)',
    bolVerifiedDwell: '5 hrs 42 min avg (319 BOLs)',
    avgDwellMins: 342,
    rateConTerms: '$35/hr after 4 hrs · 12-hr strict notice trap',
    detentionRateDollars: 35,
    noticeWindowHrs: 12,
    detentionPayoutRate: '18.2% Approved / 81.8% Disputed',
    payoutRatePct: 18.2,
    disputedPct: 81.8,
    verdict: 'High Detention Trap — Demand +$275 pre-flight linehaul pad',
  },
  {
    id: 'se-regional',
    queryMatch: 'Birmingham, AL → Memphis, TN (Dry Van / Flatbed)',
    lane: 'Birmingham, AL → Memphis, TN',
    facilityClusterId: '16S-BD-223-926',
    fridayForecast: 'Facility 16S-BD-223-926 averages 2.8 hrs crane wait on mornings',
    brokerProfile: 'MC #309441 (Southern Industrial Freight)',
    bolVerifiedDwell: '1 hr 04 min avg (88 BOLs)',
    avgDwellMins: 64,
    rateConTerms: '$60/hr after 2 hrs · 24-hr notice window',
    detentionRateDollars: 60,
    noticeWindowHrs: 24,
    detentionPayoutRate: '88.7% Approved / 11.3% Disputed',
    payoutRatePct: 88.7,
    disputedPct: 11.3,
    verdict: 'Green-Light Fit — Consistent sub-90 min receiver turns',
  },
  {
    id: 'pa-oh',
    queryMatch: 'Harrisburg, PA → Columbus, OH (Dry Van)',
    lane: 'Harrisburg, PA → Columbus, OH',
    facilityClusterId: '17T-NE-891-412',
    fridayForecast: 'Facility 17T-NE-891-412 averages 1.6 hrs dwell across all shifts',
    brokerProfile: 'MC #512890 (Keystone Dedicated Logistics)',
    bolVerifiedDwell: '1 hr 35 min avg (204 BOLs)',
    avgDwellMins: 95,
    rateConTerms: '$75/hr after 2 hrs · 48-hr notice window',
    detentionRateDollars: 75,
    noticeWindowHrs: 48,
    detentionPayoutRate: '94.0% Approved / 6.0% Disputed',
    payoutRatePct: 94.0,
    disputedPct: 6.0,
    verdict: 'Green-Light Fit — Top-decile accessorial compliance',
  },
];

interface BolSamplePreset {
  id: string;
  label: string;
  loadNumber: string;
  rateConId: string;
  brokerName: string;
  brokerMc: string;
  facilityLocation: string;
  deliveryDate: string;
  arrivalTime: string;
  departureTime: string;
  noticeSentTime: string;
  totalDwellMins: number;
  freeTimeMins: number;
  detentionRateDollars: number;
  noticeWindowHrs: number;
  redactedPiiFields: string[];
  needsReviewNote?: string | null;
  dockLat: number;
  dockLon: number;
  eldLat: number;
  eldLon: number;
  rawSnippet: string;
}

const SAMPLE_BOL_PRESETS: BolSamplePreset[] = [
  {
    id: 'joliet-4417',
    label: 'Load #4417 — Joliet, IL Dry Van (6h 33m dwell)',
    loadNumber: '4417',
    rateConId: 'RC-88214',
    brokerName: 'Midwest Contract Group',
    brokerMc: '481920',
    facilityLocation: 'Joliet, IL Cold & Dry Distribution',
    deliveryDate: '10/14',
    arrivalTime: '08:04 CT',
    departureTime: '14:37 CT',
    noticeSentTime: '10:12 CT',
    totalDwellMins: 393,
    freeTimeMins: 120,
    detentionRateDollars: 60,
    noticeWindowHrs: 24,
    redactedPiiFields: [
      'Carrier Name: [REDACTED BEFORE INDEXING]',
      'Carrier MC/DOT: [REDACTED]',
      'Driver Signature: [REDACTED]',
      'Linehaul Rate: [REDACTED]',
    ],
    needsReviewNote: null,
    dockLat: 41.525,
    dockLon: -88.0817,
    eldLat: 41.52509,
    eldLon: -88.08158,
    rawSnippet:
      'RATE CON #RC-88214 | Broker MC #481920 | Load #4417 | Receiver: Joliet, IL Distribution | Detention: $60/hr after 2 hrs free time. Carrier must notify broker within 24 hrs. Signed BOL + ELD: Arrived 08:04 CT, Notice Sent 10:12 CT, Signed 14:31 CT, Departed 14:37 CT (Total dwell 393 mins). Carrier: Prairie State Trucking MC#991024, Driver R. Miller, Linehaul $1,850.',
  },
  {
    id: 'dallas-9102',
    label: 'Load #9102 — Dallas, TX Grocery Reefer (5h 45m dwell)',
    loadNumber: '9102',
    rateConId: 'RC-55309',
    brokerName: 'National Spot Brokerage',
    brokerMc: '774102',
    facilityLocation: 'South Dallas Cold Storage Dock B',
    deliveryDate: '10/18',
    arrivalTime: '05:30 CT',
    departureTime: '11:15 CT',
    noticeSentTime: '07:40 CT',
    totalDwellMins: 345,
    freeTimeMins: 120,
    detentionRateDollars: 65,
    noticeWindowHrs: 24,
    redactedPiiFields: [
      'Carrier Name: [REDACTED BEFORE INDEXING]',
      'Carrier MC/DOT: [REDACTED]',
      'Driver Name: [REDACTED]',
      'Linehaul Rate: [REDACTED]',
    ],
    needsReviewNote: null,
    dockLat: 32.6518,
    dockLon: -96.7462,
    eldLat: 32.65191,
    eldLon: -96.74608,
    rawSnippet:
      'RATE CON #RC-55309 | Broker MC #774102 (National Spot Brokerage) | Load #9102 | Receiver: South Dallas Cold Storage | Detention $65/hr after 2 hrs free time, 24-hr notice required. ELD In: 05:30 CT, Broker Notified: 07:40 CT, ELD Out: 11:15 CT (345 mins total dwell).',
  },
  {
    id: 'birmingham-6380',
    label: 'Load #6380 — Birmingham Flatbed (Needs Review Flag)',
    loadNumber: '6380',
    rateConId: 'RC-31904',
    brokerName: 'Southern Industrial Freight',
    brokerMc: '309441',
    facilityLocation: 'Memphis, TN Structural Steel Yard',
    deliveryDate: '10/21',
    arrivalTime: '07:15 CT',
    departureTime: '13:55 CT',
    noticeSentTime: '09:20 CT',
    totalDwellMins: 400,
    freeTimeMins: 120,
    detentionRateDollars: 60,
    noticeWindowHrs: 24,
    redactedPiiFields: [
      'Carrier Name: [REDACTED BEFORE INDEXING]',
      'Carrier MC/DOT: [REDACTED]',
      'Driver PIN #246810: [REDACTED]',
      'Linehaul Rate: [REDACTED]',
    ],
    needsReviewNote:
      'Handwritten receiver sign-out ("13:45?") slightly smudged on BOL — auto-reconciled with ELD geofence departure (13:55 CT).',
    dockLat: 35.1495,
    dockLon: -90.049,
    eldLat: 35.14962,
    eldLon: -90.04889,
    rawSnippet:
      'RATE CON #RC-31904 | Broker MC #309441 (Southern Industrial Freight) | Load #6380 | Receiver: Memphis Structural Steel Yard | Detention $60/hr after 2 hrs free time. Driver Cab-Upload: Arrived 07:15 CT, Notice Sent 09:20 CT, Handwritten BOL Out smudged (13:45?), ELD GPS Departure 13:55 CT (400 mins total dwell).',
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
  buttonLabel = 'Get my free detention audit',
  onClearTier,
  inputRef,
  onLeadCaptured,
}: {
  defaultSource: LeadSource;
  selectedTier: PricingTierName;
  activeSearchQuery?: string | null;
  buttonLabel?: string;
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
                Queued for your fleet:{' '}
                <strong>{activeSearchQuery}</strong>
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
  const [selectedTier, setSelectedTier] = useState<PricingTierName>(null);
  const [activeHeroSource, setActiveHeroSource] =
    useState<LeadSource>('hero_inline');

  // Conversion Hierarchy Fix #4: Default tab is Worked Example (#4417), secondary tab is Live BOL Scanner
  const [activeDemoTab, setActiveDemoTab] = useState<
    'worked_example' | 'live_scanner'
  >('worked_example');

  // Live BOL Scanner & Ghost-Clerk Claim Builder state
  const [rawBolText, setRawBolText] = useState(
    SAMPLE_BOL_PRESETS[0].rawSnippet
  );
  const [isScanningBol, setIsScanningBol] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [claimLoadNumber, setClaimLoadNumber] = useState('4417');
  const [claimRateConId, setClaimRateConId] = useState('RC-88214');
  const [claimBrokerName, setClaimBrokerName] = useState(
    'Midwest Contract Group'
  );
  const [claimBrokerMc, setClaimBrokerMc] = useState('481920');
  const [claimFacility, setClaimFacility] = useState(
    'Joliet, IL Cold & Dry Distribution'
  );
  const [claimArrival, setClaimArrival] = useState('08:04 CT');
  const [claimDeparture, setClaimDeparture] = useState('14:37 CT');
  const [claimNoticeSent, setClaimNoticeSent] = useState('10:12 CT');
  const [claimTotalDwellMins, setClaimTotalDwellMins] = useState(393);
  const [claimFreeTimeMins, setClaimFreeTimeMins] = useState(120);
  const [claimDetentionRate, setClaimDetentionRate] = useState(60);
  const [ghostEmailAlias, setGhostEmailAlias] = useState(
    'billing@yourfleet.com'
  );
  const [followUpStage, setFollowUpStage] = useState<
    'day0' | 'day7' | 'day14' | 'day30'
  >('day0');
  const [redactedFields, setRedactedFields] = useState<string[]>(
    SAMPLE_BOL_PRESETS[0].redactedPiiFields
  );
  const [needsReviewNote, setNeedsReviewNote] = useState<string | null>(null);
  const [driverCutPct, setDriverCutPct] = useState<number>(75);
  const [copiedClaim, setCopiedClaim] = useState(false);
  const [showBrokerPortalPreview, setShowBrokerPortalPreview] =
    useState<boolean>(false);
  const [brokerPortalStatus, setBrokerPortalStatus] = useState<
    'pending' | 'approved_revised_rc' | 'disputed'
  >('pending');
  const [brokerDisputeReason, setBrokerDisputeReason] = useState<string>(
    'Driver arrived after scheduled appointment'
  );
  const [activeCoords, setActiveCoords] = useState({
    dockLat: SAMPLE_BOL_PRESETS[0].dockLat,
    dockLon: SAMPLE_BOL_PRESETS[0].dockLon,
    eldLat: SAMPLE_BOL_PRESETS[0].eldLat,
    eldLon: SAMPLE_BOL_PRESETS[0].eldLon,
  });
  const [liveGpsStatus, setLiveGpsStatus] = useState<string | null>(null);
  const [selectedClusterKey, setSelectedClusterKey] = useState<string>(
    '16T-EN-099-976'
  );

  // Pro Carrier PDF Suite & Custom Blank-Form Replica state
  const [selectedPdfFormType, setSelectedPdfFormType] =
    useState<PdfFormTemplateType>('full_3page_suite');
  const [customTemplateDataUrl, setCustomTemplateDataUrl] = useState<
    string | null
  >(null);
  const [customTemplateName, setCustomTemplateName] = useState<string | null>(
    null
  );
  const [customTemplateFormat, setCustomTemplateFormat] = useState<
    'PNG' | 'JPEG'
  >('PNG');
  const [customTemplateMode, setCustomTemplateMode] =
    useState<CustomTemplateMode>('letterhead_banner');
  const [showCalibrationGrid, setShowCalibrationGrid] =
    useState<boolean>(false);
  const [customOffsetX, setCustomOffsetX] = useState<number>(0);
  const [customOffsetY, setCustomOffsetY] = useState<number>(0);
  const [printPreviewBlobUrl, setPrintPreviewBlobUrl] = useState<string | null>(
    null
  );

  // Local 1-Meter Dock Grid & Planar Math (Zero external Map APIs)
  const geoProof = computePlanarDockOffsetMeters(
    activeCoords.dockLat,
    activeCoords.dockLon,
    activeCoords.eldLat,
    activeCoords.eldLon
  );
  const offsetFeet = Math.round(geoProof.planarOffsetMeters * 3.28084);
  const truckLengths = (offsetFeet / 70).toFixed(1); // 1 tractor + 53' trailer ≈ 70 ft
  const enclosureStamp = evaluateBoundaryEnclosure(geoProof.planarOffsetMeters);

  // B. Spatial Facility Intelligence & Detention Forecasting (100m Cluster ID Primary Key)
  const activeClusterId =
    selectedClusterKey === 'AUTO'
      ? geoProof.facilityMgrs100mClusterId
      : selectedClusterKey;
  const facilityIntel = getSpatialFacilityIntelligence(
    activeClusterId,
    claimFacility
  );

  // C. Timestamp-to-Offset Visual Geofence Plot (ELD Breadcrumb Series)
  const eldBreadcrumbSeries = computeEldBreadcrumbPlot(
    activeCoords.dockLat,
    activeCoords.dockLon,
    [
      {
        tPlusMins: 0,
        timestampLabel: claimArrival,
        eventLabel: 'T+0 min: Arrival at facility boundary',
        // ~120m planar offset from dock center
        lat: activeCoords.dockLat + 0.00086,
        lon: activeCoords.dockLon + 0.00082,
      },
      {
        tPlusMins: 15,
        timestampLabel: 'Backed into door',
        eventLabel: 'T+15 min: Backed into dock door (sustained 3.5+ hrs)',
        // ~12m planar offset (or active ELD test coordinate)
        lat: activeCoords.eldLat,
        lon: activeCoords.eldLon,
      },
      {
        tPlusMins: 128,
        timestampLabel: claimNoticeSent,
        eventLabel: 'T+128 min: Detention notice transmitted at dock bumper',
        lat: activeCoords.dockLat + 0.00008,
        lon: activeCoords.dockLon + 0.00009,
      },
      {
        tPlusMins: 225,
        timestampLabel: claimDeparture,
        eventLabel: 'T+225 min: Departed dock apron & cleared gate',
        // ~185m planar offset (>150m boundary exit)
        lat: activeCoords.dockLat + 0.00133,
        lon: activeCoords.dockLon + 0.00125,
      },
    ]
  );

  // Interactive Broker & Lane Fit Search Radar state
  const [searchInput, setSearchInput] = useState('');
  const [committedSearchQuery, setCommittedSearchQuery] = useState<
    string | null
  >(null);

  // Interactive Clamped True-Yield Fit Calculator sliders
  const [calcPayoutPct, setCalcPayoutPct] = useState(91.4);
  const [calcDwellMins, setCalcDwellMins] = useState(78);
  const [calcDetentionRate, setCalcDetentionRate] = useState(65);
  const [calcNoticeHrs, setCalcNoticeHrs] = useState(24);

  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [lastCapturedLead, setLastCapturedLead] = useState<LeadRecord | null>(
    null
  );

  const heroInputRef = useRef<HTMLInputElement | null>(null);
  const postDemoInputRef = useRef<HTMLInputElement | null>(null);
  const finalCtaInputRef = useRef<HTMLInputElement | null>(null);
  const finalCtaSectionRef = useRef<HTMLElement | null>(null);

  // Computed Ghost-Clerk Claim figures & Driver Settlement Split
  const billableMins = Math.max(0, claimTotalDwellMins - claimFreeTimeMins);
  const billableHoursFormatted = `${Math.floor(billableMins / 60)} hrs ${
    billableMins % 60
  } min`;
  const totalDwellFormatted = `${Math.floor(claimTotalDwellMins / 60)} hrs ${
    claimTotalDwellMins % 60
  } min`;
  const claimAmountDollars = Math.round(
    (billableMins / 60) * claimDetentionRate
  );
  const driverCutDollars = (claimAmountDollars * (driverCutPct / 100)).toFixed(
    2
  );
  const fleetNetDollars = (
    claimAmountDollars *
    ((100 - driverCutPct) / 100)
  ).toFixed(2);

  // Clamped True-Yield Fit Score (Fix #2)
  const liveBrokerFitScore = computeClampedBrokerFitScore({
    payoutRatePct: calcPayoutPct,
    avgDwellMins: calcDwellMins,
    detentionRateDollars: calcDetentionRate,
    noticeWindowHrs: calcNoticeHrs,
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

  const handleLoadSamplePreset = (preset: BolSamplePreset) => {
    setRawBolText(preset.rawSnippet);
    setClaimLoadNumber(preset.loadNumber);
    setClaimRateConId(preset.rateConId);
    setClaimBrokerName(preset.brokerName);
    setClaimBrokerMc(preset.brokerMc);
    setClaimFacility(preset.facilityLocation);
    setClaimArrival(preset.arrivalTime);
    setClaimDeparture(preset.departureTime);
    setClaimNoticeSent(preset.noticeSentTime);
    setClaimTotalDwellMins(preset.totalDwellMins);
    setClaimFreeTimeMins(preset.freeTimeMins);
    setClaimDetentionRate(preset.detentionRateDollars);
    setRedactedFields(preset.redactedPiiFields);
    setNeedsReviewNote(preset.needsReviewNote ?? null);
    setActiveCoords({
      dockLat: preset.dockLat,
      dockLon: preset.dockLon,
      eldLat: preset.eldLat,
      eldLon: preset.eldLon,
    });
    const estDollars = Math.round(
      (Math.max(0, preset.totalDwellMins - preset.freeTimeMins) / 60) *
        preset.detentionRateDollars
    );
    setCommittedSearchQuery(
      `Claim #${preset.loadNumber} ($${estDollars}) · MC #${preset.brokerMc}`
    );
  };

  const executeGeminiBolScan = async (payload: {
    rawText?: string;
    imageBase64?: string;
    mimeType?: string;
  }) => {
    setIsScanningBol(true);
    setScanError(null);
    try {
      const response = await fetch('/api/bol/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || !data.extraction) {
        throw new Error(
          data.message || 'Could not extract BOL fields right now.'
        );
      }
      const ext = data.extraction;
      setClaimLoadNumber(String(ext.loadNumber || '4417'));
      setClaimRateConId(String(ext.rateConId || 'RC-88214'));
      setClaimBrokerName(String(ext.brokerName || 'Broker Arrangement'));
      setClaimBrokerMc(String(ext.brokerMc || '481920'));
      setClaimFacility(String(ext.facilityLocation || 'Receiver Dock'));
      setClaimArrival(String(ext.arrivalTime || '08:04 CT'));
      setClaimDeparture(String(ext.departureTime || '14:37 CT'));
      setClaimNoticeSent(String(ext.noticeSentTime || '10:12 CT'));
      const dwell = Number(ext.totalDwellMins) || 360;
      const free = Number(ext.freeTimeMins) || 120;
      const rate = Number(ext.detentionRateDollars) || 60;
      setClaimTotalDwellMins(dwell);
      setClaimFreeTimeMins(free);
      setClaimDetentionRate(rate);
      if (Array.isArray(ext.redactedPiiFields) && ext.redactedPiiFields.length) {
        setRedactedFields(ext.redactedPiiFields);
      }
      const estDollars = Math.round((Math.max(0, dwell - free) / 60) * rate);
      setCommittedSearchQuery(
        `Scanned Claim #${ext.loadNumber || '4417'} ($${estDollars}) · MC #${
          ext.brokerMc || '481920'
        }`
      );
    } catch (err) {
      setScanError(
        err instanceof Error
          ? err.message
          : 'Failed to scan document. Using current values.'
      );
    } finally {
      setIsScanningBol(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const resultStr = String(reader.result || '');
      const base64Part = resultStr.split(',')[1];
      if (base64Part) {
        executeGeminiBolScan({
          imageBase64: base64Part,
          mimeType: file.type || 'image/png',
          rawText: rawBolText,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRadarSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = searchInput.trim() || 'Joliet, IL → Atlanta, GA';
    setCommittedSearchQuery(cleaned);
    setTimeout(() => postDemoInputRef.current?.focus(), 150);
  };

  const handleCustomTemplateUpload = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isJpeg =
      file.type.includes('jpeg') ||
      file.type.includes('jpg') ||
      file.name.toLowerCase().endsWith('.jpg') ||
      file.name.toLowerCase().endsWith('.jpeg');
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (dataUrl.startsWith('data:image/')) {
        setCustomTemplateDataUrl(dataUrl);
        setCustomTemplateName(file.name);
        setCustomTemplateFormat(isJpeg ? 'JPEG' : 'PNG');
        if (customTemplateMode === 'none') {
          setCustomTemplateMode('full_page_replica');
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDownloadClaimPdf = (
    override?: {
      loadNumber: string;
      rateConId: string;
      brokerName: string;
      brokerMc: string;
      facility: string;
      arrival: string;
      departure: string;
      noticeSent: string;
      totalDwellFormatted: string;
      freeTimeHrs: number;
      billableFormatted: string;
      rateDollars: number;
      amountDollars: number;
      senderAlias: string;
      stageLabel: string;
    },
    formOverride?: PdfFormTemplateType,
    action: 'download' | 'print_blob' = 'download'
  ) => {
    const data = override ?? {
      loadNumber: claimLoadNumber,
      rateConId: claimRateConId,
      brokerName: claimBrokerName,
      brokerMc: claimBrokerMc,
      facility: claimFacility,
      arrival: claimArrival,
      departure: claimDeparture,
      noticeSent: claimNoticeSent,
      totalDwellFormatted,
      freeTimeHrs: Math.round(claimFreeTimeMins / 60),
      billableFormatted: billableHoursFormatted,
      rateDollars: claimDetentionRate,
      amountDollars: claimAmountDollars,
      senderAlias: ghostEmailAlias,
      stageLabel:
        followUpStage === 'day0'
          ? 'DAY 0 INITIAL DETENTION CLAIM'
          : `${followUpStage.toUpperCase()} ACCOUNTING FOLLOW-UP`,
    };

    const targetForm = formOverride ?? selectedPdfFormType;
    const blobUrl = generateCarrierPdfSuite(
      {
        ...data,
        deliveryDate: '10/14',
        totalDwellMins: claimTotalDwellMins,
        billableMins,
        driverCutPct,
        driverCutDollars: (
          data.amountDollars *
          (driverCutPct / 100)
        ).toFixed(2),
        fleetNetDollars: (
          data.amountDollars *
          ((100 - driverCutPct) / 100)
        ).toFixed(2),
        planarOffsetMeters: geoProof.planarOffsetMeters,
        offsetFeet,
        truckLengths,
        dockMgrs1m: geoProof.dockMgrs1m,
        activeClusterId,
        enclosureStamp,
        facilityIntel,
        eldBreadcrumbSeries,
        customTemplateDataUrl,
        customTemplateFormat,
        customTemplateMode: customTemplateDataUrl ? customTemplateMode : 'none',
        showCalibrationGrid,
        customOffsetX,
        customOffsetY,
      },
      targetForm,
      action
    );

    if (action === 'print_blob' && blobUrl) {
      setPrintPreviewBlobUrl(blobUrl);
    }
  };

  const filteredBenchmarks = BENCHMARK_LANES.filter((item) => {
    if (!searchInput.trim()) return true;
    const q = searchInput.toLowerCase();
    return (
      item.queryMatch.toLowerCase().includes(q) ||
      item.lane.toLowerCase().includes(q) ||
      item.facilityClusterId.toLowerCase().includes(q) ||
      item.fridayForecast.toLowerCase().includes(q) ||
      item.brokerProfile.toLowerCase().includes(q) ||
      item.verdict.toLowerCase().includes(q)
    );
  });

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
      {/* NAVIGATION: Strictly 3 links + 1 primary CTA (Fix #3) */}
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
              <h1>Stop writing off the detention sitting on your BOLs</h1>
              <p className="hero-subheadline">
                Built for 1–100 truck fleets: BillOff-Lading turns signed Bills
                of Lading into paid detention claims — and lets you search
                brokers by real dock turn times and payout rates before you
                haul.
              </p>

              <div>
                <EmailCaptureForm
                  defaultSource={activeHeroSource}
                  selectedTier={null}
                  inputRef={heroInputRef}
                  onLeadCaptured={setLastCapturedLead}
                />
              </div>

              <p className="hero-credibility">
                Fleets charge detention on 94.5% of eligible loads — but fewer
                than half of those invoices ever get paid. That&apos;s{' '}
                <span className="claim-dollar-figure">$3.6 billion</span> a year
                left at the dock.
              </p>
            </div>

            <div className="hero-visual-frame">
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

        {/* DEMO MOMENT + SECONDARY LIVE BOL SCANNER + BROKER FIT RADAR */}
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

              {/* Conversion Hierarchy Fix #4: Worked Example Default + Crisp Secondary Toggle */}
              <div
                className="demo-tab-switcher"
                role="tablist"
                aria-label="Demo Mode"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeDemoTab === 'worked_example'}
                  className={`demo-tab-btn ${
                    activeDemoTab === 'worked_example'
                      ? 'demo-tab-btn-active'
                      : ''
                  }`}
                  onClick={() => setActiveDemoTab('worked_example')}
                >
                  Worked Example (Load #4417)
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeDemoTab === 'live_scanner'}
                  className={`demo-tab-btn ${
                    activeDemoTab === 'live_scanner'
                      ? 'demo-tab-btn-active'
                      : ''
                  }`}
                  onClick={() => setActiveDemoTab('live_scanner')}
                >
                  Try Live BOL Scanner &amp; Claim Builder
                </button>
              </div>
            </div>

            {activeDemoTab === 'worked_example' ? (
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
                      <span className="claim-dollar-figure">$60/hr</span> after
                      2 hrs free time. Carrier must notify broker within 24 hrs
                      of occurrence.&rdquo;
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
                        Per rate confirmation #RC-88214 (detention: $60/hr after
                        2 hrs free time), we are submitting a detention claim
                        for Load #4417, delivered 10/14.
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
                  <div style={{ marginTop: 'var(--space-12)' }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() =>
                        handleDownloadClaimPdf({
                          loadNumber: '4417',
                          rateConId: 'RC-88214',
                          brokerName: 'Midwest Contract Group',
                          brokerMc: '481920',
                          facility: 'Joliet, IL Dry Van Receiver',
                          arrival: '08:04 CT',
                          departure: '14:37 CT',
                          noticeSent: '10:12 CT',
                          totalDwellFormatted: '6 hrs 33 min',
                          freeTimeHrs: 2,
                          billableFormatted: '4 hrs 35 min',
                          rateDollars: 60,
                          amountDollars: 275,
                          senderAlias: ghostEmailAlias,
                          stageLabel: 'DAY 0 INITIAL DETENTION CLAIM',
                        })
                      }
                    >
                      Download Claim Evidence PDF (#4417)
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* SECONDARY TAB: LIVE BOL OCR ANALYZER & GHOST-CLERK CLAIM BUILDER */
              <div className="scanner-workbench">
                <div className="radar-filter-chips">
                  {SAMPLE_BOL_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className="radar-chip"
                      onClick={() => handleLoadSamplePreset(preset)}
                    >
                      Load Sample: {preset.label}
                    </button>
                  ))}
                </div>

                <div className="scanner-grid">
                  {/* Left: OCR Input & Zero-PII Scrubber */}
                  <div className="scanner-panel">
                    <h3>1. Rate-Con &amp; Signed BOL OCR Analyzer</h3>
                    <p className="small-text">
                      Paste a Rate Confirmation / BOL snippet or upload a
                      document photo. Our server-side Gemini 2.5 Flash parser
                      extracts detention terms while stripping private carrier
                      identity (`[DEC-10]`).
                    </p>

                    <label className="field-label">
                      <span>Rate Confirmation / BOL Text or ELD Export</span>
                      <textarea
                        className="textarea-input"
                        value={rawBolText}
                        onChange={(e) => setRawBolText(e.target.value)}
                      />
                    </label>

                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 'var(--space-8)',
                        alignItems: 'center',
                      }}
                    >
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={isScanningBol}
                        onClick={() =>
                          executeGeminiBolScan({ rawText: rawBolText })
                        }
                      >
                        {isScanningBol
                          ? 'Scanning with Gemini 2.5 Flash...'
                          : 'Extract BOL & Scrub Carrier PII'}
                      </button>

                      <label
                        className="btn-secondary"
                        style={{ cursor: 'pointer' }}
                      >
                        Upload BOL / Rate-Con Image
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleFileUpload}
                          style={{ display: 'none' }}
                        />
                      </label>
                    </div>

                    {scanError && (
                      <p
                        className="small-text"
                        style={{ color: 'var(--accent)' }}
                      >
                        {scanError}
                      </p>
                    )}

                    <div className="field-grid-2">
                      <label className="field-label">
                        <span>White-Label Ghost-Clerk Sender</span>
                        <input
                          type="text"
                          className="capture-input"
                          value={ghostEmailAlias}
                          onChange={(e) => setGhostEmailAlias(e.target.value)}
                        />
                      </label>
                      <label className="field-label">
                        <span>Broker MC#</span>
                        <input
                          type="text"
                          className="capture-input"
                          value={claimBrokerMc}
                          onChange={(e) => setClaimBrokerMc(e.target.value)}
                        />
                      </label>
                      <label className="field-label">
                        <span>Total Dwell (mins)</span>
                        <input
                          type="number"
                          className="capture-input"
                          value={claimTotalDwellMins}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value));
                            setClaimTotalDwellMins(val);
                            const est = Math.round(
                              (Math.max(0, val - claimFreeTimeMins) / 60) *
                                claimDetentionRate
                            );
                            setCommittedSearchQuery(
                              `Claim #${claimLoadNumber} ($${est}) · MC #${claimBrokerMc}`
                            );
                          }}
                        />
                      </label>
                      <label className="field-label">
                        <span>Detention Rate ($/hr)</span>
                        <input
                          type="number"
                          className="capture-input"
                          value={claimDetentionRate}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value));
                            setClaimDetentionRate(val);
                            const est = Math.round(
                              (Math.max(
                                0,
                                claimTotalDwellMins - claimFreeTimeMins
                              ) /
                                60) *
                                val
                            );
                            setCommittedSearchQuery(
                              `Claim #${claimLoadNumber} ($${est}) · MC #${claimBrokerMc}`
                            );
                          }}
                        />
                      </label>
                    </div>

                    {needsReviewNote && (
                      <div
                        className="pii-redaction-box"
                        style={{
                          borderColor: 'var(--accent)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 'var(--space-12)',
                        }}
                      >
                        <div>
                          <strong style={{ color: 'var(--accent)' }}>
                            NEEDS REVIEW (Non-Blocking Parser Guard):
                          </strong>
                          <div className="small-text">{needsReviewNote}</div>
                        </div>
                        <button
                          type="button"
                          className="radar-chip"
                          onClick={() => setNeedsReviewNote(null)}
                        >
                          Approve Timestamp
                        </button>
                      </div>
                    )}

                    <div className="pii-redaction-box">
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: 'var(--space-8)',
                          marginBottom: 'var(--space-8)',
                        }}
                      >
                        <strong>
                          A. Automated Boundary Enclosure (150m Radius Stamp):
                        </strong>
                        <span
                          className="small-text tabular-nums"
                          style={{
                            color: enclosureStamp.inBounds
                              ? 'var(--accent)'
                              : 'var(--text-primary)',
                            fontWeight: 700,
                          }}
                        >
                          {geoProof.planarOffsetMeters}m ({offsetFeet} ft ·{' '}
                          {truckLengths} truck lengths)
                        </span>
                      </div>

                      {/* Bold Page-1 Verification Stamp Preview */}
                      <div
                        style={{
                          padding: 'var(--space-8) var(--space-12)',
                          border:
                            enclosureStamp.tier === 'APRON'
                              ? '2px solid var(--accent)'
                              : '1px solid var(--text-primary)',
                          backgroundColor: enclosureStamp.inBounds
                            ? 'var(--surface)'
                            : 'var(--surface-hover)',
                          marginBottom: 'var(--space-8)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: 'var(--space-8)',
                        }}
                      >
                        <strong
                          className="tabular-nums"
                          style={{
                            color:
                              enclosureStamp.tier === 'APRON'
                                ? 'var(--accent)'
                                : 'var(--text-primary)',
                            letterSpacing: '0.02em',
                          }}
                        >
                          {enclosureStamp.stampText}
                        </strong>
                        <span className="small-text tabular-nums">
                          {enclosureStamp.inBounds
                            ? 'IN-BOUNDS (≤ 150m)'
                            : 'OUT-OF-BOUNDS (> 150m)'}{' '}
                          · Grid {geoProof.dockMgrs1m}
                          {liveGpsStatus ? ` · ${liveGpsStatus}` : ''}
                        </span>
                      </div>

                      <div className="radar-filter-chips">
                        <button
                          type="button"
                          className={`radar-chip ${
                            enclosureStamp.tier === 'APRON'
                              ? 'radar-chip-active'
                              : ''
                          }`}
                          onClick={() => {
                            setLiveGpsStatus(null);
                            // ~12m (39 ft) Backed Into Door
                            setActiveCoords((prev) => ({
                              ...prev,
                              eldLat: prev.dockLat + 0.00008,
                              eldLon: prev.dockLon + 0.00009,
                            }));
                          }}
                        >
                          Backed Into Door #14 (12m / 39 ft · &lt;50m)
                        </button>
                        <button
                          type="button"
                          className={`radar-chip ${
                            enclosureStamp.tier === 'STAGING'
                              ? 'radar-chip-active'
                              : ''
                          }`}
                          onClick={() => {
                            setLiveGpsStatus(null);
                            // ~120m (394 ft) Staging Area
                            setActiveCoords((prev) => ({
                              ...prev,
                              eldLat: prev.dockLat + 0.00086,
                              eldLon: prev.dockLon + 0.00082,
                            }));
                          }}
                        >
                          Facility Staging Area (120m / 394 ft · &lt;150m)
                        </button>
                        <button
                          type="button"
                          className={`radar-chip ${
                            enclosureStamp.tier === 'OFF_SITE'
                              ? 'radar-chip-active'
                              : ''
                          }`}
                          onClick={() => {
                            setLiveGpsStatus(null);
                            // ~185m (607 ft) Departed / Off-Site
                            setActiveCoords((prev) => ({
                              ...prev,
                              eldLat: prev.dockLat + 0.00133,
                              eldLon: prev.dockLon + 0.00125,
                            }));
                          }}
                        >
                          Off-Site / Departed (185m / 607 ft · &gt;150m)
                        </button>
                        <button
                          type="button"
                          className="radar-chip"
                          onClick={() => {
                            if (!navigator.geolocation) {
                              setLiveGpsStatus(
                                'Browser GPS unavailable — using Joliet dock lock'
                              );
                              return;
                            }
                            setLiveGpsStatus('Locking your exact spot...');
                            navigator.geolocation.getCurrentPosition(
                              (pos) => {
                                const { latitude, longitude } = pos.coords;
                                setActiveCoords({
                                  dockLat: latitude,
                                  dockLon: longitude,
                                  eldLat: latitude + 0.00003,
                                  eldLon: longitude + 0.00003,
                                });
                                setLiveGpsStatus(
                                  'Pinned to your live device location (<5m lock)'
                                );
                              },
                              () => {
                                setLiveGpsStatus(
                                  'Location permission skipped — showing Joliet Dock #14'
                                );
                              },
                              { enableHighAccuracy: true, timeout: 6000 }
                            );
                          }}
                        >
                          Pin My Exact Spot Right Now
                        </button>
                      </div>
                    </div>

                    {/* B. Spatial Facility Intelligence & Detention Forecasting (100m Cluster ID) */}
                    <div className="pii-redaction-box">
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: 'var(--space-8)',
                          marginBottom: 'var(--space-8)',
                        }}
                      >
                        <strong>
                          B. Spatial Facility Intelligence (100m Cluster Key):
                        </strong>
                        <div className="radar-filter-chips">
                          {(
                            [
                              '16T-EN-099-976',
                              '14S-PB-113-147',
                              '16S-BD-223-926',
                              'AUTO',
                            ] as const
                          ).map((cid) => (
                            <button
                              key={cid}
                              type="button"
                              className={`radar-chip ${
                                selectedClusterKey === cid
                                  ? 'radar-chip-active'
                                  : ''
                              }`}
                              onClick={() => setSelectedClusterKey(cid)}
                            >
                              {cid === 'AUTO'
                                ? `Live BOL Grid (${geoProof.facilityMgrs100mClusterId})`
                                : cid}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div
                        className="small-text tabular-nums"
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 'var(--space-4)',
                        }}
                      >
                        <div>
                          <strong>Average Dwell Forecast:</strong>{' '}
                          <span style={{ color: 'var(--accent)' }}>
                            &ldquo;{facilityIntel.fridayDwellForecast}&rdquo;
                          </span>
                        </div>
                        <div>
                          <strong>
                            Broker Friction Index ({facilityIntel.verifiedBolCount}{' '}
                            Verified BOLs at {facilityIntel.clusterId}):
                          </strong>{' '}
                          {facilityIntel.claimsApprovedPct}% Claims Approved vs.{' '}
                          <strong>
                            {facilityIntel.claimsDisputedPct}% Disputed
                          </strong>
                        </div>
                        <div>
                          <strong>Pre-Flight Rate Negotiation Advisory:</strong>{' '}
                          {facilityIntel.preFlightNegotiationAdvice}
                        </div>
                      </div>
                    </div>

                    <div className="pii-redaction-box">
                      <strong>
                        Zero-PII Scrubber Log (Stripped Before Broker Index):
                      </strong>
                      <div className="small-text">
                        {redactedFields.join(' · ')}
                      </div>
                    </div>
                  </div>

                  {/* Right: Live Ghost-Clerk Claim Packet Preview */}
                  <div className="scanner-panel">
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 'var(--space-8)',
                      }}
                    >
                      <h3>2. Generated Ghost-Clerk Claim Packet</h3>
                      <div className="radar-filter-chips">
                        {(['day0', 'day7', 'day14', 'day30'] as const).map(
                          (stage) => (
                            <button
                              key={stage}
                              type="button"
                              className={`radar-chip ${
                                followUpStage === stage
                                  ? 'radar-chip-active'
                                  : ''
                              }`}
                              onClick={() => setFollowUpStage(stage)}
                            >
                              {stage === 'day0'
                                ? 'Day 0 Claim'
                                : stage === 'day7'
                                ? 'Day 7 Follow-up'
                                : stage === 'day14'
                                ? 'Day 14 Notice'
                                : 'Day 30 Final'}
                            </button>
                          )
                        )}
                      </div>
                    </div>

                    <div className="email-subject-line">
                      <div>
                        From: <strong>{ghostEmailAlias}</strong> (Zero
                        BillOff-Lading branding)
                      </div>
                      <div>
                        Subject:{' '}
                        {followUpStage === 'day0'
                          ? `Detention Claim — Load #${claimLoadNumber} — $${claimAmountDollars}.00 — Revised Rate Con Requested`
                          : `[${followUpStage.toUpperCase()} FOLLOW-UP] Open Detention Invoice — Load #${claimLoadNumber} ($${claimAmountDollars}.00)`}
                      </div>
                    </div>

                    <div className="email-body-copy">
                      <p>
                        Per rate confirmation #{claimRateConId} with{' '}
                        {claimBrokerName} (MC #{claimBrokerMc} · detention: $
                        {claimDetentionRate}/hr after{' '}
                        {Math.round(claimFreeTimeMins / 60)} hrs free time), we
                        are submitting{' '}
                        {followUpStage === 'day0'
                          ? 'our documented detention claim'
                          : `our ${followUpStage.replace(
                              'day',
                              'Day-'
                            )} accounting follow-up`}{' '}
                        for Load #{claimLoadNumber} at {claimFacility}.
                      </p>
                      <ul className="email-meta-list">
                        <li>
                          — Arrival (0.5-mi ELD Geofence): {claimArrival} ·
                          Departure: {claimDeparture}
                        </li>
                        <li>
                          — Total dwell: {totalDwellFormatted} · Free time:{' '}
                          {Math.round(claimFreeTimeMins / 60)} hrs · Billable:{' '}
                          {billableHoursFormatted}
                        </li>
                        <li>
                          — Amount due:{' '}
                          <span className="claim-dollar-figure">
                            ${claimAmountDollars}.00
                          </span>{' '}
                          (Please issue Revised Rate Con #{claimRateConId}-REV1)
                        </li>
                        <li>
                          — Notice sent: {claimNoticeSent} (inside rate-con
                          window)
                        </li>
                        <li>
                          — Broker 1-Click Approval Portal (No Login Required):{' '}
                          <strong>
                            ladingledger.com/approve/{claimRateConId.toLowerCase()}
                          </strong>
                        </li>
                      </ul>
                      <p>
                        Attached: signed BOL, Page-1 Automated Boundary Stamp (
                        <strong>{enclosureStamp.stampText}</strong>), and
                        Timestamp-to-Offset Geofence Plot.
                      </p>
                    </div>

                    {/* C. Timestamp-to-Offset Visual Geofence Plot (Embedded SVG + Included in PDF) */}
                    <div className="pii-redaction-box">
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: 'var(--space-8)',
                          marginBottom: 'var(--space-8)',
                        }}
                      >
                        <strong>
                          C. Timestamp-to-Offset Visual Geofence Plot (Embedded
                          in PDF):
                        </strong>
                        <span className="small-text tabular-nums">
                          150m Dock Enclosure · 50m Apron Threshold
                        </span>
                      </div>

                      <svg
                        viewBox="0 0 520 130"
                        style={{
                          width: '100%',
                          height: 'auto',
                          backgroundColor: 'var(--background)',
                          border: '1px solid var(--border)',
                          marginBottom: 'var(--space-8)',
                        }}
                        role="img"
                        aria-label="Timestamp-to-Offset Visual Geofence Plot showing T+0m at 120m, T+15m at 12m sustained for 3.5 hours, and T+225m at 185m"
                      >
                        {/* 150m Facility Boundary Line */}
                        <line
                          x1="20"
                          y1="32"
                          x2="500"
                          y2="32"
                          stroke="var(--text-muted)"
                          strokeWidth="1"
                          strokeDasharray="4 4"
                        />
                        <text
                          x="26"
                          y="26"
                          fill="var(--text-muted)"
                          fontSize="10"
                          fontFamily="Inter, sans-serif"
                        >
                          150m Facility Staging Boundary
                        </text>

                        {/* 50m Dock Apron Line */}
                        <line
                          x1="20"
                          y1="82"
                          x2="500"
                          y2="82"
                          stroke="var(--accent)"
                          strokeWidth="1.2"
                          strokeDasharray="3 3"
                        />
                        <text
                          x="26"
                          y="76"
                          fill="var(--accent)"
                          fontSize="10"
                          fontFamily="Inter, sans-serif"
                        >
                          50m Dock Apron Verified Zone
                        </text>

                        {/* Connected Breadcrumb Trajectory Polyline */}
                        {(() => {
                          const xs = [65, 195, 335, 455];
                          const ys = eldBreadcrumbSeries.map((pt) => {
                            const clamped = Math.min(
                              200,
                              Math.max(0, pt.offsetMeters)
                            );
                            return Math.round(112 - (clamped / 200) * 96);
                          });
                          const pointsAttr = xs
                            .map((x, idx) => `${x},${ys[idx]}`)
                            .join(' ');
                          return (
                            <>
                              <polyline
                                fill="none"
                                stroke="var(--text-primary)"
                                strokeWidth="2"
                                points={pointsAttr}
                              />
                              {eldBreadcrumbSeries.map((pt, idx) => (
                                <g key={pt.tPlusMins}>
                                  <circle
                                    cx={xs[idx]}
                                    cy={ys[idx]}
                                    r="4.5"
                                    fill="var(--accent)"
                                  />
                                  <text
                                    x={xs[idx]}
                                    y={ys[idx] > 65 ? ys[idx] - 9 : ys[idx] + 15}
                                    textAnchor="middle"
                                    fill="var(--text-primary)"
                                    fontSize="10"
                                    fontWeight="700"
                                    fontFamily="Inter, sans-serif"
                                  >
                                    T+{pt.tPlusMins}m ({pt.offsetMeters}m)
                                  </text>
                                </g>
                              ))}
                            </>
                          );
                        })()}
                      </svg>

                      <div
                        className="small-text tabular-nums"
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 'var(--space-4)',
                        }}
                      >
                        <div>
                          • <strong>T+0 min ({claimArrival}):</strong> Arrival
                          at facility boundary (
                          <strong>
                            {eldBreadcrumbSeries[0].offsetMeters}m
                          </strong>{' '}
                          / {eldBreadcrumbSeries[0].offsetFeet} ft) —{' '}
                          {eldBreadcrumbSeries[0].enclosure.stampText}
                        </div>
                        <div>
                          • <strong>T+15 min:</strong> Backed into dock door (
                          <strong>
                            {eldBreadcrumbSeries[1].offsetMeters}m
                          </strong>{' '}
                          / {eldBreadcrumbSeries[1].offsetFeet} ft — sustained
                          for 3.5+ hours) —{' '}
                          <span style={{ color: 'var(--accent)' }}>
                            {eldBreadcrumbSeries[1].enclosure.stampText}
                          </span>
                        </div>
                        <div>
                          • <strong>T+225 min ({claimDeparture}):</strong>{' '}
                          Departed dock apron (
                          <strong>
                            {eldBreadcrumbSeries[3].offsetMeters}m
                          </strong>{' '}
                          / {eldBreadcrumbSeries[3].offsetFeet} ft) —{' '}
                          {eldBreadcrumbSeries[3].enclosure.stampText}
                        </div>
                      </div>
                    </div>

                    {/* Interactive Broker One-Click Approval Link Preview (#4 in PDF) */}
                    <div className="pii-redaction-box">
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: 'var(--space-8)',
                        }}
                      >
                        <strong>
                          No-Login Broker 1-Click Approval Link (Included in
                          Email):
                        </strong>
                        <button
                          type="button"
                          className="radar-chip"
                          onClick={() => {
                            setShowBrokerPortalPreview(
                              !showBrokerPortalPreview
                            );
                            setBrokerPortalStatus('pending');
                          }}
                        >
                          {showBrokerPortalPreview
                            ? 'Hide Broker Portal View'
                            : 'Preview What Broker Sees'}
                        </button>
                      </div>

                      {showBrokerPortalPreview && (
                        <div
                          style={{
                            marginTop: 'var(--space-12)',
                            paddingTop: 'var(--space-12)',
                            borderTop: '1px solid var(--border)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 'var(--space-8)',
                          }}
                        >
                          <div className="small-text">
                            <strong>
                              Broker View — Load #{claimLoadNumber} (Rate Con #
                              {claimRateConId}):
                            </strong>{' '}
                            0.5-mi GPS Geofence &amp; Signed BOL verified (
                            {claimArrival} – {claimDeparture}).
                          </div>

                          {brokerPortalStatus === 'pending' && (
                            <div
                              style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: 'var(--space-8)',
                              }}
                            >
                              <button
                                type="button"
                                className="btn-primary"
                                onClick={() =>
                                  setBrokerPortalStatus('approved_revised_rc')
                                }
                              >
                                Approve &amp; Issue Revised Rate Con (+$
                                {claimAmountDollars}.00)
                              </button>
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() =>
                                  setBrokerPortalStatus('disputed')
                                }
                              >
                                Dispute Claim (Requires Reason)
                              </button>
                            </div>
                          )}

                          {brokerPortalStatus === 'approved_revised_rc' && (
                            <div className="small-text">
                              <strong style={{ color: 'var(--accent)' }}>
                                ✓ Broker Approved in 1 Click:
                              </strong>{' '}
                              Revised Rate Con #{claimRateConId}-REV1 (+$
                              {claimAmountDollars}.00) uploaded &amp; queued for
                              factoring payout.
                            </div>
                          )}

                          {brokerPortalStatus === 'disputed' && (
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 'var(--space-8)',
                              }}
                            >
                              <label className="field-label">
                                <span>
                                  Broker Forced to Select Specific Dispute
                                  Reason:
                                </span>
                                <select
                                  className="capture-input"
                                  value={brokerDisputeReason}
                                  onChange={(e) =>
                                    setBrokerDisputeReason(e.target.value)
                                  }
                                >
                                  <option value="Driver arrived after scheduled appointment">
                                    Driver arrived after scheduled appointment
                                  </option>
                                  <option value="Facility states load was ready earlier">
                                    Facility states load was ready earlier
                                  </option>
                                  <option value="Missing paper sign-in sheet attachment">
                                    Missing paper sign-in sheet attachment
                                  </option>
                                </select>
                              </label>
                              <div className="small-text">
                                <strong>Instant Dispatcher Counter-Proof:</strong>{' '}
                                Historical Evidence Vault attaches 0.5-mile
                                Motive/Samsara GPS entry at {claimArrival} + 14
                                prior on-time loads for MC #{claimBrokerMc}.
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Driver Detention Settlement Split (Encourages 24-Hr Driver BOL Uploads) */}
                    <div className="pii-redaction-box">
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: 'var(--space-8)',
                          marginBottom: 'var(--space-4)',
                        }}
                      >
                        <strong>
                          Driver Settlement Split (Why Drivers Snap BOLs at the
                          Dock):
                        </strong>
                        <span className="small-text tabular-nums">
                          Driver Cut: {driverCutPct}% ($
                          {driverCutDollars}) · Fleet Net: {100 - driverCutPct}%
                          (${fleetNetDollars})
                        </span>
                      </div>
                      <input
                        type="range"
                        min={50}
                        max={100}
                        step={5}
                        value={driverCutPct}
                        onChange={(e) =>
                          setDriverCutPct(Number(e.target.value))
                        }
                        style={{
                          width: '100%',
                          accentColor: 'var(--accent)',
                          cursor: 'pointer',
                        }}
                        aria-label="Driver detention payout share percentage"
                      />
                    </div>

                    {/* PRO CARRIER PDF FORM SUITE & CUSTOM BLANK-FORM REPLICA STUDIO */}
                    <div className="pii-redaction-box">
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: 'var(--space-8)',
                          marginBottom: 'var(--space-8)',
                        }}
                      >
                        <strong>
                          Pro Carrier PDF Form Suite &amp; Custom Form Template
                          Match:
                        </strong>
                        <span className="small-text tabular-nums">
                          {customTemplateName
                            ? `Custom Form Active: ${customTemplateName}`
                            : 'Standard 3-Form Suite Ready'}
                        </span>
                      </div>

                      <p
                        className="small-text"
                        style={{ marginBottom: 'var(--space-8)' }}
                      >
                        Print or download individual pro forms or the full
                        3-page bundle — or upload your own blank company
                        worksheet / letterhead (PNG/JPG) and we&apos;ll stamp
                        your load, spatial proof, and driver payroll math right
                        onto your form.
                      </p>

                      {/* Form Selector Tabs */}
                      <div
                        className="radar-filter-chips"
                        style={{ marginBottom: 'var(--space-8)' }}
                      >
                        {(
                          [
                            {
                              id: 'full_3page_suite',
                              label: 'Full 3-Page Carrier Suite',
                            },
                            {
                              id: 'claim_evidence_packet',
                              label: 'Form 101-A: Claim Evidence Packet',
                            },
                            {
                              id: 'revised_rate_con_invoice',
                              label: 'Form 102-B: Revised Rate Con & Invoice',
                            },
                            {
                              id: 'driver_settlement_sheet',
                              label: 'Form 103-C: Driver Payroll Worksheet',
                            },
                          ] as const
                        ).map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className={`radar-chip ${
                              selectedPdfFormType === item.id
                                ? 'radar-chip-active'
                                : ''
                            }`}
                            onClick={() => setSelectedPdfFormType(item.id)}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>

                      {/* Upload Custom Blank Form / Letterhead + Calibration Grid */}
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 'var(--space-8)',
                          alignItems: 'center',
                          marginBottom: 'var(--space-8)',
                        }}
                      >
                        <label
                          className="radar-chip"
                          style={{ cursor: 'pointer', fontWeight: 600 }}
                        >
                          {customTemplateName
                            ? 'Replace Uploaded Carrier Form / Logo'
                            : '+ Upload Your Blank Form / Letterhead (PNG/JPG)'}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/jpg"
                            onChange={handleCustomTemplateUpload}
                            style={{ display: 'none' }}
                          />
                        </label>

                        {customTemplateDataUrl && (
                          <>
                            <button
                              type="button"
                              className={`radar-chip ${
                                customTemplateMode === 'full_page_replica'
                                  ? 'radar-chip-active'
                                  : ''
                              }`}
                              onClick={() =>
                                setCustomTemplateMode('full_page_replica')
                              }
                            >
                              Full-Page Blank Form Overlay
                            </button>
                            <button
                              type="button"
                              className={`radar-chip ${
                                customTemplateMode === 'letterhead_banner'
                                  ? 'radar-chip-active'
                                  : ''
                              }`}
                              onClick={() =>
                                setCustomTemplateMode('letterhead_banner')
                              }
                            >
                              Top-Right Letterhead Stamp
                            </button>
                            <button
                              type="button"
                              className="radar-chip"
                              onClick={() => {
                                setCustomTemplateDataUrl(null);
                                setCustomTemplateName(null);
                                setCustomOffsetX(0);
                                setCustomOffsetY(0);
                              }}
                            >
                              Clear Custom Form
                            </button>
                          </>
                        )}

                        <label
                          className="small-text"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={showCalibrationGrid}
                            onChange={(e) =>
                              setShowCalibrationGrid(e.target.checked)
                            }
                            style={{ accentColor: 'var(--accent)' }}
                          />
                          <span>
                            Overlay 36pt Coordinate Calibration Grid (for form
                            alignment)
                          </span>
                        </label>
                      </div>

                      {/* Optional X/Y Calibration Nudge Sliders when Custom Form or Grid is active */}
                      {(customTemplateDataUrl || showCalibrationGrid) && (
                        <div
                          className="field-grid-2"
                          style={{ marginBottom: 'var(--space-8)' }}
                        >
                          <label className="slider-control">
                            <span className="small-text">
                              Horizontal Form Alignment Offset (X):{' '}
                              <strong>{customOffsetX} pt</strong>
                            </span>
                            <input
                              type="range"
                              min={-40}
                              max={40}
                              step={2}
                              value={customOffsetX}
                              onChange={(e) =>
                                setCustomOffsetX(Number(e.target.value))
                              }
                            />
                          </label>
                          <label className="slider-control">
                            <span className="small-text">
                              Vertical Form Alignment Offset (Y):{' '}
                              <strong>{customOffsetY} pt</strong>
                            </span>
                            <input
                              type="range"
                              min={-40}
                              max={40}
                              step={2}
                              value={customOffsetY}
                              onChange={(e) =>
                                setCustomOffsetY(Number(e.target.value))
                              }
                            />
                          </label>
                        </div>
                      )}

                      {printPreviewBlobUrl && (
                        <div style={{ marginTop: 'var(--space-8)' }}>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginBottom: 'var(--space-4)',
                            }}
                          >
                            <strong className="small-text">
                              Live Printable PDF Form Preview (Use your browser
                              Print icon inside the viewer):
                            </strong>
                            <button
                              type="button"
                              className="radar-chip"
                              onClick={() => setPrintPreviewBlobUrl(null)}
                            >
                              Close Preview
                            </button>
                          </div>
                          <iframe
                            src={printPreviewBlobUrl}
                            title="Printable Carrier PDF Form Suite Preview"
                            style={{
                              width: '100%',
                              height: '420px',
                              border: '1px solid var(--text-primary)',
                              backgroundColor: 'var(--surface)',
                            }}
                          />
                        </div>
                      )}
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        gap: 'var(--space-8)',
                        flexWrap: 'wrap',
                      }}
                    >
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          navigator.clipboard?.writeText(
                            `Subject: Detention Claim — Load #${claimLoadNumber} — $${claimAmountDollars}.00\nFrom: ${ghostEmailAlias}\nPer rate confirmation #${claimRateConId}, total dwell ${totalDwellFormatted}, billable ${billableHoursFormatted}, amount due $${claimAmountDollars}.00. Approve in 1 click: https://ladingledger.com/approve/${claimRateConId.toLowerCase()}`
                          );
                          setCopiedClaim(true);
                          setTimeout(() => setCopiedClaim(false), 2000);
                        }}
                      >
                        {copiedClaim
                          ? 'Copied Claim Packet'
                          : 'Copy Ghost-Clerk Email'}
                      </button>

                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() =>
                          handleDownloadClaimPdf(
                            undefined,
                            selectedPdfFormType,
                            'download'
                          )
                        }
                      >
                        {selectedPdfFormType === 'full_3page_suite'
                          ? 'Download Full 3-Page PDF Suite'
                          : selectedPdfFormType === 'claim_evidence_packet'
                          ? 'Download Form 101-A (Evidence PDF)'
                          : selectedPdfFormType === 'revised_rate_con_invoice'
                          ? 'Download Form 102-B (Revised Rate Con)'
                          : 'Download Form 103-C (Driver Payroll PDF)'}
                      </button>

                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() =>
                          handleDownloadClaimPdf(
                            undefined,
                            selectedPdfFormType,
                            'print_blob'
                          )
                        }
                      >
                        Preview &amp; Print Pro PDF Forms
                      </button>

                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => {
                          setCommittedSearchQuery(
                            `Claim #${claimLoadNumber} ($${claimAmountDollars}.00) · MC #${claimBrokerMc}`
                          );
                          postDemoInputRef.current?.focus();
                        }}
                      >
                        Send this claim packet + my 90-day audit
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* INTERACTIVE BROKER & LANE FIT SEARCH RADAR (DEC-11 & DEC-13) */}
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
                      setCalcPayoutPct(item.payoutRatePct);
                      setCalcDwellMins(item.avgDwellMins);
                      setCalcDetentionRate(item.detentionRateDollars);
                      setCalcNoticeHrs(item.noticeWindowHrs);
                    }}
                  >
                    {item.queryMatch}
                  </button>
                ))}
              </div>

              <table className="radar-results-table">
                <thead>
                  <tr>
                    <th>Lane &amp; 100m Cluster ID</th>
                    <th>Broker Arrangement</th>
                    <th>BOL-Verified Dwell &amp; Forecast</th>
                    <th>Rate-Con Clause</th>
                    <th>Broker Friction Index</th>
                    <th>True-Yield Fit</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBenchmarks.map((row) => {
                    const computedRowScore = computeClampedBrokerFitScore({
                      payoutRatePct: row.payoutRatePct,
                      avgDwellMins: row.avgDwellMins,
                      detentionRateDollars: row.detentionRateDollars,
                      noticeWindowHrs: row.noticeWindowHrs,
                    });
                    return (
                      <tr
                        key={row.id}
                        onClick={() => {
                          setCommittedSearchQuery(row.queryMatch);
                          setSelectedClusterKey(
                            row.facilityClusterId === '16T-EN-099-976' ||
                              row.facilityClusterId === '14S-PB-113-147' ||
                              row.facilityClusterId === '16S-BD-223-926'
                              ? row.facilityClusterId
                              : '16T-EN-099-976'
                          );
                          setCalcPayoutPct(row.payoutRatePct);
                          setCalcDwellMins(row.avgDwellMins);
                          setCalcDetentionRate(row.detentionRateDollars);
                          setCalcNoticeHrs(row.noticeWindowHrs);
                        }}
                      >
                        <td>
                          <strong>{row.lane}</strong>
                          <div className="small-text tabular-nums">
                            Cluster Key: {row.facilityClusterId}
                          </div>
                        </td>
                        <td>{row.brokerProfile}</td>
                        <td>
                          <div>{row.bolVerifiedDwell}</div>
                          <div className="small-text">{row.fridayForecast}</div>
                        </td>
                        <td>{row.rateConTerms}</td>
                        <td>
                          <span className="claim-dollar-figure">
                            {row.detentionPayoutRate}
                          </span>
                        </td>
                        <td>
                          <strong>{computedRowScore} / 100</strong> —{' '}
                          {row.verdict}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* CLAMPED TRUE-YIELD BROKER FIT CALCULATOR (Fix #2) */}
              <div className="calculator-strip">
                <div>
                  <h3>Simulate Any Broker Rate-Con &amp; Dock Turn</h3>
                  <p className="small-text" style={{ marginBottom: '12px' }}>
                    Drag the sliders to test a broker&apos;s detention terms
                    using our clamped True-Yield Fit formula (40% Verified
                    Payout Rate · 30% Dock Dwell · 20% Hourly Rate · 10% Notice
                    Window).
                  </p>
                  <div className="sliders-grid">
                    <label className="slider-control">
                      <span>
                        Verified Detention Payout: <strong>{calcPayoutPct}%</strong>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={calcPayoutPct}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setCalcPayoutPct(v);
                          setCommittedSearchQuery(
                            `Custom Broker Fit (${computeClampedBrokerFitScore({
                              payoutRatePct: v,
                              avgDwellMins: calcDwellMins,
                              detentionRateDollars: calcDetentionRate,
                              noticeWindowHrs: calcNoticeHrs,
                            })}/100 · ${calcDwellMins}m dwell)`
                          );
                        }}
                      />
                    </label>

                    <label className="slider-control">
                      <span>
                        BOL-Verified Avg Dwell:{' '}
                        <strong>
                          {Math.floor(calcDwellMins / 60)}h {calcDwellMins % 60}
                          m ({calcDwellMins} mins)
                        </strong>
                      </span>
                      <input
                        type="range"
                        min={30}
                        max={480}
                        step={5}
                        value={calcDwellMins}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setCalcDwellMins(v);
                          setCommittedSearchQuery(
                            `Custom Broker Fit (${computeClampedBrokerFitScore({
                              payoutRatePct: calcPayoutPct,
                              avgDwellMins: v,
                              detentionRateDollars: calcDetentionRate,
                              noticeWindowHrs: calcNoticeHrs,
                            })}/100 · ${v}m dwell)`
                          );
                        }}
                      />
                    </label>

                    <label className="slider-control">
                      <span>
                        Rate-Con Detention Rate:{' '}
                        <strong>${calcDetentionRate}/hr</strong>
                      </span>
                      <input
                        type="range"
                        min={20}
                        max={100}
                        step={5}
                        value={calcDetentionRate}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setCalcDetentionRate(v);
                          setCommittedSearchQuery(
                            `Custom Broker Fit (${computeClampedBrokerFitScore({
                              payoutRatePct: calcPayoutPct,
                              avgDwellMins: calcDwellMins,
                              detentionRateDollars: v,
                              noticeWindowHrs: calcNoticeHrs,
                            })}/100 · $${v}/hr)`
                          );
                        }}
                      />
                    </label>

                    <label className="slider-control">
                      <span>
                        Rate-Con Notice Window:{' '}
                        <strong>{calcNoticeHrs} hrs</strong>
                      </span>
                      <input
                        type="range"
                        min={2}
                        max={72}
                        step={2}
                        value={calcNoticeHrs}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setCalcNoticeHrs(v);
                          setCommittedSearchQuery(
                            `Custom Broker Fit (${computeClampedBrokerFitScore({
                              payoutRatePct: calcPayoutPct,
                              avgDwellMins: calcDwellMins,
                              detentionRateDollars: calcDetentionRate,
                              noticeWindowHrs: v,
                            })}/100 · ${v}h notice)`
                          );
                        }}
                      />
                    </label>
                  </div>
                </div>

                <div className="calculator-score-readout">
                  <span className="small-text">
                    Clamped True-Yield Broker Fit Score
                  </span>
                  <div className="score-giant">{liveBrokerFitScore} / 100</div>
                  <p className="small-text">
                    {liveBrokerFitScore >= 75
                      ? 'Green-Light Fit — Fast turns & high accessorial recovery.'
                      : liveBrokerFitScore >= 50
                      ? 'Caution — Pad linehaul rate or enforce strict ELD notice.'
                      : 'High Detention Trap — Severe unpaid dock sit risk.'}
                  </p>
                </div>
              </div>

              <div className="post-demo-capture-band" style={{ marginTop: 0 }}>
                <div>
                  <h3>
                    Send this claim packet + my 90-day BOL Audit &amp; Broker
                    Fit Report
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
