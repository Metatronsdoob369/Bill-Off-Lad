import { describe, it, expect } from 'vitest';
import { computeClampedBrokerFitScore } from '../src/App';

describe('Deterministic Clamped True-Yield & Broker Fit Scoring (DEC-11)', () => {
  it('correctly scores optimal green-light carrier broker fit', () => {
    // 95% payout, 60m dwell (fast), $75/hr detention, 48h notice window
    const score = computeClampedBrokerFitScore({
      payoutRatePct: 95,
      avgDwellMins: 60,
      detentionRateDollars: 75,
      noticeWindowHrs: 48,
    });
    // 0.4*(0.95) + 0.3*(1 - 60/360) + 0.2*(75/100) + 0.1*(48/48) = 0.38 + 0.25 + 0.15 + 0.10 = 0.88 -> 88
    expect(score).toBeGreaterThanOrEqual(85);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('correctly penalizes predatory broker terms (low payout, long dwell, small rate)', () => {
    // 15% payout, 330m dwell (5.5 hrs), $30/hr detention, 12h strict trap
    const score = computeClampedBrokerFitScore({
      payoutRatePct: 15,
      avgDwellMins: 330,
      detentionRateDollars: 30,
      noticeWindowHrs: 12,
    });
    expect(score).toBeLessThan(35);
  });

  it('clamps inputs to [0, 1] range to prevent out-of-bounds score corruption', () => {
    // Negative values
    const minScore = computeClampedBrokerFitScore({
      payoutRatePct: -50,
      avgDwellMins: 9999, // Way past 360m
      detentionRateDollars: -10,
      noticeWindowHrs: -5,
    });
    expect(minScore).toBe(0);

    // Extreme high values
    const maxScore = computeClampedBrokerFitScore({
      payoutRatePct: 200,
      avgDwellMins: 0,
      detentionRateDollars: 500,
      noticeWindowHrs: 200,
    });
    expect(maxScore).toBe(100);
  });

  it('evaluates benchmark test cases consistently', () => {
    // Joliet benchmark: 91.4% payout, 78m dwell, $65 rate, 24h notice
    const jolietScore = computeClampedBrokerFitScore({
      payoutRatePct: 91.4,
      avgDwellMins: 78,
      detentionRateDollars: 65,
      noticeWindowHrs: 24,
    });
    expect(jolietScore).toBe(78);
  });
});
