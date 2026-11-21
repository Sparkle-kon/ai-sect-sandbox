import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {campaignStopReceiptMatchesResult,detectCampaignStop,sameCampaignStopCondition,validCampaignStopCondition}
  from '../src/engine/campaignStopCondition';
import {advanceRelocations,resolveRelocationAction} from '../src/engine/relocationEngine';
import {terrainTileAt} from '../src/engine/terrainEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {Cultivator,LLMDecisionPayload,RelocationMove,WorldEvent,WorldState} from '../src/types/world';

const idle:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'按实际规则静候。'};
const step=(world:WorldState)=>advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,idle])),()=>.99);
const current=(world:WorldState)=>world.events.filter(row=>row.tick===world.tick);
function simultaneousDeaths(){
  const before=createInitialWorld(2031);before.month=12;before.tick=12;
  const sect=before.sects[0],incumbent=before.cultivators.find(row=>row.id===sect.leaderId)!;
  const peer=before.cultivators.find(row=>row.sectId!==sect.id&&!before.sects.some(group=>group.leaderId===row.id))!;
  const survivor=before.cultivators.find(row=>row.sectId===sect.id&&row.id!==incumbent.id)!;
  for(const actor of [incumbent,peer]){actor.age=actor.lifespan-1;actor.alive=true;actor.hp=actor.maxHp;}
  survivor.name=incumbent.name;peer.name=incumbent.name;survivor.age=26;survivor.lifespan=120;
  const after=step(before);
  expect(after.events.some(row=>row.id===`evt-${after.tick}-${incumbent.id}-oldage`)).toBe(true);
  expect(after.events.some(row=>row.id===`evt-${after.tick}-${peer.id}-oldage`)).toBe(true);
  return {before,after,incumbent,peer,survivor,sectId:sect.id};
}

