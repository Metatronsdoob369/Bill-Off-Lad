import { jsPDF } from 'jspdf';
import {
  BoundaryEnclosureStamp,
  EvaluatedEldBreadcrumb,
  SpatialFacilityProfile,
} from './geotrans';

export type PdfFormTemplateType =
  | 'full_3page_suite'
  | 'claim_evidence_packet'
  | 'revised_rate_con_invoice'
  | 'driver_settlement_sheet';

export type CustomTemplateMode = 'none' | 'letterhead_banner' | 'full_page_replica';

export interface CarrierPdfSuiteInput {
  loadNumber: string;
  rateConId: string;
  brokerName: string;
  brokerMc: string;
  facility: string;
  deliveryDate: string;
  arrival: string;
  departure: string;
  noticeSent: string;
  totalDwellFormatted: string;
  totalDwellMins: number;
  freeTimeHrs: number;
  billableFormatted: string;
  billableMins: number;
  rateDollars: number;
  amountDollars: number;
  driverCutPct: number;
  driverCutDollars: string;
  fleetNetDollars: string;
  senderAlias: string;
  stageLabel: string;
  planarOffsetMeters: number;
  offsetFeet: number;
  truckLengths: string;
  dockMgrs1m: string;
  activeClusterId: string;
  enclosureStamp: BoundaryEnclosureStamp;
  facilityIntel: SpatialFacilityProfile;
  eldBreadcrumbSeries: EvaluatedEldBreadcrumb[];
  customTemplateDataUrl?: string | null;
  customTemplateFormat?: 'PNG' | 'JPEG';
  customTemplateMode?: CustomTemplateMode;
  showCalibrationGrid?: boolean;
  customOffsetX?: number;
  customOffsetY?: number;
}

/**
 * Draws an optional coordinate calibration grid (inspired by `scripts/render-grid.ts`)
 * so fleets can align field coordinates onto any uploaded scanned paper form.
 */
function drawCalibrationGrid(doc: jsPDF) {
  doc.setDrawColor(180, 84, 10);
  doc.setLineWidth(0.35);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(180, 84, 10);

  for (let x = 36; x <= 576; x += 36) {
    doc.line(x, 18, x, 774);
    doc.text(`${x}pt`, x + 2, 26);
  }
  for (let y = 36; y <= 756; y += 36) {
    doc.line(18, y, 594, y);
    doc.text(`${y}pt`, 20, y - 2);
  }
}

/**
 * Applies either a full-page scanned blank form background (`full_page_replica`)
 * or a top-right custom carrier letterhead/logo stamp (`letterhead_banner`).
 */
function applyCustomCarrierTemplate(
  doc: jsPDF,
  input: CarrierPdfSuiteInput
): void {
  if (!input.customTemplateDataUrl || input.customTemplateMode === 'none') {
    return;
  }
  const fmt = input.customTemplateFormat || 'PNG';
  try {
    if (input.customTemplateMode === 'full_page_replica') {
      // Full-page scanned worksheet underlay (612 x 792 pt US Letter)
      doc.addImage(input.customTemplateDataUrl, fmt, 0, 0, 612, 792);
    } else if (input.customTemplateMode === 'letterhead_banner') {
      // Top-right carrier letterhead / form badge inside header
      doc.addImage(input.customTemplateDataUrl, fmt, 456, 44, 108, 42);
    }
  } catch {
    // Ignore invalid image encoding and continue rendering vector form
  }
}

/**
 * PAGE 1: DETENTION CLAIM & SPATIAL EVIDENCE PACKET
 */
