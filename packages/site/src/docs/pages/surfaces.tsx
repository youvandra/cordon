import { Link } from "react-router-dom";
import { ABSENT_TOOLS, MCP_CONFIG, MCP_TOOLS } from "@cordon/fixtures";
import { C, Code, H2, Lead, Note, P, Table, UL } from "../parts";

export function Mcp() {
  return (
    <>
      <Lead>
        The MCP server puts Cordon inside a client the reader already runs. It
        holds the key, exposes three tools, and forwards everything to the
        daemon.
      </Lead>

      <H2 id="install">Install</H2>
      <Code lang="json">{MCP_CONFIG}</Code>
      <P>
        Every variable in that block is one the daemon actually reads. See{" "}
        <Link to="/docs/configuration">Configuration</Link> for the full list.
      </P>

      <H2 id="tools">Tools</H2>
      <Table
        head={["Tool", "Takes", "Does"]}
        rows={MCP_TOOLS.map((tool) => [
          <C key={tool.name}>{tool.name}</C>,
          <span key={`${tool.name}-args`} className="mono">
            {tool.args}
          </span>,
          tool.note,
        ])}
      />

      <H2 id="the-missing-tool">The tool that is missing</H2>
      <P>
        The list above is part of the fence rather than a matter of
        convenience. An agent can say “fetch this URL”. It has no way to say
        “send money to this address”, because nothing it can call takes one.
      </P>
      <Code>{ABSENT_TOOLS.map((name) => `${name}  does not exist, and will not`).join("\n")}</Code>
      <Note tone="warn" title="This is asserted, not promised">
        The test suite asks a running server for its tool list and fails if any
        of those names appears. The moment a general transfer tool exists, the
        claim leaks.
      </Note>

      <H2 id="what-a-refusal-looks-like">What a refusal looks like</H2>
      <P>
        A refusal comes back as a normal result, not an error. The model asked a
        valid question and the answer is no, with the reason and the record
        attached, so it can tell the user rather than retrying blindly.
      </P>
      <Code lang="json">{`{
  "refused": true,
  "reason": "window-budget",
  "breachedAt": "0x7f3a…",
  "note": "the limit is an ancestor's, not this node's",
  "transaction": "0x9c21…"
}`}</Code>
    </>
  );
}

export function Proxy() {
  return (
    <>
      <Lead>
        Some agent runtimes cannot be changed. They still make HTTP requests,
        and every HTTP client in every language has read <C>HTTP_PROXY</C> for
        thirty years. That is the whole integration.
      </Lead>

      <H2 id="cordon-run">cordon run</H2>
      <Code lang="bash">{`cordon run --node 0x7f3a… -- python my_agent.py`}</Code>
      <P>
        This starts a proxy, hands one child process the environment that points
        at it, and takes both away when the child exits. The program is
        unmodified and unaware. Its exit code is passed straight through.
      </P>

      <H2 id="what-it-adds">What it adds, and what it does not</H2>
      <Note tone="warn" title="The proxy is not the bound">
        The bound is the contract, and the reason an agent cannot step around it
        is that it holds no key. A program that ignores <C>HTTP_PROXY</C>{" "}
        entirely still cannot pay anybody. What the proxy adds is the ability to
        succeed inside the bound: without it, an unmodified program meets a
        payment challenge it can do nothing with.
      </Note>

      <H2 id="responses">What comes back</H2>
      <Table
        head={["Situation", "Response"]}
        rows={[
          ["The seller wanted nothing", "the seller's own response, untouched"],
          ["The seller was paid", <>the response, plus <C>cordon-paid</C> and <C>cordon-transaction</C></>],
          ["The contract refused", <>402, with <C>cordon-refusal</C> and the refusal in the body</>],
          ["No daemon behind the proxy", "502. Nothing was bought and nothing is pretended"],
        ]}
      />
      <P>
        402 is the literal truth of a refusal: the seller asked to be paid and
        nobody paid. A program that handles payment required at all handles this
        without knowing Cordon exists.
      </P>

      <H2 id="https">https</H2>
      <P>
        Every seller worth buying from is on https, and a proxy that only
        tunnels sees ciphertext. So <C>cordon run</C> terminates TLS using a
        certificate authority it makes for that one run.
      </P>
      <UL>
        <li>
          Created into a private temporary directory, and deleted with the run.
        </li>
        <li>
          Never installed into a system or browser trust store. One child
          process trusts it, through environment variables, while it is alive.
        </li>
        <li>
          Trusted by nobody else. A certificate it signs is rejected by every
          other client on the machine, and there is a test for that.
        </li>
      </UL>
      <P>
        Started on its own, the proxy serves plaintext and refuses{" "}
        <C>CONNECT</C> rather than tunnelling it. Terminating someone's TLS is
        not something a process should begin doing because it was launched with
        no arguments.
      </P>

      <H2 id="standalone">Running it standalone</H2>
      <Code lang="bash">{`CORDON_NODE=0x7f3a… \\
CORDON_DAEMON=http://127.0.0.1:8402 \\
CORDON_CA=1 \\
  node src/main.ts`}</Code>
    </>
  );
}

