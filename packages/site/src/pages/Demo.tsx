import { Link } from "react-router-dom";
import {
  Container,
  Headline,
  Surface,
  Tag,
  Text,
  usePageMeta,
  useNoIndex,
} from "cordon-ui";
import { DEFAULT_CHAIN, DEMOS, MANDATE, formatUsdc, shortId } from "@cordon/fixtures";
import { RecordShell } from "../parts/RecordShell";
import { useLiveTree, type LiveNode, type LiveTree } from "../parts/meter";

/**
 * /demo — the run of show, for the phone in the presenter's hand.
 *
 * Not a page for the audience. It carries the line to say and the screen to
 * open, which is backstage, so it is `noindex` and nothing links to it: a
 * reader arrives because the presenter typed the path.
 *
 * The reason it is a route here rather than a note somewhere is the pre-flight
 * block. A runbook that states the tree's condition from memory is a runbook
 * that goes stale the first time a rehearsal spends something, and the failure
 * lands on stage — beat 5 cuts a branch that a rehearsal already cut, and
 * nothing happens in front of the judges. This one asks the meter, on load.
 */

const DEMO = DEMOS[DEFAULT_CHAIN.chainId]!;

/**
 * The live node furthest from the root — the one beat 4 is about.
 *
 * Revoked nodes are skipped: a cut branch draws nothing for a reason that has
 * nothing to do with an ancestor's window, so pointing the beat at one would
 * demonstrate the wrong thing with the right number.
 */
function deepest(tree: LiveTree | null): LiveNode | null {
  if (!tree) return null;
  const live = tree.nodes.filter((node) => !node.revoked);
  if (live.length === 0) return null;
  return live.reduce((best, node) => (node.depth > best.depth ? node : best));
}

interface Beat {
  n: number;
  id: string;
  title: string;
  /**
   * The one sentence. Everything else on a beat supports saying this.
   *
   * A function where the sentence quotes a figure. The figure has to be the
   * tree's current one: a line that says "three dollars" to a room looking at
   * a screen that says four is the presenter contradicting their own demo, and
   * these are testnet trees that get respawned. Without a meter it falls back
   * to a phrasing that quotes nothing.
   */
  say: string | ((tree: LiveTree | null) => string);
  /** What the hand does while the mouth says it. */
  act: string;
  /** What the room should be looking at when it lands. */
  shows: string | ((tree: LiveTree | null) => string);
  /** Shown as it appears on screen rather than described. Set in mono,
   *  because a JSON body set as prose is a JSON body a reader skims. */
  snippet?: string;
  /** Where it is, as a path this page can link to. */
  open?: { label: string; to: string };
  /** What to do when the beat does not land. Every beat has one, because a
   *  demo without an exit is a demo that stops. */
  ifItFails: string;
  /** Beats that need nobody to sell anything. Marked, because the marketplace
   *  seller is not published and these are what survive without it. */
  sellerFree: boolean;
}

/**
 * Five beats, in the order they build.
 *
 * The argument is cumulative: a name that points rather than states, the bound
 * it points at, the refusal that bound produces, the one bound no wallet can
 * express, and the cut that ends it. Dropping a beat costs the one after it,
 * except beat 2, which folds into beat 1 when the clock is short.
 */
