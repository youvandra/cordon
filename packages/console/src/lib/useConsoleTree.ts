import { DEMO } from "@cordon/fixtures";
import { useWallet } from "./wallet";
import { useChainTree, type ChainNode } from "./tree";

/**
 * Whose tree the console is showing, and the tree.
 *
 * A signed-in owner sees their own. Anybody else sees the public tree Cordon
 * runs on Arc — read the same way, from the same contracts — so the console is
 * useful before a wallet is involved rather than a gate in front of nothing.
 */
export function useConsoleTree() {
  const { address, real, ready } = useWallet();
  const mine = real && Boolean(address);
  const owner = mine ? address! : DEMO.owner;
  const chain = useChainTree(owner);
  const nodes: ChainNode[] = chain.state === "read" ? chain.nodes : [];
  const root =
    nodes.find((node) => node.parent === null && !node.revoked) ??
    nodes.find((node) => node.parent === null);

  return { ready, mine, owner, chain, nodes, root };
}
