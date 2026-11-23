import { STARTER_SECT_IDS, starterSectIdentity } from '../../types/sectManagement';
import type { WorldState } from '../../types/world';
import { arr, id, num, one, optional, structure, tick, wealth } from './primitives';

const building = num(0,100,true);
export const sectManagementShape = structure({
  version: one(1),
  starterId: one(...STARTER_SECT_IDS),
  sectId: id,
  leaderId: id,
  homeSiteId: id,
  foundedTick: tick,
  draw: one(0,1),
  foundingDiscipleIds: arr(5,id),
  buildings: structure({ hall:building, kitchen:building, furnace:building, trainingGround:building, gate:building, library:building }),
  debt: optional(structure({ creditorId:id, principal:wealth, dueTick:tick })),
});

export function validateSectManagement(world: WorldState, fail: (field:string)=>never): void {
  for (const actor of world.cultivators) {
    if (actor.quirks && (!actor.quirks.length || new Set(actor.quirks).size !== actor.quirks.length))
      fail('cultivators.quirks');
  }
  const state=world.sectManagement;
  if(!state){
    for(const starterId of STARTER_SECT_IDS){
      for(const draw of [0,1] as const){
        const identity=starterSectIdentity(world.random.seed,starterId,draw);
        if(world.sects.some(row=>row.id===identity.sectId)||world.locations.some(row=>row.id===identity.homeSiteId)||
            world.cultivators.some(actor=>actor.id===identity.leaderId))return fail('sectManagement.origin');
      }
    }
    return;
  }
  const origin=starterSectIdentity(world.random.seed,state.starterId,state.draw);
  const sect=world.sects.find(row=>row.id===state.sectId);
  const home=world.locations.find(row=>row.id===state.homeSiteId);
  const people=new Map(world.cultivators.map(actor=>[actor.id,actor]));
  const founder=people.get(state.leaderId),creditor=people.get(origin.creditorId);
  if(!sect||!home||home.expeditionOmenId!==undefined||!founder||!creditor||
      state.sectId!==origin.sectId||state.leaderId!==origin.leaderId||state.homeSiteId!==origin.homeSiteId||
      state.foundedTick!==1||world.worldgen?.birthTick!==state.foundedTick||state.foundedTick>world.tick)
    return fail('sectManagement.origin');
  const disciples=state.foundingDiscipleIds.map(id=>people.get(id));
  if(disciples.length!==origin.foundingDiscipleIds.length||
      state.foundingDiscipleIds.some((id,index)=>id!==origin.foundingDiscipleIds[index])||
      disciples.some(actor=>!actor?.quirks?.length))return fail('sectManagement.roster');

  // Current deaths, disciples leaving, elections and relocation do not rewrite founding facts.
  if(world.tick===state.foundedTick&&world.interventionSequence===0){
    const homeBody=(actor:typeof founder|undefined)=>!!actor&&actor.alive&&actor.hp>0&&
      actor.positionPlane===undefined&&actor.sectId===sect.id&&actor.locationId===home.id;
    if(sect.leaderId!==founder.id||sect.headquartersId!==home.id||home.ownerSectId!==sect.id||home.type!=='sect_hq'||
        !homeBody(founder)||founder.sectRank!=='掌门'||disciples.some(actor=>!homeBody(actor))||
        !creditor.alive||creditor.hp<=0||creditor.locationId!=='loc-market'||creditor.positionPlane!==undefined||
        creditor.sectId===sect.id)return fail('sectManagement.foundingBodies');
  }
  // The named creditor must be the real Wang minted in this exact world. Due dates after opening
  // may move when later management rules actually renegotiate the note; never assert fictitious payment.
  if(state.debt&&(state.debt.principal<=0||state.debt.dueTick<=state.foundedTick||state.debt.creditorId!==creditor.id))
    return fail('sectManagement.debt');
  if(world.tick===state.foundedTick&&(state.starterId==='qingyun-odd-jobs'?
      state.debt?.principal!==80||state.debt?.dueTick!==state.foundedTick+6:state.debt!==undefined))
    return fail('sectManagement.debt');
}
