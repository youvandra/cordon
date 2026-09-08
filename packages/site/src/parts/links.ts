/**
 * Where the other surface lives.
 *
 * The console is a separate build. In production both surfaces sit behind one
 * origin and `/console` is simply a path; in development they are two dev
 * servers, so the link needs a port. A deploy that puts them on separate
 * hosts overrides this with `VITE_CONSOLE_URL`.
 *
 * The split is not cosmetic: everything here is public and shareable, and
 * everything through this link needs the owner's key.
 */
export const CONSOLE_URL: string =
  import.meta.env.VITE_CONSOLE_URL ??
  (import.meta.env.DEV ? "http://localhost:5173/console" : "/console");
