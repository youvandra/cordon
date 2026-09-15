import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion, useInView } from "framer-motion";
import { Surface } from "cordon-ui";
import { DRILL_RUN, REASON_MEANING, SETTLEMENT, formatUsdc, shortAddress } from "@cordon/fixtures";
import { shortTx, txUrl } from "@cordon/fixtures/preview";
import { useEntrance } from "./motion";

/* ==========================================================================
   One purchase, walked from the agent to the seller.

   The counterfactual shows the budget. This shows where the budget sits: an
   agent asks for a URL, a seller names a price, and between the two is a
   contract that is asked before any money exists. Two runs, both real and
   both on Arc: the purchase that settled end to end, and a refusal from the
   hostile drill. They are different purchases, and the note under the figure
   says so rather than stitching them into one story.

   Every step is readable without the animation. The pulse and the lit segment
   are decoration over a list that is already complete, the active step is
   plain state, and a document that cannot animate opens on the last step.
   ========================================================================== */

type Station = 0 | 1 | 2 | 3;

interface Step {
  from: Station;
  to: Station;
  title: string;
  body: ReactNode;
  code?: string;
  tx?: { label: string; hash: string };
  record?: string;
  verdict?: "released" | "refused";
}

type ScenarioId = "paid" | "refused";

const STATIONS: { name: string; sub: string; glyph: ReactNode }[] = [
  { name: "Agent", sub: "holds no key", glyph: <AgentGlyph /> },
  { name: "Cordon", sub: "holds the key", glyph: <FenceGlyph /> },
  { name: "Arc", sub: "TreeVault", glyph: <VaultGlyph /> },
  { name: "Seller", sub: "x402 API", glyph: <SellerGlyph /> },
];

const PRICE = formatUsdc(SETTLEMENT.price6);
const SELLER = shortAddress(SETTLEMENT.seller, 6, 4);
const REFUSAL = DRILL_RUN.refusals[0];
const REASON = REFUSAL.reason;

const ASK: Step = {
  from: 0,
  to: 1,
  title: "The agent asks for a URL.",
  body: (
    <>
      Its only tool takes a URL. There is no field for who gets paid, and no
      key behind it to pay with.
    </>
  ),
  code: "cordon_fetch(url)",
};

const SCENARIOS: Record<ScenarioId, { label: string; steps: Step[] }> = {
  paid: {
    label: "Paid",
    steps: [
      ASK,
      {
        from: 1,
        to: 3,
        title: "The seller names its price.",
        body: <>The API answers 402 with an amount and an address. Neither comes from the agent.</>,
        code: `402 · ${PRICE} to ${SELLER}`,
      },
      {
        from: 1,
        to: 2,
        title: "Cordon asks the contract first.",
        body: <>Before any money exists, the vault is asked for exactly that amount, for exactly that seller.</>,
        code: `draw(node, ${SELLER}, ${PRICE})`,
      },
      {
        from: 2,
        to: 2,
        title: "Every bound, up to the root.",
        body: (
          <>
            Tranche cap, window, lifetime and the seller's share, checked on
            this agent and charged to every parent above it. All pass.
          </>
        ),
        tx: { label: "draw", hash: SETTLEMENT.drawTx },
        verdict: "released",
      },
      {
        from: 2,
        to: 1,
        title: "One tranche leaves the vault.",
        body: <>Circle's Gateway lands it in this agent's own balance. One purchase worth, never more.</>,
        tx: { label: "gateway release", hash: SETTLEMENT.mintTx },
      },
      {
        from: 1,
        to: 3,
        title: "The seller collects the price.",
        body: <>The key signs an EIP-3009 authorisation for exactly {PRICE}, and the seller submits it.</>,
        tx: { label: "collection", hash: SETTLEMENT.collectTx },
      },
      {
        from: 3,
        to: 0,
        title: "The agent gets what it asked for.",
        body: <>The response comes back through Cordon, and the agent never touched the money.</>,
        code: "200 OK",
      },
    ],
  },
  refused: {
    label: "Refused",
    steps: [
      ASK,
      {
        from: 1,
        to: 3,
        title: "The seller names its price.",
        body: <>The API answers 402 with an amount and an address. Neither comes from the agent.</>,
        code: "402 · amount, payTo",
      },
      {
        from: 1,
        to: 2,
        title: "Cordon asks the contract first.",
        body: <>Before any money exists, the vault is asked for exactly that amount, for exactly that seller.</>,
        code: "draw(node, payTo, amount)",
      },
      {
        from: 2,
        to: 2,
        title: "A bound says no.",
        body: (
          <>
            Refused for <b>{REASON}</b>: {REASON_MEANING[REASON] ?? REASON}. The
            draw returns instead of reverting, so the refusal stays on chain.
          </>
        ),
        tx: { label: "refusal", hash: REFUSAL.tx },
        verdict: "refused",
      },
      {
        from: 2,
        to: 2,
        title: "The refusal is published.",
        body: (
          <>
            Written into the ERC-8004 reputation registry by the contract that
            refused, naming its transaction. Anyone can read it.
          </>
        ),
        record: REFUSAL.id,
      },
      {
        from: 2,
        to: 0,
        title: "The agent is told no, and why.",
        body: <>No money moved and the seller was never paid. What comes back is the reason.</>,
        code: `refused · ${REASON} · #${REFUSAL.id}`,
      },
    ],
  },
};

