/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Overrides the API prefix. Defaults to the Vite dev proxy target `/api/v1`. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
