import { Reveal } from "../parts/Reveal";

/** The reason Cordon bounds capacity rather than items. */
export function Claim() {
  return (
    <section className="section--tight">
      <div className="wrap">
        <hr className="rule" />
      </div>
      <div className="wrap wrap--narrow" style={{ paddingBlock: "clamp(48px, 9vh, 104px)" }}>
        <Reveal>
          <p className="claim">
            You cannot stop one payment.
            <br />
            You can stop the <em>ten-thousandth</em>.
          </p>
          <span className="claim__source">
            Each payment is signed off chain, so no contract can stand in the
            way of a single one. What Cordon bounds is how much the tree can
            spend in total.
          </span>
        </Reveal>
      </div>
      <div className="wrap">
        <hr className="rule" />
      </div>
    </section>
  );
}