const BEATS: Beat[] = [
  {
    n: 1,
    id: "name",
    title: "A name that points, never states",
    say: "This agent has a name. Ask the name what it may spend and it will not tell you — it points at the contract that decides.",
    act: "Console → Resolve. Paste the agent's name.",
    shows:
      "Three records and no figure among them: cordon.node, cordon.registry, cordon.chain. Then the bound itself, read from the registry the records name.",
    open: { label: "Open Resolve", to: "/console/resolve" },
    ifItFails:
      "The resolver is one RPC away from the room's wifi. Read the records off this page instead and go straight to beat 2 — the point is that they are a pointer, not that they loaded fast.",
    sellerFree: true,
  },
  {
    n: 2,
    id: "bound",
    title: "The bound is the contract's",
    say: "A cap copied into a text record is a copy, and a copy drifts. The mandate can narrow a minute from now while the record still quotes the old number to a seller deciding whether to serve.",
    act: "Stay on Resolve. Point at the figures under the records.",
    /* The window and the lifetime cap come off the live root where there is
       one. The tranche cap, the concentration bound and the depth limit are
       the vault's own constants and the same for every tree, so they stay
       fixtures. */
    shows: (tree) => {
      const root = tree?.nodes.find((node) => node.parent === null);
      const budget6 = root ? BigInt(root.budget6) : MANDATE.budget6;
      const lifetime6 = root ? BigInt(root.lifetimeCap6) : MANDATE.lifetimeCap6;
      return `${formatUsdc(budget6, 0)} a window, ${formatUsdc(lifetime6, 0)} for the life of it, ${formatUsdc(MANDATE.tranche6, 0)} the most one purchase may be, ${MANDATE.concentrationBoundPct}% the most any one seller may take, ${MANDATE.maxDepth} deep.`;
    },
    ifItFails:
      "Fold it into beat 1 and keep moving. This beat is the sentence, not the screen.",
    sellerFree: true,
  },
  {
    n: 3,
    id: "refusal",
    title: "A refusal is a transaction",
    say: "It did not fail. It was refused, by name, and the refusal is on chain with the transaction that holds it.",
    act: "Ask the agent for a purchase above the tranche cap. Read the daemon's answer aloud.",
    shows:
      "The daemon's answer, and then the refusal page it points at — which names the record it was published under in a registry nobody here controls.",
    snippet:
      '{ "paid": false, "refusal": { "reason": "tranche-cap",\n    "refusalId": "…", "txHash": "0x…" } }',
    /* The agent's record rather than `/refusal/<id>`. A refusal id written
       down here is an id from the tree that existed when it was written, and
       these trees get respawned — the record page lists whatever refusals the
       node actually has, including the one just made. */
    open: { label: "The agent's record", to: `/agent/${DEMO.agentId}` },
    ifItFails:
      "Open an existing refusal instead and say it was made earlier. The claim is that refusals carry their transaction — 98.7 to 100% of the registry's feedback carries none — and a refusal from this morning proves it as well as one from this minute.",
    sellerFree: false,
  },
  {
    n: 4,
    id: "ancestor",
    title: "The bound no wallet can express",
    say: (tree) => {
      const grandchild = deepest(tree);
      return grandchild
        ? `This grandchild has ${formatUsdc(BigInt(grandchild.budget6), 0)} of its own window untouched. Ask what it may actually draw.`
        : "This grandchild has its own window untouched. Ask what it may actually draw.";
    },
    act: "TreeVault.headroom(node) — the console shows it per node, and it returns the node that bound it.",
    shows:
      "Zero, and an ancestor's id beside it. The root is spent, so nothing beneath it draws, however much room a child's own window has left. Give every agent its own wallet and there is no way to write that down.",
    open: { label: "Agents", to: "/console/agents" },
    ifItFails:
      "Nothing to fail. No seller serves, no money moves, no transaction is sent — it is a view function. If the console is down, this is the beat to run from a terminal.",
    sellerFree: true,
  },
  {
    n: 5,
    id: "cut",
    title: "Cut the branch",
    say: "One signature, from the owner's own wallet, and that node and everything under it draws nothing. Revoked is checked first, before any bound.",
    act: "Console → Agents → the node → Revoke. One signature.",
    shows:
      "The branch goes dead in the tree, and the next draw beneath it is refused with reason `revoked` rather than with a bound.",
    open: { label: "Agents", to: "/console/agents" },
    ifItFails:
      "If the wallet will not connect, say the sentence and show a revoked node from an earlier run. Do not spend the last minutes fighting a wallet in front of a room.",
    sellerFree: true,
  },
];

