import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import { defineChain } from "viem";
import { ARC, MANDATE } from "@cordon/fixtures";

/**
 * The wallet gate.
 *
 * Creating a mandate and releasing a refusal both need a signature from the
 * owner's own key. Neither our server nor the agent can produce one, and that
 * is the argument this gate exists to make.
 *
 * With `VITE_PRIVY_APP_ID` set the gate is real: Privy holds the key, the
 * owner logs in, and the address on screen is one that can sign on Arc.
 * Without it the gate is the mock it has always been, and every surface that
 * depends on it says so out loud — a preview that claims a signature nobody
 * made is worse than one that admits it is a drawing.
 *
 * Privy holds the key; Cordon holds the bound. They answer different
 * questions — who may sign, and what may be signed for — and neither
 * substitutes for the other. A policy in the service that holds a key is an
 * off-chain control, which is `declared` in this project's vocabulary, and it
 * is not what makes a refusal a refusal.
 */
const APP_ID: string | undefined =
  (import.meta.env.VITE_PRIVY_APP_ID as string | undefined) || undefined;

/* Arc is nobody's default chain, so it is declared here from the same fixture
   every other surface reads. */
const arc = defineChain({
  id: ARC.chainId,
  name: ARC.name,
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: ARC.nativeDecimals },
  rpcUrls: { default: { http: [ARC.rpc] } },
  blockExplorers: { default: { name: "arcscan", url: ARC.explorer } },
});

interface WalletState {
  address: string | null;
  connect: () => void;
  disconnect: () => void;
  /**
   * A way in that touches no key, kept even when Privy is configured.
   *
   * The console is the submission's own surface, and putting a login in front
   * of it means the first thing a reader meets is a signup form for a wallet
   * they do not want. The preview has always been the way to look at the four
   * screens; a real wallet is the way to sign. Both, and the badge says which.
   */
  preview: () => void;
  /** Whether the address above can actually sign, or is a drawing of one. */
  real: boolean;
  /** Whether a real wallet is available at all, whatever this session chose. */
  available: boolean;
  /**
   * Whether the session above is settled.
   *
   * Privy restores a session asynchronously, and until it has, `real` is false
   * for a reader who is in fact signed in. Every screen used to take that
   * moment at face value and draw the demo tree, so a reload showed an owner
   * somebody else's numbers under their own heading and then swapped them.
   * A screen that reads this shows a skeleton instead.
   */
  ready: boolean;
}

const WalletContext = createContext<WalletState>({
  address: null,
  connect: () => {},
  disconnect: () => {},
  preview: () => {},
  real: false,
  available: false,
  ready: true,
});

export const useWallet = () => useContext(WalletContext);

/** sessionStorage, not localStorage: a mock signature should not outlive the tab. */
const KEY = "cordon.wallet";

function read(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    /* Private windows and blocked site data both throw on access. */
    return null;
  }
}

function MockWallet({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(read);

  const enter = () => {
    try {
      sessionStorage.setItem(KEY, MANDATE.owner);
    } catch {
      /* Ignored: the gate still opens, it just will not survive a reload. */
    }
    setAddress(MANDATE.owner);
  };

  const value = useMemo<WalletState>(
    () => ({
      address,
      real: false,
      available: false,
      /* Nothing to restore: the mock reads sessionStorage synchronously. */
      ready: true,
      /* With no Privy app id there is one way in, and it is this one. */
      preview: () => enter(),
      connect: () => enter(),
      disconnect: () => {
        try {
          sessionStorage.removeItem(KEY);
        } catch {
          /* Ignored, as above. */
        }
        setAddress(null);
      },
    }),
    [address],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

/** Privy's session, in the shape the rest of the console already reads. */
function PrivyWallet({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, login, logout } = usePrivy();
  /* A session that chose to look rather than to sign, and it has to survive a
     reload: without that, opening /console/tree directly puts a reader at the
     gate, and every refresh after choosing to look puts them back there. Same
     storage as the mock, for the same reason — it should not outlive the tab. */
  const [previewing, setPreviewing] = useState(() => read() === MANDATE.owner);

  const signedIn = ready && authenticated;

  const value = useMemo<WalletState>(
    () => ({
      /* `ready` gates the address rather than the gate itself: showing a
         connected address before Privy has finished reading its own session
         is the same lie as showing a figure before the run that produced it. */
      address: signedIn ? (user?.wallet?.address ?? null) : previewing ? MANDATE.owner : null,
      real: signedIn,
      available: true,
      ready,
      preview: () => {
        try {
          sessionStorage.setItem(KEY, MANDATE.owner);
        } catch {
          /* Ignored: the gate still opens, it just will not survive a reload. */
        }
        setPreviewing(true);
      },
      connect: () => login(),
      disconnect: () => {
        try {
          sessionStorage.removeItem(KEY);
        } catch {
          /* Ignored, as above. */
        }
        setPreviewing(false);
        void logout();
      },
    }),
    [ready, signedIn, previewing, user, login, logout],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  if (!APP_ID) return <MockWallet>{children}</MockWallet>;

  return (
    <PrivyProvider
      appId={APP_ID}
      config={{
        /* An owner who logs in with an email has no wallet yet, and the
           mandate needs one. */
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
        defaultChain: arc,
        supportedChains: [arc],
      }}
    >
      <PrivyWallet>{children}</PrivyWallet>
    </PrivyProvider>
  );
}
