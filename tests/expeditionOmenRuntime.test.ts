import {describe,expect,it,vi} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {canSeeOccasion,projectExpeditionOmens} from '../src/engine/expeditionOmenEngine';
import {availableObservatoryActions,resolveObservatoryAction} from '../src/engine/fieldObservatoryEngine';
import {advanceOccasions,availableOccasionJoins,joinOccasion} from '../src/engine/occasionEngine';
import {decodeWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import {knownMapLocations,noteTerrainVisit} from '../src/engine/terrainEngine';
import {localQiWeather} from '../src/engine/weatherEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const seed=2031, anchor='loc-vein-north', watcher='npc-2', listener='npc-1', stranger='npc-3';
const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'按真实到期受测。'};
const actor=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
const site=(world:WorldState)=>world.locations.find(row=>row.id===anchor)!;
const tick=(world:WorldState,choices:Record<string,LLMDecisionPayload>={})=>advanceWorldTick(world,
  {...Object.fromEntries(world.cultivators.map(row=>[row.id,rest])),...choices},()=>.99);
const at=(world:WorldState,to:number)=>{
  while(world.tick<to)world=tick(world);
  expect(world.tick).toBe(to);
  return world;
};
function initial(){
  const world=createInitialWorld(seed,'classic');
  expect(actor(world,watcher).locationId).toBe(anchor);
  // Two (otherwise independent) seeded locals are staged at the real site. Their
  // instrument, future travel and later acts are ordinary native action resolution.
  for(const id of [listener,stranger]){actor(world,id).locationId=anchor;noteTerrainVisit(world,actor(world,id));}
  actor(world,stranger).name=actor(world,listener).name; // Name collision never transfers a received clue.
  return world;
}
function observatory(move:'fund'|'measure'|'relay',opened?:number,target?:string):LLMDecisionPayload {
  return {...rest,chosenAction:'FIELD_OBSERVATORY',observatoryMove:move,targetLocationId:anchor,
    ...(opened===undefined?{}:{targetObservatoryTick:opened}),...(target===undefined?{}:{targetCultivatorId:target})};
}
function funded(world:WorldState){
  const operator=actor(world,watcher),cash=operator.spiritStones;
  expect(resolveObservatoryAction(world,operator,observatory('fund'))?.witnessScope).toBe('participants');
  expect(operator.spiritStones).toBeLessThan(cash);
  return world;
}

