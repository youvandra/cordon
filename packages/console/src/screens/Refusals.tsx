import { useState } from "react";
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Modal,
  Stack,
  Tag,
  Text,
  useToast,
} from "cordon-ui";
import { formatUsdc } from "@cordon/fixtures";
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
  const { notify } = useToast();

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

export default function Refusals() {
  useTitle("Refusals · Cordon console");
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
