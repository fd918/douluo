/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AI_ENDPOINT?: string;
  readonly VITE_AI_DIRECT_ONLY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
