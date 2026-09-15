import { PurchasePath } from "../parts/PurchasePath";
import { Reveal } from "../parts/Reveal";

/**
 * Where the budget sits when an agent actually buys something.
 *
 * The counterfactual above it is the tree; this is the purchase. Both runs in
 * the figure are real transactions, and the note under it says they are two
 * different purchases rather than letting the figure imply one.
 */
export function Purchase() {
  return (
    <section id="buy" className="section">
      <div className="wrap">
        <Reveal>
          <p className="eyebrow">One purchase</p>
          <h2 className="display display--page" style={{ maxWidth: "17ch" }}>
            An agent buys something. <span className="display__dim">This is the path.</span>
          </h2>
          <p className="lede">
            The agent never holds money. It asks for a URL, and everything
            between that request and a seller being paid passes a contract that
            can say no.
          </p>
        </Reveal>

        <Reveal delay={0.08}>
          <div style={{ marginTop: "var(--cordon-space-8)" }}>
            <PurchasePath />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
