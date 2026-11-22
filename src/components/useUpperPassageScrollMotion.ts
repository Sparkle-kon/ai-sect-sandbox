import { useEffect, useRef, useState } from 'react';

export interface PassageMotionFrame {
  scope: string;
  actorId: string;
  tick: number;
  snapshot: object;
  sourceId?: string;
  historical: boolean;
}

/** A new display or a branch cut is not a step. Only a consecutive live turn can start the ink motion. */
export function advancedPassageMotion(previous: PassageMotionFrame | undefined, next: PassageMotionFrame | undefined) {
  return !!(previous && next?.sourceId && !previous.historical && !next.historical &&
    previous.scope === next.scope && previous.actorId === next.actorId &&
    previous.snapshot !== next.snapshot && previous.tick + 1 === next.tick && previous.sourceId !== next.sourceId);
}

export function useUpperPassageScrollMotion(frame: PassageMotionFrame | undefined) {
  const before = useRef<PassageMotionFrame>();
  const [playing, setPlaying] = useState<PassageMotionFrame>();
  const { scope, actorId, tick, snapshot, sourceId, historical } = frame ?? {};
  useEffect(() => {
    const next = scope !== undefined && actorId !== undefined && tick !== undefined &&
      snapshot !== undefined && historical !== undefined ? { scope, actorId, tick, snapshot, sourceId, historical } : undefined;
    setPlaying(advancedPassageMotion(before.current, next) ? next : undefined);
    before.current = next;
  }, [scope, actorId, tick, snapshot, sourceId, historical]);
  return !!(playing && frame && !frame.historical && playing.snapshot === frame.snapshot && playing.tick === frame.tick &&
    playing.scope === frame.scope && playing.actorId === frame.actorId && playing.sourceId === frame.sourceId);
}
