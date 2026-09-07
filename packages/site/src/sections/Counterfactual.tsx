import { Surface } from "cordon-ui";
import { ENFORCED_BY } from "@cordon/fixtures";
import { DelegationTree } from "../parts/DelegationTree";
import { Reveal } from "../parts/Reveal";

/** A refusal is only legible beside its absence. */
export function Counterfactual() {
  return (
    <section className="section">
      <div className="wrap">
        <Reveal>
          <p className="eyebrow">The same tree, twice</p>
          <h2 className="display display--page" style={{ maxWidth: "16ch" }}>
            A refusal is <span className="display__dim">invisible.</span>
          </h2>
          <p className="lede">
            So run both. Identical trees, identical task — one cordoned, one not.
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="counter" style={{ marginTop: "var(--cordon-space-8)" }}>
            <Surface glaze="bisque" radius="6" rim elevation="tile" className="counter__panel">
              <div className="counter__head">
                <span className="counter__name">Uncordoned</span>
                <span className="mono" style={{ color: "var(--cordon-copy-dim)" }}>no ancestor debit</span>
              </div>
              <DelegationTree cordoned={false} height={240} interval={0.7} />
            </Surface>

            <Surface glaze="bisque" radius="6" rim elevation="tile" className="counter__panel">
              <div className="counter__head">
                <span className="counter__name">Cordoned</span>
                <span className="mono" style={{ color: "var(--cordon-accent)" }}>{ENFORCED_BY.refusal}</span>
              </div>
              <DelegationTree cordoned height={240} interval={0.7} />
            </Surface>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
