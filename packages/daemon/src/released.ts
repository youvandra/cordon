/**
 * Spending what the owner released.
 *
 * `TreeVault.release` moves a refused amount out of the treasury into the
 * operator's Gateway balance, on the owner's signature. Until this existed
 * nothing spent it: the daemon only ever paid out of a fresh draw, and a fresh
 * draw is refused by the same bound again. The owner signed, the money moved,
 * and the purchase they meant to allow never happened.
 *
 * So before a draw, the fetch asks here for a released refusal that names this
 * node, this payee and this amount, and that has not been spent. If there is
 * one, the purchase is settled out of the balance the release already put
 * there and no draw is sent — the bound does not move, which is the whole
 * promise of a release.
 *
 * The match is read from the chain rather than remembered from the refusal,
 * so a release signed before this code existed is spendable too, and a daemon
 * restart forgets nothing it needs. What it does remember is which ones it has
 * spent, in a file: a released amount pays one purchase, not one per restart.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Address, Hex } from "viem";

export interface RefusalRow {
  node: Hex;
  counterparty: Address;
  amount6: bigint;
  released: boolean;
}

export interface ReleasedPurchases {
  /** A released, unspent refusal for exactly this purchase, now reserved for
   *  it — or null, and the caller draws as usual. */
  claim(node: Hex, payTo: Address, amount6: bigint): Promise<bigint | null>;
  /** Give a reservation back, when the settlement failed before paying. */
  unclaim(refusalId: bigint): void;
}

export interface ChainReleasesOptions {
  count: () => Promise<bigint>;
  read: (id: bigint) => Promise<RefusalRow>;
  /** Where spent refusal ids are kept. Ids are public; the file is not a secret. */
  file: string;
  /** How many of the newest refusals to look through. */
  scan?: number;
}

export class ChainReleases implements ReleasedPurchases {
  private readonly options: ChainReleasesOptions;
  private readonly spent: Set<string>;

  constructor(options: ChainReleasesOptions) {
    this.options = options;
    this.spent = existsSync(options.file)
      ? new Set((JSON.parse(readFileSync(options.file, "utf8")) as string[]).map(String))
      : new Set();
  }

  async claim(node: Hex, payTo: Address, amount6: bigint): Promise<bigint | null> {
    const count = await this.options.count();
    const scan = BigInt(this.options.scan ?? 256);
    const floor = count > scan ? count - scan : 0n;

    for (let id = count; id > floor; id--) {
      const key = id.toString();
      if (this.spent.has(key)) continue;
      const row = await this.options.read(id);
      if (!row.released) continue;
      if (row.node.toLowerCase() !== node.toLowerCase()) continue;
      if (row.counterparty.toLowerCase() !== payTo.toLowerCase()) continue;
      if (row.amount6 !== amount6) continue;

      /* Reserved and written before anything is paid. A crash between here
         and the payment leaves a release marked spent that was not — which
         costs a purchase — rather than one spent twice, which costs money. */
      this.spent.add(key);
      this.save();
      return id;
    }
    return null;
  }

  unclaim(refusalId: bigint): void {
    if (this.spent.delete(refusalId.toString())) this.save();
  }

  private save(): void {
    mkdirSync(dirname(this.options.file), { recursive: true });
    writeFileSync(this.options.file, JSON.stringify([...this.spent], null, 2) + "\n");
  }
}
