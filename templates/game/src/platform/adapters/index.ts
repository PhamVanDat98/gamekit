import { createAdapter } from 'virtual:gk-adapter';
import type { PortalAdapter } from '../types';

/**
 * The build resolves `virtual:gk-adapter` to src/platform/adapters/<GK_PORTAL>.ts
 * (see vite.config.ts), so each portal package contains only its own SDK code.
 * Every adapter file exports `createAdapter(): PortalAdapter`.
 */
export async function loadAdapter(): Promise<PortalAdapter> {
  return createAdapter();
}
