import {describe,expect,it,vi} from 'vitest';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {terrainTileAt} from '../src/engine/terrainEngine';
import {quoteSectJob} from '../src/engine/sectJobs';
import {BASE_SECT_JOB_IDS} from '../src/engine/sectQuirkCatalog';
import {isSectErrandJob} from '../src/engine/sectErrands';
import {STARTER_SECT_IDS} from '../src/types/sectManagement';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import type {SectJobAssignment} from '../src/types/sectJobs';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const seeds=[1,42,1729,13071,50261,65537];
const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'且留原处。'};
const focus=(world:WorldState)=>world.cultivators.find(row=>row.id===world.sectManagement?.foundingDiscipleIds[0])!;
const work=(world:WorldState,jobId:SectJobAssignment['jobId'],roll=.68,model?:LLMDecisionPayload)=>{
  const disciple=focus(world);
  const orders=Object.fromEntries(world.cultivators.filter(row=>row.id!==disciple.id).map(row=>[row.id,rest]));
  if(model)orders[disciple.id]=model;
  return advanceWorldTick(world,orders,()=>roll,model?'deferred':'utility',undefined,{
    sectJobAssignments:[{discipleId:disciple.id,jobId}],modelActors:model?new Set([disciple.id]):undefined,
  });
};

describe('H6 native round-trip errands',()=>{
  it('all 120 independent first-month job quotes are available and settle without an intermediate on-route month',()=>{
    const tally=Object.fromEntries(BASE_SECT_JOB_IDS.map(job=>[job,0]));
    for(const seed of seeds)for(const starter of STARTER_SECT_IDS){
      const original=createManagedSectWorld(seed,'classic',starter,0)!;
      const disciple=focus(original);
      for(const job of BASE_SECT_JOB_IDS){
        const label=`${seed}/${starter}/${job}`;
        const quote=quoteSectJob(original,disciple,job);
        expect(quote.kind,label).not.toBe('blocked');
        const world=work(original,job),row=world.sectManagement?.latestReport?.rows[0];
        expect(row?.phase,label).toBe('performed');
        tally[job]++;
        if(!isSectErrandJob(job))continue;
        const route=row?.errand,trail=world.mapPresentation.trails.find(trail=>trail.cultivatorId===disciple.id);
        expect(quote.kind,label).toBe('errand');
        expect(route?.homeId,label).toBe(original.sectManagement?.homeSiteId);
        expect(focus(world).locationId,label).toBe(route?.homeId);
        expect(trail?.points.length,label).toBeGreaterThan(2);
        expect(trail?.points,label).toEqual(route?.path);
        expect(row?.sourceEventId&&world.events.some(event=>event.id===row.sourceEventId),label).toBe(true);
        if(seed===13071)expect(decodeEraWorldSave(encodeEraWorldSave(world)).sectManagement?.latestReport)
          .toEqual(world.sectManagement?.latestReport);
      }
    }
    expect(Object.values(tally)).toEqual(Array.from({length:10},()=>12));
  });

  it('a route hazard and a refused challenge both return real completed slips with the right tier',()=>{
    const world=createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0)!,actor=focus(world);
    const route=quoteSectJob(world,actor,'challenge');
    if(route.kind!=='errand')throw Error('Expected a real challenge route');
    const first=route.path[0],turn=route.path[route.turnAt];
    const endpointIds=new Set([terrainTileAt(world,first.x,first.y)?.id,terrainTileAt(world,turn.x,turn.y)?.id]);
    const hazardTile=route.path.map(p=>terrainTileAt(world,p.x,p.y)).find(tile=>tile&&!endpointIds.has(tile.id));
    if(!hazardTile)throw Error('Expected at least one separate road tile');
    const danger=structuredClone(world);
    danger.mapHazards.push({id:'h6-road-fixture',kind:'cursed_miasma',tileId:hazardTile.id,createdTick:world.tick,
      expiresTick:world.tick+3,intensity:3});
    const injured=work(danger,'challenge',0),bad=injured.sectManagement?.latestReport?.rows[0];
    expect(bad).toMatchObject({phase:'performed',tier:'disaster',errand:{outcome:'road_disaster'},
      effects:expect.arrayContaining([expect.objectContaining({kind:'hp',stage:'native'})])});
    expect(focus(injured).hp).toBeLessThan(actor.hp);
    expect(focus(injured).locationId).toBe(world.sectManagement?.homeSiteId);
    const refused=work(world,'challenge',.995),row=refused.sectManagement?.latestReport?.rows[0];
    expect(row).toMatchObject({phase:'performed',tier:'mishap',errand:{outcome:'refused'}});
    const note=refused.events.find(event=>event.id===row?.sourceEventId);
    expect(note?.description).toContain('应招');
    expect(note?.duelWinnerId).toBeUndefined();
  });

  it('same destination/route and actual consequences from a mocked provider reply',async()=>{
    const world=createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0)!,actor=focus(world);
    const fetchMock=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:'{"chosenAction":"REST"}'}}]})));
    vi.stubGlobal('fetch',fetchMock);
    let proposed:LLMDecisionPayload|undefined;
    try {
      llmScheduler.resetTickBudget();
      proposed=await requestCultivatorLLMDecision(actor,world,{enabled:true,apiBaseUrl:'https://test.invalid/v1',apiKey:'test',
        model:'fixture'},world.tick+1);
    }finally{vi.unstubAllGlobals();llmScheduler.resetTickBudget();}
    expect(fetchMock).toHaveBeenCalledOnce();
    if(!proposed)throw Error('mock produced no legal Cognitive reply');
    const utility=work(world,'challenge'),cognitive=work(world,'challenge',.68,proposed);
    expect(utility.sectManagement?.latestReport).toEqual(cognitive.sectManagement?.latestReport);
    expect(utility.mapPresentation.trails).toEqual(cognitive.mapPresentation.trails);
    expect(focus(utility).hp).toBe(focus(cognitive).hp);
  });
});
