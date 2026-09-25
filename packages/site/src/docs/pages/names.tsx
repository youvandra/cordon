import { Link } from "react-router-dom";
import { SEPOLIA } from "@cordon/fixtures";
import { C, Code, H2, H3, Lead, Note, P, Table, UL } from "../parts";

/**
 * Names, and why they are load-bearing rather than decorative.
 *
 * The argument this page has to carry is that ENS adds a party. Everything
 * before it served an owner who already knew their tree; a name serves the
 * stranger on the other side of a purchase, who until now saw an address and
 * a signature and could ask nothing else.
 */
export function Names() {
  return (
    <>
      <Lead>
        Every agent in a tree can have a name, and resolving it tells you what
        that agent is permitted to spend and who stands behind it. The name tree
        is the mandate tree: a subname is issued as part of a spawn, and cutting
        a branch cuts both.
      </Lead>

      <Note tone="info" title="Which chain">
        ENSv2 is deployed on {SEPOLIA.name} and nowhere else for now, so Cordon
        runs there too. A name on one chain cannot cut a mandate on another
        without a bridge or an off-chain control, so the mandate went to the
        name rather than the other way round. The Arc deployment is unchanged.
      </Note>

      <H2 id="the-shape">The shape</H2>
      <P>
        A name's subnames live in a registry of its own, which the owner deploys
        and points the name at. That is already the shape of a mandate tree, so
        the two fit without either bending.
      </P>
      <Code>{`acme.eth                      the root mandate, funded by a person
  probe.acme.eth              a child agent, its own cap and window
    worker1.probe.acme.eth    a grandchild, narrower again`}</Code>
      <P>
        Cordon's own name appears nowhere in that tree, and that is deliberate.
        The parent of a name is whoever can revoke it, so a tree hanging from
        the protocol's name would make the protocol everyone's supervisor —
        which is the thing no contract here has.
      </P>

      <H2 id="what-a-name-carries">What a name carries</H2>
      <P>
        Four kinds of record, and the difference between them is what a reader
        may trust.
      </P>
      <Table
        head={["Record", "What it is", "Who guarantees it"]}
        rows={[
          [
            <C key="k">cordon.node</C>,
            "the mandate this agent draws against",
            "the contract, once you follow it",
          ],
          [
            <C key="k">cordon.registry</C>,
            "which registry holds that mandate",
            "the contract, once you follow it",
          ],
          [
            <C key="k">agent-endpoint[mcp]</C>,
            "where to call the agent (ENSIP-26)",
            "nobody — the owner's own words",
          ],
          [
            <C key="k">agent-context</C>,
            "what the agent is for, in prose (ENSIP-26)",
            "nobody — the owner's own words",
          ],
          [
            <C key="k">agent-registration[…]</C>,
            "the ERC-8004 identity the name claims (ENSIP-25)",
            "checkable against the registry",
          ],
        ]}
      />
      <Note tone="warn" title="A cap is never written into a record">
        A record is a copy, and a copy drifts: a mandate can narrow a minute
        after its cap was written down, and a seller reading the record would be
        quoted a bound that no longer holds. So the name carries a pointer to
        the contract, never the figure. What Cordon publishes is where to ask.
      </Note>

      <H2 id="the-check">The check a stranger makes</H2>
      <P>
        An x402 payment arrives as an authorisation, and the only thing in it
        that identifies the payer is an address. Two reads turn that into an
        answer.
      </P>
      <Code lang="ts">{`// 1. address to name, and the name has to resolve back to it
const name = await client.getEnsName({ address: payer });
const back = await client.getEnsAddress({ name });
if (back !== payer) throw new Error("this name is not theirs");

// 2. name to pointer, pointer to the contract
const node = await client.getEnsText({ name, key: "cordon.node" });
const registry = await client.getEnsText({ name, key: "cordon.registry" });

const live = await registry.read.isLive([node]);        // still permitted?
const [left] = await vault.read.headroom([node]);       // how much is left?`}</Code>
      <P>
        The second half of step one is what makes step one mean anything.
        Without it, anyone can point a name at somebody else's address and
        borrow their bound.
      </P>
      <P>
        The repository ships this as a script, so it can be run rather than
        described:
      </P>
      <Code lang="bash">{`node scripts/resolve-agent.ts worker1.probe.acme.eth
node scripts/resolve-agent.ts 0x…            # the way a seller receives it`}</Code>

      <H2 id="roles">Roles mirror the mandate</H2>
      <P>
        ENSv2 governs a name through Enhanced Access Control roles rather than a
        single owner. Cordon maps the mandate's own authority onto them, and
        maps nothing else.
      </P>
      <Table
        head={["What the contract permits", "The role that says it"]}
        rows={[
          [
            "an operator may spawn beneath its node",
            <C key="a">ROLE_REGISTRAR</C>,
          ],
          [
            "the owner may cut any branch of the tree it funded",
            <C key="b">ROLE_UNREGISTER</C>,
          ],
          [
            "an operator may publish nothing about itself",
            "no role — the records are the owner's",
          ],
          ["nobody may widen a cap", "no role, because there is no widening"],
        ]}
      />
      <H3 id="no-raise-cap">There is no raise-cap</H3>
      <P>
        A mandate narrows monotonically and is immutable once open, so widening
        one means opening another and signing for it. The namespace cannot
        express a widening because the contract cannot perform one, and that
        agreement is the point rather than a gap.
      </P>
      <H3 id="records-stay-the-owners">Why the operator cannot describe itself</H3>
      <P>
        An operator able to write its own <C>cordon.node</C> could point it at a
        wider mandate, and a seller reading the name would be told a bound that
        does not hold it. So an agent may register beneath itself and may not
        describe itself. Trying reverts.
      </P>
      <Code>{`EACUnauthorizedAccountRoles(…, 0xFda2…fE43)`}</Code>
      <P>
        The mirror is checkable rather than asserted. This walks the registries
        down to an agent's own, reads the mandate its name points at, and
        compares them line by line — failing only when the name grants what the
        contract refuses:
      </P>
      <Code lang="bash">{`node scripts/check-authority.ts worker1.probe.acme.eth`}</Code>

      <H2 id="cutting">Cutting a branch</H2>
      <P>
        The owner revokes the mandate and unregisters the name. The two halves
        do different work and neither substitutes for the other.
      </P>
      <UL>
        <li>
          <b>Revoking stops the money.</b> Liveness is read by walking from a
          node to its root, so one revocation kills every descendant in the same
          transaction and at constant cost. Nothing off chain is consulted.
        </li>
        <li>
          <b>Unregistering stops the discovery.</b> The name no longer resolves,
          so a stranger holding the agent's address learns nothing about who
          stood behind it — and neither do the names beneath it.
        </li>
      </UL>
      <P>
        Everything below falls with it and nothing below is touched. A
        grandchild never named in that transaction is refused at its next draw,
        and the refusal names the ancestor that caused it rather than the agent
        that asked. See <Link to="/docs/refusals">refusals</Link>.
      </P>
      <Note tone="info" title="Who can cut an agent off">
        The person who funded it, and nobody else. No key belonging to this
        project holds a revoke role over anyone's agent name, which is why the
        tree hangs from the owner's name rather than from Cordon's.
      </Note>

      <H2 id="try-it">Try it</H2>
      <P>
        The console has a screen for this and it needs no wallet: paste a name
        or an address and it shows the bound, whether the branch is live, and
        the chain of operators who could cut it off.
      </P>
      <UL>
        <li>
          <Link to="/console/resolve">Resolve an agent</Link> in the console.
        </li>
        <li>
          <Link to="/docs/the-record">The record</Link>, for the ERC-8004 side of
          the identity a name attests to.
        </li>
      </UL>
    </>
  );
}
