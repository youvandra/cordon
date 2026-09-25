import { Link } from "react-router-dom";
import { Surface } from "cordon-ui";
import { Reveal } from "../parts/Reveal";

/**
 * What changes once the authority has a name: the number of parties.
 *
 * Every section before this one argues to an owner. This one is about the
 * person on the other side of a purchase, who until now saw an HTTP request
 * and a signature and had no way to ask anything else.
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
            Cordon began as a private fence. You ran it, you held the mandate,
            you saw the tree — and the agents were bounded, but the bounds were
            yours alone to know. Give every agent a name and the same bounds
            become a public fact.
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
            <pre className="panel__code">{`worker1.probe.acme.eth

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
          <ul className="points points--2" style={{ marginTop: "clamp(48px, 8vh, 96px)" }}>
            <li className="points__item">
              <span className="points__title">A seller can ask first</span>
              <p className="points__body">
                Today a seller answers first and is paid second, with no way to
                ask whether the payment will land. Two reads turn the address in
                a payment into a live answer: is this branch still permitted,
                and how much is left.
              </p>
            </li>
            <li className="points__item">
              <span className="points__title">Permissions are the name's</span>
              <p className="points__body">
                An agent that may spawn beneath itself may register beneath its
                name. It may not cut anything, and it may not describe itself —
                an agent able to write its own record could point it at a wider
                mandate than the one holding it.
              </p>
            </li>
            <li className="points__item">
              <span className="points__title">Cutting the name cuts the branch</span>
              <p className="points__body">
                Revoking stops the money and unregistering stops the discovery.
                Everything below falls with it, and nothing below is touched.
                The person who funded the tree is the only one who can do
                either.
              </p>
            </li>
            <li className="points__item">
              <span className="points__title">No supervisor, in either tree</span>
              <p className="points__body">
                Cordon's name appears nowhere in anyone's agent tree. The parent
                of a name is whoever can revoke it, so the tree hangs from the
                owner's name — and no key of ours holds a role over it.
              </p>
            </li>
          </ul>
        </Reveal>

        <Reveal delay={0.05}>
          <p className="lede" style={{ marginTop: "var(--cordon-space-8)" }}>
            <Link to="/console/resolve">Resolve an agent</Link> — no wallet, no
            permission — or read{" "}
            <Link to="/docs/names">names and authority</Link>.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
