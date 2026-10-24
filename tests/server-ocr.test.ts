import { describe, it, expect } from 'vitest';
import { extractDeterministicBolFallback } from '../src/bolParser';

describe('Deterministic Server-Side BOL/Rate-Con OCR Extraction & Zero-PII Scrubber', () => {
  it('accurately parses rate con terms, timestamps, and calculates dwell from raw freight snippet', () => {
    const rawText =
      'RATE CON #RC-88214 | Broker MC #481920 | Load #4417 | Receiver: Joliet Distribution | Detention: $60/hr after 2 hrs free time. Carrier must notify within 24 hrs. Arrived 08:04 CT, Notice Sent 10:12 CT, Departed 14:37 CT (393 mins total dwell).';

    const extraction = extractDeterministicBolFallback(rawText);

    expect(extraction.loadNumber).toBe('4417');
    expect(extraction.rateConId).toBe('RC-88214');
    expect(extraction.brokerMc).toBe('481920');
    expect(extraction.detentionRateDollars).toBe(60);
    expect(extraction.freeTimeMins).toBe(120); // 2 hours
    expect(extraction.noticeWindowHrs).toBe(24);
    expect(extraction.arrivalTime).toBe('08:04 CT');
    expect(extraction.departureTime).toBe('14:37 CT');
    expect(extraction.noticeSentTime).toBe('10:12 CT');
    expect(extraction.totalDwellMins).toBe(393);
  });

  it('scrubs private carrier identity (Zero-PII DEC-10) before indexing', () => {
    const rawWithPii =
      'RATE CON #RC-99110 | Broker MC #551200 | Load #8821 | Carrier: Prairie State Express MC#991024 | Driver: John Miller (Signature: J. Miller) | Linehaul: $2,450.00 | Detention: $65/hr after 2 hrs.';

    const extraction = extractDeterministicBolFallback(rawWithPii);

    expect(extraction.redactedPiiFields).toBeDefined();
    expect(extraction.redactedPiiFields.length).toBeGreaterThan(0);
    // Ensure carrier name and linehaul rate are marked for redaction
    const combinedRedactions = extraction.redactedPiiFields.join(' ');
    expect(combinedRedactions).toContain('Carrier');
    expect(combinedRedactions).toContain('Driver');
    expect(combinedRedactions).toContain('Linehaul');
  });

  it('handles empty or malformed input with safe default fallback values without throwing', () => {
    expect(() => {
      const fallback = extractDeterministicBolFallback('');
      expect(fallback.loadNumber).toBeTruthy();
      expect(fallback.detentionRateDollars).toBeGreaterThan(0);
      expect(fallback.freeTimeMins).toBeGreaterThan(0);
    }).not.toThrow();
  });
});
