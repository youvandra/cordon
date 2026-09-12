import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Cta,
  Enforced,
  Field,
  Grid,
  MetricCard,
  Modal,
  Select,
  Stack,
  StepProgress,
  Text,
  TextField,
  useNotify,
} from "cordon-ui";
import { ARC, ENFORCED_BY, MANDATE, isAddress } from "@cordon/fixtures";
import { ScreenHead } from "../parts/Preview";
import { useTitle } from "../parts/Shell";
import { useEntrance } from "../lib/entrance";
import { useWallet } from "../lib/wallet";
import { REGISTRY, useExistingMandate, useOpenMandate } from "../lib/mandate";

/**
 * Dollars as typed, in USDC base units.
 *
 * The fields are free text and people type decimals into money. Rounding to
 * the millionth is the token's own precision; anything finer is not a smaller
 * amount, it is an amount USDC cannot express.
 */
function usdc6(dollars: string): bigint {
  const value = Number(dollars || "0");
  if (!Number.isFinite(value) || value < 0) return 0n;
  return BigInt(Math.round(value * 1_000_000));
}

const WINDOWS = [
  { value: "3600", label: "1 hour" },
  { value: "86400", label: "24 hours" },
  { value: "604800", label: "7 days" },
];

/**
 * A label with the explanation folded behind it.
 *
 * Every field used to carry two lines of prose underneath, which turned a form
 * of six questions into an essay and pushed the thing being asked off the
 * screen. The explanation is still one keystroke away and is still read by a
 * screen reader — it is just no longer in the way of the answer.
 */
type Stage = "asking" | "review" | "done";

