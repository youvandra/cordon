import { Link } from "react-router-dom";
import { MCP_CONFIG } from "@cordon/fixtures";
import { C, Code, Defs, H2, Lead, Note, OL, P, Table, UL } from "../parts";

export function Introduction() {
  return (
    <>
      <Lead>
        Cordon gives a whole tree of agents one budget and enforces it in a
        contract. Every purchase any agent makes is charged to that agent and to
        every one of its ancestors, all the way up. When the total would break
        the limit the owner signed, the purchase does not happen.
      </Lead>

      <H2 id="the-problem">The problem</H2>
      <P>
        An orchestrator spawns workers. Each worker gets a spending limit, and
        each worker respects it. The workers spawn their own helpers, who also
        get limits, and also respect them. Every local check passes and nobody
        anywhere adds the numbers up. The owner signed for one figure and the
        tree can spend a multiple of it without a single rule being broken.
      </P>
      <P>
        Giving an agent a smaller wallet does not fix this. It caps one agent.
        The moment that agent can create another one, the cap is per branch
        rather than per tree, and the total is unbounded again.
      </P>

      <H2 id="what-cordon-does">What Cordon does</H2>
      <UL>
        <li>
          The owner signs one mandate: a budget, a window, a per purchase cap, a
          concentration limit and a maximum depth.
        </li>
        <li>
          Agents are nodes under that mandate. A parent can create children on
          its own, and the contract refuses any child wider than its parent.
        </li>
        <li>
          Before any payment, the daemon asks the contract for a tranche exactly
          the size of the purchase. The contract charges every node on the path
          to the root, or it refuses.
        </li>
        <li>
          A refusal is written on chain and published to a shared reputation
          registry, with the transaction it came from attached.
        </li>
      </UL>

      <H2 id="what-it-does-not-do">What it does not do</H2>
      <P>
        Cordon cannot block one individual payment. Payments here are signed off
        chain and settled in batches, so there is no contract in the path of a
        single one. What Cordon bounds is capacity.
      </P>
      <Note tone="warn" title="Say this out loud, always">
        You cannot stop one payment. You can stop the ten-thousandth. Anyone who
        reads the mechanism will work this out, so it is better said first.
      </Note>
      <P>
        There is one more honest limit. If an agent runtime holds its own wallet
        and funds it itself, Cordon cannot get in front of the money. In that
        case Cordon can observe and cannot control, and it says so rather than
        implying otherwise.
      </P>

      <H2 id="who-it-is-for">Who it is for</H2>
      <P>
        The unit Cordon is built for is one owner running a fan-out of their own
        agents: an orchestrator with workers, all under one set of keys, all
        funded from one vault. That case is checkable, because the vault really
        is the only source of money.
      </P>
      <P>
        Cross organisation delegation, where the parent and the child belong to
        different people, uses the same mechanism. It just needs strangers to
        adopt it first, so it is not where this starts.
      </P>

      <H2 id="where-next">Where next</H2>
      <Defs
        items={[
          {
            term: <Link to="/docs/quickstart">Quickstart</Link>,
            def: "Get a refusal on your own machine in about a minute.",
          },
          {
            term: <Link to="/docs/how-it-works">How it works</Link>,
            def: "Follow one purchase from the agent to the seller and back.",
          },
          {
            term: <Link to="/docs/contracts">Contracts</Link>,
            def: "The three contracts, their functions, and what they emit.",
          },
        ]}
      />
    </>
  );
}

