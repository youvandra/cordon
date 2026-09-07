import { GOVERNANCE_GAP } from "@cordon/fixtures";
import { Reveal } from "../parts/Reveal";

/** The feature list, written by a third party. */
export function Gap() {
  return (
    <section className="section--tight">
      <div className="wrap wrap--narrow">
        <Reveal>
          <p className="eyebrow">Not our observation</p>
          <p className="claim" style={{ fontSize: "clamp(20px, 2.6vw, 30px)" }}>
            MCP, A2A and ACP cannot express{" "}
            {GOVERNANCE_GAP.missing.map((item, index) => (
              <em key={item}>
                {item}
                {index < GOVERNANCE_GAP.missing.length - 1 ? ", " : "."}
              </em>
            ))}
          </p>
          <span className="claim__source">
            {GOVERNANCE_GAP.title} · {GOVERNANCE_GAP.source}. That list is this project's
            feature list, written by a third party.
          </span>
        </Reveal>
      </div>
    </section>
  );
}