export default function Demo() {
  usePageMeta({
    title: "Run of show · Cordon",
    description: "The demo, beat by beat, with the tree's condition read from the meter.",
  });
  /* Backstage. It carries the lines to say, which is not something to hand a
     search engine. */
  useNoIndex(true);

  const tree = useLiveTree(DEMO.root);

  return (
    <RecordShell>
      <Container width="wide" className="stackpage">
        <header className="public__head">
          <Text variant="micro" tone="dim" as="p" className="eyebrow">
            backstage · run of show
          </Text>
          <Headline lines={["Five beats,", "in the order they build."]} />
          <Text variant="lead" tone="copy" as="p" className="public__lede">
            The line to say, the screen to open, and what to do when a beat does
            not land. The block below reads the tree as it stands right now, so
            a rehearsal that spent something shows up here rather than on stage.
          </Text>
          <Text variant="micro" tone="dim" as="p">
            {DEFAULT_CHAIN.name} {DEFAULT_CHAIN.chainId} · root{" "}
            <span className="mono">{shortId(DEMO.root)}</span> · agent{" "}
            <Link to={`/agent/${DEMO.agentId}`}>{DEMO.agentId}</Link>
          </Text>
        </header>

        <Preflight tree={tree} />

        <ol className="beats">
          {BEATS.map((beat) => (
            <Beat key={beat.id} beat={beat} tree={tree.state === "live" ? tree.data : null} />
          ))}
        </ol>

        <Surface radius="5" elevation="tile" className="runbook__note">
          <Text variant="micro" tone="dim" as="p" className="eyebrow">
            if the clock runs out
          </Text>
          <Text as="p" tone="copy">
            Drop beat 2 into beat 1, and drop beat 5. Beats 1, 3 and 4 are the
            argument: a name that points at a contract, a refusal that is a
            transaction, and a bound that no per-agent wallet can express.
          </Text>
          <Text as="p" tone="copy">
            <b>If no seller will serve</b>, beat 3 is the one that goes. Every
            other beat is marked <Tag tone="positive">no seller needed</Tag>{" "}
            below and runs against the chain alone — beat 4 is a view function
            and sends no transaction at all.
          </Text>
        </Surface>
      </Container>
    </RecordShell>
  );
}

/* -------------------------------------------------------------------------- */

/** A line that may be written against the tree as it stands. */
function line(value: string | ((tree: LiveTree | null) => string), tree: LiveTree | null): string {
  return typeof value === "function" ? value(tree) : value;
}

function Beat({ beat, tree }: { beat: Beat; tree: LiveTree | null }) {
  return (
    <li className="beat" id={beat.id}>
      <div className="beat__head">
        <span className="beat__n mono">{beat.n}</span>
        <h2 className="beat__title">{beat.title}</h2>
        {beat.sellerFree ? <Tag tone="positive">no seller needed</Tag> : null}
      </div>

      <blockquote className="beat__say">{line(beat.say, tree)}</blockquote>

      <dl className="kv kv--rows">
        <div>
          <dt>Do</dt>
          <dd>{beat.act}</dd>
        </div>
        <div>
          <dt>On screen</dt>
          <dd>
            {line(beat.shows, tree)}
            {beat.snippet ? <pre className="code beat__snippet mono">{beat.snippet}</pre> : null}
          </dd>
        </div>
        <div>
          <dt>If it fails</dt>
          <dd>{beat.ifItFails}</dd>
        </div>
      </dl>

      {beat.open ? (
        <Link className="beat__open" to={beat.open.to}>
          {beat.open.label} →
        </Link>
      ) : null}
    </li>
  );
}

/* -------------------------------------------------------------------------- */

interface Check {
  label: string;
  value: string;
  /** What the presenter should conclude. `false` is not an error — it is a
   *  thing to look at before walking on. */
  ready: boolean;
  note?: string;
}

/**
 * What is behind the tree, summed from the events the meter read.
 *
 * `TreeVault.treasury6` moves on exactly four things — funded in, withdrawn
 * out, drawn out, released out — and none of them involve a clock, so this is
 * a running total and not a second implementation of the window arithmetic the
 * contract owns. That distinction is why `meter.ts` computes no headroom and
 * this computes a balance: headroom rolls, a balance does not.
 *
 * It is still only as true as the range the meter read, which is why the range
 * is printed beside it rather than left for the reader to assume.
 */
function behind(tree: LiveTree): bigint {
  const out = tree.nodes.reduce(
    (total, node) => total + BigInt(node.drawn6) + BigInt(node.releasedTo6),
    0n,
  );
  return BigInt(tree.funded6) - BigInt(tree.withdrawn6) - out;
}

