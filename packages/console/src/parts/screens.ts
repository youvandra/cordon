/**
 * The four screens, in the order they are worked through.
 *
 * Its own module so the palette can list them without importing the shell that
 * the palette is rendered inside.
 */
export const SCREENS = [
  { id: "setup", label: "Setup", description: "sign the mandate" },
  { id: "tree", label: "Tree", description: "watch the exposure" },
  { id: "refusals", label: "Refusals", description: "decide, or leave it" },
  { id: "drill", label: "Drill", description: "the measured ceiling" },
] as const;
