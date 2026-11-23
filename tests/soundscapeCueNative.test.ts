import {afterEach,describe,expect,it,vi} from 'vitest';
import {projectSoundscapeCues} from '../src/components/soundscapeCueModel';
import {createInitialWorld} from '../src/data/initialWorld';
import {computeHeuristicDecision,queryCultivatorLLMDecision} from '../src/engine/llmBrain';
import {advanceWorldTick,executeGodIntervention} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';
import {actualHighAlchemyMaterials,brewActor,brewMonth,brewSiteId,highBrew} from './alchemyLightningNativeFixture';
import {actualAscensionWaves} from './ascensionNativeFixture';

const witness='npc-1',opponent='elder-taixu-1',outsider='npc-6',taixu='loc-taixu';
const actor=(world:WorldState,id=witness)=>world.cultivators.find(row=>row.id===id)!;
const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'静候。'};
const month=(world:WorldState,decision=rest)=>advanceWorldTick(world,Object.fromEntries(
  world.cultivators.map(row=>[row.id,row.id===witness?decision:rest])),()=>.2,'utility');
const heard=(world:WorldState,id=witness)=>projectSoundscapeCues(world,{viewer:actor(world,id)});
const kinds=(world:WorldState,id=witness)=>heard(world,id).map(cue=>cue.kind);

afterEach(()=>vi.unstubAllGlobals());

