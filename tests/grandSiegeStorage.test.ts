import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { possessAvatar } from '../src/engine/avatarEngine';
import { resolveCeasefireAction } from '../src/engine/ceasefireEngine';
import { queueGrandSiegeHero } from '../src/engine/grandSiegeTheatreEngine';
import { decodeEraWorldSave, decodeWorldSave, encodeEraWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import type { WorldState } from '../src/types/world';
import { actualGrandSiege, actualSiege, attackSect, commander, patriarch, siegeActor, siegeTurn } from './grandSiegeNativeFixture';

function theatre(world:WorldState) {
  const frame=actualSiege(world).theatre;
  if (!frame) throw Error('Expected native paid opposing siege theatre');
  return frame;
}
function reject(world:WorldState, edit:(copy:WorldState)=>void, expected:RegExp) {
  const copy=structuredClone(world);
  edit(copy);
  expect(()=>encodeWorldSave(copy)).toThrow(expected);
}
const reopen=(world:WorldState)=>{
  const encoded=encodeWorldSave(world);
  const restored=decodeWorldSave(encoded);
  expect(encodeWorldSave(restored)).toBe(encoded);
  return restored;
};

describe('strict grand siege theatre save proof',()=>{
  it('leaves legacy state byte-exact and retains the genuine launch, physical arrival and following round',()=>{
    const initial=encodeWorldSave(createInitialWorld());
    expect(initial).not.toContain('"theatre"');
    expect(encodeWorldSave(decodeWorldSave(initial))).toBe(initial);
    const {launched,arrived}=actualGrandSiege();
    expect(theatre(reopen(launched)).arrivedTick).toBeUndefined();
    expect(theatre(reopen(arrived))).toMatchObject({openedTick:5,arrivedTick:7,rounds:[]});
    const first=siegeTurn(arrived);
    expect(theatre(first).rounds).toHaveLength(1);
    expect(encodeEraWorldSave(siegeTurn(reopen(arrived)))).toBe(encodeEraWorldSave(first));
    const era=encodeEraWorldSave(first);
    expect(encodeEraWorldSave(decodeEraWorldSave(era))).toBe(era);
    const legacy=structuredClone(launched);
    delete actualSiege(legacy).theatre;
    expect(actualSiege(reopen(legacy)).theatre).toBeUndefined();
  });

  it('rejects fabricated launch, moved arrival and tampered scoped/public evidence',()=>{
    const {launched,arrived}=actualGrandSiege();
    reject(launched,w=>{theatre(w).sourceLaunchId='made-up-launch';},/sieges.theatre.launch/);
    reject(launched,w=>{theatre(w).openedTick--;},/sieges.theatre.launch/);
    reject(arrived,w=>{theatre(w).arrivedTick=6;},/sieges.theatre.arrival/);
    reject(arrived,w=>{const source=w.events.find(event=>event.id===theatre(w).sourceLaunchId)!; source.witnessScope='participants';},/sieges.theatre.launch/);
    reject(arrived,w=>{w.events=w.events.filter(event=>event.id!==theatre(w).sourceLaunchId);},/sieges.theatre.launch/);
    reject(arrived,w=>{w.events.find(event=>event.title==='联军抵达山门')!.locationId='loc-market';},/sieges.theatre.arrival/);
  });

  it('rejects duplicate roster or invented duel, damage, turn and paid hero fields',()=>{
    const first=siegeTurn(actualGrandSiege().arrived);
    const round=(w:WorldState)=>theatre(w).rounds[0];
    expect(round(first).clash).toBeTruthy();
    reject(first,w=>{round(w).tick--;},/sieges.theatre.round/);
    reject(first,w=>{round(w).attackers[0].actorId=round(w).attackers[1].actorId;},/sieges.theatre.round/);
    reject(first,w=>{round(w).wallAfter=round(w).wallBefore+1;},/sieges.theatre.round/);
    reject(first,w=>{round(w).clash!.attackerDamage=999;},/sieges.theatre.clash/);
    reject(first,w=>{round(w).clash!.winnerId='npc-8';},/sieges.theatre.clash/);
    reject(first,w=>{round(w).hero={actorId:round(w).attackers[0].actorId,move:'elder-rescue',origin:'player',
      rank:'太上长老',paidQi:24,paidHp:0,wallSaved:28};},/sieges.theatre.hero/);
    reject(first,w=>{Object.assign(round(w),{deathCount:0});},/deathCount/);
  });

  it('never makes an arrival into a battle scar, and authentic native completion binds both the final round and terminal',()=>{
    const {arrived}=actualGrandSiege();
    reject(arrived,w=>{theatre(w).terminal={tick:w.tick,status:'repelled',
      sourceEventId:`evt-${w.tick}-dip-${actualSiege(w).id}`,battlefield:true};},/sieges.theatre.terminal/);
    let settled=arrived;
    for(let month=0;month<7&&actualSiege(settled).status==='sieging';month++) settled=siegeTurn(settled);
    const terminal=theatre(settled).terminal;
    expect(terminal).toMatchObject({battlefield:true,status:actualSiege(settled).status});
    expect(theatre(reopen(settled))).toEqual(theatre(settled));
    reject(settled,w=>{theatre(w).terminal!.battlefield=false;},/sieges.theatre.terminal/);
    reject(settled,w=>{theatre(w).terminal!.sourceEventId='false-retreat-from-another-campaign';},/sieges.theatre/);
  });

  it('restores an actual sealed order as intent until its true turn, then validates original defender and paid cost',()=>{
    const crisis=siegeTurn(actualGrandSiege().arrived);
    expect(possessAvatar(crisis,patriarch)).toBe(true);
    const queued=queueGrandSiegeHero(crisis,patriarch,actualSiege(crisis).id,'leader-last-stand');
    expect(queued).not.toBe(crisis);
    expect(theatre(reopen(queued)).queued).toMatchObject({actorId:patriarch,queuedTick:crisis.tick});
    reject(queued,w=>{theatre(w).queued!.queuedTick++;},/sieges.theatre.queued/);
    reject(queued,w=>{theatre(w).queued!.actorId=actualSiege(w).participantIds[0];},/sieges.theatre.queued/);
    const paid=siegeTurn(reopen(queued));
    expect(theatre(reopen(paid)).rounds[1]?.hero).toMatchObject({actorId:patriarch,origin:'player',paidQi:18,paidHp:12});
    reject(paid,w=>{theatre(w).rounds[1].hero!.paidQi=17;},/sieges.theatre.hero/);
    reject(paid,w=>{theatre(w).rounds[1].hero!.wallSaved=23;},/sieges.theatre.hero/);
  });

  it('requires the original signed withdrawal and never creates a battlefield from a peaceful arrival',()=>{
    const {arrived,siege}=actualGrandSiege(1);
    const offer=resolveCeasefireAction(arrived,siegeActor(arrived,patriarch),{
      chosenAction:'CEASEFIRE',ceasefireMove:'offer',targetSectId:attackSect,innerMonologue:'先休兵，两宗实议。',
    });
    expect(offer?.witnessScope).toBe('participants');
    const terms=arrived.ceasefires.agreements[0];
    const peaceful=siegeTurn(arrived,{[commander]:{chosenAction:'CEASEFIRE',ceasefireMove:'accept',
      targetCeasefireId:terms.id,innerMonologue:'如约签署。'}});
    const frame=(w:WorldState)=>w.sieges.find(row=>row.id===siege.id)!.theatre!;
    expect(frame(reopen(peaceful)).terminal).toMatchObject({status:'withdrawn',battlefield:false});
    reject(peaceful,w=>{frame(w).terminal!.battlefield=true;},/sieges.theatre.terminal/);
    reject(peaceful,w=>{w.ceasefires.agreements[0].withdrawnSiegeIds=[];},/sieges.theatre.withdrawn/);
    reject(peaceful,w=>{w.events.find(event=>event.id===frame(w).terminal!.sourceEventId)!.actorIds.reverse();},/sieges.theatre.withdrawn/);
  });
});
