/** The sections the nav points at, in the order they are read. */
export const SECTIONS = [
  { id: "mechanism", label: "Mechanism" },
  { id: "arc", label: "Arc" },
  { id: "record", label: "Record" },
  { id: "start", label: "Start" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];
