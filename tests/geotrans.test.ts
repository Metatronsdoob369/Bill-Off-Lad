import { describe, it, expect } from 'vitest';
import {
  wgs84ToUtm,
  wgs84ToMgrs,
  evaluateBoundaryEnclosure,
  computePlanarDockOffsetMeters,
  computeEldBreadcrumbPlot,
  getSpatialFacilityIntelligence,
  evaluateDockProximity,
} from '../src/geotrans';

describe('GeoTrans Coordinate Engine (100% Local Math / Zero Map APIs)', () => {
  it('correctly converts WGS84 coordinates to UTM Zone 16T (Joliet, IL)', () => {
    // Joliet, IL reference: 41.525° N, -88.0817° W
    const utm = wgs84ToUtm(41.525, -88.0817);
    expect(utm.zone).toBe(16);
    expect(utm.hemisphere).toBe('N');
    expect(utm.latBand).toBe('T');
    // Expected Easting ~409,800m, Northing ~4,597,600m
    expect(utm.easting).toBeGreaterThan(400000);
    expect(utm.easting).toBeLessThan(420000);
    expect(utm.northing).toBeGreaterThan(4590000);
    expect(utm.northing).toBeLessThan(4605000);
  });

  it('generates 1-meter precision (5-digit) and 100-meter cluster MGRS coordinates', () => {
    const mgrs1m = wgs84ToMgrs(41.525, -88.0817, 5);
    expect(mgrs1m.precision).toBe(5);
    expect(mgrs1m.mgrs).toMatch(/^16T\s+[A-Z]{2}\s+\d{5}\s+\d{5}$/);

    const mgrs100m = wgs84ToMgrs(41.525, -88.0817, 3);
    expect(mgrs100m.precision).toBe(3);
    expect(mgrs100m.mgrs).toMatch(/^16T\s+[A-Z]{2}\s+\d{3}\s+\d{3}$/);
  });

  it('correctly classifies Boundary Enclosures across 150m dock radius', () => {
    // Tier 1: Dock Apron (< 50m)
    const apron = evaluateBoundaryEnclosure(12.4);
    expect(apron.tier).toBe('APRON');
    expect(apron.inBounds).toBe(true);
    expect(apron.stampText).toBe('STATUS: DOCK APRON VERIFIED (< 50m)');

    // Tier 2: Facility Staging Area (50m - 150m)
    const staging = evaluateBoundaryEnclosure(120.0);
    expect(staging.tier).toBe('STAGING');
    expect(staging.inBounds).toBe(true);
    expect(staging.stampText).toBe('STATUS: FACILITY STAGING AREA (< 150m)');

    // Tier 3: Off-Site / In-Transit (> 150m)
    const offSite = evaluateBoundaryEnclosure(185.2);
    expect(offSite.tier).toBe('OFF_SITE');
    expect(offSite.inBounds).toBe(false);
    expect(offSite.stampText).toBe('STATUS: OFF-SITE / IN-TRANSIT (> 150m)');
  });

  it('computes exact 2D planar Euclidean distance between ELD ping and dock door', () => {
    const dockLat = 41.525;
    const dockLon = -88.0817;
    // Exactly at dock: offset should be 0.0m
    const atDock = computePlanarDockOffsetMeters(dockLat, dockLon, dockLat, dockLon);
    expect(atDock.planarOffsetMeters).toBe(0);
    expect(atDock.enclosure.tier).toBe('APRON');
    expect(atDock.facilityMgrs100mClusterId).toBeTruthy();

    // Sized offset
    const offset = computePlanarDockOffsetMeters(dockLat, dockLon, dockLat + 0.0001, dockLon + 0.0001);
    expect(offset.planarOffsetMeters).toBeGreaterThan(10);
    expect(offset.planarOffsetMeters).toBeLessThan(30);
  });

  it('evaluates ELD Breadcrumb Trajectory series into timestamps and boundary states', () => {
    const dockLat = 41.525;
    const dockLon = -88.0817;
    const trajectory = computeEldBreadcrumbPlot(dockLat, dockLon, [
      {
        tPlusMins: 0,
        timestampLabel: '08:04 CT',
        eventLabel: 'Arrival',
        lat: dockLat + 0.00086,
        lon: dockLon + 0.00082,
      },
      {
        tPlusMins: 15,
        timestampLabel: '08:19 CT',
        eventLabel: 'Dock Bumper',
        lat: dockLat + 0.00008,
        lon: dockLon + 0.00009,
      },
      {
        tPlusMins: 225,
        timestampLabel: '14:37 CT',
        eventLabel: 'Departure',
        lat: dockLat + 0.00133,
        lon: dockLon + 0.00125,
      },
    ]);

    expect(trajectory.length).toBe(3);
    // Arrival: staging area (< 150m)
    expect(trajectory[0].enclosure.inBounds).toBe(true);
    // Backed into door: apron (< 50m)
    expect(trajectory[1].enclosure.tier).toBe('APRON');
    expect(trajectory[1].offsetMeters).toBeLessThan(50);
    // Departed: off site (> 150m)
    expect(trajectory[2].enclosure.inBounds).toBe(false);
  });

  it('retrieves pre-flight facility intelligence for known and dynamic clusters', () => {
    const intel = getSpatialFacilityIntelligence('16T-EN-099-976', 'Joliet Warehouse');
    expect(intel.clusterId).toBe('16T-EN-099-976');
    expect(intel.fridayDwellForecast).toContain('3.4 hours');
    expect(intel.claimsApprovedPct).toBeGreaterThan(80);
    expect(intel.preFlightNegotiationAdvice).toBeTruthy();
  });

  it('evaluates 53-ft trailer lengths and dispatcher verdicts via evaluateDockProximity', () => {
    const bumper = evaluateDockProximity(41.525, -88.0817, 41.525126, -88.0817);
    expect(bumper.feetFromDock).toBe(46);
    expect(bumper.trailerLengths53Ft).toBe(0.7);
    expect(bumper.boundaryStatus).toBe('STATUS: DOCK APRON VERIFIED (< 50m)');
    expect(bumper.dispatcherVerdict).toBe('AT THE DOCK BUMPER — PAY DETENTION');

    const bullpen = evaluateDockProximity(41.525, -88.0817, 41.525658, -88.0817);
    expect(bullpen.feetFromDock).toBe(240);
    expect(bullpen.boundaryStatus).toBe('STATUS: FACILITY STAGING AREA (< 150m)');

    const truckStop = evaluateDockProximity(41.525, -88.0817, 41.529335, -88.0817);
    expect(truckStop.feetFromDock).toBeGreaterThan(1500);
    expect(truckStop.boundaryStatus).toBe('STATUS: OFF-SITE / IN-TRANSIT (> 150m)');
  });
});

