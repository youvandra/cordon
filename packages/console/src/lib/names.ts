/**
 * An agent's ENS name, for the owner's own screens.
 *
 * `Resolve` answers a stranger who holds a name. This answers the opposite
 * question, on the screens that already know the tree: an agent is a node id
 * and an operator address, and a reader looking at a column of hexadecimal
 * cannot tell which agent is which. Once the agents have names, the console
 * should use them.
 *
 * Reverse resolution used to be the only way in, and it cannot carry a name the
 * console issues: setting a reverse record needs two accounts — the operator
 * claims its own reverse node, an owner writes the name — and an agent named
 * from here has no operator present to claim. So the naming flow writes the
 * name beside the binding as the stated record `cordon.name`, and this reads
 * it back **forward**: the resolver's own `Bound` events give the node its
 * namehash, and the record gives the string. Reverse resolution stays as the
 * fallback for names somebody else published.
 *
 * Nothing here trusts a name on its own. A record is only used when hashing it
 * returns the namehash the resolver attached it to, so a stated name cannot be
 * swapped for another one and reported as this agent's.
 */
import { useEffect, useState } from "react";
import { createPublicClient, http, namehash, parseAbi, parseAbiItem, type Address, type Hex } from "viem";
import { DEMOS, DEPLOYMENTS, ENSV2, SEPOLIA } from "@cordon/fixtures";
import { CHAIN, chain } from "./chain";
import { placeOf } from "./ens-plan";

/* This package's own chain, which carries ENSv2's Universal Resolver.
   `viem/chains`'s Sepolia carries ENSv1's. `chain.ts` says nothing else in this
   package names a chain; this file used to. */
const client =
  CHAIN.chainId === ENSV2.chainId
    ? createPublicClient({ chain, transport: http(CHAIN.rpc) })
    : null;

const RESOLVER_ABI = parseAbi(["function text(bytes32 namehash, string key) view returns (string)"]);

/** Where a node's namehash can be read from, once it is bound. */
const BOUND = parseAbiItem(
  "event Bound(bytes32 indexed namehash, bytes32 indexed node, address indexed by)",
);

/**
 * The stated record the naming flow writes with the binding.
 *
 * The name a person typed. The namehash alone identifies the node to the
 * contracts and cannot be reversed into the string a seller would resolve, so
 * the string is carried here and checked against its own namehash on read.
 */
const NAME_KEY = "cordon.name";

export interface AgentNames {
  /** What this operator's address is called, or nothing. */
  of(operator: string): string | undefined;
  /** What this node is called, which is the figure the naming flow wrote. */
  ofNode(node: string): string | undefined;
  /** True until the first answer, so "not yet" is not read as "no name". */
  reading: boolean;
}

type Agent = { node: `0x${string}`; operator: `0x${string}` };

export function useAgentNames(agents: Agent[]): AgentNames {
  const [byOperator, setByOperator] = useState<Map<string, string> | null>(null);
  const [byNode, setByNode] = useState<Map<string, string> | null>(null);
  const [reading, setReading] = useState(false);
  /* The identity of the list, not the array, so a re-render with an equal list
     does not ask the chain again. */
  const key = agents.map((agent) => `${agent.node}:${agent.operator}`).join(",");

  useEffect(() => {
    if (!client || agents.length === 0) {
      setByOperator(null);
      setByNode(null);
      return;
    }
    let live = true;
    setReading(true);

    (async () => {
      const nodes = new Map<string, string>();
      const operators = new Map<string, string>();
      const wanted = new Map(agents.map((agent) => [agent.node.toLowerCase(), agent.operator.toLowerCase()]));

      /* Reverse first, one at a time. It names the operators somebody else
         already published, and — more usefully — it is the only way to learn
         which resolver answers for this tree, because `getLogs` on this
         endpoint refuses a query with no address. A dozen agents leaving at
         once is a burst a public endpoint answers with 429s, the same reason
         the tree read batches. */
      for (const agent of agents) {
        const operator = agent.operator.toLowerCase();
        if (operators.has(operator)) continue;
        try {
          const name = await client.getEnsName({ address: agent.operator });
          if (name) operators.set(operator, name);
        } catch {
          /* One address that cannot be resolved leaves the rest readable. */
        }
        if (!live) return;
      }

      /* Forward, seeded from the names reverse found: every binding on the
         resolver those names resolve through, then the stated record that
         carries the string. A tree's binds all land on the nearest ancestor's
         resolver, so one resolver usually covers the whole tree. */
      const resolvers = new Set<Address>();
      /* The demo tree's own name first, when it has one. Its operators carry no
         reverse record, so without this seed a tree named the moment it was
         built would read as a column of hexadecimal. */
      const seeded = DEMOS[SEPOLIA.chainId]?.name;
      if (seeded) {
        try {
          const place = await placeOf(client, seeded);
          if (place.resolver) resolvers.add(place.resolver);
        } catch {
          /* A demo name that will not walk leaves the rest readable. */
        }
      }
      for (const name of new Set(operators.values())) {
        try {
          const place = await placeOf(client, name);
          if (place.resolver) resolvers.add(place.resolver);
        } catch {
          /* A name reverse returned that will not walk leaves the rest. */
        }
      }

      const at = new Map<string, { resolver: Address; namehash: Hex }>();
      const from = BigInt(DEPLOYMENTS[SEPOLIA.chainId]?.fromBlock ?? 0);
      for (const resolver of resolvers) {
        try {
          const logs = await client.getLogs({
            address: resolver,
            event: BOUND,
            fromBlock: from,
            toBlock: "latest",
          });
          /* Oldest first, and the last binding for a node is the current one:
             a name reissued under the same node advances the pointer, and an
             earlier namehash would answer with the record it used to carry. */
          for (const log of logs) {
            const node = String(log.args.node).toLowerCase();
            if (wanted.has(node)) {
              at.set(node, { resolver, namehash: log.args.namehash as Hex });
            }
          }
        } catch {
          /* A range a public endpoint refuses leaves the rest readable. */
        }
      }

      for (const [node, where] of at) {
        if (!live) return;
        try {
          const name = await client.readContract({
            address: where.resolver,
            abi: RESOLVER_ABI,
            functionName: "text",
            args: [where.namehash, NAME_KEY],
          });
          /* A stated name is only this agent's when hashing it lands on the
             namehash the resolver bound. A record anybody could move would
             otherwise rename an agent the chain still bounds by another. */
          if (name && namehash(name) === where.namehash) {
            nodes.set(node, name);
            operators.set(wanted.get(node)!, name);
          }
        } catch {
          /* One resolver that will not answer leaves the rest readable. */
        }
      }

      if (!live) return;
      setByOperator(operators);
      setByNode(nodes);
      setReading(false);
    })();

    return () => {
      live = false;
    };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [key]);

  return {
    of: (operator) => byOperator?.get(String(operator).toLowerCase()),
    ofNode: (node) => byNode?.get(String(node).toLowerCase()),
    reading,
  };
}
