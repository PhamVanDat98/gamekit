declare module 'virtual:gk-adapter' {
  import type { PortalAdapter } from './types';
  export function createAdapter(): PortalAdapter;
}