export default function Setup() {
  useTitle("Setup · Cordon console");
  const animate = useEntrance();
  const navigate = useNavigate();
  const notify = useNotify();

  const [budget, setBudget] = useState(String(MANDATE.budget6 / 1_000_000n));
  const [windowS, setWindowS] = useState(String(MANDATE.windowSeconds));
  const [depth, setDepth] = useState(String(MANDATE.maxDepth));
  const [tranche, setTranche] = useState(String(MANDATE.tranche6 / 1_000_000n));
  const [concentration, setConcentration] = useState(
    String(MANDATE.concentrationBoundPct),
  );
  const [lifetime, setLifetime] = useState(String(MANDATE.lifetimeCap6 / 1_000_000n));

  /* `cordon init` prints a link with the operator already in it, because the
     alternative is copying a 42-character string into the right field and that
     is where people paste the wrong thing. Only ever a default. */
  const [params] = useSearchParams();
  const suggested = params.get("operator") ?? "";
  const [operator, setOperator] = useState(isAddress(suggested) ? suggested : "");

  /**
   * One question at a time until it is signed, then the whole thing at once and
   * unchangeable — because that is what a mandate is. A form that stays
   * editable after signing suggests an edit the contract has no function for.
   */
  const [stage, setStage] = useState<Stage>("asking");
  const [at, setAt] = useState(0);
  const [confirming, setConfirming] = useState(false);

  const { address, real } = useWallet();
  const { state, open } = useOpenMandate(address);
  const live = real && Boolean(REGISTRY) && Boolean(address);
  /* What this wallet has already signed. Without it the screen has no memory:
     sign a mandate, reload, and it asks for one again while the chain holds
     the answer. */
  const existing = useExistingMandate(real ? address : null);

  const questions = [
    {
      label: "How much may the whole tree spend?",
      step: "window",
      complete: usdc6(budget) > 0n,
      field: (
        <Stack direction="row" gap="md" wrap>
          <Field
            label="Budget"
            info="What every agent under this mandate may draw between them, per window. Not a balance — a limit the contract checks on every purchase."
          >
            <TextField
              type="number"
              value={budget}
              suffix="USDC"
              disabled={stage === "done"}
              onChange={(event) => setBudget(event.target.value)}
            />
          </Field>
          <Field
            label="Window"
            info="How often the budget refills. It rolls in whole steps, and a child's window must be the same length as its parent's."
          >
            <Select
              value={windowS}
              options={WINDOWS}
              disabled={stage === "done"}
              onValueChange={setWindowS}
            />
          </Field>
        </Stack>
      ),
    },
    {
      label: "And how much in total, ever?",
      step: "lifetime",
      complete: usdc6(lifetime) > 0n,
      field: (
        <Field
          label="Lifetime cap"
            info="The window refills; this never does. Without it a budget is a rate, and a tree left running for a week authorises seven windows of it."
        >
          <TextField
            type="number"
            value={lifetime}
            suffix="USDC"
            disabled={stage === "done"}
            onChange={(event) => setLifetime(event.target.value)}
          />
        </Field>
      ),
    },
    {
      label: "What is the most one purchase may cost?",
      step: "tranche",
      complete: usdc6(tranche) > 0n,
      field: (
        <Field
          label="Tranche cap"
            info="No single draw may exceed this. It is what stops one plausible-looking call from costing two hundred dollars."
        >
          <TextField
            type="number"
            value={tranche}
            suffix="USDC"
            disabled={stage === "done"}
            onChange={(event) => setTranche(event.target.value)}
          />
        </Field>
      ),
    },
    {
      label: "How much may go to any one seller?",
      step: "seller",
      complete: Number(concentration) > 0 && Number(concentration) <= 100,
      field: (
        <Field
          label="Concentration"
            info="A share of one window to a single payee. It catches ten thousand small purchases from the same seller, each comfortably under the tranche cap. The payee is the one the daemon declares, so this bound is declared rather than proven."
        >
          <TextField
            type="number"
            value={concentration}
            suffix="%"
            disabled={stage === "done"}
            onChange={(event) => setConcentration(event.target.value)}
          />
        </Field>
      ),
    },
    {
      label: "How deep may the tree go?",
      step: "depth",
      complete: Number(depth) > 0,
      field: (
        <Field
          label="Maximum depth"
            info="How many times an agent may spawn an agent. Every child is narrower than its parent, so depth costs nothing in authority — it bounds how far a mistake can be delegated."
        >
          <TextField
            type="number"
            value={depth}
            disabled={stage === "done"}
            onChange={(event) => setDepth(event.target.value)}
          />
        </Field>
      ),
    },
    {
      label: "Which key does the spending?",
      step: "operator",
      complete: isAddress(operator),
      field: (
        <Field
          label="Operator address"
            info="The address that does the spending — made by `cordon init` and held by the daemon. Not your wallet, and not the agent's: you sign the limit, this spends inside it."
        >
          <TextField
            value={operator}
            placeholder="0x…"
            disabled={stage === "done"}
            onChange={(event) => setOperator(event.target.value)}
          />
        </Field>
      ),
    },
  ];

  const ready = live && questions.every((question) => question.complete);

  /**
   * What was signed, as figures.
   *
   * Each one is a bound the contract checks, so each gets the instrument: the
   * ring reads what this bound is worth against the widest one above it, which
   * is the only comparison that means anything. Depth has no amount, so it
   * reads as a fraction of itself.
   */
  const window = WINDOWS.find((option) => option.value === windowS)?.label ?? "a window";
  const signed = [
    {
      title: "Per window",
      meaning: `Everything, every ${window}`,
      value: budget || "0",
      unit: "USDC",
      progress: 1,
      caption: <>the whole tree, between them</>,
      glaze: "violet" as const,
    },
    {
      title: "For its whole life",
      meaning: "Never refills",
      value: lifetime || "0",
      unit: "USDC",
      progress: Math.min(1, Number(budget || 0) / Math.max(1, Number(lifetime || 0))),
      caption: (
        <>
          {Math.max(1, Math.floor(Number(lifetime || 0) / Math.max(1, Number(budget || 1))))} windows
          <br />
          before it is spent
        </>
      ),
      glaze: "rose" as const,
    },
    {
      title: "One purchase",
      meaning: "The most a single draw may be",
      value: tranche || "0",
      unit: "USDC",
      progress: Math.min(1, Number(tranche || 0) / Math.max(1, Number(budget || 1))),
      caption: (
        <>
          {Math.floor(Number(budget || 0) / Math.max(1, Number(tranche || 1)))} of them
          <br />
          would fill a window
        </>
      ),
      glaze: "ember" as const,
    },
    {
      title: "One seller",
      meaning: "Share of a window to any one payee",
      value: concentration || "0",
      unit: "%",
      progress: Math.min(1, Number(concentration || 0) / 100),
      caption: <>declared, not proven</>,
      glaze: "violet" as const,
    },
    {
      title: "Depth",
      meaning: "How far it may be delegated",
      value: depth || "0",
      unit: "levels",
      progress: 1,
      caption: <>each one narrower than the last</>,
      glaze: "rose" as const,
    },
  ];

  const sign = () => {
    if (!live) {
      setStage("done");
      notify({
        tone: "info",
        title: "Preview only",
        children: "Nothing was signed and nothing was sent.",
        duration: 4000,
      });
      return;
    }
    setConfirming(true);
  };

  const send = () => {
    setConfirming(false);
    /* USDC has six decimals and these fields are dollars, so a typed "1.5" is
       1,500,000 base units — and `BigInt("1.5")` throws, which before this was
       an uncaught exception on a button click. */
    void open({
      operator: operator as `0x${string}`,
      budget6: usdc6(budget),
      lifetimeCap6: usdc6(lifetime),
      windowSeconds: BigInt(windowS),
      trancheCap6: usdc6(tranche),
      /* Basis points are an integer on chain. `35.55 * 100` is
         3555.0000000000005 in binary floating point, and viem rejects it. */
      concentrationBps: Math.round(Number(concentration || "0") * 100),
      maxDepth: Number(depth),
    });
  };

  /* A mandate this wallet already signed puts the screen in its finished
     state, with the chain's own numbers rather than whatever is in the form —
     which is the only version of them that is true. */
  useEffect(() => {
    if (existing.state !== "found") return;
    const m = existing.mandate;
    setBudget(String(m.budget6 / 1_000_000n));
    setLifetime(String(m.lifetimeCap6 / 1_000_000n));
    setTranche(String(m.trancheCap6 / 1_000_000n));
    setWindowS(String(m.windowSeconds));
    setConcentration(String(m.concentrationBps / 100));
    setDepth(String(m.maxDepth));
    setOperator(m.operator);
    setStage("done");
  }, [existing]);

  /* The transaction reports itself, and the screen stops asking once it is
     open. Each state raises its toast once, keyed by the state, so a
     re-render cannot stack three copies of one sentence. */
  useEffect(() => {
    if (state.status === "sent") {
      notify({
        id: `sent-${state.hash}`,
        tone: "info",
        title: "Sent",
        children: "Waiting for the receipt.",
        duration: 6000,
      });
    }
    if (state.status === "open") {
      setStage("done");
      notify({
        id: `open-${state.hash}`,
        tone: "positive",
        title: "The mandate is open",
        children: (
          <>
            <span className="mono">{state.node.slice(0, 14)}…</span> ·{" "}
            <a href={`${ARC.explorer}/tx/${state.hash}`} target="_blank" rel="noreferrer">
              the transaction
            </a>
          </>
        ),
        duration: 0,
      });
    }
    if (state.status === "failed") {
      /* Back to the last question rather than stranded on a review of numbers
         that were refused. */
      setStage("review");
      notify({ id: "failed", tone: "critical", title: "Not signed", children: state.why, duration: 0 });
    }
  }, [state, notify]);

  const commitment = (
    <MetricCard
      animate={animate}
      title={
        <>
          What the signature commits
          <br />
          Root window budget
        </>
      }
      value={budget || "0"}
      unit="USDC"
      progress={Math.min(1, Number(tranche) / Math.max(1, Number(budget)))}
      caption={
        <>
          {tranche || "0"} USDC at most in one purchase
          <br />
          {lifetime || "0"} USDC for the life of this mandate
        </>
      }
      glaze="violet"
    />
  );

  return (
    <>
      <ScreenHead
        actions={
          /* One thing to do next, and it is the tree.

             There were two buttons here and both navigated to the same screen,
             which made "Revoke a branch" a promise the destination does not
             keep on arrival: revoking is per node, so it lives on the node. A
             destructive verb sitting as the grey equal of a neutral one is
             also the wrong weight for a console where colour means exception.
             The revoke is a link in the sentence that explains it, below. */
          stage === "done" ? (
            <Button variant="primary" size="sm" onClick={() => navigate("/console/tree")}>
              Open the tree
            </Button>
          ) : undefined
        }
        title={stage === "done" ? "One mandate, signed." : "Sign one mandate. Fund the vault once."}
        lede="Children are created by their parent, in seconds, while you sleep. The contract refuses a child wider than its parent, so no per-spawn approval is needed, and none would be safe to ask for."
        note={
          stage === "done"
            ? existing.state === "found"
              ? `signed · read from ${ARC.name}`
              : "signed — a mandate cannot be edited"
            : live
              ? `signs on ${ARC.name}, from your own key`
              : "nothing is signed or sent"
        }
      />

      {stage === "done" ? (
        /* No card around them and no hero beside them. These are the bounds
           themselves, and a box drawn around a bound adds a second frame to
           something that is already the subject. A mandate cannot be edited,
           so there is nothing else on this screen to compare them against. */
        <>
          {/* Five bounds, one row where there is room. Three columns left one
              stranded on a second row, which reads as an afterthought rather
              than as the last of a set. */}
          <Grid columns={5} min={178} gap="md">
            {signed.map((figure, index) => (
              <MetricCard
                key={figure.title}
                animate={animate}
                index={index}
                title={
                  <>
                    {figure.title}
                    <br />
                    {figure.meaning}
                  </>
                }
                value={figure.value}
                unit={figure.unit}
                progress={figure.progress}
                caption={figure.caption}
                glaze={figure.glaze}
              />
            ))}
          </Grid>

          <Text variant="micro" tone="dim" as="p" className="setup__after">
            A mandate cannot be edited. It narrows: a parent spawns a child
            inside its own bounds through <span className="mono">cordon_spawn</span>,
            and the owner can{" "}
            {live ? (
              <Link className="setup__cut" to="/console/tree#nodes">
                cut any branch
              </Link>
            ) : (
              "cut any branch"
            )}{" "}
            at any time.
          </Text>
        </>
      ) : (
      <Grid columns={2} min={340} gap="lg" align="start">
        <Card>
          <CardHeader>
            <Text variant="micro" tone="dim" as="span" className="eyebrow">
              question {at + 1} of {questions.length}
            </Text>
          </CardHeader>
          <CardBody>
            {(

              <Stack direction="column" gap="lg">
                {/* Each node in this rail is already drawn as its number, so
                    labelling the steps "1".."6" printed every numeral twice
                    and told a reader nothing about where they were. The label
                    is what the step is; it hides itself on a narrow screen,
                    where the question above is the answer anyway. */}
                <StepProgress
                  steps={questions.map((question) => ({ label: question.step }))}
                  current={stage === "review" ? questions.length - 1 : at}
                />

                {stage === "review" ? (
                  <Stack direction="column" gap="md" align="start">
                    <Text variant="lead" tone="ink" as="p">
                      One signature, and it cannot be edited afterwards.
                    </Text>
                    <Text variant="body" tone="copy" as="p">
                      {budget || "0"} USDC per {WINDOWS.find((w) => w.value === windowS)?.label},{" "}
                      {lifetime || "0"} USDC in total, at most {tranche || "0"} USDC in one
                      purchase, no more than {concentration || "0"}% of a window to one seller,
                      {" "}
                      {depth || "0"} levels deep.
                    </Text>
                    <Text variant="body" tone="copy" as="p">
                      Spent by <span className="mono">{operator || "—"}</span>.
                    </Text>
                  </Stack>
                ) : (
                  <Stack direction="column" gap="md" align="start">
                    <Text variant="lead" tone="ink" as="p">
                      {questions[at]!.label}
                    </Text>
                    {questions[at]!.field}
                  </Stack>
                )}

                <Stack direction="row" gap="sm">
                  {at > 0 || stage === "review" ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        if (stage === "review") {
                          setStage("asking");
                          setAt(questions.length - 1);
                        } else setAt(at - 1);
                      }}
                    >
                      Back
                    </Button>
                  ) : null}

                  {stage === "review" ? (
                    <Cta magnetic onClick={sign} disabled={live && !ready}>
                      {state.status === "signing" ? "Waiting for your signature…" : "Sign mandate"}
                    </Cta>
                  ) : (
                    <Button
                      variant="primary"
                      disabled={!questions[at]!.complete}
                      onClick={() => {
                        if (at === questions.length - 1) setStage("review");
                        else setAt(at + 1);
                      }}
                    >
                      Next
                    </Button>
                  )}
                </Stack>
              </Stack>
            )}
          </CardBody>
        </Card>

        <Stack direction="column" gap="lg">
          <Text variant="micro" tone="dim" as="h2" id="the-commitment" className="eyebrow visually-hidden">
            What the signature commits
          </Text>
          {commitment}
          <Enforced>{ENFORCED_BY.budget}</Enforced>
        </Stack>
      </Grid>
      )}

      {/* The last moment before something that cannot be undone. */}
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Sign this mandate?"
        description="It cannot be edited afterwards. A mandate's operator is fixed when it is opened, and there is no function to repoint it."
        hideClose
        dismissOnScrim={false}
        footer={
          <Stack direction="row" gap="sm">
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Not yet
            </Button>
            <Button variant="primary" onClick={send}>
              Sign it
            </Button>
          </Stack>
        }
      >
        <div className="signoff">
          <dl className="signoff__terms">
            {[
              ["Per window", `${budget || "0"} USDC`, WINDOWS.find((w) => w.value === windowS)?.label],
              ["For its whole life", `${lifetime || "0"} USDC`, "never refills"],
              ["One purchase", `${tranche || "0"} USDC`, "at most"],
              ["One seller", `${concentration || "0"}%`, "of a window"],
              ["Depth", depth || "0", "levels"],
            ].map(([term, value, note]) => (
              <div key={term} className="signoff__row">
                <dt className="signoff__term">{term}</dt>
                <dd className="signoff__value num">
                  {value}
                  <span className="signoff__note">{note}</span>
                </dd>
              </div>
            ))}
          </dl>

          <p className="signoff__operator">
            Spent by <span className="mono">{operator}</span>
            <span className="signoff__note">the daemon&rsquo;s key, not yours</span>
          </p>

          <p className="signoff__foot">
            Your wallet signs; it does not pay. The money stays in the vault
            until an agent asks for a purchase the contract allows, and every
            draw is refused or recorded on {ARC.name}.
          </p>
        </div>
      </Modal>
    </>
  );
}
