import { describe, it, expect } from 'vitest';
import { generateCarrierPdfSuite, CarrierPdfSuiteInput } from '../src/pdfSuite';

const mockPdfInput: CarrierPdfSuiteInput = {
  loadNumber: '4417',
  rateConId: 'RC-88214',
  brokerName: 'Midwest Contract Group',
  brokerMc: '481920',
  facility: 'Joliet, IL Cold & Dry Distribution',
  deliveryDate: '10/14',
  arrival: '08:04 CT',
  departure: '14:37 CT',
  noticeSent: '10:12 CT',
  totalDwellFormatted: '6 hrs 33 min',
  totalDwellMins: 393,
  freeTimeHrs: 2,
  billableFormatted: '4 hrs 35 min',
  billableMins: 273,
  rateDollars: 60,
  amountDollars: 275,
  driverCutPct: 75,
  driverCutDollars: '206.25',
  fleetNetDollars: '68.75',
  senderAlias: 'billing@carrier.com',
  stageLabel: 'DAY 0 INITIAL DETENTION CLAIM',
  planarOffsetMeters: 12.4,
  offsetFeet: 41,
  truckLengths: '0.6',
  dockMgrs1m: '16T EN 09912 97645',
  activeClusterId: '16T-EN-099-976',
  enclosureStamp: {
    tier: 'APRON',
    inBounds: true,
    stampText: 'STATUS: DOCK APRON VERIFIED (< 50m)',
    shortBadge: 'IN-BOUNDS · DOCK APRON (< 50m)',
    radiusMeters: 150,
  },
  facilityIntel: {
    clusterId: '16T-EN-099-976',
    facilityTitle: 'Joliet Distribution',
    fridayDwellForecast: 'Averages 3.4 hours dwell on Friday afternoons',
    avgDwellHours: 3.4,
    claimsApprovedPct: 91.4,
    claimsDisputedPct: 8.6,
    verifiedBolCount: 142,
    preFlightNegotiationAdvice: 'Lock $65/hr after 90m free time',
  },
  eldBreadcrumbSeries: [
    {
      tPlusMins: 0,
      timestampLabel: '08:04 CT',
      eventLabel: 'Arrival',
      lat: 41.52586,
      lon: -88.08088,
      offsetMeters: 120,
      offsetFeet: 394,
      mgrs1m: '16T EN 09920 97650',
      enclosure: {
        tier: 'STAGING',
        inBounds: true,
        stampText: 'STATUS: FACILITY STAGING AREA (< 150m)',
        shortBadge: 'STAGING (< 150m)',
        radiusMeters: 150,
      },
    },
    {
      tPlusMins: 15,
      timestampLabel: '08:19 CT',
      eventLabel: 'Dock Door',
      lat: 41.52508,
      lon: -88.08161,
      offsetMeters: 12.4,
      offsetFeet: 41,
      mgrs1m: '16T EN 09912 97645',
      enclosure: {
        tier: 'APRON',
        inBounds: true,
        stampText: 'STATUS: DOCK APRON VERIFIED (< 50m)',
        shortBadge: 'APRON (< 50m)',
        radiusMeters: 150,
      },
    },
  ],
};

describe('Carrier Pro PDF Suite Generator', () => {
  it('renders and outputs the full 3-page carrier claim & settlement suite without throwing', () => {
    expect(() => {
      generateCarrierPdfSuite(mockPdfInput, 'full_3page_suite', 'download');
    }).not.toThrow();
  });

  it('renders individual Form 101-A (Claim Evidence Packet)', () => {
    expect(() => {
      generateCarrierPdfSuite(mockPdfInput, 'claim_evidence_packet', 'download');
    }).not.toThrow();
  });

  it('renders individual Form 102-B (Revised Rate Con Addendum & Factoring Invoice)', () => {
    expect(() => {
      generateCarrierPdfSuite(mockPdfInput, 'revised_rate_con_invoice', 'download');
    }).not.toThrow();
  });

  it('renders individual Form 103-C (Driver Weekly Detention & Payroll Worksheet)', () => {
    expect(() => {
      generateCarrierPdfSuite(mockPdfInput, 'driver_settlement_sheet', 'download');
    }).not.toThrow();
  });

  it('renders with calibration grid overlay enabled', () => {
    expect(() => {
      generateCarrierPdfSuite(
        {
          ...mockPdfInput,
          showCalibrationGrid: true,
          customOffsetX: 10,
          customOffsetY: -5,
        },
        'full_3page_suite',
        'download'
      );
    }).not.toThrow();
  });
});
