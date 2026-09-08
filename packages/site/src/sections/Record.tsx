import { DotText, Enforced, Surface } from "cordon-ui";
import { ENFORCED_BY, ERC8004, REGISTRY_BASELINE } from "@cordon/fixtures";
import { Reveal } from "../parts/Reveal";

/**
 * The moat: a measurement written where opinions are currently typed.
 *
 * There were three exhibits here for one claim — a Sybil rate broken down by
 * chain, then the two counters below. Nobody reads a registry asking which
 * chain has more Sybils, so the breakdown carried no argument the counters
 * did not already carry better; the number itself moved into the paragraph
 * above. What replaces it is the sharper fact that was sitting unused in
 * fixtures: the record is written by almost nobody.
 */
export function Record() {
  return (
    <section id="record" className="section">
      <div className="wrap">
        <Reveal>
          <p className="eyebrow">The record</p>
          <h2 className="display display--page" style={{ maxWidth: "20ch" }}>
            Reputation is an opinion <span className="display__dim">somebody types.</span>
          </h2>
          <p className="lede">
            ERC-8004 is live and the read side is a public good. The data in it is worthless, for
            one structural reason: anyone can type. On Base, {REGISTRY_BASELINE.sybilFlaggedBase}%
            of reviewers are flagged as Sybil.
          </p>
        </Reveal>

        <Reveal delay={0.08}>
          <Surface glaze="bisque" radius="6" rim elevation="tile" className="panel" style={{ marginTop: "var(--cordon-space-8)" }}>
            <p className="panel__label">Reviewers on Base with any payment history at all</p>
            <span className="stat__value" style={{ marginTop: 10 }}>
              <DotText radius={2.05} style={{ width: 150, color: "var(--cordon-ink-strong)" }}>
                {`${REGISTRY_BASELINE.reviewersWithPaymentHistoryBase}`}
              </DotText>
              <span className="stat__unit">%</span>
            </span>
            <p className="panel__note">
              That group wrote {REGISTRY_BASELINE.feedbackWrittenByThoseReviewers}% of all
              feedback. {REGISTRY_BASELINE.source}, across 173,441 registered agents. What is
              there is not a crowd's judgement — it is a handful of addresses.
            </p>
          </Surface>
        </Reveal>

        <Reveal delay={0.05}>
          <div className="counter" style={{ marginTop: "var(--cordon-gap)" }}>
            <Surface glaze="bisque" radius="6" rim elevation="tile" className="counter__panel">
              <p className="panel__label">Feedback carrying no payment or task linkage</p>
              <span className="stat__value" style={{ marginTop: 10 }}>
                <DotText radius={2.05} style={{ width: 150, color: "var(--cordon-ink-strong)" }}>
                  {`${REGISTRY_BASELINE.noLinkageLow}`}
                </DotText>
                <span className="stat__unit">–{REGISTRY_BASELINE.noLinkageHigh}%</span>
              </span>
              <p className="panel__note">
                Precisely what a measurement carries by construction and an opinion never does.
              </p>
            </Surface>

            <Surface glaze="bisque" radius="6" rim elevation="tile" className="counter__panel">
              <p className="panel__label">Cost to flip an agent's status on Base</p>
              <span className="stat__value" style={{ marginTop: 10 }}>
                <span className="stat__unit" style={{ alignSelf: "flex-end", paddingBottom: 4 }}>$</span>
                <DotText radius={2.05} style={{ width: 190, color: "var(--cordon-ink-strong)" }}>
                  {`${REGISTRY_BASELINE.costToFlipStatusBase}`}
                </DotText>
              </span>
              <p className="panel__note">
                Zero-cost manipulation under mean aggregation. Negligible attack cost.
              </p>
            </Surface>
          </div>
        </Reveal>
      </div>

      <div className="wrap wrap--narrow">
        <Reveal>
          <hr className="rule" style={{ marginTop: "clamp(48px, 8vh, 96px)" }} />
          <div style={{ paddingBlock: "clamp(44px, 8vh, 92px)" }}>
            <p className="eyebrow">What Cordon writes instead</p>
            <p className="claim">
              This tree breached the mandate its owner signed <em>3 times in 41,200 draws</em>,
              and here are the transactions.
            </p>
            <p className="lede">
              Not a vote, so it cannot be Sybil'd. It carries payment linkage by construction —
              every draw is a payment authorisation. And it can only be generated from the
              enforcement seat: you must be the thing that refuses in order to hold a record of
              refusals.
            </p>
            <Enforced>{ENFORCED_BY.record}</Enforced>
          </div>
          <hr className="rule" />
        </Reveal>
      </div>

      <div className="wrap">
        <Reveal>
          <ul className="points points--2" style={{ marginTop: "clamp(44px, 7vh, 88px)" }}>
            <li className="points__item">
              <span className="points__title">Nothing to deploy</span>
              <p className="points__body">
                Identity and Reputation are already on Arc at deterministic addresses. Cordon
                writes into what is there rather than standing up a registry nobody reads.
              </p>
              <span className="mono" style={{ color: "var(--cordon-copy-dim)", wordBreak: "break-all" }}>
                {ERC8004.identity}
              </span>
            </li>
            <li className="points__item">
              <span className="points__title">Open to read, one seat to write</span>
              <p className="points__body">
                That asymmetry is the moat. The contract is a few hundred lines and a competent
                team copies it in a fortnight; the record only accrues to whoever holds the seat.
              </p>
            </li>
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
