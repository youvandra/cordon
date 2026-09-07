import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import { CordonDefs } from "./primitives/CordonDefs";
import { useCordonReducedMotion } from "../hooks/useReducedMotion";
import { cx } from "./cx";

export interface CordonContextValue {
  /** True when the viewer asked for less motion. Components read this. */
  reducedMotion: boolean;
  /** Default glaze for surfaces that do not name one. */
  glaze: "rose" | "violet" | "ember";
}

const CordonContext = createContext<CordonContextValue>({
  reducedMotion: false,
  glaze: "rose",
});

export function useCordon(): CordonContextValue {
  return useContext(CordonContext);
}

export interface CordonProviderProps {
  children: ReactNode;
  /** House glaze for this subtree. */
  glaze?: CordonContextValue["glaze"];
  className?: string;
  /** Skip the root reset — useful when embedding inside an existing design. */
  bare?: boolean;
}

/**
 * Mounts the shared filter defs, the reset, and the motion preference once.
 * Wrap the app in it; nesting is allowed and only changes the house glaze.
 */
export function CordonProvider({ children, glaze = "rose", className, bare }: CordonProviderProps) {
  const reducedMotion = useCordonReducedMotion();
  const value = useMemo<CordonContextValue>(
    () => ({ reducedMotion, glaze }),
    [reducedMotion, glaze],
  );

  return (
    <CordonContext.Provider value={value}>
      <div className={cx(!bare && "cordon-root", className)} data-cordon-glaze={glaze}>
        <CordonDefs />
        {children}
      </div>
    </CordonContext.Provider>
  );
}
