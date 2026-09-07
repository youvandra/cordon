import { BarChart, DotText, Surface, Tag } from "cordon-ui";
import { ARC, ENDPOINTS, MARKETPLACE } from "@cordon/fixtures";
import { Reveal } from "../parts/Reveal";

/**
 * Why the tranche can be small enough to be a leash.
 *
 * This section used to close on a five-row spec sheet. Two of those rows —
 * native 18 decimals against the ERC-20 view's 6 — are the note the team keeps
 * for itself about the likeliest bug in the project, and a reader has no use
 * for it. Chain id and finality are already carried by the paragraph above. Of
 * the five, only the unlaunched mainnet was worth a reader's attention, and it
 * is a disclosure rather than an argument, so it says so in a sentence.
 */
export function Arc() {
  return (
    <section id="arc" className="section">
      <div className="wrap">
        <Reveal>
          <p className="eyebrow">Why Arc</p>
          <h2 className="display display--page" style={{ maxWidth: "18ch" }}>
            Small tranche, <span className="display__dim">tight leash.</span>
          </h2>
          <p className="lede">
            Tranche size is bounded below by settlement cost and latency. Arc makes both close to
            zero. On Ethereum this design is unusable.
          </p>
        </Reveal>

        <Reveal delay={0.08}>
          <Surface glaze="ember" radius="6" elevation="tile" glow className="panel" style={{ marginTop: "var(--cordon-space-8)" }}>
            <p className="panel__label" style={{ color: "var(--cordon-on-glaze-soft)" }}>
              One catalogue, one seller, similar-looking endpoints
            </p>
            <BarChart
              horizontal
              height={200}
              format={(n) => (n < 1 ? `$${n}` : `$${n.toFixed(2)}`)}
              data={ENDPOINTS.map((endpoint) => ({
                label: endpoint.seller,
                value: endpoint.price,
                glaze: endpoint.price >= 200 ? ("rose" as const) : ("ember" as const),
              }))}
            />
            <p className="panel__note" style={{ color: "var(--cordon-on-glaze-soft)" }}>
              Arkham alone spans $1 to $200. A 200× overspend on one plausible call is not a
              scenario anybody invented — it is in the live catalogue.
            </p>
          </Surface>
        </Reveal>

        <Reveal delay={0.05}>
          <div className="counter" style={{ marginTop: "var(--cordon-gap)" }}>
            <Surface glaze="bisque" radius="6" rim elevation="tile" className="counter__panel">
              <p className="panel__label">Services in the x402 catalogue</p>
              <span className="stat__value" style={{ marginTop: 10 }}>
                <DotText radius={2.05} style={{ width: 175, color: "var(--cordon-ink-strong)" }}>
                  {`${MARKETPLACE.services}`}
                </DotText>
              </span>
              <p className="panel__note">
                Median price ${MARKETPLACE.priceMedian}. {MARKETPLACE.offersAtOrBelowOneCent} of{" "}
                {MARKETPLACE.offersTotal} offers are at or below a cent — which is exactly why
                no single item is worth stopping.
              </p>
            </Surface>

            <Surface glaze="bisque" radius="6" rim elevation="tile" className="counter__panel">
              <p className="panel__label">Services listed on Arc</p>
              <span className="stat__value" style={{ marginTop: 10 }}>
                <DotText radius={2.05} style={{ width: 46, color: "var(--cordon-ink-strong)" }}>
                  {`${MARKETPLACE.arcListings}`}
                </DotText>
              </span>
              <p className="panel__note">
                Zero, today. The enforcement seat is unoccupied on the chain Circle is building.
              </p>
            </Surface>
          </div>
        </Reveal>
      </div>

      <div className="wrap wrap--narrow" style={{ marginTop: "clamp(48px, 8vh, 96px)" }}>
        <Reveal>
          <p className="eyebrow">Said before you find it</p>
          <p className="lede">
            {ARC.mainnetLaunched
              ? `Arc mainnet is live, and Cordon runs on chain ${ARC.chainId}.`
              : `Arc mainnet has not launched. Everything Cordon does today happens on
                 testnet ${ARC.chainId}, and every transaction on this page opens in a
                 public explorer.`}
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: "var(--cordon-space-5)", flexWrap: "wrap" }}>
            <Tag tone="caution" size="sm" dot>testnet only</Tag>
            <a href={ARC.explorer} target="_blank" rel="noreferrer" className="mono" style={{ color: "var(--cordon-accent)" }}>
              {ARC.explorer}
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
