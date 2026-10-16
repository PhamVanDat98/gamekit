/** Globals set by the portal loader (loader.js) or, under `npm run dev`, by dev-loader.ts. */
export {};

declare global {
  interface GmLanguage {
    code: string;
    name: string;
  }
  interface Window {
    GM_LANG?: { code: string; dict: Record<string, unknown>; available: GmLanguage[] };
    GM_LOADER?: { copyright: string; version: string; setLanguage(code: string): void; ready(): void };
    GMGameSDK?: { trackEventParams?(event: string, data: Record<string, unknown>): void };
  }
}
