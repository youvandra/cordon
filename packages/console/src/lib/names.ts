/**
 * An agent's ENS name, for the owner's own screens.
 *
 * `Resolve` answers a stranger who holds a name. This answers the opposite
 * question, on the screens that already know the tree: an agent is a node id
 * and an operator address, and a reader looking at a column of hexadecimal
 * cannot tell which agent is which. Once the agents have names, the console
 * should use them.
 *
 * Reverse resolution is what makes it possible without a second index: the
 * operator's address is in the mandate, and ENS answers what that address is
 * called. Nothing here trusts the answer on its own — viem's `getEnsName`
 * resolves the name forward again and returns nothing unless it comes back to
 * the same address, so a name somebody else pointed at this operator is not
 * reported as theirs.
 *
 * An agent with no name is not a failure. It is an agent nobody has named yet,
 * and the screens fall back to the id they always showed.
 */
import { useEffect, useState } from "react";
import { createPublicClient, http, type Address } from "viem";
import { sepolia } from "viem/chains";
import { CHAIN } from "./chain";

/* viem's own chain, for the Universal Resolver address it carries: ENS's
   guidance is to look a resolver up rather than hold one. */
const client =
  CHAIN.chainId === sepolia.id
    ? createPublicClient({ chain: sepolia, transport: http(CHAIN.rpc) })
    : null;

export interface AgentNames {
  /** What this operator's address is called, or nothing. */
  of(operator: string): string | undefined;
  /** True until the first answer, so "not yet" is not read as "no name". */
  reading: boolean;
}

export function useAgentNames(operators: Address[]): AgentNames {
  const [found, setFound] = useState<Map<string, string> | null>(null);
  const [reading, setReading] = useState(false);
  /* The identity of the list, not the array, so a re-render with an equal list
     does not ask the chain again. */
  const key = operators.join(",");

  useEffect(() => {
    if (!client || operators.length === 0) {
      setFound(null);
      return;
    }
    let live = true;
    setReading(true);

    (async () => {
      const names = new Map<string, string>();
      /* One at a time. Reverse resolution is two reads each, and a dozen
         agents leaving at once is a burst a public endpoint answers with
         429s — the same reason the tree read batches. */
      for (const operator of operators) {
        try {
          const name = await client!.getEnsName({ address: operator });
          if (name) names.set(operator.toLowerCase(), name);
        } catch {
          /* One address that cannot be resolved leaves the rest readable. */
        }
        if (!live) return;
      }
      if (!live) return;
      setFound(names);
      setReading(false);
    })();

    return () => {
      live = false;
    };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [key]);

  return {
    of: (operator) => found?.get(String(operator).toLowerCase()),
    reading,
  };
}
