import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { applyCultivatorBrainDecision, advanceWorldTick } from '../src/engine/worldEngine';
import { cloneWorldWithColdHistory } from '../src/engine/coldHistoryEngine';
import { availableApprenticeshipReunionActions } from '../src/engine/apprenticeshipReunion';
import { apprenticeshipReunionCommand } from '../src/engine/apprenticeshipReunionCognition';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import { isHighlight } from '../src/engine/director/highlight';
import { bondReunionHighlightSource, daoPathHighlightSource, forbiddenArtHighlightSource, sequelHighlightSource } from '../src/engine/director/secondaryHighlights';
import type { ApprenticeshipReunionMove } from '../src/types/apprenticeshipReunion';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';
import { actualForbiddenContact, artActor, artTurn, strongRivalId } from './forbiddenArtNativeFixture';

const teacher='npc-1',student='npc-2',headquarters='loc-taixu',market='loc-market';
const person=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
const order=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'由本人决定。',...fields});
function turn(world:WorldState,choices:Record<string,LLMDecisionPayload>={}){
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.map(actor=>[actor.id,choices[actor.id]??order('REST')])),()=>.99);
}
function apprenticeOrder(world:WorldState,id:string,move:ApprenticeshipReunionMove):LLMDecisionPayload {
  const exact=availableApprenticeshipReunionActions(person(world,id),world).find(option=>
    option.apprenticeshipReunionMove===move&&(move!=='ask'||option.targetCultivatorId===teacher));
  if(!exact)throw new Error(`原玩法没有开启 ${move}`);
  return {...apprenticeshipReunionCommand(exact),innerMonologue:'由本人决定。'};
}
function actualApprenticeshipReunion(){
  let world=createInitialWorld(13071,'classic');
  world=turn(world,{[student]:order('EXPLORE',{targetLocationId:headquarters})});
  while(world.tick<12)world=turn(world,{[teacher]:order('CULTIVATE')});
  world=turn(world,{[student]:apprenticeOrder(world,student,'ask')});
  world=turn(world,{[teacher]:apprenticeOrder(world,teacher,'refuse')});
  const departure=turn(world,{[student]:order('EXPLORE',{targetLocationId:market})});
  const arrival=turn(departure,{[teacher]:order('EXPLORE',{targetLocationId:market})});
  const quiet=turn(arrival,{[student]:order('SOCIALIZE',{targetCultivatorId:teacher})});
  return {departure,arrival,quiet,afterQuiet:turn(quiet)};
}

