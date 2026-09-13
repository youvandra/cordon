import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Button, EmptyState, Field, Select, TextField, useNotify } from "cordon-ui";
import { ARC, MANDATE, formatUsdc, isAddress } from "@cordon/fixtures";
import { useTitle } from "../parts/Shell";
import { PageHeader, PageSkeleton, Panel, ReadFailed } from "../parts/Page";
import { useWallet } from "../lib/wallet";
import { REGISTRY, useExistingMandate, useOpenMandate } from "../lib/mandate";
import { usdc6, windowLabel } from "../lib/format";

const WINDOWS = [
  { value: "3600", label: "1 hour" },
  { value: "86400", label: "24 hours" },
  { value: "604800", label: "7 days" },
];

export default function NewMandate() {
  useTitle("New mandate · Cordon console");
  const navigate = useNavigate();
  const notify = useNotify();
  const [params] = useSearchParams();
  const { address, real, ready, available, connect } = useWallet();
  const mine = real && Boolean(address);
  const existing = useExistingMandate(mine ? address : null);
  const { state, open } = useOpenMandate(address);

  const [budget, setBudget] = useState(String(MANDATE.budget6 / 1_000_000n));
  const [windowS, setWindowS] = useState(String(MANDATE.windowSeconds));
  const [lifetime, setLifetime] = useState(String(MANDATE.lifetimeCap6 / 1_000_000n));
  const [tranche, setTranche] = useState(String(MANDATE.tranche6 / 1_000_000n));
  const [concentration, setConcentration] = useState(String(MANDATE.concentrationBoundPct));
  const [depth, setDepth] = useState(String(MANDATE.maxDepth));
  /* `npm run init` prints a link with the first operator already in it. */
  const suggested = params.get("operator") ?? "";
  const [operator, setOperator] = useState(isAddress(suggested) ? suggested : "");

  const seen = useRef<string | null>(null);
  useEffect(() => {
    const id = `${state.status}:${"hash" in state ? state.hash : "why" in state ? state.why : ""}`;
    if (seen.current === id) return;
    seen.current = id;
    if (state.status === "sent") {
      notify({ id, tone: "info", title: "Sent", children: "Waiting for the receipt.", duration: 6000 });
    }
    if (state.status === "open") {
      notify({ id, tone: "positive", title: "Mandate opened", children: "Your agents now share one budget.", duration: 8000 });
      navigate("/console", { replace: true });
    }
    if (state.status === "failed") {
      notify({ id, tone: "critical", title: "Not signed", children: state.why, duration: 0 });
    }
  }, [state, notify, navigate]);

  if (!ready) return <PageSkeleton />;
  if (!REGISTRY) return <ReadFailed title="No deployment configured" why="This build has no registry to open a mandate in." />;

  if (!mine) {
    return (
      <div className="stack">
        <PageHeader title="New mandate" subtitle="One budget for every agent under it, signed once from your own wallet." />
        <Panel>
          <EmptyState
            icon="user"
            title="Connect a wallet to open a mandate"
            description="Only the owner's own key can sign one. Nobody else — not this server, not an agent — can produce that signature."
            action={
              available ? (
                <Button variant="primary" onClick={connect}>
                  Connect wallet
                </Button>
              ) : undefined
            }
          />
        </Panel>
      </div>
    );
  }

  if (existing.state === "looking" || existing.state === "unknown") return <PageSkeleton />;
  if (existing.state === "found") return <Navigate to="/console" replace />;
  /* A read that failed is not "you have no mandate". Offering the form here
     would invite a second mandate from an owner who already has a live one,
     and this screen ends in a signature. */
  if (existing.state === "failed") {
    return (
      <ReadFailed
        title="Could not check what this wallet has already signed"
        why={`${existing.why} Until that read succeeds, opening a mandate here could open a second one beside a live mandate.`}
      />
    );
  }

  const budget6 = usdc6(budget);
  const lifetime6 = usdc6(lifetime);
  const tranche6 = usdc6(tranche);
  const concentrationValue = Number(concentration);
  const depthValue = Number(depth);
  const operatorIsOwner = isAddress(operator) && operator.toLowerCase() === address!.toLowerCase();

  const errors = {
    budget: budget6 <= 0n ? "More than zero." : undefined,
    lifetime: lifetime6 <= 0n ? "More than zero." : undefined,
    tranche: tranche6 <= 0n ? "More than zero." : undefined,
    concentration: !(concentrationValue > 0 && concentrationValue <= 100) ? "Between 0 and 100." : undefined,
    depth: !(Number.isInteger(depthValue) && depthValue >= 1) ? "A whole number, at least 1." : undefined,
    operator:
      operator === ""
        ? undefined
        : !isAddress(operator)
          ? "Not an address."
          : operatorIsOwner
            ? "This is the wallet you are signing with. An operator is a key the daemon holds."
            : undefined,
  };
  const valid = Object.values(errors).every((error) => !error) && isAddress(operator);
  const busy = state.status === "signing" || state.status === "sent";

  const sign = () =>
    void open({
      operator: operator as `0x${string}`,
      budget6,
      lifetimeCap6: lifetime6,
      windowSeconds: BigInt(windowS),
      trancheCap6: tranche6,
      /* Basis points are an integer on chain: 35.55 * 100 is not. */
      concentrationBps: Math.round(concentrationValue * 100),
      maxDepth: depthValue,
    });

  return (
    <div className="stack">
      <PageHeader title="New mandate" subtitle="One budget for every agent under it. You sign once, and it cannot be edited afterwards." />

      <div className="compose">
        <Panel>
          <div className="form">
            <fieldset className="form__section">
              <legend className="form__legend">Spending</legend>
              <p className="form__help">What the whole tree may spend, shared by every agent under it.</p>
              <div className="form__grid">
                <Field label="Budget per window" error={errors.budget}>
                  <TextField type="number" min="0" value={budget} suffix="USDC" onChange={(event) => setBudget(event.target.value)} />
                </Field>
                <Field label="Window">
                  <Select options={WINDOWS} value={windowS} onValueChange={setWindowS} />
                </Field>
                <Field label="Lifetime cap" info="The total, ever. It never refills." error={errors.lifetime}>
                  <TextField type="number" min="0" value={lifetime} suffix="USDC" onChange={(event) => setLifetime(event.target.value)} />
                </Field>
              </div>
            </fieldset>

            <fieldset className="form__section">
              <legend className="form__legend">Limits</legend>
              <p className="form__help">Checked on every agent, and on every agent above it.</p>
              <div className="form__grid">
                {/* The only `hint` left on this form, and it stays under the
                    control: it is a warning about what was just typed rather
                    than an explanation of the field, and a warning nobody
                    opens is not a warning. */}
                <Field label="Per purchase" error={errors.tranche} hint={tranche6 > budget6 && budget6 > 0n ? "Larger than the whole window." : undefined}>
                  <TextField type="number" min="0" value={tranche} suffix="USDC" onChange={(event) => setTranche(event.target.value)} />
                </Field>
                <Field label="Per seller" info="Share of a window one seller may take." error={errors.concentration}>
                  <TextField type="number" min="0" max="100" value={concentration} suffix="%" onChange={(event) => setConcentration(event.target.value)} />
                </Field>
                <Field label="Max depth" info="How far it may be delegated." error={errors.depth}>
                  <TextField type="number" min="1" value={depth} onChange={(event) => setDepth(event.target.value)} />
                </Field>
              </div>
            </fieldset>

            <fieldset className="form__section">
              <legend className="form__legend">Operator</legend>
              <p className="form__help">The key your daemon holds for this mandate. It is fixed here and cannot be changed later.</p>
              <Field label="Operator address" info="Printed by `npm run init`." error={errors.operator}>
                <TextField value={operator} placeholder="0x…" onChange={(event) => setOperator(event.target.value.trim())} />
              </Field>
            </fieldset>
          </div>
        </Panel>

        <aside className="compose__aside">
          <Panel title="You are signing">
            <dl className="summary">
              <div><dt>Budget</dt><dd className="num">{formatUsdc(budget6)} / {windowLabel(Number(windowS))}</dd></div>
              <div><dt>Lifetime cap</dt><dd className="num">{formatUsdc(lifetime6)}</dd></div>
              <div><dt>Per purchase</dt><dd className="num">{formatUsdc(tranche6)}</dd></div>
              <div><dt>Per seller</dt><dd className="num">{concentration || "0"}%</dd></div>
              <div><dt>Max depth</dt><dd className="num">{depth || "0"}</dd></div>
              <div><dt>Operator</dt><dd className="mono">{isAddress(operator) ? `${operator.slice(0, 8)}…${operator.slice(-6)}` : "—"}</dd></div>
            </dl>
            <Button variant="primary" block loading={busy} disabled={!valid || busy} onClick={sign}>
              {state.status === "signing" ? "Confirm in your wallet…" : state.status === "sent" ? "Waiting for the receipt…" : "Sign mandate"}
            </Button>
            <p className="compose__foot">One signature on {ARC.name}. A mandate narrows — it never widens.</p>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
