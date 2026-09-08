import { Link } from "react-router-dom";
import { ARC, ERC8004, GATES, SEARCH, formatUsdc } from "@cordon/fixtures";
import { C, Code, H2, H3, Lead, Note, P, Table, UL } from "../parts";

export function Contracts() {
  return (
    <>
      <Lead>
        Three contracts. No proxy, no admin key, no owner variable, nothing
        upgradeable. If the people who wrote this could undo a refusal, the
        whole thing would be decoration.
      </Lead>

      <H2 id="mandateregistry">MandateRegistry</H2>
      <P>The shape of the tree, and the rule that a child can only narrow.</P>
      <Table
        head={["Function", "Who", "Does"]}
        rows={[
          [<C key="o">open(params)</C>, "the owner", "create a root mandate from their own key"],
          [<C key="s">spawn(parent, params)</C>, "the parent's operator", "create a child, refused if wider"],
          [<C key="r">revoke(node)</C>, "the owner", "cut the node and everything under it"],
          [<C key="m">mandate(node)</C>, "anyone", "read a mandate"],
          [<C key="p">path(node)</C>, "anyone", "the node and every ancestor up to the root"],
          [<C key="l">isLive(node)</C>, "anyone", "whether the node and its ancestors are all uncut"],
          [<C key="ra">revokedAt(node)</C>, "anyone", "which ancestor cut this branch, if any"],
        ]}
      />
      <P>
        Events: <C>MandateOpened</C>, <C>MandateSpawned</C>, <C>MandateRevoked</C>.
      </P>

      <H2 id="treevault">TreeVault</H2>
      <P>The money and the arithmetic.</P>
      <Table
        head={["Function", "Who", "Does"]}
        rows={[
          [<C key="f">fund(root, amount)</C>, "anyone", "pay into a tree"],
          [<C key="w">withdraw(root, to, amount)</C>, "the owner", "take out of it"],
          [<C key="d">draw(node, counterparty, amount)</C>, "the node's operator", "ask for a tranche; releases or refuses"],
          [<C key="rl">release(refusalId)</C>, "the owner", "sign a one time exception to one refusal"],
          [<C key="ws">windowSpent(node)</C>, "anyone", "what this node has spent in the current window"],
          [<C key="hr">headroom(node)</C>, "anyone", "what it may still draw, and which node is the limit"],
          [<C key="ev">evaluate(node, to, amount)</C>, "anyone", "what a draw would do, without doing it"],
          [<C key="rf">refusal(id)</C>, "anyone", "one refusal, in full"],
        ]}
      />
      <P>
        Events: <C>Funded</C>, <C>Withdrawn</C>, <C>Drawn</C>,{" "}
        <C>AncestorDebited</C>, <C>Refused</C>, <C>Released</C>.
      </P>
      <Note tone="info" title="A refusal returns">
        <C>draw</C> returns <C>(released, refusalId, reason)</C>. It does not
        revert on a bound. A revert would roll back the event, and a refusal
        that leaves no trace is not a record.
      </Note>

      <H2 id="conductrecord">ConductRecord</H2>
      <P>The seat. It reads the vault and writes into ERC-8004.</P>
      <Table
        head={["Function", "Who", "Does"]}
        rows={[
          [<C key="b">bind(node, agentId)</C>, "anyone", "link a node to the identity its operator holds"],
          [<C key="a">attest(refusalId)</C>, "anyone", "publish one refusal, read out of the vault"],
          [<C key="ar">attestRelease(refusalId)</C>, "anyone", "append the owner's override to that same entry"],
          [<C key="h">refusalHash(id)</C>, "anyone", "the commitment a reader recomputes"],
        ]}
      />
      <P>
        Anyone may call these precisely because they invent nothing: whoever
        pays the gas, the entry written is the one the vault already holds.
      </P>

      <H2 id="erc-8004">ERC-8004</H2>
      <P>
        Nothing to deploy. Identity and Reputation are live at deterministic
        addresses on Arc and on forty other chains.
      </P>
      <Code>{`Identity    ${ERC8004.identity}
Reputation  ${ERC8004.reputation}`}</Code>

      <H2 id="deployments">Deployments</H2>
      <P>
        Addresses live in <C>packages/contracts/deployments/&lt;chainId&gt;.json</C>{" "}
        and nowhere else. That file is written by the deploy script from the
        broadcast, never typed by hand: a mistyped address is the kind of defect
        that looks like a working system right up until the first draw.
      </P>
      <Code lang="bash">{`cast wallet import cordon-deployer --interactive   # once
./script/deploy.sh`}</Code>
      <P>
        The private key is never an argument, never an environment variable and
        never in your shell history. The script verifies the sources afterwards,
        because a contract nobody can read is a contract nobody can check.
      </P>
    </>
  );
}

