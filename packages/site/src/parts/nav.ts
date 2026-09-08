/**
 * The sections the footer points at, in the order they are read.
 *
 * The nav bar no longer lists them. A one page site with a section menu asks
 * the reader to choose before they know what the choices are, so the bar
 * carries the two places a reader actually leaves for: the docs and the
 * console.
 */
export const SECTIONS = [
  { id: "how", label: "How it works" },
  { id: "arc", label: "Arc" },
  { id: "record", label: "Record" },
  { id: "start", label: "Start" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];
