import type {RelationType,WorldState} from '../types/world';

const clampAffinity=(value:number)=>Math.max(-100,Math.min(100,value));

export function adjustRelationship(
  world: WorldState,
  fromId: string,
  toId: string,
  delta: number,
  fallbackType: RelationType,
  noteUpdate?: string
): void {
  const existing = world.relationships.find(
    (r) =>
      (r.fromId === fromId && r.toId === toId) ||
      (r.fromId === toId && r.toId === fromId)
  );
  if (existing) {
    existing.affinity = clampAffinity(existing.affinity + delta);
    if (existing.affinity <= -60) {
      existing.type = '血仇';
    } else if (existing.affinity >= 80 && existing.type === '竞争') {
      existing.type = '挚友';
    }
    if (noteUpdate) {
      existing.note = noteUpdate;
    }
  } else {
    world.relationships.push({
      fromId,
      toId,
      type: fallbackType,
      affinity: clampAffinity(delta),
      note: noteUpdate ?? '修仙界因果交集',
    });
  }
}
