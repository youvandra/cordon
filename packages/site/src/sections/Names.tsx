import { Link } from "react-router-dom";
import { Surface } from "cordon-ui";
import { Reveal } from "../parts/Reveal";

/**
 * What changes once the authority has a name: the number of parties.
 *
 * Every section before this one argues to an owner. This one is about the
 * person on the other side of a purchase, who until now saw an HTTP request
 * and a signature and had no way to ask anything else. It is deliberately
 * short: the argument is one panel and one link, and the four properties it
 * used to spell out live in the docs.
 */
export function Names() {
  return (
    <section id="names" className="section">
      <div className="wrap">
        <Reveal>
          <p className="eyebrow">Names</p>
          <h2 className="display display--page" style={{ maxWidth: "22ch" }}>
            A limit only you can see <span className="display__dim">is a limit only you can trust.</span>
          </h2>
          <p className="lede">
            Cordon began as a private fence: the bounds were yours alone to
            know. Give every agent a name and they become a public fact.
          </p>
        </Reveal>

        <Reveal delay={0.08}>
          <Surface
            glaze="bisque"
            radius="6"
            rim
            elevation="tile"
            className="panel"
            style={{ marginTop: "var(--cordon-space-8)" }}
          >
            <p className="panel__label">Resolve one name</p>
            <pre className="panel__code">{`olivia.eth
  trade.olivia.eth
  research.olivia.eth
  data.olivia.eth

  where to call it         an ordinary https endpoint
  what it may spend        read from the contract, not the record
  who funded it            and who can cut it off
  what it has been refused its ERC-8004 record`}</pre>
            <p className="panel__note">
              The name carries a pointer, never a figure. A cap written into a
              record is a copy, and a copy drifts — so the name says which
              contract to ask, and the contract answers.
            </p>
          </Surface>
        </Reveal>

        <Reveal delay={0.05}>
          <p className="lede" style={{ marginTop: "var(--cordon-space-8)" }}>
            <Link to="/resolve?q=trade.olivia.eth">Resolve an agent</Link> — no
            wallet, no permission — or read{" "}
            <Link to="/docs/names">names and authority</Link>.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
