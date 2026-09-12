import { useEffect, useRef, useState } from "react";
import { Button, Field, Modal, TextField, useNotify } from "cordon-ui";
import { formatUsdc, isAddress } from "@cordon/fixtures";
import { useFundVault, useRevoke, useSpawnChild, useTreasury, useWithdraw, type ActionState } from "../lib/mandate";
import type { ChainNode } from "../lib/tree";
import { shortId, usdc6 } from "../lib/format";

/** A reload a moment later, so the toast that said what happened is read first. */
function reloadSoon() {
  window.setTimeout(() => window.location.reload(), 1400);
}

/**
 * Announces an action's outcome once. A toast re-renders the screen, and an
 * effect that announced on every render would announce for ever.
 */
function useOutcome(
  state: ActionState,
  key: string,
  done: { title: string; body: string },
  failedTitle: string,
  onDone: () => void,
) {
  const notify = useNotify();
  const seen = useRef<string | null>(null);
  const after = useRef(onDone);
  after.current = onDone;

  useEffect(() => {
    if (state.status !== "done" && state.status !== "failed") return;
    const id = `${key}:${state.status === "done" ? state.hash : state.why}`;
    if (seen.current === id) return;
    seen.current = id;
    if (state.status === "done") {
      notify({ id, tone: "positive", title: done.title, children: done.body, duration: 6000 });
      after.current();
    } else {
      notify({ id, tone: "critical", title: failedTitle, children: state.why, duration: 0 });
    }
  }, [state, key, done.title, done.body, failedTitle, notify]);
}

export function FundDialog({ open, onClose, root, owner }: { open: boolean; onClose: () => void; root: ChainNode; owner: string }) {
  const { state, fund } = useFundVault(owner);
  const [amount, setAmount] = useState("1");
  const value = usdc6(amount);
  const working = state.status === "working";

  useOutcome(state, "fund", { title: "Vault funded", body: "Purchases can be released against it now." }, "Not funded", () => {
    onClose();
    reloadSoon();
  });

  return (
    <Modal
      open={open}
      onClose={working ? () => undefined : onClose}
      title="Fund the vault"
      description="USDC moves from your wallet into the vault. Agents never hold it — the vault releases one purchase at a time, and only when every bound allows it."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={working}>
            Cancel
          </Button>
          <Button variant="primary" loading={working} disabled={working || value <= 0n} onClick={() => void fund(root.node, value)}>
            {state.status === "working" ? state.step : `Fund ${formatUsdc(value)}`}
          </Button>
        </>
      }
    >
      <Field label="Amount" hint="Your wallet asks twice: once to approve, once to fund.">
        <TextField
          type="number"
          min="0"
          step="0.01"
          value={amount}
          suffix="USDC"
          autoFocus
          onChange={(event) => setAmount(event.target.value)}
        />
      </Field>
    </Modal>
  );
}

export function SpawnDialog({ open, onClose, parent, owner }: { open: boolean; onClose: () => void; parent: ChainNode; owner: string }) {
  const { state, spawn } = useSpawnChild(owner);
  const [operator, setOperator] = useState("");
  const [shareText, setShareText] = useState("50");
  const working = state.status === "working";

  const tooDeep = parent.depth + 1 > parent.maxDepth;
  const shareValue = Math.round(Number(shareText || "0"));
  const shareOk = Number.isFinite(shareValue) && shareValue >= 1 && shareValue <= 100;
  const isOwner = isAddress(operator) && operator.toLowerCase() === owner.toLowerCase();
  const operatorError =
    operator === "" ? undefined : !isAddress(operator) ? "Not an address." : isOwner ? "This is your own wallet. Use an operator key from `npm run init`." : undefined;
  const childBudget6 = shareOk ? (parent.budget6 * BigInt(shareValue)) / 100n : 0n;
  const underRoot = parent.parent === null;

  useOutcome(state, "spawn", { title: "Agent spawned", body: "Narrower than its parent on every axis — the contract checked." }, "Not spawned", () => {
    onClose();
    reloadSoon();
  });

  return (
    <Modal
      open={open}
      onClose={working ? () => undefined : onClose}
      title={underRoot ? "Spawn an agent" : `Spawn under ${shortId(parent.node)}`}
      description={
        underRoot
          ? "A child mandate under the root. It can only ever be narrower than its parent, and the contract refuses a wider one whoever asks."
          : `A child of ${shortId(parent.node)}, at depth ${parent.depth + 1}. It can only ever be narrower than that agent, and every purchase it makes is charged to it and to everything above.`
      }
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={working}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={working}
            disabled={working || tooDeep || !isAddress(operator) || isOwner || !shareOk || childBudget6 <= 0n}
            onClick={() =>
              void spawn(parent.node, {
                operator: operator as `0x${string}`,
                budget6: childBudget6,
                lifetimeCap6: (parent.lifetimeCap6 * BigInt(shareValue)) / 100n,
                /* Equal to the parent's, read from the chain: a shorter child
                   window refills faster than the window it debits. */
                windowSeconds: parent.windowSeconds,
                trancheCap6: parent.trancheCap6,
                concentrationBps: parent.concentrationBps,
                maxDepth: parent.maxDepth,
              })
            }
          >
            {state.status === "working" ? state.step : "Spawn agent"}
          </Button>
        </>
      }
    >
      {tooDeep ? (
        <p className="accent-text">
          This agent is at depth {parent.depth}, the deepest this mandate allows. It cannot have children.
        </p>
      ) : (
        <div className="form-stack">
          <Field label="Operator address" hint="An address printed by `npm run init`, not the wallet you are signed in with." error={operatorError}>
            <TextField value={operator} placeholder="0x…" autoFocus onChange={(event) => setOperator(event.target.value.trim())} />
          </Field>
          <Field
            label="Share of the parent"
            hint={shareOk ? `${formatUsdc(childBudget6)} of ${formatUsdc(parent.budget6)} per window, and the same share of its lifetime cap.` : "A whole number from 1 to 100."}
            error={shareText !== "" && !shareOk ? "Between 1 and 100." : undefined}
          >
            <TextField type="number" min="1" max="100" value={shareText} suffix="%" onChange={(event) => setShareText(event.target.value)} />
          </Field>
        </div>
      )}
    </Modal>
  );
}

