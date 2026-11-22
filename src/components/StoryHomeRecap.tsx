import { useMemo, type RefObject } from 'react';
import { projectStoryRecap } from '../engine/storyRecap';
import type { Cultivator, WorldState } from '../types/world';
import { ChronicleRecapControls } from './ChronicleRecapControls';

export default function StoryHomeRecap({world,scopeKey,viewer,readerRef}:{
  world:WorldState;scopeKey:string;viewer?:Cultivator;readerRef:RefObject<HTMLElement>;
}) {
  const recap=useMemo(()=>projectStoryRecap(world,viewer),[world,viewer]);
  return <ChronicleRecapControls recap={recap} readerRef={readerRef} world={world}
    scopeKey={scopeKey} viewerId={viewer?.id} chapterId="story-overview"/>;
}