export function Daemon() {
  return (
    <>
      <Lead>
        The daemon is the product. It holds the keys, checks the bounds on
        chain, signs the payments and publishes the refusals. The MCP server and
        the proxy are thin surfaces in front of it and hold no logic of their
        own.
      </Lead>

      <H2 id="endpoints">Endpoints</H2>
      <Table
        head={["Route", "Body", "Answers"]}
        rows={[
          [<C key="s">GET /status</C>, "", "every node this daemon can act for, with its headroom"],
          [<C key="f">POST /fetch</C>, <span key="fb" className="mono">{`{ node, url, method?, headers?, body? }`}</span>, "the seller's response, or a refusal"],
          [<C key="p">POST /spawn</C>, <span key="pb" className="mono">{`{ node, operator, budget6, trancheCap6, concentrationBps }`}</span>, "the child mandate the registry created"],
        ]}
      />
      <Note tone="warn" title="There is no transfer endpoint">
        And there will not be one. The recipient comes from the seller's own
        challenge and the amount comes from the seller's own price. A general
        transfer endpoint would leak the whole claim.
      </Note>

      <H2 id="refusals-are-200">A refusal is a 200</H2>
      <P>
        On <C>/fetch</C>, a refusal comes back with status 200 and a refusal in
        the body. The caller asked a valid question and got a real answer. HTTP
        errors are reserved for things that actually went wrong.
      </P>

      <H2 id="publishing">Publishing</H2>
      <P>
        When a draw is refused, the daemon writes it to the record immediately,
        with no filter. There is no “only report repeated breaches” and no
        severity: a daemon that chose which refusals were worth reporting would
        be writing an opinion.
      </P>
      <P>
        This happens after the fact and cannot fail loudly. The bound is already
        enforced and the refusal is already on chain, so a seat that is
        unreachable or absent costs the record its completeness and costs the
        enforcement nothing. Without <C>CORDON_RECORD</C> set, the daemon says
        so at startup.
      </P>

      <H2 id="starting">Starting it</H2>
      <Code lang="bash">{`CORDON_VAULT=0x… \\
CORDON_REGISTRY=0x… \\
CORDON_NODE_ME=0x… \\
CORDON_KEY_ME=0x… \\
  node src/main.ts`}</Code>
      <P>
        A misconfigured daemon refuses to start. It holds a key, so discovering
        a missing address halfway through a payment is not an option.
      </P>
    </>
  );
}

export function Meter() {
  return (
    <>
      <Lead>
        The meter folds Arc's events into the shape the record pages render. It
        is a cache in the strict sense: delete it, replay from block zero, and
        the same ledger comes back.
      </Lead>

      <H2 id="running-it">Running it</H2>
      <Code lang="bash">{`node src/main.ts --chain 5042002 --from 0     # index, then serve
node src/main.ts --once --out ledger.json     # index and exit`}</Code>
      <P>
        Addresses are never arguments. They come from the deployment file the
        deploy script wrote from the broadcast, because a meter pointed at a
        mistyped address produces a ledger that looks right and is about another
        tree.
      </P>

      <H2 id="read-api">Read API</H2>
      <Table
        head={["Route", "Answers"]}
        rows={[
          [<C key="h">GET /health</C>, "the block range covered, and what is in it"],
          [<C key="t">GET /tree/:root</C>, "every node under one root, with its counters"],
          [<C key="n">GET /node/:node</C>, "one node's conduct and its refusals"],
          [<C key="a">GET /agent/:agentId</C>, "the same, addressed by ERC-8004 identity"],
          [<C key="r">GET /refusal/:id</C>, "one refusal and the transaction it happened in"],
        ]}
      />
      <P>
        Read only, and the process holds no key. Every response carries the
        range it covers, because an indexer that does not say how far behind it
        is invites a reader to assume it is current.
      </P>

      <H2 id="what-it-counts">What it counts</H2>
      <Table
        head={["Figure", "From"]}
        rows={[
          ["draws, drawn", "Drawn, per node"],
          ["refusals", "Refused, against the node that asked"],
          ["breaches", "Refused, against the node whose bound stopped it"],
          ["debited", "AncestorDebited, per ancestor"],
          ["counterparties", "Drawn, by declared recipient"],
          ["released", "Released, counted apart from purchases"],
        ]}
      />
      <Note tone="info" title="No scores here">
        A number that is not in an event and not enforced by a contract has no
        business in a ledger a page renders. The live bounds are read from the
        vault rather than recomputed, because a window figure and an all time
        total look alike and only one of them refuses anything.
      </Note>

      <H2 id="reconciliation">Reconciliation</H2>
      <P>
        One thing is checkable from chain state alone: an agent's payment
        balance must never exceed what the vault released to it. Below is
        ordinary, it means the agent bought something. Above means money reached
        that agent from outside the tree.
      </P>
      <P>
        Matching each declared recipient against the seller actually paid needs
        an API we have not confirmed a buyer can read, so it reports{" "}
        <C>unavailable</C> rather than approximating. A reconciliation that
        quietly compares nothing always passes.
      </P>
    </>
  );
}