export function Quickstart() {
  return (
    <>
      <Lead>
        The fastest path is the MCP server, because it runs inside a client you
        already have. You give it a mandate and a key, and every purchase the
        model makes goes through the contract.
      </Lead>

      <H2 id="before-you-start">Before you start</H2>
      <UL>
        <li>Node 22 or newer.</li>
        <li>An MCP client. Claude Desktop is the one these examples use.</li>
        <li>
          A deployed vault and registry, plus a mandate you own. The console
          creates the mandate and funds the vault.
        </li>
      </UL>
      <Note tone="info" title="Testnet only">
        Arc mainnet has not launched. Everything below runs against the testnet,
        where the gas token and the money are both test USDC.
      </Note>

      <H2 id="one-configure-the-client">1. Configure the client</H2>
      <P>
        Add Cordon to <C>claude_desktop_config.json</C>. The addresses come from
        the deployment file, and the node and key come from the mandate you
        created.
      </P>
      <Code lang="json">{MCP_CONFIG}</Code>
      <Note tone="warn" title="The key lives here, not in the agent">
        <C>CORDON_KEY_ME</C> is held by the server process. The model never sees
        it and has no tool that would let it use one. That is the arrangement
        the whole design rests on.
      </Note>

      <H2 id="two-ask-it-to-buy-something">2. Ask it to buy something</H2>
      <P>
        Restart the client and ask for something that costs money. A request for
        a paid endpoint returns a payment challenge, and Cordon settles it if
        the contract allows.
      </P>
      <Code>{`Fetch https://api.aisa.one/apis/v2/coingecko/simple/price?ids=bitcoin
through cordon_fetch and tell me the price.`}</Code>

      <H2 id="three-watch-it-refuse">3. Watch it refuse</H2>
      <P>
        Ask for something above the per purchase cap, or keep going until the
        window budget runs out. The tool comes back with a refusal rather than
        an error: which node asked, which bound stopped it, and the transaction
        it happened in.
      </P>
      <Code>{`{
  "refused": true,
  "reason": "window-budget",
  "breachedAt": "0x7f3a…",
  "transaction": "0x9c21…"
}`}</Code>
      <P>
        Open that transaction in the explorer. The refusal is a record on chain,
        not a message from a server.
      </P>

      <H2 id="in-front-of-a-script-instead">In front of a script instead</H2>
      <P>
        If the thing spending money is a program rather than a model, use the
        proxy. Nothing about the program changes.
      </P>
      <Code lang="bash">{`cordon run --node 0x7f3a… -- python my_agent.py`}</Code>
      <P>
        See <Link to="/docs/proxy">Proxy and cordon run</Link> for how it handles
        https and what it hands back when a purchase is refused.
      </P>
    </>
  );
}

export function HowItWorks() {
  return (
    <>
      <Lead>
        There are two clocks. The slow one is on chain and is guarded. The fast
        one is off chain, costs nothing, and Cordon does not touch it.
      </Lead>

      <H2 id="the-path-of-one-purchase">The path of one purchase</H2>
      <OL>
        <li>
          The agent asks for a URL. It cannot ask for anything else: there is no
          tool that takes a recipient or an amount.
        </li>
        <li>
          The daemon requests the URL. If it is free, the body comes back and
          nothing touches the tree.
        </li>
        <li>
          If the seller wants payment, it answers with a challenge naming its
          own address and its own price. Both come from the seller, not from the
          agent and not from Cordon.
        </li>
        <li>
          The daemon asks the vault for a tranche of exactly that size, for
          exactly that recipient.
        </li>
        <li>
          The contract checks the bounds on every node from the agent up to the
          root. If they all pass, it charges every one of them and moves the
          money into the payment balance for that agent alone.
        </li>
        <li>
          The daemon signs the payment off chain and retries the request. The
          seller returns the body.
        </li>
        <li>
          If any bound fails, nothing moves. The refusal is written on chain and
          then published to the reputation registry.
        </li>
      </OL>

      <Note tone="good" title="The order is the design">
        The bound is checked before the money exists. That is what makes a
        refusal a refusal rather than a regret.
      </Note>

      <H2 id="who-holds-what">Who holds what</H2>
      <Table
        head={["Party", "Holds", "Can"]}
        rows={[
          ["The owner", "their own wallet", "sign the mandate, release a refusal, cut a branch"],
          ["The daemon", "the operator keys", "ask for a tranche, sign a payment"],
          ["The agent", "nothing", "ask for a URL"],
          ["The vault", "the treasury", "release a tranche, or refuse"],
        ]}
      />
      <P>
        The agent holds no key at all. Not one tranche, none. Every purchase
        goes past the gate, so the most an unsupervised agent can spend is
        whatever the contract lets through, rather than whatever it happens to
        be holding.
      </P>

      <H2 id="the-parts">The parts</H2>
      <Defs
        items={[
          {
            term: <Link to="/docs/contracts">Contracts</Link>,
            def: "The tree, the money and the record. No admin key, no proxy, nothing upgradeable.",
          },
          {
            term: <Link to="/docs/daemon">Daemon</Link>,
            def: "Holds the keys, talks to the chain, signs the payments. This is the product.",
          },
          {
            term: <Link to="/docs/mcp">MCP</Link>,
            def: "One of three thin surfaces in front of the daemon.",
          },
          {
            term: <Link to="/docs/meter">Meter</Link>,
            def: "Reads the chain back into the shape the pages render. A cache, never an authority.",
          },
        ]}
      />
    </>
  );
}
