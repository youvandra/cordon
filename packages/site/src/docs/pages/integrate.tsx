import { Link } from "react-router-dom";
import { ATTEST, DEFAULT_CHAIN, DEPLOYMENT, MCP_CONFIG, REASONS, REASON_MEANING, formatUsdc } from "@cordon/fixtures";
import { C, Code, Defs, H2, H3, Lead, Note, OL, P, Table, UL } from "../parts";
import { DOC_GROUPS } from "../nav";

/**
 * How somebody else's agent gets behind the fence.
 *
 * Three ways in, in the order they cost effort: a config block for a client
 * that already speaks MCP, a command in front of a program nobody wants to
 * edit, and an HTTP call for everything else. The same daemon is underneath
 * all three, so the refusal is the same object in every one of them.
 */
/** What an owner can actually do about each reason, in the operator skill's
 *  words, so the docs and the agent that helps an owner give the same advice. */
const WAY_OUT: Record<string, string> = {
  "tranche-cap": "a new, wider mandate — or release this one purchase",
  "window-budget": "wait for the window to roll, or release this one purchase",
  "lifetime-cap": "a new mandate; this total does not come back",
  concentration: "usually the bound doing its job — say so rather than working round it",
  "vault-balance": "the owner funds the vault; every bound passed",
  revoked: "stop — this branch is cut and nothing under it will draw again",
};

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
        The block below goes in your client's config. The server is published
        as <C>cordon-mcp</C>, so there is nothing to clone for this part. It
        reads the key from the file <C>init</C> wrote, named in{" "}
        <C>CORDON_ENV_FILE</C>, so every key keeps one copy — in the file{" "}
        <C>init</C> guards, rather than a second one in a config people paste
        into issues. The contract addresses default to the deployment the
        package was built against.
      </P>
      <Code lang="json">{MCP_CONFIG}</Code>
      <Note tone="warn" title="An absolute path, not ~">
        An MCP client starts the server with no shell, so nothing expands{" "}
        <C>~</C> or <C>$HOME</C> in that block. Write the full path to the key
        file, and Node 22 or newer has to be on the client's <C>PATH</C> for{" "}
        <C>npx</C> to find.
      </Note>
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
      <Code>{`You can buy things. You cannot spend faster than the mandate your owner
signed.

The only spending tool takes a URL. There is no tool that sends money to an
address, and there will not be one. The price and the payee come from the
seller's own payment challenge — so choosing a URL is choosing who gets paid,
and what is bounded is how much and how fast, not who.

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
      <Code lang="bash">{`node packages/proxy/src/run.ts --node 0x7f3a… -- python my_agent.py`}</Code>
      <P>
        See <Link to="/docs/proxy">Proxy and cordon run</Link> for what it does
        with https and what the program receives when a purchase is refused.
      </P>

      <H2 id="http">3. Over HTTP</H2>
      <P>
        The daemon is the product; the other two surfaces forward to it. It
        serves three routes and, deliberately, not a fourth.
      </P>
      <Code lang="bash">{`curl -s localhost:8402/status

curl -s -X POST localhost:8402/fetch \\
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
        head={["Reason", "What it means", "The way out"]}
        rows={REASONS.filter((reason) => reason !== "none").map((reason) => [
          <C key={reason}>{reason}</C>,
          REASON_MEANING[reason] ?? reason,
          WAY_OUT[reason] ?? "report it to the owner; the bound is the owner's to move",
        ])}
      />
      <P>
        Three things never to do, and the reason is the same for all of them.{" "}
        <b>Retrying</b> gets the same answer and costs a transaction on this
        agent's record. <b>Splitting</b> a purchase into smaller ones to get under
        a cap, and <b>finding an unpriced mirror</b> of a paid resource, are the
        behaviour the cumulative bounds exist to catch — and both are recorded.
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
          ["Chain", `${DEFAULT_CHAIN.name} · ${DEFAULT_CHAIN.chainId}`],
          ["USDC, 6 decimals", <C key="usdc">{DEFAULT_CHAIN.erc20}</C>],
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
        From an empty wallet to an agent that has bought something and been
        refused something. The order matters, and the one step people miss is
        marked. Two steps cost a signature; the rest are yours to check.
      </Lead>

      <Note tone="info" title="What you need first">
        A wallet on Arc testnet holding test USDC from{" "}
        <a href="https://faucet.circle.com">faucet.circle.com</a> — it is both
        the gas and the money — Node 23.6 or newer, and a clone of the
        repository.
      </Note>

      <Note tone="warn" title="Keys before the mandate">
        A mandate names its operator when it is opened, and the operator cannot
        be changed afterwards. So the keys come first, and the mandate second.
      </Note>

      <H2 id="one">1. Make the operator keys</H2>
      <Code lang="bash">{`git clone https://github.com/youvandra/cordon.git && cd cordon
npm ci --prefix packages/daemon
npm run init --prefix packages/daemon -- --nodes 4`}</Code>
      <P>
        This writes <C>~/.cordon/cordon.env</C> at <C>0600</C> and prints{" "}
        <b>addresses only</b> — never a key. A second run refuses rather than
        overwrite a file whose keys may already operate a live mandate. It also
        prints a console link with the first address already filled in.
      </P>
      <P>
        Send a little gas to each address. An operator holding a tranche and no
        gas cannot send the draw that would earn it.
      </P>

      <H2 id="two">2. Sign one mandate</H2>
      <P>
        Open the link <C>init</C> printed, or{" "}
        <a href="/console/new">the console</a>, connect your wallet, and answer
        six questions: the budget and its window, the total for the life of the
        mandate, the most a single purchase may be, the share of a window any one
        seller may take, and how deep the tree may go. The operator is an
        address from step 1 — <b>not your own wallet</b>, and the form refuses
        it.
      </P>
      <P>
        That signature creates the <b>root</b>. It cannot be edited afterwards:
        a mandate narrows, it never widens.
      </P>
      <Note tone="good" title="Check">
        <C>GET https://getcordon.xyz/api/tree/&lt;root&gt;</C> returns your root.
      </Note>

      <H2 id="three">3. Fund the vault</H2>
      <P>
        On Overview, <b>Fund vault</b> in the top right opens the funding dialog.{" "}
        <b>Two signatures</b>: one approving the vault to move your USDC, one
        moving it. The money sits in the vault, not in any agent, and leaves one
        purchase at a time.
      </P>
      <Note tone="good" title="Check">
        <C>funded6</C> in <C>/api/tree/&lt;root&gt;</C> rose by exactly that.
      </Note>
      <P>
        <b>Withdraw</b>, beside it, takes money back out: owner-only, one
        signature, and always to the wallet that signs.
      </P>

      <H2 id="three-b">3b. Put each node id into the key file</H2>
      <Note tone="warn" title="The step people miss">
        The daemon will not start without it, and nothing earlier warns you.
      </Note>
      <P>
        <C>init --nodes 4</C> wrote four empty lines — <C>CORDON_NODE_ROOT=</C>,{" "}
        <C>CORDON_NODE_WORKER1=</C>, <C>CORDON_NODE_WORKER2=</C>,{" "}
        <C>CORDON_NODE_WORKER3=</C> — one per key, in the order it printed the
        addresses. Each needs the id of the mandate that label's address
        operates: <C>ROOT</C> now, a worker's after step 4.
      </P>
      <P>
        Those lines hold ids, never keys, so listing them is safe. Read no other
        line of that file.
      </P>
      <Code lang="bash">{`grep '^CORDON_NODE_' ~/.cordon/cordon.env

# macOS; on Linux drop the '' after -i
sed -i '' 's/^CORDON_NODE_ROOT=$/CORDON_NODE_ROOT=0x<node id>/' ~/.cordon/cordon.env

grep '^CORDON_NODE_ROOT=' ~/.cordon/cordon.env   # confirm it took`}</Code>
      <P>
        Always run the confirming <C>grep</C>. <C>sed</C> exits successfully when
        its pattern matches nothing, so a mistyped label changes nothing, prints
        nothing, and the daemon still refuses to start.
      </P>

      <H2 id="four">4. Spawn a child</H2>
      <P>
        <b>Spawn agent</b>, on Overview or Agents. Name a second address from step 1 and a share of the
        parent. The child is narrower than its parent on every axis, and the
        contract refuses a wider one whoever asks — you included. Then repeat
        step 3b for that worker's label. A grandchild comes from{" "}
        <b>Spawn under this agent</b> in that child's side panel on Agents.
      </P>
      <Note tone="info" title="A stated purpose needs the operator">
        A spawn signed from your wallet cannot carry a purpose — only the
        operator key holds the child's identity. <C>POST /spawn</C> with{" "}
        <C>purpose</C>, or <C>cordon_spawn</C>, can: one line, at most 140
        characters, written beside the key and on the child's ERC-8004
        identity. The daemon writes that key to <C>CORDON_KEY_FILE</C> before
        sending and fills the node id in itself, so step 3b is not needed. Send
        the new operator gas and restart the daemon, or the child has no name
        and its refusals are never published.
      </Note>

      <H2 id="five">5. Run the daemon</H2>
      <P>
        The only process that holds a key. Addresses go in one file and keys in
        another, so the file with keys in it is the only one that is ever{" "}
        <C>0600</C>.
      </P>
      <Code lang="bash">{`cat > packages/daemon/.env.live <<'ENV'
CORDON_VAULT=<TreeVault address>
CORDON_REGISTRY=<MandateRegistry address>
CORDON_RECORD=<ConductRecord address>
CORDON_RPC=https://rpc.testnet.arc.io
CORDON_PORT=8402
ENV

node --env-file=packages/daemon/.env.live \\
     --env-file="$HOME/.cordon/cordon.env" \\
     packages/daemon/src/main.ts`}</Code>
      <P>
        The addresses are on <Link to="/docs/contracts">Contracts</Link>. It
        refuses to start misconfigured — a daemon that starts anyway discovers a
        missing value halfway through a payment.
      </P>
      <Note tone="warn" title="Started is not the same as able to draw">
        The daemon starts happily with a node id filed under a key that is not
        that node's operator; the failure only arrives at the first purchase.
        Compare each node's operator against the address <C>init</C> printed for
        its label.
      </Note>
      <Code lang="bash">{`curl -s localhost:8402/status | python3 -c "
import json,sys
for n in json.load(sys.stdin)['nodes']:
    print(n['node'][:12], 'operator', n['mandate']['operator'])"`}</Code>

      <H2 id="six">6. Point your agent at it</H2>
      <P>
        The MCP config block, the proxy entry point, or a plain HTTP call —{" "}
        <Link to="/docs/integrate">Integrate with your agent</Link> has all
        three. Where the key file holds several nodes, <C>CORDON_MCP_NODE</C>{" "}
        names which one an MCP server speaks for.
      </P>

      <H2 id="seven">7. Buy something</H2>
      <P>Cordon sells a reading for a cent, so there is always something priced:</P>
      <Code lang="bash">{`curl -s -X POST localhost:8402/fetch \\
  -H 'content-type: application/json' \\
  -d '{"node":"0x…","url":"https://attest.getcordon.xyz/attest/894124"}'`}</Code>
      <OL>
        <li>The seller answers with a challenge naming its own price and address.</li>
        <li>The daemon asks the vault for exactly that, for exactly that payee.</li>
        <li>The contract charges this node and every node above it, or refuses.</li>
        <li>The daemon signs the payment and the seller returns the body.</li>
      </OL>
      <Note tone="good" title="Check">
        <C>paid: true</C> with the body, and the draw transaction on arcscan.
      </Note>

      <H2 id="eight">8. Watch it refuse</H2>
      <P>
        Ask from a node whose per-purchase cap is below the price, or keep going
        until the window is spent. It comes back <C>paid: false</C> with the
        reason and the transaction — and like a purchase, it is HTTP 200: a
        refusal is an answer, not a failure for a retry loop to hammer.
      </P>
      <Note tone="good" title="Check">
        <C>https://getcordon.xyz/refusal/&lt;id&gt;</C> shows the decision and
        the record it was published under.
      </Note>

      <H2 id="nine">9. Decide what to do about it</H2>
      <P>
        Both are yours. <b>Release</b> one refusal from the console — a
        signature that moves the refused amount to the operator. Ask for the
        same purchase again and the daemon pays it from the release with no new
        draw, once; the refusal and the release stay side by side on the record. Or <b>cut the
        branch</b>, after which that node and everything under it draws nothing.
      </P>

      <H2 id="replace">Replacing a mandate</H2>
      <P>
        A mandate never widens, so a wider one is a new one. In this order:
      </P>
      <OL>
        <li>Revoke the root. With two live roots, Overview shows only the first.</li>
        <li>
          <b>Withdraw</b> the treasury. <C>TreeVault.withdraw</C> asks who owns
          the root, not whether it is live, so a cut root still pays out — and
          its side panel on Agents keeps the button.
        </li>
        <li>
          Make fresh operator keys in a second file, and point{" "}
          <C>CORDON_KEY_FILE</C> at it:{" "}
          <C>npm run init --prefix packages/daemon -- --nodes 4 --out "$HOME/.cordon/cordon-2.env"</C>
        </li>
        <li>
          Open the new one at <a href="/console/new">/console/new</a> — a revoked
          root's Overview links there — and fund it.
        </li>
      </OL>

      <H2 id="after">After that</H2>
      <Defs
        items={[
          {
            term: <Link to="/docs/troubleshooting">Troubleshooting</Link>,
            def: "The errors this walk produces when a step is skipped, quoted as they arrive.",
          },
          {
            term: <Link to="/docs/draws-and-bounds">Draws and bounds</Link>,
            def: "What each of the five bounds checks, and in what order.",
          },
          {
            term: <Link to="/docs/refusals">Refusals, release, revocation</Link>,
            def: "The ways out, and what each one leaves behind.",
          },
        ]}
      />
    </>
  );
}

/**
 * The front of the documentation.
 *
 * Every page in the contents carries a one line summary, and until now there
 * was nowhere those were read: `/docs` redirected straight into the
 * introduction, so twenty-one sentences were written for a screen that did not
 * exist. This is that screen — the shape of the whole thing, before a reader
 * has to guess which group holds the answer they came for.
 */
export function DocsIndex() {
  return (
    <>
      <Lead>
        Cordon gives a tree of agents one budget and enforces it in a contract.
        These are the pages, in reading order.
      </Lead>

      {DOC_GROUPS.map((group) => (
        <div key={group.title}>
          <H2 id={group.title.toLowerCase().replace(/[^a-z]+/g, "-")}>{group.title}</H2>
          <Defs
            items={group.pages.map((page) => ({
              term: <Link to={`/docs/${page.slug}`}>{page.title}</Link>,
              def: page.summary,
            }))}
          />
        </div>
      ))}

      <Note tone="info" title="In a hurry">
        <Link to="/docs/walkthrough">Step by step</Link> is the whole thing
        once, in order.{" "}
        <Link to="/docs/integrate">Integrate with your agent</Link> is the part
        you paste into a config.
      </Note>
    </>
  );
}