interface Mark {
  sub?: string;
  mark?: "ok" | "no";
  muted?: boolean;
}

/* What each station has come to, once the run has reached it. The first three
   steps of both runs are the same request, so the difference has to stay on
   the stations after the fork, or the two runs only differ for one step. */
function marksAt(scenario: ScenarioId, index: number): Mark[] {
  const marks: Mark[] = STATIONS.map(() => ({}));
  if (scenario === "paid") {
    if (index >= 3) marks[2] = { sub: "released", mark: "ok" };
    if (index >= 5) marks[3] = { sub: `paid ${PRICE}`, mark: "ok" };
    if (index >= 6) marks[0] = { sub: "got its data", mark: "ok" };
  } else {
    if (index >= 3) marks[2] = { sub: "refused", mark: "no" };
    if (index >= 3) marks[3] = { sub: "never paid", muted: true };
    if (index >= 5) marks[0] = { sub: "got the reason", mark: "no" };
  }
  return marks;
}

const ORDER: ScenarioId[] = ["paid", "refused"];
const STEP_MS = 2300;
const HOLD_MS = 3600;
const EASE = [0.16, 1, 0.3, 1] as const;

const at = (station: Station) => ((station + 0.5) / STATIONS.length) * 100;

export function PurchasePath() {
  const animate = useEntrance();
  const [scenario, setScenario] = useState<ScenarioId>("paid");
  const steps = SCENARIOS[scenario].steps;
  const [index, setIndex] = useState(() => (animate ? 0 : steps.length - 1));
  const [playing, setPlaying] = useState(animate);

  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-120px" });

  /* Autoplay walks one run, holds its ending, then plays the other. It only
     advances while the figure is on screen, so a reader arriving mid-page
     does not land on the fifth step of a story they never saw begin. */
  useEffect(() => {
    if (!playing || !inView) return;
    const last = index === steps.length - 1;
    const timer = window.setTimeout(() => {
      if (!last) return setIndex(index + 1);
      setScenario(ORDER[(ORDER.indexOf(scenario) + 1) % ORDER.length]);
      setIndex(0);
    }, last ? HOLD_MS : STEP_MS);
    return () => window.clearTimeout(timer);
  }, [playing, inView, index, steps.length, scenario]);

  const step = steps[Math.min(index, steps.length - 1)];
  const refusedAt = steps.findIndex((s) => s.verdict === "refused");
  const refused = refusedAt >= 0 && index >= refusedAt;
  const marks = marksAt(scenario, index);

  const choose = (id: ScenarioId) => {
    setScenario(id);
    setIndex(0);
    setPlaying(animate);
  };

  const left = Math.min(at(step.from), at(step.to));
  const width = Math.abs(at(step.to) - at(step.from));
  const key = `${scenario}-${index}`;

  return (
    <div ref={ref} className="buy" data-scenario={scenario}>
      <Surface glaze="bisque" radius="6" rim elevation="tile" className="buy__panel">
        <div className="buy__head">
          <div className="buy__switch" role="tablist" aria-label="Which purchase">
            {ORDER.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={scenario === id}
                className="buy__tab"
                data-tone={id}
                onClick={() => choose(id)}
              >
                {SCENARIOS[id].label}
              </button>
            ))}
          </div>
          {animate ? (
            <button type="button" className="buy__play" onClick={() => setPlaying((p) => !p)}>
              {playing ? "Pause" : "Play"}
            </button>
          ) : null}
        </div>

        <div className="buy__lane">
          <div className="buy__rail" style={refused ? { right: `${100 - at(2)}%` } : undefined} />
          {refused ? <div className="buy__cut" style={{ left: `${at(2)}%`, width: `${at(3) - at(2)}%` }} /> : null}
          {width > 0 ? (
            animate ? (
              <motion.div
                key={`span-${key}`}
                className="buy__span"
                data-refused={refused || undefined}
                style={{ left: `${left}%`, width: `${width}%`, transformOrigin: step.from < step.to ? "left" : "right" }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.9, ease: EASE }}
              />
            ) : (
              <div className="buy__span" data-refused={refused || undefined} style={{ left: `${left}%`, width: `${width}%` }} />
            )
          ) : null}
          {animate ? (
            <motion.span
              key={`pulse-${key}`}
              className="buy__pulse"
              data-refused={refused || undefined}
              initial={{ left: `${at(step.from)}%` }}
              animate={{ left: `${at(step.to)}%` }}
              transition={{ duration: 0.9, ease: EASE }}
            />
          ) : (
            <span className="buy__pulse" data-refused={refused || undefined} style={{ left: `${at(step.to)}%` }} />
          )}

          <ol className="buy__stations">
            {STATIONS.map((station, i) => {
              const lit = i === step.from || i === step.to;
              const mark = marks[i];
              return (
                <li
                  key={station.name}
                  className="buy__station"
                  data-lit={lit || undefined}
                  data-mark={mark.mark}
                  data-muted={mark.muted || undefined}
                >
                  <span className="buy__glyph">
                    {station.glyph}
                    {mark.mark ? (
                      <span className="buy__mark" aria-hidden="true">
                        <svg viewBox="0 0 12 12">
                          {mark.mark === "ok" ? <path d="M3 6.2L5.1 8.2L9 4" /> : <path d="M3.8 3.8L8.2 8.2M8.2 3.8L3.8 8.2" />}
                        </svg>
                      </span>
                    ) : null}
                  </span>
                  <span className="buy__name">{station.name}</span>
                  <span className="buy__sub">{mark.sub ?? station.sub}</span>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="buy__readout" aria-live="polite">
          <div className="buy__readout-top">
            <span className="buy__count">
              {String(index + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}
            </span>
            {step.verdict ? (
              <span className="buy__verdict" data-tone={step.verdict}>
                {step.verdict}
              </span>
            ) : null}
          </div>
          <p className="buy__title">{step.title}</p>
          <p className="buy__body">{step.body}</p>
          <div className="buy__proof">
            {step.code ? <code className="buy__code mono">{step.code}</code> : null}
            {step.tx ? (
              <a className="buy__tx mono" href={txUrl(step.tx.hash)} target="_blank" rel="noreferrer">
                {step.tx.label} {shortTx(step.tx.hash)}
              </a>
            ) : null}
            {step.record ? (
              <Link className="buy__tx mono" to={`/refusal/${step.record}`}>
                refusal #{step.record}
              </Link>
            ) : null}
          </div>
        </div>
      </Surface>

      <ol className="buy__steps">
        {steps.map((s, i) => (
          <li key={`${scenario}-${s.title}-${i}`}>
            <button
              type="button"
              className="buy__step"
              data-state={i === index ? "active" : i < index ? "done" : "next"}
              data-tone={s.verdict}
              onClick={() => {
                setIndex(i);
                setPlaying(false);
              }}
            >
              <span className="buy__step-index">{String(i + 1).padStart(2, "0")}</span>
              <span>{s.title}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* Glyphs, drawn for this figure. A row of library icons reads as a kit. */

function AgentGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="7" width="14" height="11" rx="3.5" />
      <path d="M12 7V4.2" />
      <circle cx="12" cy="3.6" r="0.9" />
      <circle cx="9.5" cy="12.4" r="1" className="fill" />
      <circle cx="14.5" cy="12.4" r="1" className="fill" />
    </svg>
  );
}

function FenceGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 20V6.5L7.5 4.5L9 6.5V20" />
      <path d="M15 20V6.5L16.5 4.5L18 6.5V20" />
      <path d="M3.5 10H20.5M3.5 15.5H20.5" />
    </svg>
  );
}

function VaultGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="4.5" width="16" height="15" rx="2.5" />
      <circle cx="12" cy="12" r="3.6" />
      <path d="M12 8.4V10M12 14v1.6M8.4 12H10M14 12h1.6" />
      <path d="M7 19.5V21M17 19.5V21" />
    </svg>
  );
}

function SellerGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 9.5L5.6 4.5H18.4L20 9.5" />
      <path d="M4 9.5c0 1.4 1.2 2.4 2.7 2.4S9.3 10.9 9.3 9.5c0 1.4 1.2 2.4 2.7 2.4s2.7-1 2.7-2.4c0 1.4 1.2 2.4 2.6 2.4S20 10.9 20 9.5" />
      <path d="M5.5 12v7.5h13V12" />
      <path d="M10 19.5v-4.2h4v4.2" />
    </svg>
  );
}
