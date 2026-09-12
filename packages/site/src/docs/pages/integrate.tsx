import { Link } from "react-router-dom";
import { ARC, ATTEST, DEPLOYMENT, MCP_CONFIG, REASONS, REASON_MEANING, formatUsdc } from "@cordon/fixtures";
import { C, Code, Defs, H2, H3, Lead, Note, OL, P, Table, UL } from "../parts";

/**
 * How somebody else's agent gets behind the fence.
 *
 * Three ways in, in the order they cost effort: a config block for a client
 * that already speaks MCP, a command in front of a program nobody wants to
 * edit, and an HTTP call for everything else. The same daemon is underneath
 * all three, so the refusal is the same object in every one of them.
 */
export function Integrate() {
  const vault = DEPLOYMENT?.vault ?? "pending";
  const registry = DEPLOYMENT?.registry ?? "pending";

  return (
    <>
      <Lead>
        Cordon goes between your agent and the money, not inside your agent.
        Nothing about how the agent reasons, which model it runs, or what
        framework it uses has to change: it stops holding a key and starts
        asking for URLs.
      </Lead>

      <H2 id="pick-a-way-in">Pick a way in</H2>
      <Defs
        items={[
          {
            term: "An MCP client",
            def: "Claude Desktop, or anything else that reads an MCP config. One config block, no code.",
          },
          {
            term: "A program you cannot edit",
            def: "cordon run in front of it. It sets the proxy variables the runtime already reads.",
          },
          {
            term: "Anything else",
            def: "POST to the daemon. Three routes, JSON in, JSON out, no SDK required.",
          },
        ]}
      />
      <Note tone="info" title="You need a mandate first">
        All three need a node id and the operator key for it. <Link to="/docs/walkthrough">
        Step by step</Link> opens one from the console and funds it.
      </Note>

      <H2 id="mcp">1. An MCP client</H2>
      <P>
        The block below goes in your client's config. The addresses are this
        deployment's; the node and the key are yours.
      </P>
      <Code lang="json">{MCP_CONFIG}</Code>
      <P>
        A keyring holding more than one node also takes <C>CORDON_MCP_NODE</C>,
        which names the node this server speaks for. Without it the server takes
        whichever key parsed first, which is not a thing anybody can see.
      </P>
      <H3 id="skill">The skill file</H3>
      <P>
        Tools tell an agent what it <i>can</i> call. They do not tell it what a
        refusal means, or that retrying one is pointless, or that splitting a
        purchase to get under a cap is the behaviour the cap exists to stop.
        That belongs in the agent's own instructions, and Cordon ships a file
        for it: <C>packages/mcp/SKILL.md</C>, generated from the same fixtures
        the tools are, so it cannot describe a tool that no longer registers.
      </P>
      <P>
        Copy it into your agent's skills directory, or paste it into a system
        prompt. The short version, if you are writing your own:
      </P>
      <Code>{`You can buy things. You cannot move money.

The only spending tool takes a URL. There is no tool that sends money to an
address, and there will not be one. The price and the payee come from the
seller's own payment challenge.

cordon_fetch may come back refused. That is the contract declining, not an
error: do not retry it, do not split the purchase to get under a cap, and do
not look for an unpriced mirror of a paid resource. Report the amount, the
reason and the transaction — the person reading you can raise the bound or
release that one purchase. You cannot.

cordon_status says what is left and which node in the tree is the limit. It is
often an ancestor, so a balance above this agent is not this agent's to spend.`}</Code>
      <Note tone="warn" title="The instruction is not the fence">
        Everything in that file is advice, and an agent that ignores every word
        of it still cannot overspend — the contract is what stops it. The file
        exists so a refusal is understood rather than fought.
      </Note>

      <H2 id="proxy">2. In front of a program</H2>
      <P>
        If the thing spending money is a script, a framework or somebody else's
        binary, put the fence in front of it. Nothing inside the program
        changes: <C>cordon run</C> sets the proxy variables its HTTP client
        already reads, and every paid request it makes comes past the gate.
      </P>
      <Code lang="bash">{`cordon run --node 0x7f3a… -- python my_agent.py`}</Code>
      <P>
        See <Link to="/docs/proxy">Proxy and cordon run</Link> for what it does
        with https and what the program receives when a purchase is refused.
      </P>

      <H2 id="http">3. Over HTTP</H2>
      <P>
        The daemon is the product; the other two surfaces forward to it. It
        serves three routes and, deliberately, not a fourth.
      </P>
      <Code lang="bash">{`curl -s localhost:8412/status

curl -s -X POST localhost:8412/fetch \\
  -H 'content-type: application/json' \\
  -d '{"node":"0x7f3a…","url":"https://api.example.com/report"}'`}</Code>
      <P>A purchase that went through comes back like this:</P>
      <Code lang="json">{`{
  "paid": true,
  "status": 200,
  "headers": { "x-payment-response": "…" },
  "body": { "…": "the seller's own response" }
}`}</Code>
      <P>And one the contract declined comes back like this:</P>
      <Code lang="json">{`{
  "paid": false,
  "free": false,
  "refusal": {
    "released": false,
    "reason": "tranche-cap",
    "breachedAt": "0x08bd7e42…",
    "refusalId": "9",
    "txHash": "0x974e2ca6…"
  },
  "offer": { "amount": "10000", "payTo": "0x3feeA285…", "asset": "0x3600…0000" }
}`}</Code>
      <Note tone="good" title="Both are 200">
        A refusal is an answer, not a failure, so it does not arrive as a 5xx
        for a retry loop to hammer. Branch on <C>paid</C>, and treat{" "}
        <C>refusal</C> as final.
      </Note>

      <H2 id="handling-a-refusal">Handling a refusal in your own code</H2>
      <Table
        head={["Reason", "What it means", "What to do"]}
        rows={REASONS.filter((reason) => reason !== "none").map((reason) => [
          <C key={reason}>{reason}</C>,
          REASON_MEANING[reason] ?? reason,
          reason === "vault-balance"
            ? "fund the vault; the bounds passed"
            : reason === "revoked"
              ? "stop — this branch is cut and nothing under it will draw"
              : "report it to the owner; the bound is the owner's to move",
        ])}
      />
      <P>
        Retrying is the one thing never to do. The same request is refused
        again, and every attempt is a transaction that costs gas and lands on
        this agent's record.
      </P>

      <H2 id="what-your-agent-must-not-have">What your agent must not have</H2>
      <UL>
        <li>A private key, a seed phrase, or a wallet file of its own.</li>
        <li>A tool that takes a recipient address or an amount.</li>
        <li>A shell it can use to install one of the above.</li>
      </UL>
      <P>
        Cordon bounds what passes the gate. It cannot bound money that never
        came through the gate, and an agent holding its own wallet is spending
        money Cordon can only watch. The docs say this in{" "}
        <Link to="/docs/introduction">the introduction</Link> too, because it is
        the one way to deploy this and get nothing.
      </P>

      <H2 id="checking-who-you-are-paying">Checking who you are paying</H2>
      <P>
        Every refusal Cordon writes is published to a registry that is not ours,
        keyed to an agent identity. A buyer can read a seller's conduct before
        paying it, and a seller can read a buyer's before serving it. That
        reading is itself a paid endpoint at {formatUsdc(ATTEST.price6)}:
      </P>
      <Code lang="bash">{`curl -s https://attest.getcordon.xyz${ATTEST.resourcePath}/894124`}</Code>
      <P>
        See <Link to="/docs/attest">Attest</Link> for what it returns and why it
        costs anything at all.
      </P>

      <H2 id="the-addresses">The addresses</H2>
      <Table
        head={["What", "Where"]}
        rows={[
          ["Chain", `${ARC.name} · ${ARC.chainId}`],
          ["USDC, 6 decimals", <C key="usdc">{ARC.erc20}</C>],
          ["MandateRegistry", <C key="reg">{registry}</C>],
          ["TreeVault", <C key="vault">{vault}</C>],
        ]}
      />
      <P>
        Everything here is testnet. <Link to="/docs/configuration">Configuration</Link>{" "}
        lists every variable each package reads.
      </P>
    </>
  );
}