describe('soundscape cue authority from committed native turns',()=>{
  it('projects the same actual sword flight from Utility and strict Cognitive, without altering save or accepting spoofed trails',async()=>{
    const start=createInitialWorld();
    const traveller=actor(start);
    start.cultivators=[traveller];
    traveller.qiProgress=10;
    traveller.rumors.push({id:'audio-route',locationId:'loc-market',lead:true,subject:'万仙坊市有机缘',
      confidence:100,hops:0,learnedTick:start.tick,originTick:start.tick,provenance:'witness'});
    const utility=computeHeuristicDecision(traveller,start,()=>.1);
    expect(utility).toMatchObject({chosenAction:'EXPLORE',targetLocationId:'loc-market'});
    vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({
      chosenAction:'EXPLORE',targetLocationId:'loc-market',innerMonologue:'御剑赴市',
    })}}]})));
    const cognitive=await queryCultivatorLLMDecision(traveller,start,{
      enabled:true,apiBaseUrl:'https://example.invalid',apiKey:'fixture',model:'fixture',
    });
    expect(cognitive).toMatchObject({chosenAction:'EXPLORE',targetLocationId:'loc-market'});
    const transition=(decision:LLMDecisionPayload)=>advanceWorldTick(start,{[traveller.id]:decision},()=>.7);
    const a=transition(utility),b=transition(cognitive),snapshot=JSON.stringify(a);
    const travel=(world:WorldState)=>projectSoundscapeCues(world,{viewer:actor(world),previousWorld:start});
    expect(travel(a)).toContainEqual(expect.objectContaining({kind:'flight',tick:a.tick,id:expect.any(String)}));
    expect(travel(a)).toEqual(travel(b));
    expect(projectSoundscapeCues(a,{})).toEqual([]);
    expect(projectSoundscapeCues(a,{viewer:{...actor(a)}})).toEqual([]);
    expect(projectSoundscapeCues(a,{viewer:actor(a),historical:true})).toEqual([]);
    expect(kinds(month(a))).not.toContain('flight');
    expect(JSON.stringify(a)).toBe(snapshot);
    const fake=structuredClone(a);
    fake.mapPresentation.trails[0].points.at(-1)!.x+=1;
    expect(travel(fake).map(cue=>cue.kind)).not.toContain('flight');
  });

  it('plays a real clash only in its witnessed current venue and rejects private, contested or remote records',()=>{
    const world=month(createInitialWorld(1,'spirit-bloom'),{
      chosenAction:'DUEL',targetCultivatorId:opponent,innerMonologue:'在太虚山门实地交手。',
    });
    const source=world.events.find(row=>row.tick===world.tick&&row.duelWinnerId&&row.locationId===taixu)!;
    expect(source).toBeDefined();
    expect(kinds(world)).toContain('clash');
    expect(projectSoundscapeCues(world,{siteId:taixu}).map(row=>row.kind)).toContain('clash');
    expect(kinds(world,outsider)).not.toContain('clash');
    expect(projectSoundscapeCues(world,{viewer:actor(world,outsider),siteId:taixu})).toEqual([]);
    const privateCopy=structuredClone(world);
    privateCopy.events.find(row=>row.id===source.id)!.witnessScope='participants';
    expect(kinds(privateCopy)).not.toContain('clash');
    const contested=structuredClone(world);
    contested.events.push({...source});
    expect(kinds(contested)).not.toContain('clash');
    expect(kinds(month(world))).not.toContain('clash');
  });

  it('sounds only a settled heavenly trial wave, not a warning or manual god strike',()=>{
    const initial=createInitialWorld(1,'spirit-bloom');
    Object.assign(actor(initial),{realm:'筑基',realmStage:9,qiProgress:100});
    const opening=month(initial,{chosenAction:'BREAKTHROUGH',innerMonologue:'当面叩问金丹。'});
    expect(actor(opening).tribulation).toMatchObject({stage:'lightning',nextWave:1});
    expect(kinds(opening)).not.toContain('thunder');
    const settled=month(opening,{chosenAction:'FACE_TRIBULATION',tribulationStance:'defy',innerMonologue:'直面劫雷。'});
    expect(heard(settled)).toContainEqual(expect.objectContaining({kind:'thunder',wave:1,tick:settled.tick}));
    expect(kinds(settled,outsider)).not.toContain('thunder');
    const manual=executeGodIntervention(initial,{type:'TRIBULATION_STRIKE',targetCultivatorId:witness});
    expect(kinds(manual)).not.toContain('thunder');
  });

  it('uses only actual ascension wave numbers and does not synthesize a duplicate terminal chime',()=>{
    const {opening,first,second,passed}=actualAscensionWaves();
    const atSite=(world:WorldState)=>projectSoundscapeCues(world,{siteId:taixu});
    expect(atSite(opening)).toEqual([]);
    for(const [world,wave] of [[first,1],[second,2],[passed,3]] as const){
      const sounds=atSite(world);
      expect(sounds.filter(cue=>cue.kind==='thunder')).toEqual([
        expect.objectContaining({kind:'thunder',wave,tick:world.tick}),
      ]);
      expect(sounds.map(cue=>cue.kind)).toEqual(['thunder']);
    }
  });

  it('chimes a real successful paid pill only at the authorized current site, never a failure or forged reservation',()=>{
    const prepared=actualHighAlchemyMaterials();
    const successful=brewMonth(prepared,highBrew('nine_turn_golden','calm'),.2);
    const failed=brewMonth(prepared,highBrew('nine_turn_golden','fierce'),.001);
    const hearing=(world:WorldState)=>projectSoundscapeCues(world,{viewer:brewActor(world)});
    expect(hearing(prepared).map(c=>c.kind)).not.toContain('alchemy');
    expect(hearing(successful)).toContainEqual(expect.objectContaining({kind:'alchemy',tick:successful.tick}));
    expect(hearing(failed).map(c=>c.kind)).not.toContain('alchemy');
    expect(hearing(brewMonth(successful)).map(c=>c.kind)).not.toContain('alchemy');
    expect(projectSoundscapeCues(successful,{viewer:brewActor(successful),siteId:'loc-taixu'})).toEqual([]);
    const noFee=structuredClone(successful);
    noFee.furnaceReservations.uses=noFee.furnaceReservations.uses.filter(row=>row.siteId!==brewSiteId);
    expect(hearing(noFee).map(c=>c.kind)).not.toContain('alchemy');
  });
});
