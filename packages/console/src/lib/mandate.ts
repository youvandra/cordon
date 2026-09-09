/**
 * Opening a mandate from the owner's own wallet, in the browser.
 *
 * This is the one action in the whole system that cannot be automated: a
 * mandate exists because a person signed for it. The deployer is a machine and
 * the owner is a human, and until now the only way to do it was a shell script
 * against a Foundry keystore.
 *
 * It simulates before it sends. A revert from the node is a hex string; a
 * simulation that fails can say *why* — and the failure most likely to happen
 * here has a specific cause worth naming, because the deployed registry
 * predates `lifetimeCap6` and takes a six-field struct where this sends seven.
 */
import { useCallback, useState } from "react";
import { createPublicClient, createWalletClient, custom, defineChain, type Hex } from "viem";
import { useWallets } from "@privy-io/react-auth";
import { ARC, DEPLOYMENT } from "@cordon/fixtures";
import { MandateRegistryAbi } from "../../../daemon/src/abi.gen.ts";

export const arc = defineChain({
  id: ARC.chainId,
  name: ARC.name,
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: ARC.nativeDecimals },
  rpcUrls: { default: { http: [ARC.rpc] } },
  blockExplorers: { default: { name: "arcscan", url: ARC.explorer } },
});

export interface MandateParams {
  operator: `0x${string}`;
  budget6: bigint;
  lifetimeCap6: bigint;
  windowSeconds: bigint;
  trancheCap6: bigint;
  concentrationBps: number;
  maxDepth: number;
}

export type OpenState =
  | { status: "idle" }
  | { status: "signing" }
  | { status: "sent"; hash: Hex }
  | { status: "open"; hash: Hex; node: Hex }
  | { status: "failed"; why: string };

/**
 * The registry, or nothing — `pending` is a value here too.
 *
 * The generated fixture types addresses as `string`, because before a deploy
 * there is none and the file says so with `null`. viem wants the narrower
 * type, and this is the one place that crossing happens.
 */
export const REGISTRY = DEPLOYMENT?.registry as `0x${string}` | undefined;

export function useOpenMandate() {
  const { wallets } = useWallets();
  const [state, setState] = useState<OpenState>({ status: "idle" });

  const open = useCallback(
    async (params: MandateParams) => {
      if (!REGISTRY) {
        setState({ status: "failed", why: "no deployment recorded for this chain yet" });
        return;
      }
      const wallet = wallets[0];
      if (!wallet) {
        setState({ status: "failed", why: "no wallet is connected" });
        return;
      }

      setState({ status: "signing" });
      try {
        /* Privy wallets follow whatever chain they were last on, and a
           signature sent to the wrong chain is not an error anyone can read. */
        await wallet.switchChain(ARC.chainId);
        const provider = await wallet.getEthereumProvider();
        const account = wallet.address as `0x${string}`;
        const walletClient = createWalletClient({ account, chain: arc, transport: custom(provider) });
        const publicClient = createPublicClient({ chain: arc, transport: custom(provider) });

        const call = {
          address: REGISTRY,
          abi: MandateRegistryAbi,
          functionName: "open" as const,
          args: [params] as const,
          account,
        };

        await publicClient.simulateContract(call);
        const hash = await walletClient.writeContract(call);
        setState({ status: "sent", hash });

        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        /* The node id is the first indexed topic of MandateOpened, which is the
           first log this call writes. Reading it back beats deriving it: the
           derivation is the registry's, and a second copy of it here would be
           a number that can disagree with the chain that just made it. */
        const node = receipt.logs[0]?.topics[1] as Hex | undefined;
        if (!node) {
          setState({ status: "failed", why: "the transaction landed but wrote no MandateOpened log" });
          return;
        }
        setState({ status: "open", hash, node });
      } catch (error) {
        const message = (error as Error).message ?? String(error);
        /* The one failure worth naming, because it looks like a bug and is a
           deployment being out of date. */
        const stale = /function.*not found|execution reverted|encodeFunctionData/i.test(message);
        setState({
          status: "failed",
          why: stale
            ? "the registry at this address does not take these parameters — it predates the lifetime cap, and the contracts need redeploying"
            : message.slice(0, 200),
        });
      }
    },
    [wallets],
  );

  return { state, open };
}
