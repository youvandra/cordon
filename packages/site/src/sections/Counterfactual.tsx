import { Surface } from "cordon-ui";
import { DelegationTree } from "../parts/DelegationTree";
import { Reveal } from "../parts/Reveal";

/**
 * A refusal is only legible beside its absence.
 *
 * This section also carries the mechanism now. There used to be a separate one
 * listing the four checks in prose, directly under two drawings that had just
 * shown them happening. The drawings do the work; the four names sit beside
 * them as a short list rather than as a screen of their own.
 */
const CHECKS = [
  "No single draw goes past the tranche cap.",
  "A trailing window, the same length at every depth.",
  "No one seller takes more than its share of a window.",
  "Every parent up to the root is debited on every draw.",
];

export function Counterfactual() {
  return (
    <section id="how" className="section">
      <div className="wrap">
        <Reveal>
          <p className="eyebrow">The same tree, twice</p>
          <h2 className="display display--page" style={{ maxWidth: "16ch" }}>
            A refusal is <span className="display__dim">invisible.</span>
          </h2>
          <p className="lede">
            So run both. Two identical trees on the same task, one cordoned and
            one not.
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="counter" style={{ marginTop: "var(--cordon-space-8)" }}>
            <Surface glaze="bisque" radius="6" rim elevation="tile" className="counter__panel">
              <div className="counter__head">
                <span className="counter__name">Uncordoned</span>
                <span className="counter__note">nothing adds up the tree</span>
              </div>
              <DelegationTree cordoned={false} height={240} interval={0.7} />
            </Surface>

            <Surface glaze="bisque" radius="6" rim elevation="tile" className="counter__panel">
              <div className="counter__head">
                <span className="counter__name">Cordoned</span>
                <span className="counter__note counter__note--live">the root refuses</span>
              </div>
              <DelegationTree cordoned height={240} interval={0.7} />
            </Surface>
          </div>
        </Reveal>

        <Reveal delay={0.06}>
          <ul className="checks">
            {CHECKS.map((check, index) => (
              <li key={check} className="checks__item">
                <span className="checks__index">0{index + 1}</span>
                <span>{check}</span>
              </li>
            ))}
          </ul>
          <p className="checks__foot">
            The first three exist elsewhere. The fourth is why this is not
            simply a smaller wallet.
          </p>
        </Reveal>
      </div>

      <div className="wrap wrap--narrow">
        <Reveal>
          <hr className="rule" style={{ marginTop: "clamp(48px, 8vh, 96px)" }} />
          <div style={{ paddingBlock: "clamp(40px, 7vh, 80px)" }}>
            <p className="eyebrow">The 2am question</p>
            <p className="claim" style={{ fontSize: "clamp(21px, 2.8vw, 32px)" }}>
              There is a way out. It is <em>human</em>, and it is logged.
            </p>
            <p className="lede">
              A CFO wants an override, and “we can never undo this” reads as a
              defect. Release is there: a named person signs it from their own
              key. What cannot be reversed is the bound, not the decision.
            </p>
          </div>
          <hr className="rule" />
        </Reveal>
      </div>
    </section>
  );
}
