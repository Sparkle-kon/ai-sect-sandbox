import type { WorldState } from '../types/world';

function sameAuthoredOrigin(a:WorldState['authoredEraOrigin'],b:WorldState['authoredEraOrigin']):boolean {
  if(a===b)return true;
  if(!a||!b||a.version!==b.version||a.id!==b.id||a.openedTick!==b.openedTick||a.year!==b.year||a.month!==b.month||
    a.baselineDigest!==b.baselineDigest||a.designDigest!==b.designDigest||a.rulesRevision!==b.rulesRevision)return false;
  if(a.openingEventIds.length!==b.openingEventIds.length||a.openingEventIds.some((id,i)=>id!==b.openingEventIds[i]))return false;
  const {draft:x}=a,{draft:y}=b;
  return x.format===y.format&&x.version===y.version&&x.seed===y.seed&&x.profileId===y.profileId&&
    x.anchor.year===y.anchor.year&&x.anchor.month===y.anchor.month&&x.target.year===y.target.year&&x.target.month===y.target.month&&
    x.conditions.length===y.conditions.length&&x.conditions.every((condition,i)=>{
      const other=y.conditions[i];
      switch(condition.kind){
        case 'jade_vein_depleted':return other.kind===condition.kind&&condition.siteId===other.siteId&&
          condition.spiritQi===other.spiritQi&&condition.jadeCapacity===other.jadeCapacity;
        case 'village_capacity':return other.kind===condition.kind&&condition.settlementId===other.settlementId&&condition.capacity===other.capacity;
        case 'danxia_branch_moves_north':return other.kind===condition.kind&&condition.destinationId===other.destinationId&&condition.stones===other.stones&&
          condition.memberIds.length===other.memberIds.length&&condition.memberIds.every((id,index)=>id===other.memberIds[index]);
      }
    });
}

/** Natural, portable and built-in scenario origins all distinguish independent ancestries. */
export function sameGeneratedWorld(a: WorldState, b: WorldState): boolean {
  return a.random.seed === b.random.seed &&
    (a.worldgen?.profileId ?? 'classic') === (b.worldgen?.profileId ?? 'classic') &&
    (a.worldgen?.algorithm ?? 1) === (b.worldgen?.algorithm ?? 1) &&
    a.builtinScenarioOrigin?.id === b.builtinScenarioOrigin?.id &&
    a.builtinScenarioOrigin?.version === b.builtinScenarioOrigin?.version &&
    a.builtinScenarioOrigin?.openedTick === b.builtinScenarioOrigin?.openedTick &&
    a.scenarioOrigin?.id === b.scenarioOrigin?.id &&
    a.scenarioOrigin?.version === b.scenarioOrigin?.version &&
    a.scenarioOrigin?.ruleset === b.scenarioOrigin?.ruleset &&
    a.scenarioOrigin?.endTick === b.scenarioOrigin?.endTick &&
    sameAuthoredOrigin(a.authoredEraOrigin,b.authoredEraOrigin);
}
