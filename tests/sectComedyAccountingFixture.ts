import {sectComicEventId} from '../src/engine/sectComedy';
import {resourceFlowAccountDelta,flowSect} from '../src/engine/resourceFlowEngine';
import type {WorldState} from '../src/types/world';

/** Keep native recruitment and growth assertions independent of the newly posted comedy transaction. */
export function comedyTreasuryDelta(world:WorldState):number{
  const sectId=world.sectManagement?.sectId;
  if(!sectId)return 0;
  return (world.resourceFlow.months.find(row=>row.tick===world.tick)?.entries??[])
    .filter(row=>row.reason==='sect_comedy'&&row.refId===sectComicEventId(world.tick,sectId)&&row.good==='stone')
    .reduce((sum,row)=>sum+resourceFlowAccountDelta(row,flowSect(sectId)),0);
}