describe('real local observed expedition omens',()=>{
  it('requires real paid measurement; reveals only at actual own/recipient dates and rejects a guessed or remote enrollment',()=>{
    const baseline=initial();
    const noInstrument=at(structuredClone(baseline),4);
    expect(localQiWeather(noInstrument,site(noInstrument))).toMatchObject({kind:'灵潮',intensity:.53});
    expect(noInstrument.occasions.filter(row=>row.kind==='expedition')).toEqual([]);
    const pending=funded(baseline);
    expect(projectExpeditionOmens(pending,actor(pending,watcher))).toEqual([]);
    const t2=tick(pending);
    expect(t2.tick).toBe(2);
    expect(projectExpeditionOmens(t2,actor(t2,watcher))).toEqual([]);
    const t3=tick(t2,{[watcher]:observatory('measure',1)});
    expect(localQiWeather(t3,site(t3))).toMatchObject({kind:'灵潮',intensity:.36});
    expect(t3.events.find(row=>row.id==='evt-field-observatory-npc-2-1-measure')?.witnessScope).toBe('participants');
    const agedOwn=projectExpeditionOmens(t3,actor(t3,watcher));
    expect(agedOwn).toMatchObject([{siteId:anchor,learnedTick:3,measuredTick:3,windowStartsTick:4,windowEndsTick:6,status:'watching'}]);
    expect(projectExpeditionOmens(t3,actor(t3,listener))).toEqual([]);
    expect(availableObservatoryActions(actor(t3,watcher),t3,4)).toEqual(expect.arrayContaining([
      expect.objectContaining({observatoryMove:'relay',targetObservatoryTick:1,targetCultivatorId:listener}),
    ]));
    const t4=tick(t3,{[watcher]:observatory('relay',1,listener)});
    expect(t4.tick).toBe(4);
    const opening=t4.occasions.find(row=>row.kind==='expedition')!;
    expect(opening).toMatchObject({status:'registration',startedTick:4,anchorSiteId:anchor});
    expect(opening.omenId).toBeTruthy();
    expect(t4.events.find(row=>row.id===`evt-4-${opening.id}-open`)?.witnessScope).toBe('participants');
    expect(projectExpeditionOmens(t4,actor(t4,listener))).toMatchObject([{learnedTick:4,measuredTick:3,status:'open'}]);
    expect(projectExpeditionOmens(t3,actor(t3,listener))).toEqual([]);
    expect(projectExpeditionOmens(t4,actor(t4,stranger))).toEqual([]);
    expect(canSeeOccasion(t4,actor(t4,stranger),opening)).toBe(false);
    expect(canSeeOccasion(t4,actor(t4,listener),opening)).toBe(true);
    expect(knownMapLocations(t4,actor(t4,stranger)).some(row=>row.id===opening.locationId)).toBe(false);
    const enrollment={...rest,chosenAction:'JOIN_OCCASION',targetOccasionId:opening.id} satisfies LLMDecisionPayload;
    expect(joinOccasion(t4,actor(t4,stranger),enrollment)).toBeNull();
    const trespass=tick(t4,{[stranger]:{...rest,chosenAction:'EXPLORE',targetLocationId:opening.locationId}});
    expect(actor(trespass,stranger).locationId).toBe(anchor);
    const accidental=tick(t4,{[stranger]:{...rest,chosenAction:'EXPLORE'}});
    expect(actor(accidental,stranger).locationId).not.toBe(opening.locationId);
    const left=tick(t4,{[listener]:{...rest,chosenAction:'EXPLORE',targetLocationId:'loc-market'}});
    expect(actor(left,listener).locationId).toBe('loc-market');
    expect(availableOccasionJoins(actor(left,listener),left).some(option=>option.targetOccasionId===opening.id)).toBe(false);
    expect(joinOccasion(left,actor(left,listener),enrollment)).toBeNull();
    expect(t4.occasions.find(row=>row.id===opening.id)?.participantIds).toEqual([]);
    const got=tick(t4,{[watcher]:enrollment,[listener]:enrollment});
    expect(got.occasions.find(row=>row.id===opening.id)?.participantIds).toEqual(expect.arrayContaining([watcher,listener]));
    expect(got.events.filter(row=>row.id.includes(`${opening.id}-join-`)).every(row=>row.witnessScope==='participants')).toBe(true);
    const restored=decodeWorldSave(encodeWorldSave(got));
    expect(restored.expeditionOmens).toEqual(got.expeditionOmens);
    expect(projectExpeditionOmens(restored,actor(restored,listener))).toEqual(projectExpeditionOmens(got,actor(got,listener)));
    const started=at(restored,7),active=started.occasions.find(row=>row.id===opening.id)!;
    expect(active.status).toBe('running');
    expect(canSeeOccasion(started,actor(started,listener),active)).toBe(true); // Signed custody outlives the clue window.
    expect(actor(started,listener).locationId).toBe(opening.locationId);
    expect(joinOccasion(started,actor(started,stranger),enrollment)).toBeNull();
    const closed=decodeWorldSave(encodeWorldSave(at(started,20)));
    expect(closed.occasions.find(row=>row.id===opening.id)?.status).toMatch(/completed|cancelled/);
    expect(closed.locations.some(row=>row.id===opening.locationId)).toBe(false);
    for(const change of ['source','relay','opening','window','gate','actor','publication','anchor'] as const){
      const corrupted=structuredClone(restored), row=corrupted.expeditionOmens.rows[0];
      if(change==='source')Object.assign(row,{operatorId:stranger});
      if(change==='relay')Object.assign(row.relay!,{recipientId:stranger});
      if(change==='opening')Object.assign(row.opening!,{occasionId:'another-unrelated-occasion'});
      if(change==='window')Object.assign(row,{windowEndsTick:row.windowEndsTick+1});
      if(change==='gate')Object.assign(corrupted.locations.find(site=>site.id===opening.locationId)!,{expeditionOmenId:'bad'});
      if(change==='actor')corrupted.occasions.find(occasion=>occasion.id===opening.id)!.participantIds.push(stranger);
      if(change==='publication')Reflect.deleteProperty(corrupted.events.find(event=>event.id.includes(`${opening.id}-join-`))!,'witnessScope');
      if(change==='anchor') {
        const openingEvent=corrupted.events.find(event=>event.id===`evt-4-${opening.id}-open`)!;
        const anchor={...openingEvent};Reflect.deleteProperty(anchor,'witnessScope');
        corrupted.chronicleArchive.anchors.push(anchor);
      }
      expect(()=>decodeWorldSave(JSON.stringify({format:'ai-sect-sandbox',version:1,world:corrupted})))
        .toThrow(expect.objectContaining({code:'invalid_world'}));
    }
  });

  it('never uses a missed or stale forecast, nor reopens a genuinely measured clue after its adverse aperture',()=>{
    const baseline=initial();
    const missed=at(funded(structuredClone(baseline)),6);
    expect(missed.fieldObservatories.byActor[watcher]?.runs[0]?.status).toBe('missed');
    expect(missed.occasions.filter(row=>row.kind==='expedition')).toEqual([]);
    expect(projectExpeditionOmens(missed,actor(missed,watcher))).toEqual([]);
    const recent=funded(at(structuredClone(baseline),4));
    const t5=tick(recent);
    const t6=tick(t5,{[watcher]:observatory('measure',4)});
    expect(projectExpeditionOmens(t6,actor(t6,watcher))).toMatchObject([{measuredTick:6,windowStartsTick:7,windowEndsTick:9}]);
    const t7=tick(t6);
    expect(localQiWeather(t7,site(t7))).toMatchObject({kind:'灵潮',intensity:.16});
    const t10=at(t7,10);
    expect(t10.occasions.filter(row=>row.kind==='expedition')).toEqual([]);
    expect(projectExpeditionOmens(t10,actor(t10,watcher))).toMatchObject([{status:'missed'}]);
    const late=tick(t10,{[watcher]:observatory('relay',4,listener)});
    expect(projectExpeditionOmens(late,actor(late,listener))).toEqual([]);
    const lateRoundtrip=decodeWorldSave(encodeWorldSave(late));
    expect(lateRoundtrip.expeditionOmens.rows[0]?.relay).toBeUndefined();
    expect(lateRoundtrip.fieldObservatories.byActor[watcher]?.runs[0]).toMatchObject({status:'measured',relay:{recipientId:listener,relayedTick:11}});
    const t16=at(late,16);
    expect(localQiWeather(t16,site(t16))).toMatchObject({kind:'灵潮',intensity:.32});
    expect(t16.occasions.filter(row=>row.kind==='expedition')).toEqual([]);
  });

  it('preserves actual tournament calendar and upgrades old saves without inventing omens',()=>{
    const world=initial();
    const older={...world};Reflect.deleteProperty(older,'expeditionOmens');
    const decoded=decodeWorldSave(JSON.stringify({format:'ai-sect-sandbox',version:1,world:older}));
    expect(decoded.expeditionOmens).toEqual({rows:[]});
    decoded.tick=59;decoded.year=1005;decoded.month=11;
    const nativeCalendar=vi.fn(()=>.1);
    expect(advanceOccasions(decoded,nativeCalendar)).toEqual([]);
    expect(nativeCalendar).not.toHaveBeenCalled();
    decoded.tick++;decoded.month++;
    expect(advanceOccasions(decoded,nativeCalendar)).toHaveLength(1);
    const tournament=decoded.occasions[0];
    expect(tournament).toMatchObject({kind:'tournament',startedTick:60,registrationClosesTick:63,expiresTick:72});
    expect(advanceOccasions(decoded,nativeCalendar)).toEqual([]);
    expect(canSeeOccasion(decoded,undefined,tournament)).toBe(true);
    expect(availableOccasionJoins(actor(decoded,watcher),decoded)).toEqual(expect.arrayContaining([
      expect.objectContaining({targetOccasionId:tournament.id}),
    ]));
    const nonTournament=initial();nonTournament.tick=60;nonTournament.year=1005;nonTournament.month=12;
    const formerlyAutoExpedition=vi.fn(()=>.9);
    expect(advanceOccasions(nonTournament,formerlyAutoExpedition)).toEqual([]);
    expect(advanceOccasions(nonTournament,formerlyAutoExpedition)).toEqual([]);
    expect(formerlyAutoExpedition).toHaveBeenCalledTimes(1);
    expect(nonTournament.occasions).toHaveLength(0);
  });
});
