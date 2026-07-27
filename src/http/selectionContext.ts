/**
 * Contexto de selección admin (campañas) en memoria del gateway.
 *
 * Evita reenviar campanias_json en cada POST de /oauth/approve
 * (superadmins pueden tener cientos de campañas → Payload Too Large).
 */

import type { CampaniaInfo } from "../wibiAuth.js";

export interface SelectionContext {
  pendingId: string;
  campanias: CampaniaInfo[];
  actorName?: string;
  expiresAtMs: number;
}

const TTL_MS = 10 * 60 * 1000;
const store = new Map<string, SelectionContext>();

function prune(): void {
  const now = Date.now();
  for (const [key, value] of store) {
    if (value.expiresAtMs <= now) store.delete(key);
  }
}

export function rememberSelectionContext(input: {
  pendingId: string;
  campanias: CampaniaInfo[];
  actorName?: string;
}): void {
  prune();
  store.set(input.pendingId, {
    pendingId: input.pendingId,
    campanias: input.campanias,
    actorName: input.actorName,
    expiresAtMs: Date.now() + TTL_MS,
  });
}

export function getSelectionContext(pendingId: string): SelectionContext | null {
  prune();
  const entry = store.get(pendingId);
  if (!entry) return null;
  if (entry.expiresAtMs <= Date.now()) {
    store.delete(pendingId);
    return null;
  }
  return entry;
}

export function forgetSelectionContext(pendingId: string): void {
  store.delete(pendingId);
}
