import { describe,expect,it } from 'vitest';
import { createTerrainMapView } from '../src/components/terrainMapView';
import { CLAN_INNATE_TRAITS } from '../src/types/cultivationClan';
import { projectCultivationClans } from '../src/engine/cultivationClanEngine';
import { clanEventId } from '../src/engine/cultivationClanTerms';
import { decodeEraWorldSave,encodeEraWorldSave } from '../src/engine/storageEngine';
import {
  actualClanAdult,actualClanExpecting,actualClanProposal,clanActor,clanFirst,clanMonth,clanOrder,clanPropose,
  clanSecond,clanSite,clanUnion,
} from './clanDynastyNativeFixture';
import type { WorldState } from '../src/types/world';

function strict(world:WorldState){
  const raw=encodeEraWorldSave(world),restored=decodeEraWorldSave(raw);
  expect(encodeEraWorldSave(restored)).toBe(raw);
  return restored;
}
const noMinor=(world:WorldState,id:string)=>expect(world.cultivators.some(row=>row.id===id)).toBe(false);

describe('actual consent, birth and maturation in the cultivation clan',()=>{
  it('requires later independent adult consent to each separate phase and only pays the ceremony on native completion',()=>{
    const phases=actualClanExpecting();
    const {union,trusted,accepted,invited,bonded,offered,expecting}=phases;
    const sameMonth=clanMonth(trusted,{
      [clanFirst]:clanPropose,[clanSecond]:clanOrder('accept',union.id),
    });
    expect(clanUnion(sameMonth).status).toBe('proposed');
    let lapsed=sameMonth;
    for(let month=0;month<4;month++)lapsed=clanMonth(lapsed);
    expect(clanUnion(lapsed)).toMatchObject({status:'expired',closedTick:lapsed.tick});
    expect(clanUnion(lapsed).acceptedTick).toBeUndefined();
    expect(clanUnion(accepted).ceremony).toBeUndefined();
    expect(clanUnion(bonded).plan).toBeUndefined();
    expect(clanUnion(offered).plan?.acceptedTick).toBeUndefined();
    for(const id of [clanFirst,clanSecond]){
      expect(clanActor(invited,id).qiProgress).toBe(clanActor(accepted,id).qiProgress);
      expect(clanActor(bonded,id).qiProgress).toBe(clanActor(invited,id).qiProgress-8);
      expect(clanActor(expecting,id).qiProgress).toBe(clanActor(bonded,id).qiProgress);
    }
    expect(expecting.cultivationClans?.children).toEqual([]);
    const event=bonded.events.find(row=>row.id===clanEventId(bonded.tick,union.id,'ceremony'));
    expect(event).toMatchObject({locationId:clanSite,tick:bonded.tick});
    expect(event?.witnessScope).toBeUndefined();
    expect(event?.actorIds).toEqual(expect.arrayContaining([clanFirst,clanSecond]));
    expect(clanUnion(strict(expecting))).toEqual(clanUnion(expecting));
  });

  it('requires nine subsequent local months for the abstract birth, then exactly 216 native months before one playable adult',()=>{
    const {child,newborn,lastMinor,adult,justBefore,union,expecting,personId}=actualClanAdult();
    expect(new Set(child.roots)).toEqual(new Set(['木','火']));
    expect(CLAN_INNATE_TRAITS).toContain(child.innateTrait);
    expect(clanUnion(newborn).plan?.earnedTicks).toEqual(Array.from({length:9},(_,index)=>expecting.tick+index+1));
    expect(encodeEraWorldSave(clanMonth(strict(justBefore)))).toBe(encodeEraWorldSave(newborn));
    const birth=newborn.events.find(row=>row.id===clanEventId(newborn.tick,union.id,'birth'));
    expect(birth).toMatchObject({witnessScope:'participants',tick:newborn.tick,locationId:clanSite});
    expect(birth?.actorIds).not.toContain(personId);
    noMinor(newborn,personId);
    const parent=projectCultivationClans(newborn,clanActor(newborn));
    expect(parent?.unions.find(row=>row.id===union.id)).toMatchObject({own:true,children:[child]});
    const outside=projectCultivationClans(newborn,clanActor(newborn,'elder-danxia-1'));
    expect(outside?.unions.find(row=>row.id===union.id)).toMatchObject({own:false,children:[]});
    expect(outside?.unions.find(row=>row.id===union.id)?.plan).toBeUndefined();
    noMinor(lastMinor,personId);
    const minorTerrain=createTerrainMapView(lastMinor,clanActor(lastMinor),false);
    expect(minorTerrain.liveActors.some(row=>row.id===personId)).toBe(false);
    expect(adult.cultivationClans?.children.find(row=>row.id===child.id)?.maturedTick).toBe(adult.tick);
    expect(adult.cultivators.filter(row=>row.id===personId)).toHaveLength(1);
    expect(adult.cultivators.length).toBe(lastMinor.cultivators.length+1);
    expect(adult.cultivators.find(row=>row.id===personId)?.spiritRoot).toBe(child.roots[0]);
    expect(newborn.cultivationClans?.children[0].maturedTick).toBeUndefined();
    const reread=strict(adult);
    const beforePractice=clanActor(reread,personId);
    expect(beforePractice.maxHp).toBe(child.innateTrait==='steadfast_vessel'?132:120);
    expect(beforePractice.techniqueMastery).toBe(child.innateTrait==='keen_insight'?4:0);
    expect(beforePractice.qiProgress).toBe(child.innateTrait==='clear_meridians'?6:0);
    const after=clanMonth(reread,{[personId]:{chosenAction:'CULTIVATE',innerMonologue:'成人后亲自修行第一步。'}});
    expect(clanActor(after,personId).qiProgress).toBeGreaterThan(beforePractice.qiProgress);
    expect(after.cultivators.filter(row=>row.id===personId)).toHaveLength(1);
    expect(after.cultivationClans?.children[0]).toEqual(adult.cultivationClans?.children[0]);
  },30_000);

  it('allows an actual refusal, stops remote consent and does not infer a child from one adult’s family proposal',()=>{
    const {proposed,union}=actualClanProposal();
    const refused=clanMonth(proposed,{[clanSecond]:clanOrder('refuse',union.id)});
    expect(clanUnion(refused)).toMatchObject({status:'refused',closedTick:refused.tick});
    expect(clanUnion(clanMonth(refused,{[clanSecond]:clanOrder('accept',union.id)}))).toEqual(clanUnion(refused));
    const phases=actualClanExpecting();
    const adultDeclines=clanMonth(phases.offered,{[clanSecond]:clanOrder('family_refuse',union.id)});
    expect(clanUnion(adultDeclines)).toMatchObject({status:'bonded',plan:{status:'declined',closedTick:adultDeclines.tick}});
    expect(strict(adultDeclines).cultivationClans?.children).toEqual([]);
    const departed=clanMonth(phases.bonded,{[clanSecond]:{chosenAction:'EXPLORE',targetLocationId:'loc-market',
      innerMonologue:'本人先行离开丹霞。'}});
    expect(clanActor(departed,clanSecond).locationId).toBe('loc-market');
    const unilateral=clanMonth(departed,{[clanFirst]:clanOrder('family_offer',union.id)});
    expect(clanUnion(unilateral).plan).toBeUndefined();
    expect(unilateral.cultivationClans?.children).toEqual([]);
  });
});

it('closes an unfinished family plan only after the true natural death, without silently creating a descendant',()=>{
  const {expecting}=actualClanExpecting(true);
  const stillAlive=clanMonth(expecting);
  expect(stillAlive.tick).toBe(12);
  expect(clanActor(stillAlive).alive).toBe(true);
  expect(clanUnion(stillAlive).plan).toMatchObject({status:'expecting',earnedTicks:[stillAlive.tick]});
  const after=clanMonth(stillAlive);
  expect(after.tick).toBe(13);
  expect(clanActor(after).alive).toBe(false);
  expect(after.events).toContainEqual(expect.objectContaining({category:'death',tick:after.tick,actorIds:[clanFirst]}));
  expect(clanUnion(after)).toMatchObject({status:'bonded',plan:{status:'lost',earnedTicks:[stillAlive.tick],closedTick:after.tick}});
  expect(strict(after).cultivationClans?.children).toEqual([]);
});
