/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_JSONBIN_BIN_ID?: string;
  readonly VITE_JSONBIN_MASTER_KEY?: string;
  [key: string]: any;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
