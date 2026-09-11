import { useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Modal,
  Skeleton,
  Stack,
  Tag,
  Text,
  useNotify,
} from "cordon-ui";
import { DEMO, formatUsdc } from "@cordon/fixtures";
import {
  REFUSALS,
  refusalOrdinal,
  shortTx,
  txUrl,
  type Refusal,
} from "@cordon/fixtures/preview";
import { site } from "../lib/links";
import { ScreenHead } from "../parts/Preview";
import { useTitle } from "../parts/Shell";
import { useWallet } from "../lib/wallet";
import { useChainTree } from "../lib/tree";
import { useChainRefusals, type ChainRefusal } from "../lib/refusals";
import { useRelease } from "../lib/mandate";
import { ARC, REASON_MEANING } from "@cordon/fixtures";

/**
 * One card, one decision.
 *
 * The card used to carry four labelled fields, a timestamp, a contract
 * function and three buttons in a row, and the actual question, which is
 * whether to release money past a bound, sat in the middle of all of it. What
 * is left is the shape of the decision: who wanted paying and how much, at the
 * top; what stopped it, in the middle; and the two buttons at the bottom right
 * where a hand already is.
 */
function RefusalCard({ refusal }: { refusal: Refusal }) {
  const [released, setReleased] = useState(refusal.released);
  /* Releasing is the one thing in this console that moves money past a bound
     somebody already signed. It is a decision, it is permanent, and it is
     recorded next to the refusal it stepped around — so it is asked for
     twice. */
  const [confirming, setConfirming] = useState(false);
  const notify = useNotify();

  const release = () => {
    setConfirming(false);
    setReleased(true);
    notify({
      tone: "caution",
      title: `Refusal ${refusalOrdinal(refusal)} released`,
      children:
        "The bound did not move. The refusal and the release are both on the record, side by side.",
      duration: 8000,
    });
  };
  const short = `${refusal.counterparty.slice(0, 6)}…${refusal.counterparty.slice(-4)}`;

  return (
    <Card className="refusal">
      <CardHeader>
        <div className="refusal__top">
          <div>
            <span className="refusal__node">{refusal.nodeLabel}</span>
            <span className="refusal__bound">stopped by {refusal.boundLabel}</span>
          </div>
          <a
            className="refusal__party"
            href={txUrl(refusal.tx)}
            target="_blank"
            rel="noreferrer"
            title={refusal.counterparty}
          >
            <span className="mono">{short}</span>
            <span className="refusal__tx mono">{shortTx(refusal.tx)}</span>
          </a>
        </div>
      </CardHeader>

      <CardBody>
        {/* One comparison, because that is the whole decision: what was asked
            for, against what there was room for. */}
        <div className="ask">
          <div className="ask__side">
            <span className="ask__label">wanted</span>
            <span className="ask__value num">{formatUsdc(refusal.requested6)}</span>
          </div>
          <span className="ask__vs" aria-hidden="true">
            against
          </span>
          <div className="ask__side">
            <span className="ask__label">room left</span>
            <span className="ask__value ask__value--short num">{formatUsdc(refusal.headroom6)}</span>
          </div>
        </div>
      </CardBody>

      <CardFooter>
        <div className="refusal__foot">
          {/* The status, and where anybody else reads it. `RECORD_BASE` is
              compiled into the contract, so every refusal in the reputation
              registry already points at this page; the owner is the one
              person who could not reach it, which made the console the only
              view of a refusal that did not know its public address. */}
          <Stack direction="row" gap="sm" align="center">
            {released ? (
              <Tag tone="positive" size="sm" dot>
                released by you
              </Tag>
            ) : (
              <Tag tone="critical" size="sm" dot>
                refused
              </Tag>
            )}
            <a className="refusal__record" href={site(`/refusal/${refusalOrdinal(refusal)}`)}>
              what a seller sees
            </a>
          </Stack>

          {/* Weight follows consequence. Leaving it refused costs nothing and
              is the safe answer, so it is the quiet button; releasing spends
              past a bound you signed, so it carries the colour. */}
          <Stack direction="row" gap="sm" align="center">
            <Button size="sm" variant="secondary" disabled={released}>
              Leave it
            </Button>
            <Button size="sm" variant="danger" disabled={released} onClick={() => setConfirming(true)}>
              Sign to release
            </Button>
          </Stack>
        </div>
      </CardFooter>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Release ${formatUsdc(refusal.requested6)} past this bound?`}
        description="This does not raise the bound. The same purchase is refused again a second later, and both the refusal and your release stay on the record."
        hideClose
        dismissOnScrim={false}
        footer={
          <Stack direction="row" gap="sm">
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Leave it refused
            </Button>
            <Button variant="danger" onClick={release}>
              Sign the release
            </Button>
          </Stack>
        }
      >
        <Text variant="body" tone="copy" as="p">
          Paid to <span className="mono">{short}</span>, from your own key.
          Nobody else can sign this — not us, not the deployer, and no admin
          key, because there is none.
        </Text>
      </Modal>
    </Card>
  );
}


/**
 * A refusal the contract actually wrote, and the decision it leaves open.
 *
 * Releasing is a transaction from the owner's own key, and it is one now: it
 * pays this one refused draw out of the treasury, raises no bound, and is
 * written beside the refusal it overrode. A visitor reading the public tree
 * sees no button, because the signature is not theirs to give.
 */
function ChainRefusalCard({
  refusal,
  owner,
  cut,
}: {
  refusal: ChainRefusal;
  owner: string | null;
  /** Whether this refusal's node, or an ancestor of it, has been revoked. */
  cut: boolean;
}) {
  const short = `${refusal.counterparty.slice(0, 6)}…${refusal.counterparty.slice(-4)}`;
  const notify = useNotify();
  const { state, release } = useRelease(owner);
  const [confirming, setConfirming] = useState(false);

  const announced = useRef<string | null>(null);
  useEffect(() => {
    const outcome = `release:${state.status}:${"hash" in state ? state.hash : "why" in state ? state.why : ""}`;
    if (announced.current === outcome) return;
    if (state.status === "done") {
      announced.current = outcome;
      notify({
        id: state.hash,
        tone: "caution",
        title: `Refusal ${String(refusal.id)} released`,
        children: "The bound did not move. The refusal and the release are both on the record, side by side.",
        duration: 8000,
      });
      window.location.reload();
    }
    if (state.status === "failed") {
      announced.current = outcome;
      notify({ id: `release-failed-${refusal.id}`, tone: "critical", title: "Not released", children: state.why, duration: 0 });
    }
  }, [state, notify, refusal.id]);

  return (
    <Card className="refusal">
      <CardHeader>
        <Text variant="micro" tone="dim" as="span" className="eyebrow">
          refusal {String(refusal.id)} · block {String(refusal.blockNumber)}
        </Text>
        <Tag tone={refusal.released ? "neutral" : "positive"} size="sm" dot>
          {refusal.released ? "signed out later" : "still standing"}
        </Tag>
      </CardHeader>

      <CardBody>
        <Stack direction="column" gap="sm" align="start">
          <Text variant="lead" tone="ink" as="p">
            {formatUsdc(refusal.amount6)} to <span className="mono">{short}</span>
          </Text>
          <Text variant="body" tone="copy" as="p">
            {REASON_MEANING[refusal.reason] ?? refusal.reason}.
          </Text>
          <Stack direction="row" gap="md" wrap>
            <span className="mono refusal__bound">{refusal.reason}</span>
            <a
              href={`${ARC.explorer}/tx/${refusal.transactionHash}`}
              target="_blank"
              rel="noreferrer"
              className="mono"
            >
              {refusal.transactionHash.slice(0, 10)}…
            </a>
            <a href={site(`/refusal/${refusal.id}`)}>what a seller sees</a>
          </Stack>
        </Stack>
      </CardBody>

      <CardFooter>
        <div className="refusal__actions">
          <Stack direction="row" gap="sm" align="center" wrap>
            {owner ? (
              <>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={refusal.released || state.status === "working"}
                  onClick={() => setConfirming(true)}
                >
                  {state.status === "working" ? state.step : "Sign to release"}
                </Button>
                <Text variant="micro" tone="dim" as="span" className={cut ? "refusal__warn" : undefined}>
                  {cut
                    ? "this branch is cut — releasing still pays its operator, because the vault checks the owner and not the revocation"
                    : "one transaction from your own key, and it does not move the bound"}
                </Text>
              </>
            ) : (
              <Text variant="micro" tone="dim" as="span">
                Releasing takes the owner's own signature. This is their tree, not yours.
              </Text>
            )}
          </Stack>
        </div>
      </CardFooter>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Release ${formatUsdc(refusal.amount6)} past this bound?`}
        description="This does not raise the bound. The same purchase is refused again a second later, and both the refusal and your release stay on the record."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Leave it refused
            </Button>
            <Button
              variant="danger"
              disabled={state.status === "working"}
              onClick={() => {
                setConfirming(false);
                void release(refusal.id);
              }}
            >
              Sign the release
            </Button>
          </>
        }
      >
        <Text variant="body" tone="copy" as="p">
          The money comes out of the treasury and goes to this node's operator,
          sized to the draw the contract refused. It is not a new draw: no
          window is debited, because this amount was never inside the authority
          they describe.
        </Text>
        {cut ? (
          <Text variant="body" tone="copy" as="p" className="refusal__warn">
            <b>This branch has been revoked.</b> It can draw nothing on its own,
            and a release still reaches its operator: `release` checks that you
            are the owner, not that the node is live. Cutting a branch stops it
            spending; it does not stop you paying it.
          </Text>
        ) : null}
      </Modal>
    </Card>
  );
}

