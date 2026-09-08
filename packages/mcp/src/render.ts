/**
 * How a refusal reads.
 *
 * A refusal is invisible by nature: nothing happens. Inside a chat, "nothing
 * happened" is indistinguishable from a bug unless the tool says which bound
 * stopped it, at which node, and where the record is. This file is the
 * difference between a judge seeing a control and a judge seeing an error.
 *
 * Nothing here invents a figure. Every number comes from the outcome the
 * contract returned.
 */
import type { DrawOutcome } from "../../daemon/src/gate.ts";
import type { Offer } from "../../daemon/src/challenge.ts";

const usdc = (base6: bigint) => {
  const whole = base6 / 1_000_000n;
  const frac = (base6 % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "") || "0";
  return `$${whole}.${frac}`;
};

const short = (id: string) => `${id.slice(0, 10)}…${id.slice(-6)}`;

const WHY: Record<string, string> = {
  "tranche-cap": "the purchase is larger than one tranche",
  "window-budget": "the window has no room left",
  concentration: "too much of the window has already gone to this counterparty",
  revoked: "the mandate for this branch was cut",
  "vault-balance": "the vault holds less than the purchase costs",
};

export function renderRefusal(outcome: DrawOutcome, offer: Offer, explorer?: string): string {
  const lines = [
    `REFUSED — ${WHY[outcome.reason] ?? outcome.reason}.`,
    "",
    `The purchase        ${usdc(offer.amount)} to ${offer.payTo}`,
    `The bound that hit  ${outcome.reason}`,
  ];

  if (outcome.breachedAt) {
    /* Naming the node is the whole point: the draw was made here and stopped
       somewhere above, which is the thing no per-agent limit can do. */
    lines.push(`Enforced at         ${short(outcome.breachedAt)}`);
  }
  if (outcome.refusalId !== undefined) {
    lines.push(`On the record as    refusal #${outcome.refusalId}`);
  }
  if (outcome.txHash) {
    lines.push(`Transaction         ${outcome.txHash}`);
    if (explorer) lines.push(`                    ${explorer}/tx/${outcome.txHash}`);
  }

  lines.push(
    "",
    "Nothing was paid and no budget was consumed. This is a decision the",
    "contract made; it cannot be retried past the bound that produced it.",
  );

  return lines.join("\n");
}

export function renderPaid(outcome: DrawOutcome, offer: Offer, body: unknown): string {
  const text = typeof body === "string" ? body : JSON.stringify(body, null, 2);
  return [
    `Paid ${usdc(offer.amount)} to ${offer.payTo} on ${offer.network}.`,
    outcome.beneficiary ? `Tranche credited to ${outcome.beneficiary}.` : "",
    outcome.txHash ? `Draw ${outcome.txHash}` : "",
    "",
    text,
  ]
    .filter(Boolean)
    .join("\n");
}