describe('real secondary director sources',()=>{
  it('shows two genuinely different permanent paths, executes the native order, and rejects a foreign actor or stale quote',()=>{
    const world=createInitialWorld(13071,'classic'),actor=person(world,teacher);
    const candidates=daoPathHighlightSource.probe(world,actor),candidate=candidates[0];
    expect(candidate).toBeDefined();
    expect(isHighlight(candidate!)).toBe(true);
    expect(candidate?.options.map(row=>row.id)).toEqual(expect.arrayContaining(['choose:shadow','choose:body']));
    expect(daoPathHighlightSource.decision?.(world,person(world,student),candidate!,'choose:body')).toBeUndefined();
    const choose=(id:string)=>{
      const fork=cloneWorldWithColdHistory(world), body=person(fork,teacher);
      const decision=daoPathHighlightSource.decision?.(fork,body,candidate!,id);
      expect(decision?.chosenAction).toBe('DAO_PATH');
      const event=applyCultivatorBrainDecision(fork,body,decision!);
      expect(event?.tick).toBe(world.tick);
      expect(event?.witnessScope).toBe('participants');
      expect(daoPathHighlightSource.decision?.(fork,body,candidate!,id)).toBeUndefined();
      return body.daoPath?.pathId;
    };
    expect(choose('choose:body')).toBe('body');
    expect(choose('choose:shadow')).toBe('shadow');
    expect(actor.daoPath).toBeUndefined();
  });

  it('only exposes the exact already-guided owner and queues a real escape without settling it early',()=>{
    const {offered,contact}=actualForbiddenContact();
    const actor=artActor(offered);
    const candidate=forbiddenArtHighlightSource.probe(offered,actor)[0];
    expect(candidate?.sourceId).toBe(contact.id);
    expect(isHighlight(candidate!)).toBe(true);
    expect(forbiddenArtHighlightSource.probe(offered,artActor(offered,strongRivalId))).toEqual([]);
    expect(forbiddenArtHighlightSource.choose?.(offered,actor,candidate!,'invented-art')).toBe(false);
    const fork=cloneWorldWithColdHistory(offered),body=artActor(fork);
    expect(forbiddenArtHighlightSource.choose?.(fork,body,candidate!,'severed-shadow-flight')).toBe(true);
    expect(artActor(fork).hp).toBe(actor.hp);
    expect(artActor(fork).forbiddenScars).toBeUndefined();
    expect(forbiddenArtHighlightSource.probe(fork,body)).toEqual([]);
    expect(artActor(artTurn(fork)).forbiddenScars).toMatchObject([{artId:'severed-shadow-flight',result:'escape'}]);
    expect(offered.forbiddenDuels?.[0].queued).toBeUndefined();
  });

  it('admits reunions only after native departure, arrival and quiet talk, and rejects a choice with missing proof',()=>{
    const {departure,arrival,quiet,afterQuiet}=actualApprenticeshipReunion();
    expect(bondReunionHighlightSource.probe(departure,person(departure,student))).toEqual([]);
    expect(bondReunionHighlightSource.probe(arrival,person(arrival,teacher))).toEqual([]);
    expect(bondReunionHighlightSource.probe(quiet,person(quiet,teacher),quiet.tick)).toEqual([]);
    expect(isHighlight(bondReunionHighlightSource.probe(quiet,person(quiet,teacher))[0])).toBe(true);
    const actor=person(afterQuiet,teacher),offer=bondReunionHighlightSource.probe(afterQuiet,actor)[0];
    expect(offer).toBeDefined();
    expect(isHighlight(offer!)).toBe(true);
    expect(offer?.options.map(row=>row.id)).toEqual(expect.arrayContaining(['part','teach']));
    expect(bondReunionHighlightSource.probe(afterQuiet,person(afterQuiet,'npc-8'))).toEqual([]);
    const altered=cloneWorldWithColdHistory(afterQuiet);
    altered.events=altered.events.filter(row=>row.id!==quiet.apprenticeshipReunions?.cases[0]?.quiet?.eventId);
    expect(bondReunionHighlightSource.decision?.(altered,person(altered,teacher),offer!,'teach',altered.tick)).toBeUndefined();
    const select=(id:string)=>{
      const fork=cloneWorldWithColdHistory(afterQuiet),body=person(fork,teacher);
      const decision=bondReunionHighlightSource.decision?.(fork,body,offer!,id,fork.tick);
      expect(decision).toBeDefined();
      const auxiliaries:string[]=[];
      const event=applyCultivatorBrainDecision(fork,body,decision!,undefined,undefined,event=>auxiliaries.push(event.id));
      expect(event?.witnessScope).toBe('participants');
      expect(fork.apprenticeshipReunions?.cases[0].farewell?.actorId).toBe(id==='part'?teacher:undefined);
      return {fork,auxiliaries};
    };
    expect(select('teach').fork.mentorship.offers).toHaveLength(1);
    expect(select('teach').auxiliaries).toHaveLength(1);
    expect(select('part').fork.mentorship.offers).toHaveLength(0);
  });

  it('offers the actual damaged bell follow-up to its assigned watcher and runs the chosen native route next month',()=>{
    const watcher='elder-taixu-1',remote='elder-taixu-2';
    let world=createInitialWorld(637);
    const tower=world.locations.find(site=>site.id===headquarters)!;
    const towerTile=terrainTileAt(world,tower.x,tower.y)!;
    const mark={x:(towerTile.col+2.5)*1000/world.terrain.columns,y:(towerTile.row+.5)*600/world.terrain.rows};
    world=applyMapBrush(world,'paint_vein',[mark]);
    const known=world.locations.find(site=>site.x===mark.x&&site.y===mark.y)!;
    world=turn(world,{[teacher]:order('BUILD_FACILITY',{facilityKind:'defense_array'}),
      [remote]:order('EXPLORE',{targetLocationId:known.id})});
    world=turn(turn(world));
    expect(sequelHighlightSource.probe(world,person(world,watcher))).toEqual([]);
    world=turn(applyMapBrush(applyMapBrush(world,'beast_tide',[tower]),'beast_tide',[tower]));
    expect(sequelHighlightSource.probe(world,person(world,watcher),world.tick)).toEqual([]);
    const candidate=sequelHighlightSource.probe(world,person(world,watcher))[0];
    expect(isHighlight(candidate)).toBe(true);
    expect(candidate.options.map(row=>row.id)).toEqual(['inspect','reroute']);
    expect(sequelHighlightSource.probe(world,person(world,remote))).toEqual([]);
    const select=(id:string)=>{
      const command=sequelHighlightSource.decision?.(world,person(world,watcher),candidate,id);
      expect(command?.chosenAction).toBe('BELL_WATCH');
      const next=turn(world,{[watcher]:command!});
      return next.locations.find(site=>site.id===headquarters)?.bellWatch?.choice;
    };
    expect(select('inspect')).toMatchObject({move:'inspect',destinationId:headquarters,pathTileIds:[]});
    expect(select('reroute')).toMatchObject({move:'reroute',destinationId:known.id,pathTileIds:expect.arrayContaining([expect.any(String)])});
  });
});
