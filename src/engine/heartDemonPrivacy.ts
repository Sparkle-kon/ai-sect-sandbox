import type {Cultivator,CultivatorReflection,MemoryEntry} from '../types/world';

/** The pre-existing heart theatre stored its exact choice as a private memory (even in older saves). */
export function sealedHeartDemonMemory(memory:MemoryEntry):boolean{
  return memory.category==='heavenly'&&memory.content.startsWith('幻境之中，选择了「');
}
export const sealedHeartDemonEventId=(id:string|undefined):boolean=>typeof id==='string'&&
  (/^evt-heart-demon-.+-resolved$/u.test(id)||id.startsWith('evt-dao-heart-mending-'));

export function sealedHeartDemonMemoryIds(actor:Cultivator):ReadonlySet<string>{
  const ids=new Set([...actor.memories,...actor.coreMemories].filter(sealedHeartDemonMemory).map(row=>row.id));
  const evidence=actor.tribulation?.heartDemon?.evidence;
  if(evidence?.kind==='reflection')ids.add(evidence.memoryId);
  return ids;
}
export function sealedHeartDemonReflection(actor:Cultivator,reflection:CultivatorReflection,ids=sealedHeartDemonMemoryIds(actor)):boolean{
  const evidence=actor.tribulation?.heartDemon?.evidence;
  return reflection.sourceMemoryIds.some(id=>ids.has(id))||evidence?.kind==='reflection'&&evidence.reflectionId===reflection.id;
}
