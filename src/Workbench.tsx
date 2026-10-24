import React, { useState } from 'react';
import {
  evaluateDockProximity,
  DockProximityResult,
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
import { LeadRecord, submitFleetLead } from './firebase';

export interface BrokerFitBenchmark {
  id: string;
  queryMatch: string;
  lane: string;
  facilityClusterId: string;
  facilityName: string;
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
  preFlightAdvisory: string;
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

export const BENCHMARK_LANES: BrokerFitBenchmark[] = [
  {
    id: 'mw-se',
    queryMatch: 'Joliet, IL → Atlanta, GA (Dry Van)',
    lane: 'Joliet, IL → Atlanta, GA',
    facilityClusterId: '16T-EN-099-976',
    facilityName: 'Joliet Cold Storage / CenterPoint (#4417)',
    fridayForecast:
      'Facility 16T-EN-099-976 averages 3.4 hours dwell time on Friday afternoons.',
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
    preFlightAdvisory:
      'Require $60–$65/hr detention after 2 hrs free time in Rate Con; broker honors ELD timestamps inside 24-hr notice window.',
  },
  {
    id: 'mw-trap',
    queryMatch: 'Chicago, IL → Dallas, TX (Reefer / Grocery)',
    lane: 'Chicago, IL → Dallas, TX',
    facilityClusterId: '14S-PB-113-147',
    facilityName: 'DFW Grocery Distribution Center — South Gate',
    fridayForecast:
      'Facility 14S-PB-113-147 averages 5.7 hours dwell time on Friday grocery unloads.',
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
    preFlightAdvisory:
      'HIGH FRICTION: Add +$275 to +$350 linehaul buffer up front or avoid Friday delivery slots. Broker enforces strict 12-hr notice trap.',
  },
  {
    id: 'se-regional',
    queryMatch: 'Birmingham, AL → Memphis, TN (Dry Van / Flatbed)',
    lane: 'Birmingham, AL → Memphis, TN',
    facilityClusterId: '16S-BD-223-926',
    facilityName: 'Birmingham Industrial Steel & Pipe Yard',
    fridayForecast:
      'Facility 16S-BD-223-926 averages 1.1 hours dwell time across weekday shifts.',
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
    preFlightAdvisory:
      'Green-Light Fit: Consistent sub-90 min turns; standard 2-hr free time and $60/hr clause routinely honored.',
  },
  {
    id: 'pa-oh',
    queryMatch: 'Harrisburg, PA → Columbus, OH (Dry Van)',
    lane: 'Harrisburg, PA → Columbus, OH',
    facilityClusterId: '17T-NE-891-412',
    facilityName: 'Central Ohio Logistics Hub — East Apron',
    fridayForecast:
      'Facility 17T-NE-891-412 averages 1.6 hours dwell time across all shifts.',
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
    preFlightAdvisory:
      'Top-Decile Compliance: 48-hr notice window and $75/hr accessorial addendum approved within 7 days.',
  },
];

export interface BolSamplePreset {
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

export const SAMPLE_BOL_PRESETS: BolSamplePreset[] = [
  {
    id: 'joliet-4417',
    label: 'Load #4417 — Joliet, IL Dry Van ($275.00 · 4h 35m billable)',
    loadNumber: '4417',
    rateConId: 'RC-88214',
    brokerName: 'Midwest Contract Group',
    brokerMc: '481920',
    facilityLocation: 'Joliet, IL Cold & Dry Distribution',
    deliveryDate: '10/14',
    arrivalTime: '08:02 CT',
    departureTime: '14:37 CT',
    noticeSentTime: '10:12 CT',
    totalDwellMins: 395, // 6 hrs 35 min total dwell -> 4 hrs 35 min (275m) billable @ $60/hr = $275.00
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
    eldLat: 41.525126,
    eldLon: -88.0817,
    rawSnippet:
      'RATE CON #RC-88214 | Broker MC #481920 | Load #4417 | Receiver: Joliet, IL Distribution | Detention: $60/hr after 2 hrs free time. Carrier must notify broker within 24 hrs. Signed BOL + ELD: Arrived 08:02 CT, Notice Sent 10:12 CT, Signed 14:31 CT, Departed 14:37 CT (Total dwell 395 mins / 4 hrs 35 min billable = $275.00). Carrier: Prairie State Trucking MC#991024, Driver R. Miller, Linehaul $1,850.',
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

// Joliet, IL Receiver Dock Coordinates (41.5250° N, -88.0817° W)
export const JOLIET_DOCK = { lat: 41.525, lon: -88.0817 };

export const YARD_SCENARIOS = [
  {
    id: 'bumper',
    label: '1. Backed Into Door #14 (46 ft)',
    truckLat: 41.525126,
    truckLon: -88.0817,
  },
  {
    id: 'bullpen',
    label: '2. Yard Bullpen / Staging (240 ft)',
    truckLat: 41.525658,
    truckLon: -88.0817,
  },
  {
    id: 'truckstop',
    label: '3. Truck Stop Across Hwy (1,580 ft)',
    truckLat: 41.529335,
    truckLon: -88.0817,
  },
];

export function BillOffLadingLogo({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 21V3H21V21"
        stroke="var(--text-primary)"
        strokeWidth="2"
        strokeLinecap="square"
      />
      <path d="M5 5H19V9.5H5V5Z" fill="var(--text-primary)" />
      <line
        x1="5"
        y1="7.25"
        x2="19"
        y2="7.25"
        stroke="var(--accent)"
        strokeWidth="1.5"
      />
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

export type WorkbenchTabId = 'claim' | 'gps' | 'pdf' | 'radar';

export function DispatchWorkbench({
  isUnlocked,
  initialTab = 'claim',
  selectedYardScenario,
  onSelectYardScenario,
  proximity,
  liveGpsStatus,
  onRunLiveWalkTest,
  selectedCluster,
  onSelectCluster,
  simPayout,
  setSimPayout,
  simDwell,
  setSimDwell,
  simRate,
  setSimRate,
  simNotice,
  setSimNotice,
  onUnlockSuccess,
  onBackToLander,
}: {
  isUnlocked: boolean;
  initialTab?: WorkbenchTabId;
  selectedYardScenario: string;
  onSelectYardScenario: (scenarioId: string) => void;
  proximity: DockProximityResult;
  liveGpsStatus: string | null;
  onRunLiveWalkTest: (simulate35FtWalk: boolean) => void;
  selectedCluster: BrokerFitBenchmark;
  onSelectCluster: (cluster: BrokerFitBenchmark) => void;
  simPayout: number;
  setSimPayout: (v: number) => void;
  simDwell: number;
  setSimDwell: (v: number) => void;
  simRate: number;
  setSimRate: (v: number) => void;
  simNotice: number;
  setSimNotice: (v: number) => void;
  onUnlockSuccess: (record: LeadRecord) => void;
  onBackToLander: () => void;
}) {
  const [activeTab, setActiveTab] = useState<WorkbenchTabId>(initialTab);

  // Tab 1: Live BOL OCR & Claim Builder State (Defaulted to Load #4417 = $275.00)
  const [rawBolText, setRawBolText] = useState(
    SAMPLE_BOL_PRESETS[0].rawSnippet
  );
  const [isScanningBol, setIsScanningBol] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [loadNumber, setLoadNumber] = useState('4417');
  const [rateConId, setRateConId] = useState('RC-88214');
  const [brokerName, setBrokerName] = useState('Midwest Contract Group');
  const [brokerMc, setBrokerMc] = useState('481920');
  const [facility, setFacility] = useState(
    'Joliet, IL Cold & Dry Distribution'
  );
  const [arrivalTime, setArrivalTime] = useState('08:02 CT');
  const [departureTime, setDepartureTime] = useState('14:37 CT');
  const [noticeSentTime, setNoticeSentTime] = useState('10:12 CT');
  const [carrierAlias, setCarrierAlias] = useState('billing@yourfleet.com');
  const [dwellMins, setDwellMins] = useState(395); // 6 hrs 35 min -> 275 billable mins @ $60/hr = $275.00
  const [freeTimeMins, setFreeTimeMins] = useState(120); // 2 hrs
  const [hourlyRate, setHourlyRate] = useState(60);
  const [driverCutPct, setDriverCutPct] = useState(75);
  const [activeDayTemplate, setActiveDayTemplate] = useState<0 | 7 | 14 | 30>(
    0
  );
  const [redactedFields, setRedactedFields] = useState<string[]>(
    SAMPLE_BOL_PRESETS[0].redactedPiiFields
  );
  const [needsReviewNote, setNeedsReviewNote] = useState<string | null>(null);
  const [copiedClaim, setCopiedClaim] = useState(false);
  const [showBrokerPortalPreview, setShowBrokerPortalPreview] = useState(false);
  const [brokerPortalStatus, setBrokerPortalStatus] = useState<
    'pending' | 'approved_revised_rc' | 'disputed'
  >('pending');
  const [brokerDisputeReason, setBrokerDisputeReason] = useState(
    'Driver arrived after scheduled appointment'
  );

  // Tab 3: Pro Carrier PDF Suite & Custom Blank-Form Replica State
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
  const [showCalibrationGrid, setShowCalibrationGrid] = useState(false);
  const [customOffsetX, setCustomOffsetX] = useState(0);
  const [customOffsetY, setCustomOffsetY] = useState(0);
  const [printPreviewBlobUrl, setPrintPreviewBlobUrl] = useState<string | null>(
    null
  );

  // Tab 4: Radar Search Filter State
  const [radarSearchInput, setRadarSearchInput] = useState('');

  // Soft-Gate Email Unlock State (for unverified visitors inside /app)
  const [gateEmail, setGateEmail] = useState('');
  const [gateHoneypot, setGateHoneypot] = useState('');
  const [gatePromptReason, setGatePromptReason] = useState<string | null>(null);
  const [pendingPdfAction, setPendingPdfAction] = useState<{
    formType: PdfFormTemplateType;
    action: 'download' | 'print_blob';
  } | null>(null);
  const [gateError, setGateError] = useState<string | null>(null);

  const billableMins = Math.max(0, dwellMins - freeTimeMins);
  const totalDwellFormatted = `${Math.floor(dwellMins / 60)} hrs ${
    dwellMins % 60
  } min`;
  const billableFormatted = `${Math.floor(billableMins / 60)} hrs ${
    billableMins % 60
  } min`;
  const amountDueNumber = Math.round((billableMins / 60) * hourlyRate);
  const amountDue = amountDueNumber.toFixed(2);
  const driverCutDollars = (amountDueNumber * (driverCutPct / 100)).toFixed(2);
  const fleetNetDollars = (
    amountDueNumber *
    ((100 - driverCutPct) / 100)
  ).toFixed(2);

  const liveFitScore = computeClampedBrokerFitScore({
    payoutRatePct: simPayout,
    avgDwellMins: simDwell,
    detentionRateDollars: simRate,
    noticeWindowHrs: simNotice,
  });

  // Compute full ELD breadcrumb series & spatial intelligence for PDF generator
  const activeScenarioObj =
    YARD_SCENARIOS.find((s) => s.id === selectedYardScenario) ||
    YARD_SCENARIOS[0];
  const geoProof = computePlanarDockOffsetMeters(
    JOLIET_DOCK.lat,
    JOLIET_DOCK.lon,
    activeScenarioObj.truckLat,
    activeScenarioObj.truckLon
  );
  const enclosureStamp = evaluateBoundaryEnclosure(proximity.metersFromDock);
  const facilityIntel = getSpatialFacilityIntelligence(
    selectedCluster.facilityClusterId,
    facility
  );
  const eldBreadcrumbSeries = computeEldBreadcrumbPlot(
    JOLIET_DOCK.lat,
    JOLIET_DOCK.lon,
    [
      {
        tPlusMins: 0,
        timestampLabel: arrivalTime,
        eventLabel: 'T+0 min: Arrival at facility boundary',
        lat: JOLIET_DOCK.lat + 0.00086,
        lon: JOLIET_DOCK.lon + 0.00082,
      },
      {
        tPlusMins: 15,
        timestampLabel: 'Backed into door',
        eventLabel: 'T+15 min: Backed into dock door (sustained 3.5+ hrs)',
        lat: activeScenarioObj.truckLat,
        lon: activeScenarioObj.truckLon,
      },
      {
        tPlusMins: 128,
        timestampLabel: noticeSentTime,
        eventLabel: 'T+128 min: Detention notice transmitted at dock bumper',
        lat: JOLIET_DOCK.lat + 0.00008,
        lon: JOLIET_DOCK.lon + 0.00009,
      },
      {
        tPlusMins: 225,
        timestampLabel: departureTime,
        eventLabel: 'T+225 min: Departed dock apron & cleared gate',
        lat: JOLIET_DOCK.lat + 0.00133,
        lon: JOLIET_DOCK.lon + 0.00125,
      },
    ]
  );

  const runVectorPdfExport = (
    formType: PdfFormTemplateType = selectedPdfFormType,
    action: 'download' | 'print_blob' = 'download'
  ) => {
    const blobUrl = generateCarrierPdfSuite(
      {
        loadNumber,
        rateConId,
        brokerName,
        brokerMc,
        facility,
        deliveryDate: '10/14',
        arrival: arrivalTime,
        departure: departureTime,
        noticeSent: noticeSentTime,
        totalDwellFormatted,
        totalDwellMins: dwellMins,
        freeTimeHrs: Math.round(freeTimeMins / 60),
        billableFormatted,
        billableMins,
        rateDollars: hourlyRate,
        amountDollars: amountDueNumber,
        senderAlias: carrierAlias,
        stageLabel:
          activeDayTemplate === 0
            ? 'DAY 0 INITIAL DETENTION CLAIM'
            : `DAY ${activeDayTemplate} ACCOUNTING FOLLOW-UP`,
        driverCutPct,
        driverCutDollars,
        fleetNetDollars,
        planarOffsetMeters: proximity.metersFromDock,
        offsetFeet: proximity.feetFromDock,
        truckLengths: String(proximity.trailerLengths53Ft),
        dockMgrs1m: proximity.mgrs1m,
        activeClusterId: selectedCluster.facilityClusterId,
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
      formType,
      action
    );

    if (action === 'print_blob' && blobUrl) {
      setPrintPreviewBlobUrl(blobUrl);
    }
  };

  const handleGatedPdfAction = (
    reason: string,
    formType: PdfFormTemplateType = selectedPdfFormType,
    action: 'download' | 'print_blob' = 'download'
  ) => {
    if (!isUnlocked) {
      setGatePromptReason(reason);
      setPendingPdfAction({ formType, action });
      return;
    }
    runVectorPdfExport(formType, action);
  };

  const handleUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGateError(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(gateEmail.trim())) {
      setGateError('Enter a valid fleet email address to unlock.');
      return;
    }
    const res = await submitFleetLead({
      email: gateEmail.trim(),
      source: 'broker_search_gate',
      tier: null,
      searchQuery: `${selectedCluster.facilityClusterId} | Load #${loadNumber} ($${amountDue})`,
      honeypot: gateHoneypot,
    });
    setGatePromptReason(null);
    onUnlockSuccess(res.record);
    if (pendingPdfAction) {
      runVectorPdfExport(pendingPdfAction.formType, pendingPdfAction.action);
      setPendingPdfAction(null);
    }
  };

  const handleLoadSamplePreset = (preset: BolSamplePreset) => {
    setRawBolText(preset.rawSnippet);
    setLoadNumber(preset.loadNumber);
    setRateConId(preset.rateConId);
    setBrokerName(preset.brokerName);
    setBrokerMc(preset.brokerMc);
    setFacility(preset.facilityLocation);
    setArrivalTime(preset.arrivalTime);
    setDepartureTime(preset.departureTime);
    setNoticeSentTime(preset.noticeSentTime);
    setDwellMins(preset.totalDwellMins);
    setFreeTimeMins(preset.freeTimeMins);
    setHourlyRate(preset.detentionRateDollars);
    setRedactedFields(preset.redactedPiiFields);
    setNeedsReviewNote(preset.needsReviewNote ?? null);
  };

  const executeGeminiBolScan = async (payload: {
    rawText?: string;
    imageBase64?: string;
    mimeType?: string;
  }) => {
    if (!isUnlocked) {
      setGatePromptReason(
        'Unlock Custom AI BOL & Rate-Con OCR Scanning + Save Your 90-Day Audit'
      );
      return;
    }
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
      setLoadNumber(String(ext.loadNumber || '4417'));
      setRateConId(String(ext.rateConId || 'RC-88214'));
      setBrokerName(String(ext.brokerName || 'Midwest Contract Group'));
      setBrokerMc(String(ext.brokerMc || '481920'));
      setFacility(String(ext.facilityLocation || 'Receiver Dock'));
      setArrivalTime(String(ext.arrivalTime || '08:02 CT'));
      setDepartureTime(String(ext.departureTime || '14:37 CT'));
      setNoticeSentTime(String(ext.noticeSentTime || '10:12 CT'));
      setDwellMins(Number(ext.totalDwellMins) || 395);
      setFreeTimeMins(Number(ext.freeTimeMins) || 120);
      setHourlyRate(Number(ext.detentionRateDollars) || 60);
      if (Array.isArray(ext.redactedPiiFields) && ext.redactedPiiFields.length) {
        setRedactedFields(ext.redactedPiiFields);
      }
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

  const handleBolFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const ghostTemplates: Record<
    0 | 7 | 14 | 30,
    { subject: string; body: string }
  > = {
    0: {
      subject: `Detention Claim — Load #${loadNumber} — $${amountDue} — documentation attached`,
      body: `From: ${carrierAlias} (White-Labeled Carrier Billing Desk)\n\nPer rate confirmation #${rateConId} with ${brokerName} (MC #${brokerMc} · detention: $${hourlyRate}/hr after ${
        freeTimeMins / 60
      } hrs free time), we are submitting a detention claim for Load #${loadNumber} at ${facility}.\n— Arrival (ELD/GPS): ${arrivalTime} [${
        proximity.boundaryStatus
      }]\n— Departure (ELD/GPS): ${departureTime}\n— Total dwell: ${totalDwellFormatted} · Free time: ${
        freeTimeMins / 60
      } hrs · Billable: ${billableFormatted}\n— Dock Proximity Stamp: ${
        proximity.feetFromDock
      } ft (${proximity.trailerLengths53Ft} Truck Lengths) · Grid ${
        proximity.mgrs1m
      }\n— Amount due: $${amountDue} (Please issue Revised Rate Con #${rateConId}-REV1)\n— 1-Click Broker Approval Portal: ladingledger.com/approve/${rateConId.toLowerCase()}\n\nAttached: signed BOL, ELD geofence breadcrumb plot, rate con page 2.\nPlease confirm payment within 15 days. We'll follow up on day 7, 14, and 30.`,
    },
    7: {
      subject: `7-Day Follow-Up: Detention Claim — Load #${loadNumber} ($${amountDue})`,
      body: `From: ${carrierAlias}\n\nFollowing up on our detention claim for Load #${loadNumber} ($${amountDue}) submitted inside the 24-hour notice window per #${rateConId}. The signed BOL and ${proximity.feetFromDock}-ft dock-apron verification stamp (${proximity.mgrs1m}) are re-attached for your AP team. Please confirm the scheduled payout date.`,
    },
    14: {
      subject: `14-Day Status Check: Unpaid Detention — Load #${loadNumber} ($${amountDue})`,
      body: `From: ${carrierAlias}\n\nChecking in on Invoice #${loadNumber}-DET ($${amountDue}). Our records show 14 days elapsed since timely filing with full ELD + signed BOL proof at facility cluster ${proximity.mgrs100mClusterId}. Please reply with remittance details or any written dispute reason.`,
    },
    30: {
      subject: `30-Day Final Accounting Notice: Load #${loadNumber} Detention ($${amountDue})`,
      body: `From: ${carrierAlias}\n\nThis is our 30-day accounting follow-up for Load #${loadNumber} ($${amountDue}). Please remit payment or provide a written explanation for non-payment so we can update our carrier lane records for ${selectedCluster.brokerProfile}.`,
    },
  };

  const filteredBenchmarks = BENCHMARK_LANES.filter((item) => {
    if (!radarSearchInput.trim()) return true;
    const q = radarSearchInput.toLowerCase();
    return (
      item.queryMatch.toLowerCase().includes(q) ||
      item.lane.toLowerCase().includes(q) ||
      item.facilityClusterId.toLowerCase().includes(q) ||
      item.facilityName.toLowerCase().includes(q) ||
      item.brokerProfile.toLowerCase().includes(q) ||
      item.verdict.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      {/* WORKBENCH 3-ZONE TOP BAR */}
      <header className="site-nav">
        <div className="container nav-inner">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-16)',
            }}
          >
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '8px 16px' }}
              onClick={onBackToLander}
            >
              ← Back to Overview
            </button>
            <span className="brand-link">
              <BillOffLadingLogo size={22} />
              <span>BillOff-Lading Workbench</span>
            </span>
          </div>

          <nav className="nav-links" aria-label="Workbench Tools">
            <button
              type="button"
              className={`radar-chip ${
                activeTab === 'claim' ? 'radar-chip-active' : ''
              }`}
              onClick={() => setActiveTab('claim')}
            >
              1. BOL OCR &amp; Claim Builder
            </button>
            <button
              type="button"
              className={`radar-chip ${
                activeTab === 'gps' ? 'radar-chip-active' : ''
              }`}
              onClick={() => setActiveTab('gps')}
            >
              2. 53&apos; GPS Walk Test
            </button>
            <button
              type="button"
              className={`radar-chip ${
                activeTab === 'pdf' ? 'radar-chip-active' : ''
              }`}
              onClick={() => setActiveTab('pdf')}
            >
              3. Pro PDF Suite (101A-C)
            </button>
            <button
              type="button"
              className={`radar-chip ${
                activeTab === 'radar' ? 'radar-chip-active' : ''
              }`}
              onClick={() => setActiveTab('radar')}
            >
              4. Broker &amp; Lane Radar
            </button>
          </nav>

          <button
            type="button"
            className="btn-primary"
            onClick={() =>
              handleGatedPdfAction(
                'Unlock Vector PDF Export (Forms 101-A, 102-B, 103-C) & Save Your 90-Day Audit',
                selectedPdfFormType,
                'download'
              )
            }
          >
            {isUnlocked
              ? 'Export Claim Evidence PDF'
              : 'Unlock PDF & Save Audit'}
          </button>
        </div>
      </header>

      <main className="section-band-bg" style={{ minHeight: '85vh' }}>
        <div className="container">
          {/* SOFT-GATE INLINE UNLOCK BANNER WHEN UNVERIFIED USER CLICKS EXPORT OR OCR */}
          {gatePromptReason && !isUnlocked && (
            <div
              className="demo-card"
              style={{
                marginBottom: 'var(--space-32)',
                borderColor: 'var(--accent)',
                backgroundColor: 'var(--surface)',
              }}
            >
              <h3>{gatePromptReason}</h3>
              <p
                className="small-text"
                style={{ marginBottom: 'var(--space-16)' }}
              >
                Enter your fleet email to unlock full vector PDF packet
                downloads (Forms 101-A, 102-B, 103-C), custom AI BOL scanning,
                and claim your free 90-day BOL detention audit.
              </p>
              <form
                className="capture-row"
                onSubmit={handleUnlockSubmit}
                style={{ maxWidth: '540px' }}
              >
                <div className="honeypot-trap" aria-hidden="true">
                  <input
                    type="text"
                    name="company_dot_number"
                    tabIndex={-1}
                    value={gateHoneypot}
                    onChange={(e) => setGateHoneypot(e.target.value)}
                  />
                </div>
                <input
                  type="email"
                  className="capture-input"
                  placeholder="you@yourfleet.com"
                  value={gateEmail}
                  onChange={(e) => setGateEmail(e.target.value)}
                  required
                />
                <button type="submit" className="btn-primary">
                  Unlock Workbench &amp; Export PDF
                </button>
              </form>
              {gateError && (
                <p
                  className="small-text"
                  style={{ color: 'var(--accent)', marginTop: 'var(--space-8)' }}
                >
                  {gateError}
                </p>
              )}
            </div>
          )}

          {/* TAB 1: LIVE BOL OCR & GHOST-CLERK CLAIM BUILDER */}
          {activeTab === 'claim' && (
            <div className="scanner-workbench">
              <div className="radar-filter-chips">
                {SAMPLE_BOL_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={`radar-chip ${
                      loadNumber === preset.loadNumber
                        ? 'radar-chip-active'
                        : ''
                    }`}
                    onClick={() => handleLoadSamplePreset(preset)}
                  >
                    Load Preset: {preset.label}
                  </button>
                ))}
              </div>

              <div className="demo-panels-grid">
                <div className="scanner-panel">
                  <h2 className="demo-panel-label">
                    Live BOL &amp; Rate-Con Claim Builder (Zero-PII Pipeline)
                  </h2>

                  <label className="field-label">
                    <span>
                      Paste Rate Confirmation / BOL Snippet or Upload Document
                    </span>
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
                        onChange={handleBolFileUpload}
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

                  <label className="field-label">
                    <span>
                      White-Labeled Carrier Billing Alias (Ghost-Clerk Relay)
                    </span>
                    <input
                      type="text"
                      className="capture-input"
                      value={carrierAlias}
                      onChange={(e) => setCarrierAlias(e.target.value)}
                    />
                  </label>

                  <div className="field-grid-2">
                    <label className="field-label">
                      <span>Load #</span>
                      <input
                        type="text"
                        className="capture-input"
                        value={loadNumber}
                        onChange={(e) => setLoadNumber(e.target.value)}
                      />
                    </label>
                    <label className="field-label">
                      <span>Rate Con #</span>
                      <input
                        type="text"
                        className="capture-input"
                        value={rateConId}
                        onChange={(e) => setRateConId(e.target.value)}
                      />
                    </label>
                  </div>

                  <div className="field-grid-2">
                    <label className="slider-control">
                      <span>
                        Total Dock Dwell:{' '}
                        <strong>
                          {totalDwellFormatted} ({dwellMins}m)
                        </strong>
                      </span>
                      <input
                        type="range"
                        min={60}
                        max={600}
                        value={dwellMins}
                        onChange={(e) => setDwellMins(Number(e.target.value))}
                      />
                    </label>
                    <label className="slider-control">
                      <span>
                        Rate-Con Detention ($/hr):{' '}
                        <strong>${hourlyRate}/hr</strong>
                      </span>
                      <input
                        type="range"
                        min={25}
                        max={125}
                        step={5}
                        value={hourlyRate}
                        onChange={(e) => setHourlyRate(Number(e.target.value))}
                      />
                    </label>
                  </div>

                  <div className="email-meta-list">
                    <strong>
                      Zero-PII Scrubber Log (Stripped Before Indexing):
                    </strong>
                    {redactedFields.map((field) => (
                      <span key={field}>✓ {field}</span>
                    ))}
                    <span>
                      ✓ Indexed Facility Cluster:{' '}
                      <strong>{proximity.mgrs100mClusterId}</strong>
                    </span>
                  </div>
                </div>

                {/* RIGHT COLUMN: GHOST-CLERK EMAIL + 1-CLICK BROKER PORTAL */}
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
                    <span className="small-text tabular-nums">
                      <strong>{proximity.boundaryStatus}</strong>
                    </span>
                    <div className="radar-filter-chips">
                      {([0, 7, 14, 30] as const).map((day) => (
                        <button
                          key={day}
                          type="button"
                          className={`radar-chip ${
                            activeDayTemplate === day ? 'radar-chip-active' : ''
                          }`}
                          onClick={() => setActiveDayTemplate(day)}
                        >
                          Day {day}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="email-subject-line">
                    {ghostTemplates[activeDayTemplate].subject}
                  </div>
                  <pre
                    style={{
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'var(--font-body)',
                      fontSize: 'var(--small-size)',
                      lineHeight: 1.6,
                      padding: 'var(--space-16)',
                      backgroundColor: 'var(--background)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                    }}
                  >
                    {ghostTemplates[activeDayTemplate].body}
                  </pre>

                  {/* No-Login Broker 1-Click Approval Portal Preview */}
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
                        No-Login Broker 1-Click Approval Portal:
                      </strong>
                      <button
                        type="button"
                        className="radar-chip"
                        onClick={() => {
                          setShowBrokerPortalPreview(!showBrokerPortalPreview);
                          setBrokerPortalStatus('pending');
                        }}
                      >
                        {showBrokerPortalPreview
                          ? 'Hide Broker View'
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
                              {amountDue})
                            </button>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => setBrokerPortalStatus('disputed')}
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
                            Revised Rate Con #{rateConId}-REV1 (+${amountDue})
                            queued for factoring payout.
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
                            <div className="small-text">
                              <strong>Instant Dispatcher Counter-Proof:</strong>{' '}
                              Attaches {proximity.feetFromDock}-ft MGRS dock
                              apron stamp ({proximity.mgrs1m}) at {arrivalTime}.
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 'var(--space-8)',
                    }}
                  >
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        navigator.clipboard?.writeText(
                          `${ghostTemplates[activeDayTemplate].subject}\n\n${ghostTemplates[activeDayTemplate].body}`
                        );
                        setCopiedClaim(true);
                        setTimeout(() => setCopiedClaim(false), 2000);
                      }}
                    >
                      {copiedClaim
                        ? 'Copied Claim Email'
                        : 'Copy Ghost-Clerk Email'}
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() =>
                        handleGatedPdfAction(
                          'Unlock Form 101-A Vector PDF Export & Save Your Claim Packet',
                          'claim_evidence_packet',
                          'download'
                        )
                      }
                    >
                      Download Form 101-A Claim Evidence PDF (${amountDue})
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setActiveTab('pdf')}
                    >
                      Open Full 3-Form PDF Stencil Suite →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DOCK-BUMPER PINPOINT PROOF & 53' TRAILER WALK TEST */}
          {activeTab === 'gps' && (
            <div className="scanner-workbench">
              <div
                className="section-header-stack"
                style={{ marginBottom: 'var(--space-16)' }}
              >
                <p className="demo-intro-line">
                  Zero Map APIs · NGA/DMA TM8358.2 WGS84 Ellipsoid Math Measured
                  in Feet &amp; 53&apos; Truck-and-Trailer Lengths
                </p>
                <h2>Dock-Bumper Pinpoint Proof (Test It Live)</h2>
              </div>

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
                    onClick={() => onSelectYardScenario(scen.id)}
                  >
                    {scen.label}
                  </button>
                ))}
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ padding: '6px 16px' }}
                  onClick={() => onRunLiveWalkTest(false)}
                >
                  Lock My Current Spot (0 ft Dock)
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ padding: '6px 16px' }}
                  onClick={() => onRunLiveWalkTest(true)}
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
                  <span className="small-text">Distance from Dock Bumper</span>
                  <div className="step-number">
                    {proximity.feetFromDock} ft ({proximity.metersFromDock}m)
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
                    <strong>{proximity.mgrs100mClusterId}</strong> ·{' '}
                    {proximity.utmFormatted}
                  </span>
                </div>
              </div>

              {/* Timestamp-to-Offset Visual Geofence Plot (SVG) */}
              <div className="email-meta-list">
                <strong>
                  Timestamp-to-Offset Visual Geofence Plot (Embedded on Page 1
                  of Claim PDF):
                </strong>
                <svg
                  viewBox="0 0 720 150"
                  style={{
                    width: '100%',
                    height: 'auto',
                    marginTop: 'var(--space-8)',
                  }}
                >
                  <rect
                    width="720"
                    height="150"
                    fill="var(--surface)"
                    stroke="var(--border)"
                  />
                  <line
                    x1="40"
                    y1="45"
                    x2="680"
                    y2="45"
                    stroke="var(--accent)"
                    strokeDasharray="6 4"
                    strokeWidth="1.5"
                  />
                  <text
                    x="50"
                    y="36"
                    fill="var(--accent)"
                    fontSize="11"
                    fontWeight="600"
                  >
                    150m Facility Boundary Gate (492 ft)
                  </text>
                  <line
                    x1="40"
                    y1="95"
                    x2="680"
                    y2="95"
                    stroke="var(--border)"
                    strokeWidth="1.5"
                  />
                  <text x="50" y="88" fill="var(--text-muted)" fontSize="11">
                    50m Dock Bumper Apron (164 ft)
                  </text>
                  <polyline
                    fill="none"
                    stroke="var(--text-primary)"
                    strokeWidth="2.5"
                    points="90,62 210,122 510,122 640,24"
                  />
                  <circle cx="90" cy="62" r="5" fill="var(--accent)" />
                  <text
                    x="65"
                    y="80"
                    fill="var(--text-primary)"
                    fontSize="11"
                    fontWeight="600"
                  >
                    T+0m: 394 ft (Bullpen)
                  </text>
                  <circle cx="210" cy="122" r="5" fill="var(--accent)" />
                  <circle cx="510" cy="122" r="5" fill="var(--accent)" />
                  <text
                    x="220"
                    y="138"
                    fill="var(--accent)"
                    fontSize="11"
                    fontWeight="700"
                  >
                    T+15m to T+210m: {proximity.feetFromDock} ft —{' '}
                    {proximity.boundaryStatus}
                  </text>
                  <circle cx="640" cy="24" r="5" fill="var(--text-primary)" />
                  <text x="545" y="20" fill="var(--text-primary)" fontSize="11">
                    T+225m: 607 ft (Departed)
                  </text>
                </svg>
              </div>
            </div>
          )}

          {/* TAB 3: PRO CARRIER PDF SUITE & CUSTOM FORM STENCIL */}
          {activeTab === 'pdf' && (
            <div className="scanner-workbench">
              <div
                className="section-header-stack"
                style={{ marginBottom: 'var(--space-16)' }}
              >
                <p className="demo-intro-line">
                  Vector PDF Suite · Forms 101-A, 102-B, and 103-C + Blank
                  Company Form Stencil Overlay
                </p>
                <h2>Pro Carrier PDF Form Suite &amp; Custom Stencil Studio</h2>
              </div>

              <div className="radar-filter-chips">
                {(
                  [
                    {
                      id: 'full_3page_suite',
                      label: 'Full 3-Page Carrier Suite (101-A + 102-B + 103-C)',
                    },
                    {
                      id: 'claim_evidence_packet',
                      label: 'Form 101-A: Claim Evidence Packet',
                    },
                    {
                      id: 'revised_rate_con_invoice',
                      label: 'Form 102-B: Revised Rate Con & Factoring Invoice',
                    },
                    {
                      id: 'driver_settlement_sheet',
                      label: 'Form 103-C: Driver Weekly Settlement Worksheet',
                    },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`radar-chip ${
                      selectedPdfFormType === item.id ? 'radar-chip-active' : ''
                    }`}
                    onClick={() => setSelectedPdfFormType(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="demo-panels-grid">
                <div className="scanner-panel">
                  <h3>1. Form Alignment, Driver Split &amp; Custom Stencil</h3>
                  <p className="small-text">
                    Upload your own blank carrier invoice or letterhead
                    (PNG/JPG) to stamp Load #{loadNumber} (${amountDue}) and
                    your 1-meter MGRS dock proof directly onto your form.
                  </p>

                  <div className="pii-redaction-box">
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: 'var(--space-4)',
                      }}
                    >
                      <strong>Form 103-C Driver Settlement Split:</strong>
                      <span className="small-text tabular-nums">
                        Driver: {driverCutPct}% (${driverCutDollars}) · Fleet:{' '}
                        {100 - driverCutPct}% (${fleetNetDollars})
                      </span>
                    </div>
                    <input
                      type="range"
                      min={50}
                      max={100}
                      step={5}
                      value={driverCutPct}
                      onChange={(e) => setDriverCutPct(Number(e.target.value))}
                      style={{ width: '100%', accentColor: 'var(--accent)' }}
                    />
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 'var(--space-8)',
                      alignItems: 'center',
                    }}
                  >
                    <label
                      className="radar-chip"
                      style={{ cursor: 'pointer', fontWeight: 600 }}
                    >
                      {customTemplateName
                        ? `Replace Form (${customTemplateName})`
                        : '+ Upload Blank Carrier Form / Letterhead (PNG/JPG)'}
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
                  </div>

                  <label
                    className="small-text"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={showCalibrationGrid}
                      onChange={(e) => setShowCalibrationGrid(e.target.checked)}
                      style={{ accentColor: 'var(--accent)' }}
                    />
                    <span>
                      Overlay 36pt Coordinate Calibration Grid (for custom form
                      alignment)
                    </span>
                  </label>

                  <div className="field-grid-2">
                    <label className="slider-control">
                      <span>
                        Horizontal Offset (X):{' '}
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
                      <span>
                        Vertical Offset (Y): <strong>{customOffsetY} pt</strong>
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
                        handleGatedPdfAction(
                          'Unlock Vector PDF Suite Download',
                          selectedPdfFormType,
                          'download'
                        )
                      }
                    >
                      Download Selected Vector PDF
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() =>
                        handleGatedPdfAction(
                          'Unlock Live Printable PDF Preview',
                          selectedPdfFormType,
                          'print_blob'
                        )
                      }
                    >
                      Preview &amp; Print in Browser
                    </button>
                  </div>
                </div>

                <div className="scanner-panel">
                  <h3>2. Active Packet Summary &amp; Print Preview</h3>
                  <ul className="email-meta-list">
                    <li>
                      — Active Load: <strong>#{loadNumber}</strong> · Rate Con:{' '}
                      <strong>#{rateConId}</strong>
                    </li>
                    <li>
                      — Broker: <strong>{brokerName}</strong> (MC #{brokerMc})
                    </li>
                    <li>
                      — Verified Dwell: <strong>{totalDwellFormatted}</strong> ·
                      Billable: <strong>{billableFormatted}</strong> @ $
                      {hourlyRate}/hr
                    </li>
                    <li>
                      — Total Detention Claim:{' '}
                      <span className="claim-dollar-figure">${amountDue}</span>
                    </li>
                    <li>
                      — Page-1 Boundary Stamp:{' '}
                      <strong>{proximity.boundaryStatus}</strong> (
                      {proximity.feetFromDock} ft · {proximity.mgrs1m})
                    </li>
                  </ul>

                  {printPreviewBlobUrl ? (
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 'var(--space-8)',
                        }}
                      >
                        <strong className="small-text">
                          Live Vector PDF Preview:
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
                  ) : (
                    <div className="pii-redaction-box">
                      <p className="small-text">
                        Click <strong>Preview &amp; Print in Browser</strong> to
                        inspect the live vector PDF layout (Forms 101-A, 102-B,
                        103-C) or <strong>Download Selected Vector PDF</strong>{' '}
                        to save the file directly.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: OPEN-MARKET BROKER & 100M FACILITY CLUSTER RADAR */}
          {activeTab === 'radar' && (
            <div className="scanner-workbench">
              <div
                className="section-header-stack"
                style={{ marginBottom: 'var(--space-16)' }}
              >
                <p className="demo-intro-line">
                  Keyed on 100m MGRS Warehouse Clusters · Clamped [0, 1]
                  True-Yield Formula
                </p>
                <h2>Open-Market Broker &amp; Facility Intelligence Radar</h2>
              </div>

              <div className="radar-search-bar">
                <input
                  type="text"
                  className="capture-input"
                  placeholder="Filter by Lane (e.g. Joliet, Dallas, Memphis), Cluster ID (16T-EN-099-976), or Broker MC#..."
                  value={radarSearchInput}
                  onChange={(e) => setRadarSearchInput(e.target.value)}
                />
                {radarSearchInput && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setRadarSearchInput('')}
                  >
                    Clear Filter
                  </button>
                )}
              </div>

              <div className="radar-filter-chips">
                {BENCHMARK_LANES.map((c) => (
                  <button
                    key={c.facilityClusterId}
                    type="button"
                    className={`radar-chip ${
                      selectedCluster.facilityClusterId === c.facilityClusterId
                        ? 'radar-chip-active'
                        : ''
                    }`}
                    onClick={() => onSelectCluster(c)}
                  >
                    {c.facilityClusterId} · {c.lane}
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
                    const rowScore = computeClampedBrokerFitScore({
                      payoutRatePct: row.payoutRatePct,
                      avgDwellMins: row.avgDwellMins,
                      detentionRateDollars: row.detentionRateDollars,
                      noticeWindowHrs: row.noticeWindowHrs,
                    });
                    return (
                      <tr
                        key={row.id}
                        onClick={() => onSelectCluster(row)}
                        style={{
                          backgroundColor:
                            selectedCluster.id === row.id
                              ? 'var(--surface-hover)'
                              : undefined,
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
                        <td className="tabular-nums">
                          <strong>{rowScore} / 100</strong> — {row.verdict}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

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
                    <span className="step-number">{liveFitScore} / 100</span>
                  </div>

                  <label className="slider-control">
                    <span>
                      Verified Detention Payout Rate:{' '}
                      <strong>{simPayout}%</strong>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={simPayout}
                      onChange={(e) => setSimPayout(Number(e.target.value))}
                    />
                  </label>

                  <label className="slider-control">
                    <span>
                      BOL-Verified Avg Dwell (Mins):{' '}
                      <strong>{simDwell} mins</strong>
                    </span>
                    <input
                      type="range"
                      min={30}
                      max={480}
                      value={simDwell}
                      onChange={(e) => setSimDwell(Number(e.target.value))}
                    />
                  </label>

                  <label className="slider-control">
                    <span>
                      Hourly Detention Rate ($/hr):{' '}
                      <strong>${simRate}/hr</strong>
                    </span>
                    <input
                      type="range"
                      min={20}
                      max={100}
                      value={simRate}
                      onChange={(e) => setSimRate(Number(e.target.value))}
                    />
                  </label>

                  <label className="slider-control">
                    <span>
                      Rate-Con Notice Window: <strong>{simNotice} hrs</strong>
                    </span>
                    <input
                      type="range"
                      min={2}
                      max={48}
                      value={simNotice}
                      onChange={(e) => setSimNotice(Number(e.target.value))}
                    />
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
