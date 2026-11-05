/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_KEY: string;
  readonly VITE_AUTH_DOMAIN: string;
  readonly VITE_PROJECT_ID: string;
  readonly VITE_STORAGE_BUCKET: string;
  readonly VITE_MESSAGING_SENDER_ID: string;
  readonly VITE_APP_ID: string;
  readonly VITE_MEASUREMENT_ID: string;
  /** "true" turns on sign-in (see AUTH_ENABLED in firebase.ts) */
  readonly VITE_AUTH_ENABLED?: string;
  /** Shared accounts, used when auth is enabled; must match the emails in firestore.rules */
  readonly VITE_STAFF_EMAIL?: string;
  readonly VITE_ADMIN_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
