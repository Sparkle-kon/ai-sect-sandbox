import type { applyAnnotation } from '../engine/annotationsEngine';
import type { WorldState } from '../types/world';

export type NoteCommand = Parameters<typeof applyAnnotation>[2];
export type NoteStatus = 'saved' | 'stale' | 'readonly' | 'interrupted' | 'error' | Extract<ReturnType<typeof applyAnnotation>, { ok: false }>['code'];
export interface NotebookStamp { world: WorldState; branchId: string; actorId: string | null }

export function annotationWriteIsCurrent(stamp: NotebookStamp, world: WorldState, branchId: string, blocked: boolean, aborted = false): boolean {
  return !blocked && !aborted && stamp.world === world && stamp.branchId === branchId;
}