export function Configuration() {
  return (
    <>
      <Lead>
        Every variable each package reads, in one place. Anything not listed
        here is not read by anything.
      </Lead>

      <H2 id="daemon">Daemon and MCP</H2>
      <H3 id="daemon-required">Required</H3>
      <Table
        head={["Variable", "Meaning"]}
        rows={[
          [<C key="v">CORDON_VAULT</C>, "TreeVault address, from the deployment file"],
          [<C key="r">CORDON_REGISTRY</C>, "MandateRegistry address, from the same file"],
          [<C key="n">CORDON_NODE_&lt;label&gt;</C>, "the mandate node this daemon acts for"],
          [<C key="k">CORDON_KEY_&lt;label&gt;</C>, "the operator key for that node. The agent never sees it"],
        ]}
      />
      <H3 id="daemon-optional">Optional</H3>
      <Table
        head={["Variable", "Default"]}
        rows={[
          [<C key="rec">CORDON_RECORD</C>, "unset. Without it, refusals are enforced and never published"],
          [<C key="id">CORDON_IDENTITY</C>, "the live ERC-8004 Identity registry"],
          [<C key="rpc">CORDON_RPC</C>, ARC.rpc],
          [<C key="cid">CORDON_CHAIN_ID</C>, `${ARC.chainId}`],
          [<C key="usdc">CORDON_USDC</C>, "the 6 decimal view of USDC on Arc"],
          [<C key="net">CORDON_NETWORKS</C>, "the networks this daemon will settle on"],
          [<C key="as">CORDON_ASSETS</C>, "the assets it will pay in"],
          [<C key="port">CORDON_PORT</C>, "8402"],
        ]}
      />
      <Note tone="warn" title="Keys are named, never inlined">
        Configuration carries the name of the variable holding a key, not the
        key. A configuration dump cannot leak one.
      </Note>

      <H2 id="proxy">Proxy</H2>
      <Table
        head={["Variable", "Meaning"]}
        rows={[
          [<C key="pn">CORDON_NODE</C>, "the node this proxy acts for. One proxy, one node"],
          [<C key="pd">CORDON_DAEMON</C>, "where the daemon is. Defaults to localhost:8402"],
          [<C key="pp">CORDON_PROXY_PORT</C>, "8403"],
          [<C key="pc">CORDON_CA</C>, "set to 1 to terminate TLS. Off by default"],
        ]}
      />

      <H2 id="meter">Meter</H2>
      <Table
        head={["Flag", "Meaning"]}
        rows={[
          [<C key="mc">--chain</C>, "which deployment file to read addresses from"],
          [<C key="mf">--from</C>, "the first block to index. The deploy block, not zero, on a busy chain"],
          [<C key="mo">--out</C>, "where the snapshot goes"],
          [<C key="mp">--port</C>, "8404"],
          [<C key="m1">--once</C>, "index and exit, rather than serving"],
        ]}
      />

      <H2 id="decimals">One note about decimals</H2>
      <P>
        USDC on Arc has two views of one balance. The native view has 18
        decimals and is what gas is paid in. The token view has 6 and is what
        every contract here uses. Converting between them happens in exactly one
        function in one package, on purpose: this is the highest probability bug
        in the project and the kind that stays invisible until it is expensive.
      </P>
    </>
  );
}

