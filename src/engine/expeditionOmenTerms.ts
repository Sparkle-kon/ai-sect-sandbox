import type { LocationNode } from '../types/world';

/** Registered, linked gate interiors are not lawful ordinary exploration destinations. */
export function isScopedExpeditionGate(location: LocationNode): boolean {
  return location.type === 'secret_realm' && location.expeditionOmenId !== undefined;
}