describe('selected exact actual native campaign stop',()=>{
  it('binds only selected named dying actor despite same-name same-month other death and same-name survivor',()=>{
    const {before,after,incumbent,peer,survivor}=simultaneousDeaths(),events=current(after);
    const select={kind:'actor_died' as const,actorId:incumbent.id};
    const hit=detectCampaignStop(select,before,after,events);
    expect(validCampaignStopCondition(before,select)).toBe(true);
    expect(validCampaignStopCondition(before,{...select,displayName:incumbent.name})).toBe(false);
    expect(validCampaignStopCondition(after,select)).toBe(false);
    expect(sameCampaignStopCondition(select,{...select,actorId:survivor.id})).toBe(false);
    expect(hit).toEqual({kind:'actor_died',actorId:incumbent.id,tick:after.tick,year:after.year,month:1,
      eventId:`evt-${after.tick}-${incumbent.id}-oldage`});
    expect(campaignStopReceiptMatchesResult(select,hit,after)).toBe(true);
    expect(campaignStopReceiptMatchesResult({...select,actorId:peer.id},hit,after)).toBe(false);
    expect(detectCampaignStop({...select,actorId:survivor.id},before,after,events)).toBeUndefined();
    expect(detectCampaignStop(select,before,step(after),events)).toBeUndefined();
  });

  it('preserves an actual transition receipt but does not attribute a private, missing, or conflicting event',()=>{
    const {before,after,incumbent}=simultaneousDeaths();
    const select={kind:'actor_died' as const,actorId:incumbent.id};
    const proof=current(after).find(row=>row.id===`evt-${after.tick}-${incumbent.id}-oldage`)!;
    const safe={kind:'actor_died',actorId:incumbent.id,tick:after.tick,year:after.year,month:1};
    expect(detectCampaignStop(select,before,after,[])).toEqual(safe);
    expect(detectCampaignStop(select,before,after,[proof,{...proof,witnessScope:'participants'}])).toEqual(safe);
    const hidden=structuredClone(after);
    hidden.events.find(row=>row.id===proof.id)!.witnessScope='participants';
    expect(detectCampaignStop(select,before,hidden,[proof])).toEqual(safe);
    expect(JSON.stringify(detectCampaignStop(select,before,hidden,[proof]))).not.toContain(proof.description);
  });

  it('uses real elected incumbent transition and not another simultaneous selected death event',()=>{
    const {before,after,incumbent,sectId}=simultaneousDeaths();
    const sect=after.sects.find(row=>row.id===sectId)!;
    expect(sect.succession).toMatchObject({method:'election',previousLeaderId:incumbent.id,tick:after.tick});
    const selected={kind:'sect_leader_changed' as const,sectId,initialLeaderId:incumbent.id};
    const result=detectCampaignStop(selected,before,after,current(after));
    expect(result).toEqual({kind:selected.kind,sectId,tick:after.tick,year:after.year,month:1,
      fromActorId:incumbent.id,toActorId:sect.leaderId,method:'election',eventId:`evt-${after.tick}-${sectId}-leadership-vacancy-${sect.leaderId}`});
    expect(campaignStopReceiptMatchesResult(selected,result,after)).toBe(true);
    const vacancy=structuredClone(after);delete vacancy.sects.find(row=>row.id===sectId)!.leaderId;
    expect(detectCampaignStop(selected,before,vacancy,current(vacancy))).toBeUndefined();
  });

  it('ignores an actual vacancy and then stops on the later native appointment against the bound initial identity',()=>{
    const before=createInitialWorld(2031);before.month=12;before.tick=12;
    const sect=before.sects[0],incumbent=before.cultivators.find(row=>row.id===sect.leaderId)!;
    const members=before.cultivators.filter(row=>row.id!==incumbent.id&&row.sectId===sect.id);
    for(const person of members)person.sectId=before.sects[1].id;
    incumbent.age=incumbent.lifespan-1;
    const selection={kind:'sect_leader_changed' as const,sectId:sect.id,initialLeaderId:incumbent.id};
    const vacant=step(before);
    expect(vacant.sects[0].officeVacancy).toMatchObject({tick:vacant.tick});
    expect(detectCampaignStop(selection,before,vacant,current(vacant))).toBeUndefined();
    // Fixture arrival supplies one eligible member; the appointment itself is the genuine native process.
    const member=vacant.cultivators.find(row=>row.id===members[0].id)!;
    member.sectId=sect.id;member.alive=true;member.hp=member.maxHp;
    const later=step(vacant);
    const receipt=detectCampaignStop(selection,vacant,later,current(later));
    expect(receipt).toMatchObject({fromActorId:incumbent.id,toActorId:member.id,filledVacancy:true,method:'election'});
    expect(campaignStopReceiptMatchesResult(selection,receipt,later)).toBe(true);
  });

  it('proves each exact native relocation title endpoint, not an adjacent place or shipment',()=>{
    const after=createInitialWorld(739),sect=after.sects[0],origin=after.locations.find(row=>row.id===sect.headquartersId)!;
    const destination=after.locations.find(row=>row.id==='loc-vein-north')!;
    const leader=after.cultivators.find(row=>row.id===sect.leaderId)!;
    const elder=after.cultivators.find(row=>row.sectId===sect.id&&row.id!==leader.id&&row.sectRank==='长老')!;
    for(const person of after.cultivators.filter(row=>row.sectId===sect.id))person.locationId=origin.id;
    leader.exploredTileIds.push(terrainTileAt(after,destination.x,destination.y)!.id);
    sect.arrayMaxHp=100;sect.arrayHp=25;sect.facilities.defense_array=1;sect.spiritStones=500;
    const call=(actor:Cultivator,relocationMove:RelocationMove,extra:Partial<LLMDecisionPayload>)=>resolveRelocationAction(after,actor,
      {...idle,chosenAction:'RELOCATE',relocationMove,...extra});
    expect(call(leader,'propose',{targetLocationId:destination.id})).not.toBeNull();
    const plan=after.relocations.plans[0];
    expect(call(elder,'approve',{targetRelocationId:plan.id})).not.toBeNull();
    advanceRelocations(after);
    let before=structuredClone(after),last:WorldEvent[]=[];
    for(let cycle=0;cycle<8&&plan.status==='in_transit';cycle++){
      before=structuredClone(after);
      after.tick++;after.month=after.month%12+1;
      if(after.month===1)after.year++;
      last=advanceRelocations(after);
    }
    expect(plan.status).toBe('settled');
    const selected={kind:'site_owner_changed' as const,siteId:destination.id};
    const arrived=`evt-${after.tick}-${plan.id}-arrived`;
    expect(detectCampaignStop(selected,before,after,last)).toMatchObject({siteId:destination.id,fromSectId:null,toSectId:sect.id,
      planId:plan.id,eventId:arrived});
    expect(detectCampaignStop({...selected,siteId:origin.id},before,after,last)).toMatchObject({siteId:origin.id,fromSectId:sect.id,toSectId:null,
      planId:plan.id,eventId:arrived});
    expect(detectCampaignStop({...selected,siteId:'loc-market'},before,after,last)).toBeUndefined();
    expect(campaignStopReceiptMatchesResult(selected,detectCampaignStop(selected,before,after,last),after)).toBe(true);
  });
});