function RefusalsSkeleton({ note }: { note: string }) {
  return (
    <>
      <ScreenHead
        title="Reading the refusals"
        lede="Every one of these is a decision the contract made, read from the events it emitted."
        note={note}
        figures={false}
      />
      <Stack direction="column" gap="lg">
        {[0, 1].map((row) => (
          <Card key={row}>
            <CardBody>
              <Stack direction="column" gap="md" align="start">
                <Skeleton width="32%" height={12} />
                <Skeleton width="64%" height={26} />
                <Skeleton variant="text" lines={3} />
              </Stack>
            </CardBody>
          </Card>
        ))}
      </Stack>
    </>
  );
}

export default function Refusals() {
  useTitle("Refusals · Cordon console");

  /* An owner sees their own refusals; a visitor sees the ones the public tree
     on Arc has actually collected. Neither is a sample: a refusal that nobody
     was refused is the one thing this screen must never show. */
  const { address, real, ready } = useWallet();
  const owner = real ? address : DEMO.owner;
  const chain = useChainTree(owner);
  const nodes = chain.state === "read" ? chain.nodes.map((node) => node.node) : [];
  const rootNode = chain.state === "read" ? chain.nodes.find((node) => node.parent === null) : undefined;
  const live = useChainRefusals(nodes, rootNode?.node ?? null);
  const mine = real && Boolean(address);

  /* Revocation runs down a branch: `revokedAt` walks up from a node, so a
     child of a cut parent is cut too even though its own flag is false. */
  const byId = new Map(
    (chain.state === "read" ? chain.nodes : []).map((node) => [node.node.toLowerCase(), node]),
  );
  const isCut = (id: string): boolean => {
    let cursor = byId.get(id.toLowerCase());
    while (cursor) {
      if (cursor.revoked) return true;
      cursor = cursor.parent ? byId.get(cursor.parent.toLowerCase()) : undefined;
    }
    return false;
  };

  if (!ready) return <RefusalsSkeleton note="restoring this session…" />;

  /* The same rule as the tree screen: a wallet whose refusals are being read
     is not shown the sample ones in the meantime. */
  if (chain.state === "looking" || live.state === "looking") {
    return <RefusalsSkeleton note={`reading ${ARC.name}…`} />;
  }

  /* The chain was asked and did not answer. Saying so is the only honest
     option: the alternative is a screen of samples that looks like a clean
     record, which is what this used to do. */
  if (live.state === "failed") {
    return (
      <>
        <ScreenHead
          title="The chain did not answer."
          lede="Refusals are read from the meter beside this console, and from the chain when there is none. Neither answered, so this screen has nothing to show — which is not the same as there being nothing to show."
          note="read failed"
          figures={false}
        />
        <Card>
          <CardBody>
            <Text variant="body" tone="copy" as="p" className="mono">
              {live.why}
            </Text>
          </CardBody>
        </Card>
      </>
    );
  }

  if (live.state === "read") {
    const standing = live.refusals.filter((refusal) => !refusal.released).length;
    return (
      <>
        <ScreenHead
          title={
            live.refusals.length === 0
              ? "Nothing has been refused yet."
              : `${standing} standing, ${live.refusals.length - standing} released.`
          }
          lede={
            mine
              ? "Every one of these is a decision the contract made about your own tree, read from the events it emitted. A refusal is not an error and it costs no budget; the money simply did not move."
              : "Every one of these is a decision the contract made about the tree Cordon runs on Arc, read from the events it emitted. Releasing one takes the owner's own signature, which is why the buttons below are theirs and not yours."
          }
          note={mine ? `read from ${ARC.name}` : `the public tree · read from ${ARC.name}`}
          live
        />
        {/* The meter caps what one answer carries. A screen that draws a page
            and prints it as the whole record is the same defect as a tree with
            a branch missing, so it says which it is holding. */}
        {live.total > live.refusals.length ? (
          <Card>
            <CardBody>
              <Text variant="body" tone="copy" as="p">
                Showing the {live.refusals.length} most recent of {live.total}. The
                rest are on the chain and in the meter; this screen asks for a
                page of them rather than all of them at once.
              </Text>
            </CardBody>
          </Card>
        ) : null}
        {live.refusals.length === 0 ? (
          <Card>
            <CardBody>
              <Text variant="body" tone="copy" as="p">
                Nothing in your tree has asked for more than it was allowed. That
                is a fact about the range this reads — from the block the
                contracts were made in — as much as about the agents.
              </Text>
            </CardBody>
          </Card>
        ) : (
          <Stack direction="column" gap="lg">
            {live.refusals.map((refusal) => (
              <ChainRefusalCard
                key={String(refusal.id)}
                refusal={refusal}
                owner={mine ? address : null}
                cut={isCut(refusal.node)}
              />
            ))}
          </Stack>
        )}
      </>
    );
  }

  const released = REFUSALS.filter((refusal) => refusal.released).length;
  const standing = REFUSALS.length - released;

  return (
    <>
      <ScreenHead
        title="Which node, how much, which bound."
        lede="Two answers, no third. Leaving a refusal standing costs nothing. Releasing one is you signing from your own key, and it stays on the record next to the refusal."
        note="sample refusals, signing is mocked"
      />

      <Stack direction="row" gap="sm" align="center" wrap>
        <Tag tone="critical" size="sm" dot>
          {standing} standing
        </Tag>
        <Tag tone="positive" size="sm" dot>
          {released} released
        </Tag>
      </Stack>

      <Stack direction="column" gap="lg">
        {REFUSALS.map((refusal) => (
          <RefusalCard key={refusal.id} refusal={refusal} />
        ))}
      </Stack>
    </>
  );
}
