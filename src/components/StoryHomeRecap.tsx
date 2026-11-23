import { useCallback, type RefObject } from 'react';
import type { Cultivator, WorldState } from '../types/world';
import { ChronicleRecapControls } from './ChronicleRecapControls';

export default function StoryHomeRecap({world,scopeKey,viewer,readerRef}:{
  world:WorldState;scopeKey:string;viewer?:Cultivator;readerRef:RefObject<HTMLElement>;
}) {
  const loadRecap=useCallback(async()=> (await import('./projectHomeStoryRecap')).projectStoryRecap(world,viewer),[world,viewer]);
  if(!world.chronicleArchive.chapters.length&&!world.coldHistory?.chapters.length)return null;
  return <ChronicleRecapControls loadRecap={loadRecap} readerRef={readerRef} world={world}
    scopeKey={scopeKey} viewerId={viewer?.id} chapterId="story-overview"/>;
}
