/// <reference types="vite/client" />

/**
 * Only the variables this app actually reads. `vite/client` types
 * `import.meta.env` loosely; naming them here means a typo in a deploy's
 * environment is a type error rather than a link that silently goes nowhere.
 */
interface ImportMetaEnv {
  readonly VITE_CONSOLE_URL?: string;
  readonly VITE_SITE_URL?: string;
  /** Where the meter answers. Unset means the record pages read fixtures. */
  readonly VITE_METER_URL?: string;
  /** A second meter, for the other chain Cordon is deployed on. Record ids
   *  are per contract, so one URL cannot answer for both. */
  readonly VITE_METER_ARC_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