/** Base units as a plain decimal an input can hold, without a float in between. */
function plainUsdc(amount6: bigint): string {
  const whole = amount6 / 1_000_000n;
  const fraction = (amount6 % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export function WithdrawDialog({ open, onClose, root, owner }: { open: boolean; onClose: () => void; root: ChainNode; owner: string }) {
  const { state, withdraw } = useWithdraw(owner);
  const treasury = useTreasury(open ? root.node : null);
  const [amount, setAmount] = useState("");
  const working = state.status === "working";
  const held = treasury.state === "read" ? treasury.amount6 : null;
  const value = usdc6(amount);
  const tooMuch = held !== null && value > held;

  useEffect(() => {
    if (!open) setAmount("");
    else if (held !== null && amount === "") setAmount(plainUsdc(held));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, held]);

  useOutcome(state, "withdraw", { title: "Withdrawn", body: "The USDC is back in your wallet." }, "Not withdrawn", () => {
    onClose();
    reloadSoon();
  });

  return (
    <Modal
      open={open}
      onClose={working ? () => undefined : onClose}
      title="Withdraw from the vault"
      description={
        root.revoked
          ? "This tree is revoked, so nothing draws from it any more. Withdraw what it holds, then fund the mandate that replaces it."
          : "Agents under this tree draw from what is left. Take everything out and their next purchase is refused for vault balance."
      }
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={working}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={working}
            disabled={working || held === null || value <= 0n || tooMuch}
            onClick={() => void withdraw(root.node, value)}
          >
            {state.status === "working" ? state.step : `Withdraw ${formatUsdc(value)}`}
          </Button>
        </>
      }
    >
      <div className="form-stack">
        <p className="small muted">
          In the vault for {shortId(root.node)}:{" "}
          <span className="num strong">
            {treasury.state === "read" ? formatUsdc(treasury.amount6) : treasury.state === "failed" ? "could not read" : "reading…"}
          </span>{" "}
          <span className="mono">· TreeVault.treasury6(root)</span>
        </p>
        <Field
          label="Amount"
          hint={`Sent to ${shortId(owner, 6, 4)}, the wallet you are signed in with.`}
          error={tooMuch ? "More than the vault holds for this tree." : treasury.state === "failed" ? treasury.why : undefined}
        >
          <TextField
            type="number"
            min="0"
            step="0.000001"
            value={amount}
            suffix="USDC"
            autoFocus
            onChange={(event) => setAmount(event.target.value)}
          />
        </Field>
        {held !== null && held > 0n && value !== held ? (
          <Button variant="ghost" onClick={() => setAmount(plainUsdc(held))}>
            Withdraw everything
          </Button>
        ) : null}
      </div>
    </Modal>
  );
}

export function RevokeDialog({
  node,
  affected,
  onClose,
  owner,
}: {
  node: ChainNode | null;
  affected: number;
  onClose: () => void;
  owner: string;
}) {
  const { state, revoke } = useRevoke(owner);
  const working = state.status === "working";

  useOutcome(state, "revoke", { title: "Branch revoked", body: "That agent and everything under it draws nothing from now on." }, "Not revoked", () => {
    onClose();
    reloadSoon();
  });

  return (
    <Modal
      open={Boolean(node)}
      onClose={working ? () => undefined : onClose}
      title="Revoke this agent?"
      description={`${affected} ${affected === 1 ? "agent stops" : "agents stop"} drawing: this one and everything under it. It cannot be undone, and the record keeps the branch.`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={working}>
            Keep it
          </Button>
          <Button variant="danger" loading={working} disabled={working || !node} onClick={() => node && void revoke(node.node)}>
            {state.status === "working" ? state.step : "Revoke on chain"}
          </Button>
        </>
      }
    >
      {node ? <p className="mono muted breakable">{shortId(node.node, 10, 8)}</p> : null}
    </Modal>
  );
}
