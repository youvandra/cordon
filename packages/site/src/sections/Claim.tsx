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
            You cannot stop one nanopayment.
            <br />
            You can stop the <em>ten-thousandth</em>.
          </p>
          <span className="claim__source">
            x402 batch settlement needs an EOA signature and does not support ERC-1271, so no
            contract can sit in the path of a single payment. Cordon bounds capacity, not items.
          </span>
        </Reveal>
      </div>
      <div className="wrap">
        <hr className="rule" />
      </div>
    </section>
  );
}
