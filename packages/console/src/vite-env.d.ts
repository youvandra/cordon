/// <reference types="vite/client" />

/**
 * Only the variables this app actually reads. `vite/client` types
 * `import.meta.env` loosely; naming them here means a typo in a deploy's
 * environment is a type error rather than a link that silently goes nowhere.
 */
interface ImportMetaEnv {
  readonly VITE_CONSOLE_URL?: string;
  readonly VITE_SITE_URL?: string;
  /** Privy app id. Unset means the wallet gate is the mock it started as. */
  readonly VITE_PRIVY_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
