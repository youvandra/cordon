/**
 * Where the other surface lives.
 *
 * The public site is a separate build. In production both surfaces sit behind
 * one origin and these are plain paths; in development they are two dev
 * servers, so the links need a port. A deploy that puts them on separate hosts
 * overrides this with `VITE_SITE_URL`.
 */
const SITE_URL: string =
  import.meta.env.VITE_SITE_URL ??
  (import.meta.env.DEV ? "http://localhost:5274" : "");

export const site = (path: string) => `${SITE_URL}${path}`;