/**
 * The whole thing once, in order, from a wallet with nothing in it.
 *
 * The quickstart assumes a mandate exists. This is the page for the person who
 * has not signed one, and it is written as the sequence somebody actually
 * performs rather than as a tour of the features.
 */
export function Walkthrough() {
  return (
    <>
      <Lead>
        Six steps, from an empty wallet to an agent that has bought something
        and been refused something. Two of them cost a signature; the rest are
        reading.
      </Lead>

      <Note tone="info" title="What you need first">
        A wallet on Arc testnet holding test USDC — it is both the gas and the
        money — and a machine that can run Node 22.
      </Note>

      <H2 id="one">1. Sign one mandate</H2>
      <P>
        Open <a href="/console/setup">the console</a>, connect your wallet, and
        answer six questions: the budget and its window, the total for the life
        of the mandate, the most any single purchase may be, the share of a
        window any one seller may take, and how deep the tree may go.
      </P>
      <P>
        That signature creates the <b>root</b>. It cannot be edited afterwards —
        a mandate narrows, it never widens — so the figure you sign is the
        ceiling for everything below it, for good.
      </P>

      <H2 id="two">2. Fund the vault</H2>
      <P>
        Nothing can be drawn from an empty vault. On the tree screen, the root
        window tile carries the funding control. It asks for{" "}
        <b>two signatures</b>: one approving the vault to move your USDC, one
        moving it.
      </P>
      <P>
        The money sits in the vault, not in any agent. That is the difference
        between this and topping up an agent's wallet: the vault only lets go of
        it one purchase at a time, and only when the contract says so.
      </P>

      <H2 id="three">3. Give an agent a key</H2>
      <P>
        Every node has an <b>operator</b> — the address that signs on its
        behalf. It must not be your own wallet, and it is never the agent: it is
        a key held by a daemon process.
      </P>
      <Code lang="bash">{`# a key nobody has used, for one node
openssl rand -hex 32`}</Code>
      <P>
        Put the address in the <b>spawn</b> dialog, on the agents tile, and the
        key in the daemon's environment. The child is narrower than the parent
        on every axis, and the contract refuses a wider one whoever asks — you
        included.
      </P>

      <H2 id="four">4. Run the daemon</H2>
      <P>
        This is the process that holds keys. It reads the addresses from its
        environment and the keys from a file beside it, never from the repo.
      </P>
      <Code lang="bash">{`node --env-file=.env.live --env-file=~/.cordon/keys.env \\
  packages/daemon/src/main.ts`}</Code>
      <P>
        It prints the nodes it holds keys for, and it refuses to start
        misconfigured — a daemon that starts anyway is one that discovers a
        missing address halfway through a payment.
      </P>

      <H2 id="five">5. Point your agent at it</H2>
      <P>
        The config block, the proxy command, or the HTTP call — whichever suits
        what you are running. <Link to="/docs/integrate">Integrate with your
        agent</Link> has all three.
      </P>
      <P>Then ask it for something that costs money:</P>
      <Code>{`Fetch https://attest.getcordon.xyz/attest/894124 and tell me
what it says about that agent.`}</Code>
      <OL>
        <li>The seller answers with a challenge naming its price and its address.</li>
        <li>The daemon asks the vault for exactly that, for exactly that payee.</li>
        <li>The contract charges this node and every node above it, or refuses.</li>
        <li>The daemon signs the payment and the seller returns the body.</li>
      </OL>

      <H2 id="six">6. Watch it refuse</H2>
      <P>
        Ask for something larger than the per purchase cap, or keep going until
        the window is spent. The tool returns a refusal with the reason and the
        transaction that produced it. Open that transaction: the decision is on
        chain, made by a contract, not a message from our server.
      </P>
      <P>
        The console's refusals screen lists them. As the owner you can{" "}
        <b>release</b> one — a signature that pays that single purchase past the
        bound, with both the refusal and the release left side by side on the
        record — or <b>cut the branch</b>, which stops that node and everything
        under it from drawing again.
      </P>

      <H2 id="after">After that</H2>
      <Defs
        items={[
          {
            term: <Link to="/docs/draws-and-bounds">Draws and bounds</Link>,
            def: "What each of the five bounds actually checks, and in what order.",
          },
          {
            term: <Link to="/docs/refusals">Refusals, release, revocation</Link>,
            def: "The ways out, and what each one leaves behind.",
          },
          {
            term: <Link to="/docs/meter">Meter</Link>,
            def: "Reading the whole tree back out without trusting our server.",
          },
        ]}
      />
    </>
  );
}
