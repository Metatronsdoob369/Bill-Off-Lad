import React, { useEffect, useRef, useState } from 'react';

/**
 * Lander showpieces (design pass, Oct 2026)
 *  B · ClockHero    — live replay of Load #4417's dock sit (hero)
 *  C · BrokerBoard  — split-flap broker "departures board"
 *  A · StampedBol   — signed BOL that gets stamped DUE, then PAID
 * The pop color (--pop) is reserved for one meaning only: money paid.
 */

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Fires once when the element scrolls into view. */
function useInView<T extends Element>(threshold = 0.35) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView, threshold]);
  return { ref, inView };
}

/* ------------------------------------------------------------------ */
/* B · CLOCK HERO                                                      */
/* ------------------------------------------------------------------ */

const ARRIVE = 8 * 60 + 2; // 08:02
const FREE_ENDS = 10 * 60 + 2; // 10:02 (2 hrs free)
const NOTICE = 10 * 60 + 12; // 10:12
const DEPART = 14 * 60 + 37; // 14:37
const RATE = 60; // $/hr
const FREE_PCT = ((FREE_ENDS - ARRIVE) / (DEPART - ARRIVE)) * 100;

const fmtClock = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function ClockHero({
  captureSlot,
  credibility,
}: {
  captureSlot: React.ReactNode;
  credibility: React.ReactNode;
}) {
  const [minute, setMinute] = useState(ARRIVE);
  const [paid, setPaid] = useState(false);
  const [runId, setRunId] = useState(0);
  const [paused, setPaused] = useState(false);
  const minuteRef = useRef(ARRIVE);
  const startedRun = useRef(-1);

  // The clock runs for everyone (it is counting numbers, not sweeping motion),
  // with a Pause button so the loop can always be stopped (WCAG 2.2.2).
  useEffect(() => {
    if (paused) return;
    if (startedRun.current !== runId) {
      startedRun.current = runId;
      minuteRef.current = ARRIVE;
      setMinute(ARRIVE);
      setPaid(false);
    }
    let iv: ReturnType<typeof setInterval> | undefined;
    let payTimer: ReturnType<typeof setTimeout> | undefined;
    let loopTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      payTimer = setTimeout(() => setPaid(true), 1100);
      loopTimer = setTimeout(() => setRunId((n) => n + 1), 1100 + 5000);
    };
    if (minuteRef.current >= DEPART) {
      finish();
    } else {
      // Free time burns off fast (~1.5s); billable time ticks ~$1 per frame
      // (~11s) so visitors can watch the money climb. Then hold on PAID, loop.
      iv = setInterval(() => {
        const m = minuteRef.current;
        const next = Math.min(DEPART, m + (m < FREE_ENDS ? 4 : 1));
        minuteRef.current = next;
        setMinute(next);
        if (next >= DEPART) {
          if (iv) clearInterval(iv);
          finish();
        }
      }, 40);
    }
    return () => {
      if (iv) clearInterval(iv);
      if (payTimer) clearTimeout(payTimer);
      if (loopTimer) clearTimeout(loopTimer);
    };
  }, [runId, paused]);

  const pct = ((minute - ARRIVE) / (DEPART - ARRIVE)) * 100;
  const billableMins = Math.max(0, minute - FREE_ENDS);
  const owed = paid ? 275 : (billableMins / 60) * RATE;
  const done = minute >= DEPART;

  const events = [
    { t: '08:02', label: 'ELD geofence: at dock', on: true, pay: false },
    { t: '10:02', label: 'Free time over, meter starts', on: minute >= FREE_ENDS, pay: false },
    { t: '10:12', label: 'Notice sent, inside 24h window', on: minute >= NOTICE, pay: false },
    { t: 'Day 9', label: 'Claim paid in full', on: paid, pay: true },
  ];

  return (
    <section className="section-band-bg sp-hero">
      <div className="container">
        <div className="sp-hero-top">
          <span className="sp-eyebrow">Live replay · Load #4417</span>
          <h1 className="sp-hero-h1">Every minute past free time is money.</h1>
          <p className="hero-subheadline sp-center">
            Built for 1–100 truck fleets. BillOff-Lading turns signed BOLs into
            paid detention claims, and shows you which brokers pay before you
            haul.
          </p>
        </div>

        <div
          className="sp-meter"
          role="img"
          aria-label="Replay of Load 4417: arrived 08:02, free time ended 10:02, departed 14:37. 4 hours 35 minutes billable at $60 per hour, $275 claim paid on day 9."
          onClick={() => {
            setPaused(false);
            setRunId((n) => n + 1);
          }}
          title="Click to replay"
        >
          <div className="sp-meter-head">
            <div>
              <div className="sp-meter-load">
                RECEIVER <b>Joliet, IL</b> · BROKER <b>MC #481920</b> ·{' '}
                <b>$60/hr</b> after 2h
              </div>
              <div className="sp-clock">{fmtClock(minute)}</div>
            </div>
            <div className={`sp-owed ${paid ? 'sp-owed-paid' : ''}`}>
              <div className="sp-owed-label">
                {paid ? 'PAID · DAY 9' : 'DETENTION ACCRUING'}
              </div>
              <div className="sp-owed-amount">${owed.toFixed(2)}</div>
            </div>
          </div>

          <div className="sp-track" aria-hidden="true">
            <div className="sp-track-free" style={{ width: `${FREE_PCT}%` }} />
            <div className="sp-track-fill" style={{ width: `${Math.min(pct, FREE_PCT)}%` }} />
            <div
              className="sp-track-bill"
              style={{ left: `${FREE_PCT}%`, width: `${Math.max(0, pct - FREE_PCT)}%` }}
            />
            <div className="sp-track-truck" style={{ left: `${Math.max(12, Math.min(pct, 84))}%` }}>
              {done ? 'SIGNED OUT' : 'AT DOOR 14'}
            </div>
          </div>
          <div className="sp-ticks" aria-hidden="true">
            <span>08:02 arrive</span>
            <span>10:02 free time ends</span>
            <span>14:37 out</span>
          </div>

          <div className="sp-events">
            {events.map((e) => (
              <div
                key={e.t}
                className={`sp-event ${e.on ? 'sp-event-on' : ''} ${e.pay ? 'sp-event-pay' : ''}`}
              >
                <b>{e.t}</b>
                {e.label}
              </div>
            ))}
          </div>
          <div className="sp-meter-controls">
            <button
              type="button"
              className="sp-pause"
              aria-pressed={paused}
              onClick={(e) => {
                e.stopPropagation();
                setPaused((p) => !p);
              }}
            >
              {paused ? '▶ Play' : '❚❚ Pause'}
            </button>
          </div>
        </div>

        <div className="sp-hero-capture">
          {captureSlot}
          <p className="hero-credibility">{credibility}</p>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* C · BROKER BOARD                                                    */
/* ------------------------------------------------------------------ */

const BOARD_ROWS = [
  { lane: 'JOLIET IL > ATLANTA GA', mc: 'MC 481920', call: 'go' },
  { lane: 'CHICAGO IL > DALLAS TX', mc: 'MC 774102', call: 'trap' },
  { lane: 'BHAM AL > MEMPHIS TN', mc: 'MC 309441', call: 'go' },
  { lane: 'HBURG PA > COLUMBUS OH', mc: 'MC 552018', call: 'trap' },
] as const;

/** Sample readings each row cycles through, so the board looks like live data
 *  arriving. Each row keeps its GO / TRAP call; only the numbers drift. */
const BOARD_READINGS: { dwell: string; paid: string; score: number }[][] = [
  [
    { dwell: '1H 18M', paid: '91%', score: 94 },
    { dwell: '1H 22M', paid: '90%', score: 93 },
    { dwell: '1H 11M', paid: '92%', score: 95 },
  ],
  [
    { dwell: '5H 42M', paid: '18%', score: 29 },
    { dwell: '5H 51M', paid: '17%', score: 27 },
    { dwell: '5H 36M', paid: '19%', score: 31 },
  ],
  [
    { dwell: '1H 04M', paid: '89%', score: 91 },
    { dwell: '1H 09M', paid: '88%', score: 90 },
    { dwell: '0H 58M', paid: '90%', score: 92 },
  ],
  [
    { dwell: '3H 50M', paid: '41%', score: 47 },
    { dwell: '3H 44M', paid: '43%', score: 49 },
    { dwell: '3H 58M', paid: '39%', score: 45 },
  ],
];
const BOARD_REFRESH_MS = 4000;

const FLAP_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function FlapText({ text, start, delay }: { text: string; start: boolean; delay: number }) {
  const [shown, setShown] = useState(() =>
    prefersReducedMotion() ? text : text.replace(/\S/g, '\u00A0')
  );
  useEffect(() => {
    if (!start || prefersReducedMotion()) {
      if (prefersReducedMotion()) setShown(text);
      return;
    }
    const chars = [...text];
    const remaining = chars.map((c) => (c === ' ' ? 0 : 6 + Math.floor(Math.random() * 8)));
    let iv: ReturnType<typeof setInterval> | undefined;
    const kickoff = setTimeout(() => {
      iv = setInterval(() => {
        let busy = false;
        const next = chars.map((c, i) => {
          if (remaining[i] <= 0) return c;
          remaining[i] -= 1;
          busy = true;
          return remaining[i] <= 0 ? c : FLAP_CHARS[Math.floor(Math.random() * FLAP_CHARS.length)];
        });
        setShown(next.join(''));
        if (!busy && iv) clearInterval(iv);
      }, 70);
    }, delay);
    return () => {
      clearTimeout(kickoff);
      if (iv) clearInterval(iv);
    };
  }, [start, text, delay]);

  return (
    <span className="sp-flap" aria-label={text}>
      {shown.split(' ').map((word, wi) => (
        <span className="sp-flap-word" key={wi} aria-hidden="true">
          {[...word].map((c, i) => (
            <i key={i}>{c}</i>
          ))}
        </span>
      ))}
    </span>
  );
}

export function BrokerBoard({ onOpenRadar }: { onOpenRadar: () => void }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  const [readingIdx, setReadingIdx] = useState<number[]>(() => BOARD_ROWS.map(() => 0));
  const [flashRow, setFlashRow] = useState<number | null>(null);

  // Live feel: after the first flip-in, refresh one row every few seconds.
  useEffect(() => {
    if (!inView || prefersReducedMotion()) return;
    let row = 0;
    let clearFlash: ReturnType<typeof setTimeout> | undefined;
    const iv = setInterval(() => {
      const r = row;
      row = (row + 1) % BOARD_ROWS.length;
      setReadingIdx((prev) =>
        prev.map((v, i) => (i === r ? (v + 1) % BOARD_READINGS[i].length : v))
      );
      setFlashRow(r);
      if (clearFlash) clearTimeout(clearFlash);
      clearFlash = setTimeout(() => setFlashRow(null), 1400);
    }, BOARD_REFRESH_MS);
    return () => {
      clearInterval(iv);
      if (clearFlash) clearTimeout(clearFlash);
    };
  }, [inView]);

  return (
    <section className="section-band-bg sp-board-section">
      <div className="container">
        <div className="sp-board-band" ref={ref}>
          <div className="sp-board-head">
            <span className="sp-eyebrow">Broker &amp; Lane Fit Index · verified by real BOLs</span>
            <h2 className="sp-board-h2">Know which brokers pay before you haul.</h2>
            <p className="sp-board-sub">
              Dwell times, notice traps and payout rates from anonymized BOLs,
              not broker promises.
            </p>
          </div>

          <div className="sp-board" role="table" aria-label="Broker fit board">
            <div className="sp-board-row sp-board-row-head" role="row">
              <span role="columnheader">LANE</span>
              <span role="columnheader">BROKER</span>
              <span role="columnheader">AVG DWELL</span>
              <span role="columnheader">PAID %</span>
              <span role="columnheader">CALL</span>
            </div>
            {BOARD_ROWS.map((base, ri) => {
              const r = { ...base, ...BOARD_READINGS[ri][readingIdx[ri]] };
              return (
              <div
                className={`sp-board-row ${flashRow === ri ? 'sp-board-row-flash' : ''}`}
                role="row"
                key={r.mc}
              >
                <span role="cell"><FlapText text={r.lane} start={inView} delay={ri * 260} /></span>
                <span role="cell"><FlapText text={r.mc} start={inView} delay={ri * 260} /></span>
                <span role="cell"><FlapText text={r.dwell} start={inView} delay={ri * 260} /></span>
                <span role="cell" className="sp-board-paid">
                  <FlapText text={r.paid} start={inView} delay={ri * 260} />
                </span>
                <span role="cell">
                  <span
                    className={`sp-call sp-call-${r.call} ${inView ? 'sp-call-in' : ''}`}
                    style={{ transitionDelay: `${1100 + ri * 260}ms` }}
                  >
                    {r.call === 'go' ? 'GO' : 'TRAP'} · {r.score}
                  </span>
                </span>
              </div>
              );
            })}
          </div>

          <div className="sp-board-foot">
            <button type="button" className="btn-primary" onClick={onOpenRadar}>
              Search your lanes in the Radar →
            </button>
            <span className="sp-board-note">Sample rows. The board fills in as fleets verify BOLs.</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* A · STAMPED BOL                                                     */
/* ------------------------------------------------------------------ */

export function StampedBol() {
  const { ref, inView } = useInView<HTMLDivElement>(0.45);
  return (
    <section className="section-band-surface">
      <div className="container sp-bol-grid">
        <div className="sp-bol-copy">
          <span className="sp-eyebrow">The claim, start to finish</span>
          <h2 className="sp-bol-h2">
            Your BOL already says you&apos;re <em>owed.</em>
          </h2>
          <p className="hero-subheadline">
            BillOff-Lading reads the signed BOL, the rate con and the ELD log,
            files the claim inside the notice window, and chases it on day 7, 14
            and 30 until the check clears.
          </p>
          <div className="sp-proof">
            <div><b>94.5%</b>of eligible loads get billed</div>
            <div><b>&lt;50%</b>of those invoices get paid</div>
            <div><b>$3.6B</b>left at the dock yearly</div>
          </div>
        </div>

        <div className={`sp-bol ${inView ? 'sp-bol-in' : ''}`} ref={ref}>
          <h3 className="sp-bol-title">
            STRAIGHT BILL OF LADING <span>LOAD #4417</span>
          </h3>
          <div className="sp-bol-row"><span>Receiver</span><span>Joliet, IL · Door 14</span></div>
          <div className="sp-bol-row"><span>Rate con</span><span>RC-88214 · $60/hr after 2h</span></div>
          <div className="sp-bol-row"><span>Arrived</span><span>08:02 CT (ELD)</span></div>
          <div className="sp-bol-row"><span>Notice sent</span><span>10:12 CT · in window</span></div>
          <div className="sp-bol-row"><span>Signed out</span><span>14:37 CT (ELD)</span></div>
          <div className="sp-bol-row"><span>Dwell</span><span><mark>6h 35m · 4h 35m billable</mark></span></div>
          <div className="sp-bol-row"><span>Receiver sig</span><span className="sp-bol-sig">M. Okafor</span></div>
          <div className="sp-stamp sp-stamp-due" aria-label="Stamped: detention due, $275.00, filed same day">
            Detention due<small>$275.00 · filed same day</small>
          </div>
          <div className="sp-stamp sp-stamp-paid" aria-label="Stamped: paid, day 9, no dispute">
            Paid<small>day 9 · no dispute</small>
          </div>
        </div>
      </div>
    </section>
  );
}
