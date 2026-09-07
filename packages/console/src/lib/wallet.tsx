import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { MANDATE } from "@cordon/fixtures";

/**
 * The wallet gate, and it is a mock.
 *
 * Creating a mandate and releasing a refusal both need a signature from the
 * owner's own key. Neither our server nor the agent can produce one, and
 * neither can this preview — so the gate is real as an argument and fake as an
 * implementation, and every surface that depends on it says so out loud.
 */
interface WalletState {
  address: string | null;
  connect: () => void;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState>({
  address: null,
  connect: () => {},
  disconnect: () => {},
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

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(read);

  const value = useMemo<WalletState>(
    () => ({
      address,
      connect: () => {
        try {
          sessionStorage.setItem(KEY, MANDATE.owner);
        } catch {
          /* Ignored: the gate still opens, it just will not survive a reload. */
        }
        setAddress(MANDATE.owner);
      },
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

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}
