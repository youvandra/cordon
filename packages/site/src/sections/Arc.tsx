import { BarChart, DotText, Surface, Tag } from "cordon-ui";
import { ARC, ENDPOINTS, MARKETPLACE } from "@cordon/fixtures";
import { Reveal } from "../parts/Reveal";

/**
 * Why the tranche can be small enough to be a leash.
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
            How small a tranche can be depends on what it costs to settle one
            and how long it takes. Arc makes both close to zero. On Ethereum
            this design would not work.
          </p>
        </Reveal>

        <Reveal delay={0.08}>
          <Surface glaze="ember" radius="6" elevation="tile" glow className="panel" style={{ marginTop: "var(--cordon-space-8)" }}>
            <p className="panel__label" style={{ color: "var(--cordon-on-glaze-soft)" }}>
              One catalogue, one seller, endpoints that look alike
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
              Arkham alone runs from $1 to $200. Spending 200 times too much on
              one plausible call is not a story we made up. It is in the live
              catalogue.
            </p>
          </Surface>
        </Reveal>

        <Reveal delay={0.05}>
          <div className="counter" style={{ marginTop: "var(--cordon-gap)" }}>
            <Surface glaze="bisque" radius="6" rim elevation="tile" className="counter__panel">
              <p className="panel__label">Services agents can buy today</p>
              <span className="stat__value" style={{ marginTop: 10 }}>
                <DotText radius={2.05} style={{ width: 175, color: "var(--cordon-ink-strong)" }}>
                  {`${MARKETPLACE.services}`}
                </DotText>
              </span>
              <p className="panel__note">
                Median price ${MARKETPLACE.priceMedian}. Most offers cost a cent
                or less, which is exactly why no single one is worth stopping.
              </p>
            </Surface>

            <Surface glaze="bisque" radius="6" rim elevation="tile" className="counter__panel">
              <p className="panel__label">Of those, listed on Arc</p>
              <span className="stat__value" style={{ marginTop: 10 }}>
                <DotText radius={2.05} style={{ width: 46, color: "var(--cordon-ink-strong)" }}>
                  {`${MARKETPLACE.arcListings}`}
                </DotText>
              </span>
              <p className="panel__note">
                None yet. The seat is open on the chain Circle is building.
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
              ? "Arc mainnet is live, and Cordon runs on it."
              : `Arc mainnet has not launched yet. Everything Cordon does today
                 happens on the testnet, and every transaction on this site
                 opens in a public explorer.`}
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: "var(--cordon-space-5)", flexWrap: "wrap" }}>
            <Tag tone="caution" size="sm" dot>
              testnet only
            </Tag>
            <a href={ARC.explorer} target="_blank" rel="noreferrer" className="mono" style={{ color: "var(--cordon-accent)" }}>
              {ARC.explorer}
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
