import { Tag } from "cordon-ui";
import { ENFORCED_BY, MANDATE, formatUsdc } from "@cordon/fixtures";
import { Reveal } from "../parts/Reveal";

const CHECKS = [
  { name: "Tranche cap", detail: `No single draw exceeds ${formatUsdc(MANDATE.tranche6, 0)} USDC.`, fn: ENFORCED_BY.tranche },
  { name: "Trailing window", detail: `${MANDATE.windowSeconds / 3600} hours, equal at every depth by construction.`, fn: ENFORCED_BY.budget },
  { name: "Concentration", detail: `No counterparty takes more than ${MANDATE.concentrationBoundPct}% of the window.`, fn: ENFORCED_BY.concentration },
  { name: "Ancestor debit", detail: "Every parent up to the root is debited on every draw.", fn: ENFORCED_BY.treeBar },
];

/**
 * The four checks. The drawing that used to open this section is the same
 * drawing the hero and the counterfactual already run three times over — a
 * fourth copy said nothing the reader had not just watched.
 */
export function Mechanism() {
  return (
    <section id="mechanism" className="section">
      <div className="wrap">
        <Reveal>
          <p className="eyebrow">Mechanism</p>
          <h2 className="display display--page" style={{ maxWidth: "18ch" }}>
            The draw walks up. <span className="display__dim">The root refuses.</span>
          </h2>
          <p className="lede">
            Four checks run in the contract on every tranche. Three of them exist elsewhere.
            The fourth is the reason this is not a smaller wallet.
          </p>
        </Reveal>

        <Reveal delay={0.08}>
          <ul className="points points--2" style={{ marginTop: "var(--cordon-space-8)" }}>
            {CHECKS.map((check, index) => (
              <li key={check.name} className="points__item">
                <span className="mono" style={{ color: "var(--cordon-accent)" }}>0{index + 1}</span>
                <span className="points__title">
                  {check.name}
                  {index === 3 ? <Tag tone="rose" size="sm" style={{ marginLeft: 8 }}>the difference</Tag> : null}
                </span>
                <p className="points__body">{check.detail}</p>
                <span className="enforced">{check.fn}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>

      <div className="wrap wrap--narrow">
        <Reveal>
          <hr className="rule" style={{ marginTop: "clamp(48px, 8vh, 96px)" }} />
          <div style={{ paddingBlock: "clamp(40px, 7vh, 80px)" }}>
            <p className="eyebrow">The 2am objection</p>
            <p className="claim" style={{ fontSize: "clamp(21px, 2.8vw, 32px)" }}>
              There is an exit. It is <em>human</em>, and it is logged.
            </p>
            <p className="lede">
              A CFO wants an override, and “we can never undo this” reads as a defect. Release
              is available — a named human signs it. What cannot be reversed is the bound, not
              the decision.
            </p>
            <span className="enforced">{ENFORCED_BY.release}</span>
          </div>
          <hr className="rule" />
        </Reveal>
      </div>

      <div className="wrap">
        <Reveal>
          <ul className="points points--2" style={{ marginTop: "clamp(44px, 7vh, 88px)" }}>
            <li className="points__item">
              <span className="points__title">No agent holds a key</span>
              <p className="points__body">
                The daemon holds it and the agent holds none. Integration is an environment
                variable, not a library — it works inside runtimes whose source you cannot touch.
              </p>
            </li>
            <li className="points__item">
              <span className="points__title">A parent may spawn without asking</span>
              <p className="points__body">
                Spawns happen in seconds while the owner sleeps. The contract refuses a child
                wider than its parent, so no per-spawn approval is needed and none would be safe.
              </p>
              <span className="enforced">{ENFORCED_BY.revoke}</span>
            </li>
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