function renderClaimEvidencePage(doc: jsPDF, data: CarrierPdfSuiteInput) {
  const dx = data.customOffsetX || 0;
  const dy = data.customOffsetY || 0;
  const isReplica =
    Boolean(data.customTemplateDataUrl) &&
    data.customTemplateMode === 'full_page_replica';

  applyCustomCarrierTemplate(doc, data);

  // Manila header band (#FAF8F3) & Charcoal rules (#241F18)
  if (!isReplica) {
    doc.setFillColor(250, 248, 243);
    doc.rect(36 + dx, 36 + dy, 540, 84, 'F');
    doc.setDrawColor(36, 31, 24);
    doc.setLineWidth(1.5);
    doc.rect(36 + dx, 36 + dy, 540, 84, 'S');
  }

  applyCustomCarrierTemplate(
    doc,
    data.customTemplateMode === 'letterhead_banner'
      ? data
      : { ...data, customTemplateMode: 'none' }
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(36, 31, 24);
  doc.text(
    `FORM 101-A · DETENTION CLAIM EVIDENCE PACKET — LOAD #${data.loadNumber}`,
    52 + dx,
    62 + dy
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(110, 102, 89);
  doc.text(
    `White-Label Carrier Billing Desk: ${data.senderAlias}   |   Stage: ${data.stageLabel}`,
    52 + dx,
    82 + dy
  );
  doc.text(
    `Rate Confirmation: #${data.rateConId}   |   Broker: ${data.brokerName} (MC #${data.brokerMc})`,
    52 + dx,
    100 + dy
  );

  // A. Automated Boundary Enclosure Stamp on Page 1 of PDF (< 50m / < 150m / > 150m)
  if (!isReplica) {
    doc.setFillColor(
      data.enclosureStamp.inBounds ? 250 : 243,
      data.enclosureStamp.inBounds ? 248 : 239,
      data.enclosureStamp.inBounds ? 243 : 230
    );
    doc.setDrawColor(
      data.enclosureStamp.tier === 'APRON' ? 180 : 36,
      data.enclosureStamp.tier === 'APRON' ? 84 : 31,
      data.enclosureStamp.tier === 'APRON' ? 10 : 24
    );
    doc.setLineWidth(1.5);
    doc.rect(36 + dx, 130 + dy, 540, 68, 'FD');
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(180, 84, 10);
  doc.text(data.enclosureStamp.stampText, 50 + dx, 150 + dy);

  doc.setFontSize(9.5);
  doc.setTextColor(36, 31, 24);
  doc.text(
    `150m Dock Enclosure Check: ${
      data.enclosureStamp.inBounds
        ? 'IN-BOUNDS (VERIFIED)'
        : 'OUT-OF-BOUNDS (>150m)'
    } · Planar Offset: ${data.planarOffsetMeters}m (${data.offsetFeet} ft / ${data.truckLengths} truck lengths)`,
    50 + dx,
    166 + dy
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(110, 102, 89);
  doc.text(
    `100m Facility Cluster Key: ${data.activeClusterId} · Broker Friction: ${data.facilityIntel.claimsApprovedPct}% Approved / ${data.facilityIntel.claimsDisputedPct}% Disputed`,
    50 + dx,
    182 + dy
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(180, 84, 10);
  doc.text(`$${data.amountDollars}.00 DUE`, 435 + dx, 156 + dy);

  // Section 1: ELD & Signed BOL Timestamp Audit
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(36, 31, 24);
  doc.text('1. ELD / GPS & SIGNED BOL TIMESTAMP LEDGER', 36 + dx, 218 + dy);
  doc.setDrawColor(228, 221, 208);
  doc.setLineWidth(1);
  doc.line(36 + dx, 224 + dy, 576 + dx, 224 + dy);

  const ledgerRows: [string, string][] = [
    [
      'Load & Rate Confirmation:',
      `Load #${data.loadNumber} · Rate Con #${data.rateConId} (${data.brokerName} · MC #${data.brokerMc})`,
    ],
    [
      'Receiver Facility & Cluster ID:',
      `${data.facility} (Cluster Key: ${data.activeClusterId})`,
    ],
    [
      'Automated Boundary Stamp:',
      `${data.enclosureStamp.stampText} — ${data.planarOffsetMeters}m (${data.offsetFeet} ft) from Dock Center`,
    ],
    [
      'Arrival / Notice / Departure:',
      `In: ${data.arrival}  |  Notice Sent: ${data.noticeSent}  |  Out: ${data.departure}`,
    ],
    [
      'Verified Dwell & Billable:',
      `Total Dwell: ${data.totalDwellFormatted}  |  Free Time: ${data.freeTimeHrs} hrs  |  Billable: ${data.billableFormatted}`,
    ],
    [
      'Contractual Rate & Invoice Due:',
      `$${data.rateDollars}.00/hr  ->  $${data.amountDollars}.00 USD (Rev Rate Con #${data.rateConId}-REV1)`,
    ],
  ];

  let y = 240 + dy;
  doc.setFontSize(9.5);
  for (const [label, value] of ledgerRows) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(36, 31, 24);
    doc.text(label, 48 + dx, y);
    doc.setFont('helvetica', 'normal');
    doc.text(value, 220 + dx, y);
    doc.setDrawColor(228, 221, 208);
    doc.line(48 + dx, y + 5, 564 + dx, y + 5);
    y += 19;
  }

  // C. Timestamp-to-Offset Visual Geofence Plot
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(36, 31, 24);
  doc.text(
    '2. TIMESTAMP-TO-OFFSET VISUAL GEOFENCE PLOT (150m ENCLOSURE RADIUS)',
    36 + dx,
    y
  );
  doc.line(36 + dx, y + 6, 576 + dx, y + 6);

  const plotTop = y + 14;
  const plotHeight = 76;
  const plotLeft = 48 + dx;
  const plotWidth = 516;
  if (!isReplica) {
    doc.setFillColor(250, 248, 243);
    doc.setDrawColor(228, 221, 208);
    doc.rect(plotLeft, plotTop, plotWidth, plotHeight, 'FD');
  } else {
    doc.setDrawColor(36, 31, 24);
    doc.rect(plotLeft, plotTop, plotWidth, plotHeight, 'S');
  }

  const y150m = plotTop + 20;
  const y50m = plotTop + 52;
  doc.setDrawColor(110, 102, 89);
  doc.setLineWidth(0.6);
  doc.line(plotLeft, y150m, plotLeft + plotWidth, y150m);
  doc.setDrawColor(180, 84, 10);
  doc.line(plotLeft, y50m, plotLeft + plotWidth, y50m);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(110, 102, 89);
  doc.text('150m Facility Boundary', plotLeft + 6, y150m - 3);
  doc.setTextColor(180, 84, 10);
  doc.text('50m Dock Apron Threshold', plotLeft + 6, y50m - 3);

  const xPositions = [
    plotLeft + 75,
    plotLeft + 205,
    plotLeft + 345,
    plotLeft + 470,
  ];
  const yPositions = data.eldBreadcrumbSeries.map((pt) => {
    const clampedMeters = Math.min(200, Math.max(0, pt.offsetMeters));
    return (
      plotTop + plotHeight - 10 - (clampedMeters / 200) * (plotHeight - 20)
    );
  });

  const count = Math.min(xPositions.length, yPositions.length);
  doc.setDrawColor(36, 31, 24);
  doc.setLineWidth(1.5);
  for (let i = 0; i < count - 1; i++) {
    doc.line(
      xPositions[i],
      yPositions[i],
      xPositions[i + 1],
      yPositions[i + 1]
    );
  }
  data.eldBreadcrumbSeries.forEach((pt, idx) => {
    const cx = xPositions[idx];
    const cy = yPositions[idx];
    doc.setFillColor(180, 84, 10);
    doc.circle(cx, cy, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(36, 31, 24);
    doc.text(
      `T+${pt.tPlusMins}m (${pt.offsetMeters}m)`,
      cx - 28,
      cy > plotTop + 42 ? cy - 6 : cy + 11
    );
  });

  y = plotTop + plotHeight + 16;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(36, 31, 24);
  data.eldBreadcrumbSeries.forEach((pt) => {
    doc.text(
      `• ${pt.eventLabel} (${pt.offsetMeters}m / ${pt.offsetFeet} ft) — ${pt.enclosure.stampText}`,
      48 + dx,
      y
    );
    y += 13;
  });

  // Section 3: Ghost-Clerk Dispatch Transcript
  y += 20;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(36, 31, 24);
  doc.text('3. WHITE-LABELED GHOST-CLERK CLAIM TRANSCRIPT', 36 + dx, y);
  doc.line(36 + dx, y + 6, 576 + dx, y + 6);

  y += 20;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(
    `Subject: Detention Claim — Load #${data.loadNumber} — $${data.amountDollars}.00 — documentation attached`,
    48 + dx,
    y
  );
  y += 15;
  doc.setFont('helvetica', 'normal');
  const bodyParagraph = `Per rate confirmation #${data.rateConId} (detention: $${data.rateDollars}/hr after ${data.freeTimeHrs} hrs free time), we are submitting our documented detention claim for Load #${data.loadNumber} at ${data.facility}. Total verified dwell was ${data.totalDwellFormatted} (${data.arrival} to ${data.departure}), leaving ${data.billableFormatted} billable at $${data.rateDollars}/hr for a total due of $${data.amountDollars}.00. Notice was transmitted at ${data.noticeSent} inside the rate confirmation window. Attached: signed BOL, Page-1 Automated Boundary Stamp (${data.enclosureStamp.stampText}), and rate confirmation clause.`;
  const wrappedBody = doc.splitTextToSize(bodyParagraph, 510);
  doc.text(wrappedBody, 48 + dx, y);

  // Footer
  doc.setDrawColor(228, 221, 208);
  doc.line(36, 728, 576, 728);
  doc.setFontSize(8.5);
  doc.setTextColor(110, 102, 89);
  doc.text(
    `Form 101-A · Generated locally for fleet records (${new Date()
      .toISOString()
      .slice(0, 10)}) · Zero-PII Scrubber Active.`,
    36,
    742
  );

  if (data.showCalibrationGrid) {
    drawCalibrationGrid(doc);
  }
}

/**
 * PAGE 2: REVISED RATE CONFIRMATION ADDENDUM & FACTORING ACCESSORIAL INVOICE
 */
function renderRevisedRateConPage(doc: jsPDF, data: CarrierPdfSuiteInput) {
  const dx = data.customOffsetX || 0;
  const dy = data.customOffsetY || 0;
  const isReplica =
    Boolean(data.customTemplateDataUrl) &&
    data.customTemplateMode === 'full_page_replica';

  applyCustomCarrierTemplate(doc, data);

  if (!isReplica) {
    doc.setFillColor(250, 248, 243);
    doc.rect(36 + dx, 36 + dy, 540, 84, 'F');
    doc.setDrawColor(36, 31, 24);
    doc.setLineWidth(1.5);
    doc.rect(36 + dx, 36 + dy, 540, 84, 'S');
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(36, 31, 24);
  doc.text(
    `FORM 102-B · REVISED RATE CONFIRMATION ADDENDUM (#${data.rateConId}-REV1)`,
    52 + dx,
    62 + dy
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(110, 102, 89);
  doc.text(
    `Factoring-Ready Accessorial Invoice   |   Load #${data.loadNumber}   |   Carrier Billing Desk: ${data.senderAlias}`,
    52 + dx,
    82 + dy
  );
  doc.text(
    `Bill To Broker: ${data.brokerName} (MC #${data.brokerMc})   |   Facility: ${data.facility}`,
    52 + dx,
    100 + dy
  );

  // Ruled Invoice Box
  let y = 144 + dy;
  doc.setDrawColor(36, 31, 24);
  doc.setLineWidth(1.2);
  doc.rect(36 + dx, y, 540, 190, 'S');

  // Table Header
  if (!isReplica) {
    doc.setFillColor(243, 239, 230);
    doc.rect(36 + dx, y, 540, 28, 'F');
  }
  doc.line(36 + dx, y + 28, 576 + dx, y + 28);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(36, 31, 24);
  doc.text('ITEM CODE', 48 + dx, y + 18);
  doc.text('ACCESSORIAL / LINE DESCRIPTION', 130 + dx, y + 18);
  doc.text('QTY / HOURS', 380 + dx, y + 18);
  doc.text('RATE', 455 + dx, y + 18);
  doc.text('AMOUNT', 515 + dx, y + 18);

  // Row 1: Free Time Allowance
  const r1 = y + 52;
  doc.setFont('helvetica', 'normal');
  doc.text('DET-FREE', 48 + dx, r1);
  doc.text(
    `Contractual Receiver Free Time (${data.arrival} to +${data.freeTimeHrs} hrs)`,
    130 + dx,
    r1
  );
  doc.text(`${data.freeTimeHrs}.00 hrs`, 380 + dx, r1);
  doc.text('$0.00/hr', 455 + dx, r1);
  doc.text('$0.00', 515 + dx, r1);
  doc.setDrawColor(228, 221, 208);
  doc.line(36 + dx, r1 + 10, 576 + dx, r1 + 10);

  // Row 2: Billable Detention Accessorial
  const r2 = r1 + 32;
  doc.setFont('helvetica', 'bold');
  doc.text('DET-BILL', 48 + dx, r2);
  doc.text(
    `Verified Dock Detention — Load #${data.loadNumber} (${data.enclosureStamp.shortBadge})`,
    130 + dx,
    r2
  );
  doc.text(data.billableFormatted, 380 + dx, r2);
  doc.text(`$${data.rateDollars}.00/hr`, 455 + dx, r2);
  doc.setTextColor(180, 84, 10);
  doc.text(`$${data.amountDollars}.00`, 515 + dx, r2);
  doc.setTextColor(36, 31, 24);
  doc.line(36 + dx, r2 + 10, 576 + dx, r2 + 10);

  // Row 3: Spatial Proof Note
  const r3 = r2 + 30;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(110, 102, 89);
  doc.text(
    `Spatial Audit Key: ${data.dockMgrs1m} (${data.planarOffsetMeters}m / ${data.offsetFeet} ft from Dock Door) · Notice Sent: ${data.noticeSent}`,
    48 + dx,
    r3
  );

  // Total Footer inside table
  const rTotal = y + 154;
  doc.setDrawColor(36, 31, 24);
  doc.line(36 + dx, rTotal, 576 + dx, rTotal);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(36, 31, 24);
  doc.text(
    `TOTAL ACCESSORIAL ADDENDUM DUE (#${data.rateConId}-REV1):`,
    48 + dx,
    rTotal + 24
  );
  doc.setFontSize(15);
  doc.setTextColor(180, 84, 10);
  doc.text(`$${data.amountDollars}.00 USD`, 460 + dx, rTotal + 24);

  // Broker Sign-off & 1-Click Approval Block
  const sigTop = y + 225;
  doc.setDrawColor(36, 31, 24);
  doc.setLineWidth(1);
  doc.rect(36 + dx, sigTop, 540, 118, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(36, 31, 24);
  doc.text(
    'BROKER / FACTORING AUTHORIZATION & 1-CLICK DIGITAL ACCEPTANCE',
    50 + dx,
    sigTop + 22
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(110, 102, 89);
  doc.text(
    `Approve online in 1 click (no login required): https://ladingledger.com/approve/${data.rateConId.toLowerCase()}`,
    50 + dx,
    sigTop + 40
  );
  doc.setTextColor(36, 31, 24);
  doc.text(
    'Authorized Broker Rep Signature: _______________________________     Date: _______________',
    50 + dx,
    sigTop + 76
  );
  doc.text(
    `Revised Rate Con Reference: #${data.rateConId}-REV1     |     Payment Terms: Net 15 / Factoring Release`,
    50 + dx,
    sigTop + 100
  );

  // Footer
  doc.setDrawColor(228, 221, 208);
  doc.line(36, 728, 576, 728);
  doc.setFontSize(8.5);
  doc.setTextColor(110, 102, 89);
  doc.text(
    `Form 102-B · Revised Rate Con & Accessorial Addendum · Attach to Signed BOL for Factoring Submission.`,
    36,
    742
  );

  if (data.showCalibrationGrid) {
    drawCalibrationGrid(doc);
  }
}

/**
 * PAGE 3: DRIVER WEEKLY DETENTION & PAYROLL SETTLEMENT WORKSHEET
 * Inspired by the user's KFT Payroll replica sheet (`assemble.ts` + `pay.ts` + `lib/pdf/`)
 */
function renderDriverSettlementPage(doc: jsPDF, data: CarrierPdfSuiteInput) {
  const dx = data.customOffsetX || 0;
  const dy = data.customOffsetY || 0;
  const isReplica =
    Boolean(data.customTemplateDataUrl) &&
    data.customTemplateMode === 'full_page_replica';

  applyCustomCarrierTemplate(doc, data);

  if (!isReplica) {
    doc.setFillColor(250, 248, 243);
    doc.rect(36 + dx, 36 + dy, 540, 84, 'F');
    doc.setDrawColor(36, 31, 24);
    doc.setLineWidth(1.5);
    doc.rect(36 + dx, 36 + dy, 540, 84, 'S');
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(36, 31, 24);
  doc.text(
    `FORM 103-C · DRIVER DETENTION & PAYROLL SETTLEMENT WORKSHEET`,
    52 + dx,
    62 + dy
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(110, 102, 89);
  doc.text(
    `Carrier Settlement Desk: ${data.senderAlias}   |   Driver Share Split: ${data.driverCutPct}% Driver / ${
      100 - data.driverCutPct
    }% Fleet`,
    52 + dx,
    82 + dy
  );
  doc.text(
    `Verified by Local Spatial Engine (${data.enclosureStamp.stampText}) · Grid ${data.dockMgrs1m}`,
    52 + dx,
    100 + dy
  );

  // Ruled Driver Payroll Grid (Handwritten-style tabular layout)
  const gridTop = 142 + dy;
  doc.setDrawColor(36, 31, 24);
  doc.setLineWidth(1.2);
  doc.rect(36 + dx, gridTop, 540, 220, 'S');

  if (!isReplica) {
    doc.setFillColor(243, 239, 230);
    doc.rect(36 + dx, gridTop, 540, 28, 'F');
  }
  doc.line(36 + dx, gridTop + 28, 576 + dx, gridTop + 28);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(36, 31, 24);
  doc.text('LOAD #', 44 + dx, gridTop + 18);
  doc.text('RECEIVER FACILITY', 98 + dx, gridTop + 18);
  doc.text('ELD IN / OUT', 248 + dx, gridTop + 18);
  doc.text('BILLABLE', 348 + dx, gridTop + 18);
  doc.text('GROSS FEE', 415 + dx, gridTop + 18);
  doc.text(`DRIVER (${data.driverCutPct}%)`, 485 + dx, gridTop + 18);

  // Active Load Row
  const row1Y = gridTop + 52;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(`#${data.loadNumber}`, 44 + dx, row1Y);
  doc.setFont('helvetica', 'normal');
  doc.text(data.facility.slice(0, 26), 98 + dx, row1Y);
  doc.text(`${data.arrival} - ${data.departure}`, 248 + dx, row1Y);
  doc.text(data.billableFormatted, 348 + dx, row1Y);
  doc.text(`$${data.amountDollars}.00`, 415 + dx, row1Y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(180, 84, 10);
  doc.text(`$${data.driverCutDollars}`, 485 + dx, row1Y);
  doc.setTextColor(36, 31, 24);

  // Blank ruled worksheet rows so a driver or dispatcher can also hand-write or batch additional loads
  doc.setDrawColor(228, 221, 208);
  for (let r = 1; r <= 4; r++) {
    const lineY = row1Y + r * 28;
    doc.line(36 + dx, lineY - 16, 576 + dx, lineY - 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(180, 172, 158);
    doc.text(`[Additional Weekly Load Row #${r + 1}]`, 98 + dx, lineY);
  }

  // Settlement Summary Box
  const sumTop = gridTop + 245;
  doc.setDrawColor(180, 84, 10);
  doc.setLineWidth(1.5);
  doc.rect(36 + dx, sumTop, 540, 96, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(36, 31, 24);
  doc.text('WEEKLY DETENTION SETTLEMENT SPLIT SUMMARY', 52 + dx, sumTop + 24);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(
    `Gross Verified Detention Billed to Broker (MC #${data.brokerMc}):`,
    52 + dx,
    sumTop + 48
  );
  doc.setFont('helvetica', 'bold');
  doc.text(`$${data.amountDollars}.00 USD`, 450 + dx, sumTop + 48);

  doc.setFont('helvetica', 'normal');
  doc.text(
    `Driver Direct Settlement Share (${data.driverCutPct}% of Gross Accessorial):`,
    52 + dx,
    sumTop + 66
  );
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(180, 84, 10);
  doc.text(`$${data.driverCutDollars} USD`, 450 + dx, sumTop + 66);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(110, 102, 89);
  doc.text(
    `Fleet Office Net Recovery (${100 - data.driverCutPct}% Admin & Relay Share):`,
    52 + dx,
    sumTop + 84
  );
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(36, 31, 24);
  doc.text(`$${data.fleetNetDollars} USD`, 450 + dx, sumTop + 84);

  // Footer
  doc.setDrawColor(228, 221, 208);
  doc.line(36, 728, 576, 728);
  doc.setFontSize(8.5);
  doc.setTextColor(110, 102, 89);
  doc.text(
    `Form 103-C · Driver Detention Settlement Worksheet · Compatible with Custom Uploaded Carrier Blank Forms.`,
    36,
    742
  );

  if (data.showCalibrationGrid) {
    drawCalibrationGrid(doc);
  }
}

/**
 * Generates and downloads (or opens for print) the selected PDF Form or Complete 3-Page Suite
 */
export function generateCarrierPdfSuite(
  input: CarrierPdfSuiteInput,
  formType: PdfFormTemplateType = 'full_3page_suite',
  action: 'download' | 'print_blob' = 'download'
): string | null {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter',
  });

  if (formType === 'claim_evidence_packet') {
    renderClaimEvidencePage(doc, input);
  } else if (formType === 'revised_rate_con_invoice') {
    renderRevisedRateConPage(doc, input);
  } else if (formType === 'driver_settlement_sheet') {
    renderDriverSettlementPage(doc, input);
  } else {
    // Full 3-Page Carrier Suite
    renderClaimEvidencePage(doc, input);
    doc.addPage('letter', 'portrait');
    renderRevisedRateConPage(doc, input);
    doc.addPage('letter', 'portrait');
    renderDriverSettlementPage(doc, input);
  }

  const fileSuffix =
    formType === 'full_3page_suite'
      ? 'Full-3Page-Suite'
      : formType === 'claim_evidence_packet'
      ? 'Form101A-Evidence-Packet'
      : formType === 'revised_rate_con_invoice'
      ? 'Form102B-Revised-RateCon'
      : 'Form103C-Driver-Settlement';

  if (action === 'print_blob') {
    const blobUrl = String(doc.output('bloburl'));
    return blobUrl;
  }

  doc.save(`BillOff-Load-${input.loadNumber}-${fileSuffix}.pdf`);
  return null;
}
