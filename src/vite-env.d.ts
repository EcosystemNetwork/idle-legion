/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PARTICLE_PROJECT_ID?: string;
  readonly VITE_PARTICLE_CLIENT_KEY?: string;
  readonly VITE_PARTICLE_APP_ID?: string;
  readonly VITE_MAGIC_PUBLISHABLE_KEY?: string;
  readonly VITE_WAR_CHEST_RECEIVER?: string;
  readonly VITE_INSFORGE_URL?: string;
  readonly VITE_INSFORGE_FN_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  ethereum?: unknown;
}
