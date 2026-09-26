import { Surface } from "cordon-ui";
import { MANDATE, formatUsdc } from "@cordon/fixtures";
import { Reveal } from "../parts/Reveal";

/**
 * The seller's side of the same purchase.
 *
 * The owner's problem is delegation: a limit per agent is a limit per agent.
 * The seller's is identity — and it is the mirror of it. At the moment of
 * payment a bounded agent and a script are the same thing, because both are an
 * address, and an address is free. So a seller that must pay to serve can only
 * trust everyone or block everyone. This makes that visible in the one place a
 * reader has just watched the buyer's side from, and the answer — a name that
 * resolves to the bound — is two sections down.
 *
 * The figures are the tree's own: a purchase cap is not retyped here.
 */
const SWARM = [
  "0x3f",
  "0x9a",
  "0x1c",
  "0xbe",
  "0x07",
  "0xd2",
  "0x64",
  "0x8f",
  "0x21",
  "0xaa",
  "0x5d",
  "0x70",
  "0xc3",
  "0x19",
  "0xe6",
  "0x42",
];

export function Seller() {
  return (
    <section id="seller" className="section">
      <div className="wrap">
        <Reveal>
          <p className="eyebrow">The other side of the purchase</p>
          <h2 className="display display--page" style={{ maxWidth: "20ch" }}>
            A seller cannot tell a buyer <span className="display__dim">from a swarm.</span>
          </h2>
          <p className="lede">
            Every payment is an address, and an address is free. So a seller
            sees a bounded agent and a script as the same thing.
          </p>
        </Reveal>

        <Reveal delay={0.08}>
          <Surface
            glaze="bisque"
            radius="6"
            rim
            elevation="tile"
            className="seller"
            style={{ marginTop: "var(--cordon-space-8)" }}
          >
            <div className="seller__server">
              <span className="panel__label">A paid API</span>
            </div>

            <div className="seller__split">
              <div className="seller__side">
                <div className="seller__chips">
                  <span className="seller__chip seller__chip--named mono">trade.olivia.eth</span>
                </div>
                <p className="seller__side-note">
                  capped at {formatUsdc(MANDATE.tranche6)} a purchase, by a person
                </p>
              </div>

              <div className="seller__vs" aria-hidden="true">
                =
              </div>

              <div className="seller__side">
                <div className="seller__chips">
                  {SWARM.map((address) => (
                    <span key={address} className="seller__chip seller__chip--anon mono">
                      {address}…
                    </span>
                  ))}
                </div>
                <p className="seller__side-note">fresh addresses — no name, no owner, no history</p>
              </div>
            </div>

            <p className="panel__note">
              At the <span className="mono">402</span> they are identical. Free
              tier drained, upstream quota burned, paying customers down with
              them — and no one to blame, because the buyer was an address.
            </p>
          </Surface>
        </Reveal>

        <Reveal delay={0.05}>
          <p className="lede" style={{ marginTop: "var(--cordon-space-8)" }}>
            Payment tells a seller one thing: the buyer can pay this call. It
            never says who the buyer is, or whether it stops.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