export function Gates() {
  const green = GATES.filter((gate) => gate.status === "green").length;

  return (
    <>
      <Lead>
        Six acceptance criteria, written before the code. They are the product;
        everything else is surface. A gate is green because a run said so, not
        because someone edited a file.
      </Lead>

      <H2 id="status">Status</H2>
      <Table
        head={["Gate", "Ends when", "Status", "Tests"]}
        rows={GATES.map((gate) => [
          <b key={gate.id}>{gate.id}</b>,
          gate.ends,
          gate.status,
          gate.tests === null ? "not run" : `${gate.tests}`,
        ])}
      />
      <P>
        {green} of {GATES.length} are green. The two that are not need a live
        deployment: a four agent tree buying from real sellers, and the hostile
        drill.
      </P>

      <H2 id="the-search">The bounded search</H2>
      <P>
        G4 plays adversarial spending strategies against the contract and lets
        the contract score them. Ten named tactics, each swept through a range
        of parameters: structuring, fan out, hiding at depth, straddling a
        window boundary, racing siblings, spending after a revocation, rotating
        recipients, retrying a refusal, dust, and trying to spawn something
        wider.
      </P>
      <Code>{`${SEARCH.strategies.toLocaleString()} strategies
${SEARCH.draws.toLocaleString()} draws
${SEARCH.refused.toLocaleString()} refused
${SEARCH.passedABound} past a bound

closest any strategy came: ${formatUsdc(SEARCH.closestToBudget6)} of ${formatUsdc(SEARCH.budget6, 0)}`}</Code>
      <P>
        The closest figure is the one worth reading twice. A strategy reached
        the bound exactly and stopped there, which is what a bound is.
      </P>
      <Note tone="good" title="One tactic must fail to breach">
        A contract that refused everything would pass every assertion and be
        useless, so one tactic is a control: it spends freely, far inside every
        limit, and the search fails if it is ever refused.
      </Note>

      <H2 id="the-drill">The hostile drill</H2>
      <P>
        G3 has not been run and its number is not invented here. An agent is
        given the daemon and a target, told to spend as much as it can, and is
        neither restricted nor helped. Whatever it reaches gets published.
      </P>
      <UL>
        <li>If the number is the bound, the fence holds.</li>
        <li>
          If the number is the treasury, we have disproved our own product, and
          we will say so in the same type size.
        </li>
      </UL>
      <P>
        See <Link to="/drill">the drill page</Link>, which stays empty until
        there is something true to put on it.
      </P>
    </>
  );
}

export function Faq() {
  return (
    <>
      <Lead>The questions that come up first.</Lead>

      <H2 id="isnt-this-a-spend-limit">Is this not just a spending limit?</H2>
      <P>
        Per transaction and per session limits already exist in several places,
        and they are useful. None of them crosses a delegation boundary. The
        moment an agent can create another agent, a per agent limit becomes a
        per branch limit and the total goes unbounded. Charging every ancestor
        on every purchase is the part that is different.
      </P>

      <H2 id="why-not-a-smaller-wallet">Why not just give the agent a smaller wallet?</H2>
      <P>
        Because the agent can spawn. A smaller wallet caps one agent and says
        nothing about the sum of its descendants. It also puts money in the
        agent's hands, which Cordon deliberately does not: the agent holds no
        key at all.
      </P>

      <H2 id="can-you-reverse-a-refusal">Can you reverse a refusal?</H2>
      <P>
        No, and neither can the deployer. There is no admin key and no proxy.
        What exists is release: the owner signs an exception to one specific
        refusal from their own key, and both the refusal and the release stay on
        the record.
      </P>

      <H2 id="what-if-the-daemon-lies">What if the daemon declares one seller and pays another?</H2>
      <P>
        No contract can read the recipient inside an off chain payment
        signature, so that is caught afterwards by reconciliation rather than
        prevented at the gate. Cordon states this rather than implying the
        stronger claim. A bound that overstates itself does more harm than one
        that names its edge.
      </P>

      <H2 id="is-it-live">Is any of this live money?</H2>
      <P>
        Not yet. Arc mainnet has not launched, so everything runs on the
        testnet. The contracts are the same ones that would run on mainnet, with
        no upgrade path and no owner.
      </P>

      <H2 id="what-happens-if-cordon-goes-away">What happens if Cordon goes away?</H2>
      <P>
        The contracts keep working. Nobody can pause them, nobody can point them
        somewhere else, and the record already written stays readable in a
        registry that is not ours. That is the intended answer: a refusal has to
        survive its authors, or it was never a control.
      </P>
    </>
  );
}
