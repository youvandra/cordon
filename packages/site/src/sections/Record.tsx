import { DotText, Surface } from "cordon-ui";
import { REGISTRY_BASELINE } from "@cordon/fixtures";
import { Reveal } from "../parts/Reveal";

/**
 * The moat: a measurement written where opinions are currently typed.
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
            There is already a shared registry for agent reputation, and anyone
            can read it. The trouble is that anyone can also write to it. On
            Base, {REGISTRY_BASELINE.sybilFlaggedBase}% of the reviewers are
            flagged as fake.
          </p>
        </Reveal>

        <Reveal delay={0.08}>
          <Surface glaze="bisque" radius="6" rim elevation="tile" className="panel" style={{ marginTop: "var(--cordon-space-8)" }}>
            <p className="panel__label">Reviewers on Base who have ever paid for anything</p>
            <span className="stat__value" style={{ marginTop: 10 }}>
              <DotText radius={2.05} style={{ width: 150, color: "var(--cordon-ink-strong)" }}>
                {`${REGISTRY_BASELINE.reviewersWithPaymentHistoryBase}`}
              </DotText>
              <span className="stat__unit">%</span>
            </span>
            <p className="panel__note">
              That small group wrote {REGISTRY_BASELINE.feedbackWrittenByThoseReviewers}%
              of all the feedback there is. What sits in the registry is not a
              crowd's judgement. It is a handful of addresses.
            </p>
          </Surface>
        </Reveal>

        <Reveal delay={0.05}>
          <div className="counter" style={{ marginTop: "var(--cordon-gap)" }}>
            <Surface glaze="bisque" radius="6" rim elevation="tile" className="counter__panel">
              <p className="panel__label">Feedback with no payment behind it</p>
              <span className="stat__value" style={{ marginTop: 10 }}>
                <DotText radius={2.05} style={{ width: 150, color: "var(--cordon-ink-strong)" }}>
                  {`${REGISTRY_BASELINE.noLinkageLow}`}
                </DotText>
                <span className="stat__unit">–{REGISTRY_BASELINE.noLinkageHigh}%</span>
              </span>
              <p className="panel__note">
                Cordon writes the opposite kind of thing: every entry names the
                transaction it came from.
              </p>
            </Surface>

            <Surface glaze="bisque" radius="6" rim elevation="tile" className="counter__panel">
              <p className="panel__label">Cost to flip an agent's standing on Base</p>
              <span className="stat__value" style={{ marginTop: 10 }}>
                <span className="stat__unit" style={{ alignSelf: "flex-end", paddingBottom: 4 }}>$</span>
                <DotText radius={2.05} style={{ width: 190, color: "var(--cordon-ink-strong)" }}>
                  {`${REGISTRY_BASELINE.costToFlipStatusBase}`}
                </DotText>
              </span>
              <p className="panel__note">
                A third of a cent. Anything that cheap to fake is worth nothing
                to read.
              </p>
            </Surface>
          </div>
        </Reveal>
      </div>

      <div className="wrap">
        <Reveal>
          <ul className="points points--2" style={{ marginTop: "clamp(48px, 8vh, 96px)" }}>
            <li className="points__item">
              <span className="points__title">Nothing to deploy</span>
              <p className="points__body">
                The registry is already live on Arc. Cordon writes into what is
                there instead of standing up one nobody would read.
              </p>
            </li>
            <li className="points__item">
              <span className="points__title">Open to read, one seat to write</span>
              <p className="points__body">
                Only the thing that does the refusing can report a refusal. That
                asymmetry is the part a competitor cannot copy in a fortnight.
              </p>
            </li>
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
