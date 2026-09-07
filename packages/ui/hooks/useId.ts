import { useId as useReactId } from "react";

/** Stable, prefixed id for aria wiring. */
export function useCordonId(prefix: string, provided?: string): string {
  const generated = useReactId();
  return provided ?? `cordon-${prefix}-${generated.replace(/[:»«]/g, "")}`;
}
