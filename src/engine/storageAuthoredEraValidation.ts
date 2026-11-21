import type {WorldState} from '../types/world';
import {authoredBranchSectId,authoredEraId,isAuthoredEraProof} from './authoredEraProof';
import {DOCTRINE_FOUNDING_MIN_MEMBERS,DOCTRINE_FOUNDING_MIN_SUPPORT_QI,DOCTRINE_FOUNDING_MIN_WALLET} from './doctrineFoundingTerms';
import {SECT_CREDIT_RESERVE} from './sectCreditTerms';
import {FAST_FORWARD_CAMPAIGN_MAX_MONTHS} from './fastForwardCalendar';
import {terrainTileAt} from './terrainEngine';

const sortedUnique=(ids:readonly string[])=>ids.every((id,i)=>!i||id>ids[i-1]);
const sameIds=(a:readonly string[],b:readonly string[])=>a.length===b.length&&a.every((id,i)=>id===b[i]);
const GENERATED_BIRTH_YEAR=1001;
const FORMAT_PREFIX='sect-north-';

/** Authored receipts remain separate from native Chronicle/EraHistory. Neither these hashes nor
 * portable saves authenticate an external file; the true sealed pre-authored frame is checked at launch. */
export function validateAuthoredEraHistory(world:WorldState,fail:(path:string)=>never):void{
  const origin=world.authoredEraOrigin;
  const authoredSects=world.sects.filter(sect=>sect.id.startsWith(FORMAT_PREFIX));
  if(!origin){
    if(authoredSects.length)fail('authoredEraOrigin.missing');
    return;
  }
  const {draft}=origin;
  const months=(origin.year-GENERATED_BIRTH_YEAR)*12+origin.month-1;
  if(!isAuthoredEraProof(origin)||authoredEraId(origin)!==origin.id||
    !world.worldgen||world.worldgen.profileId!==draft.profileId||world.random.seed!==draft.seed||
    world.worldgen.birthTick!==1||origin.year!==draft.target.year||origin.month!==draft.target.month||
    origin.year<GENERATED_BIRTH_YEAR||origin.year>GENERATED_BIRTH_YEAR+100||months<1||months>FAST_FORWARD_CAMPAIGN_MAX_MONTHS||
    origin.openedTick!==months+1||origin.openedTick>world.tick||world.scenarioOrigin||world.scenarioAudit||
    origin.effects.length!==draft.conditions.length||!sortedUnique(origin.openingEventIds)||
    origin.openingEventIds.some(id=>world.events.some(row=>row.id===id&&row.tick!==origin.openedTick)))fail('authoredEraOrigin.references');

  const liveOpening=world.tick===origin.openedTick&&world.interventionSequence===0;
  const sites=new Map(world.locations.map(site=>[site.id,site]));
  let provedSect:string|undefined, adjustedSiteQI:number|undefined, adjustedSiteId:string|undefined;
  const depletion=origin.effects.find(row=>row.kind==='jade_vein_depleted');
  if(depletion){
    adjustedSiteQI=depletion.after.spiritQi;
    adjustedSiteId=depletion.siteId;
  }
  for(const [i,condition] of draft.conditions.entries()){
    const effect=origin.effects[i];
    if(effect?.kind!==condition.kind)fail('authoredEraOrigin.effects.order');
    if(effect.kind==='jade_vein_depleted'&&condition.kind===effect.kind){
      const site=sites.get(effect.siteId);
      const {before,after}=effect;
      if(!site||effect.siteId!==condition.siteId||after.spiritQi!==condition.spiritQi||after.jadeCapacity!==condition.jadeCapacity||
        before.jade>before.jadeCapacity||after.jade!==Math.min(before.jade,after.jadeCapacity)||
        before.spiritQi<after.spiritQi||before.jadeCapacity<after.jadeCapacity||
        before.spiritQi===after.spiritQi&&before.jadeCapacity===after.jadeCapacity||
        liveOpening&&(site.spiritQi!==after.spiritQi||site.herbs.jade_leaf!==after.jade||site.herbCapacity.jade_leaf!==after.jadeCapacity))
        fail('authoredEraOrigin.effects.depletion');
    }else if(effect.kind==='village_capacity'&&condition.kind===effect.kind){
      const village=world.settlements.villages.find(row=>row.id===effect.settlementId);
      if(!village||effect.settlementId!==condition.settlementId||effect.siteId!==village.locationId||!sites.has(effect.siteId)||
        effect.capacityAfter!==condition.capacity||effect.capacityAfter<effect.population||
        liveOpening&&(village.capacity!==effect.capacityAfter||village.population!==effect.population))
        fail('authoredEraOrigin.effects.village');
    }else if(effect.kind==='danxia_branch_moves_north'&&condition.kind===effect.kind){
      const parent=world.sects.find(row=>row.id===effect.parentSectId);
      const child=world.sects.find(row=>row.id===effect.branchSectId);
      const parentSite=sites.get(effect.parentSiteId), seat=sites.get(effect.destinationId);
      const tile=seat&&terrainTileAt(world,seat.x,seat.y);
      const people=new Map(world.cultivators.map(actor=>[actor.id,actor]));
      const members=new Set(effect.memberIds);
      provedSect=effect.branchSectId;
      if(!child||!parent||!parentSite||!seat||!tile||effect.destinationId!==condition.destinationId||
        effect.parentSectId!=='sect-danxia'||effect.branchSectId!==authoredBranchSectId(origin.id)||seat.id===parentSite.id||
        seat.y>=parentSite.y||tile.id!==effect.tileId||!sortedUnique(effect.memberIds)||!sameIds(effect.memberIds,[...condition.memberIds].sort())||
        effect.memberIds.length<DOCTRINE_FOUNDING_MIN_MEMBERS||effect.stayingIds.length<2||!sortedUnique(effect.stayingIds)||
        !members.has(effect.branchLeaderId)||!effect.stayingIds.includes(effect.parentLeaderId)||
        effect.memberIds.some(id=>!people.has(id))||effect.stayingIds.some(id=>!people.has(id)||members.has(id))||
        effect.branchStones!==condition.stones||effect.branchStones<DOCTRINE_FOUNDING_MIN_WALLET||
        effect.parentStonesBefore-effect.branchStones!==effect.parentStonesAfter||
        effect.protectedStones<SECT_CREDIT_RESERVE||effect.parentStonesAfter<effect.protectedStones||
        adjustedSiteId===effect.destinationId&&(adjustedSiteQI??0)<DOCTRINE_FOUNDING_MIN_SUPPORT_QI||
        liveOpening&&(child.leaderId!==effect.branchLeaderId||child.headquartersId!==seat.id||seat.ownerSectId!==child.id||
          tile.ownerSectId!==child.id||child.spiritStones!==effect.branchStones||parent.spiritStones!==effect.parentStonesAfter||
          parent.headquartersId!==parentSite.id||parentSite.ownerSectId!==parent.id||parent.leaderId!==effect.parentLeaderId||
          effect.memberIds.some(id=>{const actor=people.get(id);return !actor?.alive||actor.hp<=0||actor.sectId!==child.id||actor.locationId!==seat.id;})||
          effect.stayingIds.some(id=>{const actor=people.get(id);return !actor?.alive||actor.hp<=0||actor.sectId!==parent.id;})))
        fail('authoredEraOrigin.effects.sect');
    }
  }
  if(authoredSects.length!==(provedSect?1:0)||authoredSects.some(sect=>sect.id!==provedSect))fail('authoredEraOrigin.sectManifest');
  // Effects may never fabricate pre-existing native succession/custody for a
  // faction that did not exist at this tick in the verified natural baseline.
  if(provedSect&&world.eraHistory.receipts.some(row=>row.kind==='succession'&&row.sectId===provedSect&&(row.tick<origin.openedTick||row.tick===origin.openedTick&&origin.openingEventIds.includes(row.eventId))))
    fail('authoredEraOrigin.nativeSource');
}