function checks(tree: LiveTree): Check[] {
  const revoked = tree.nodes.filter((node) => node.revoked);
  const refusals = tree.nodes.reduce((total, node) => total + node.refusals, 0);
  const draws = tree.nodes.reduce((total, node) => total + node.draws, 0);
  const depth = tree.nodes.reduce((deepest, node) => Math.max(deepest, node.depth), 0);
  const money = behind(tree);

  return [
    {
      label: "Behind the tree",
      value: formatUsdc(money),
      /* A demo whose treasury is empty refuses everything for `vault-balance`,
         which is the one reason that is true and says nothing about a bound. */
      ready: money > 0n,
      note:
        money > 0n
          ? "Summed from the meter's range, not read from treasury6."
          : "Empty. Every draw will be refused `vault-balance`, which proves nothing about a bound — fund the vault before you go on.",
    },
    {
      label: "Nodes",
      value: `${tree.total}${tree.truncated ? " (page capped)" : ""} · ${depth + 1} levels`,
      /* Three levels, not two. Beat 4 is about a bound an agent's parent did
         not set, so it needs a grandchild — a root and one child demonstrates
         a parent debiting its own child, which is the thing a shared wallet
         can already do. */
      ready: depth >= 2 && !tree.truncated,
      note:
        depth >= 2
          ? undefined
          : "Beat 4 needs a child of a child. With two levels the demo shows a parent bounding its own child, which a shared wallet can already do.",
    },
    {
      label: "Branch cut already",
      value: revoked.length === 0 ? "none" : `${revoked.length} · ${revoked.map((n) => shortId(n.node, 8, 4)).join(", ")}`,
      /* The check that earns this block. A rehearsal that ran beat 5 leaves
         nothing for beat 5 to cut, and that is invisible until it is on
         stage. */
      ready: revoked.length === 0,
      note:
        revoked.length === 0
          ? undefined
          : "A rehearsal cut this. Beat 5 needs a live branch — spawn one, or pick a node that is still live.",
    },
    {
      label: "Refusals on record",
      value: String(refusals),
      ready: true,
      note: refusals === 0 ? "None yet. Beat 3 will write the first one." : undefined,
    },
    { label: "Draws settled", value: String(draws), ready: true },
    {
      label: "Meter read to block",
      value: tree.toBlock,
      ready: true,
      note: `chain ${tree.chainId} · from ${tree.fromBlock}`,
    },
  ];
}

function Preflight({ tree }: { tree: ReturnType<typeof useLiveTree> }) {
  return (
    <Surface radius="5" elevation="tile" className="preflight">
      <Text variant="micro" tone="dim" as="p" className="eyebrow">
        pre-flight · read on load
      </Text>

      {tree.state === "loading" ? (
        <Text as="p" tone="dim">
          Asking the meter…
        </Text>
      ) : null}

      {/* Three ways to have no figures, and they are different facts. A page
          that drew the same "—" for all three would let a presenter walk on
          believing the tree was checked. */}
      {tree.state === "unconfigured" ? (
        <Text as="p" tone="copy">
          No meter is configured for this build, so nothing here was checked.
          Read the tree in the <Link to="/console/agents">console</Link> before
          you go on.
        </Text>
      ) : null}

      {tree.state === "missing" ? (
        <Text as="p" tone="copy">
          The meter did not answer for this root. That is the meter, not the
          chain — the contracts are unaffected and every beat still runs. Check
          the tree in the <Link to="/console/agents">console</Link> instead.
        </Text>
      ) : null}

      {tree.state === "live" ? (
        <dl className="kv kv--rows preflight__rows">
          {checks(tree.data).map((check) => (
            <div key={check.label}>
              <dt>{check.label}</dt>
              <dd>
                <span className="preflight__value">{check.value}</span>
                {check.ready ? null : <Tag tone="caution">look at this</Tag>}
                {check.note ? (
                  <Text variant="micro" tone="dim" as="span" className="preflight__note">
                    {check.note}
                  </Text>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </Surface>
  );
}
