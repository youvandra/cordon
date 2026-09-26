import { BarChart, DotText, Surface } from "cordon-ui";
import { ENDPOINTS, MARKETPLACE, SEPOLIA } from "@cordon/fixtures";
import { Reveal } from "../parts/Reveal";

/**
 * Why the chain matters: it decides how small the tranche can be.
 *
 * The bound is the contracts', and it is the same wherever they run. What a
 * chain changes is the cost and the wait of settling one purchase, and that is
 * what decides whether a budget can be a leash on every purchase or only a
 * ceiling on the month.
 */
export function Arc() {
  return (
    <section id="arc" className="section">
      <div className="wrap">
        <Reveal>
          <p className="eyebrow">Why the chain matters</p>
          <h2 className="display display--page" style={{ maxWidth: "18ch" }}>
            Small tranche, <span className="display__dim">tight leash.</span>
          </h2>
          <p className="lede">
            How small a tranche can be is set by what the chain charges to settle
            one, and how long it takes. Arc makes both near zero — a tranche can
            be a single purchase, a leash rather than a monthly ceiling. Cordon
            runs on Arc and on {SEPOLIA.name}, where the names are.
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
              <p className="panel__label">Of those, on a testnet</p>
              <span className="stat__value" style={{ marginTop: 10 }}>
                <DotText radius={2.05} style={{ width: 46, color: "var(--cordon-ink-strong)" }}>
                  {`${MARKETPLACE.arcListings}`}
                </DotText>
              </span>
              <p className="panel__note">
                None. The catalogue is mainnet only, which is why Cordon runs
                sellers of its own to buy from.
              </p>
            </Surface>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
