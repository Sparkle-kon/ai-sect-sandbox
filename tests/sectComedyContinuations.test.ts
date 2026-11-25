import {describe,expect,it} from 'vitest';
import {SECT_COMEDY_TEMPLATES} from '../src/data/sectComedy';
import {projectSectComedyContinuations,applySectComedyChoice} from '../src/engine/sectComedyContinuations';
import {comedyFollowUpEventId,comedyFollowUpKey} from '../src/engine/sectComedyTerms';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {planSectPairDrama} from '../src/engine/sectPairDrama';
import type {SectJobAssignment} from '../src/types/sectJobs';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const start=()=>createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0)!;
const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'且留原处调息。'};
function next(world:WorldState,board:readonly SectJobAssignment[]=[],roll=.62,deferred=false){
  const orders=Object.fromEntries(world.cultivators.filter(row=>!board.some(job=>job.discipleId===row.id)).map(row=>[row.id,rest]));
  return advanceWorldTick(world,orders,()=>roll,deferred?'deferred':'utility',undefined,{
    sectJobAssignments:board,captureTrace:false,capturePresentation:false,
    ...(deferred?{modelActors:new Set([world.sectManagement!.leaderId])}:{}),
  });
}
const treasury=(world:WorldState)=>world.sects.find(row=>row.id===world.sectManagement?.sectId)!.spiritStones;

describe('H6 comic follow-through',()=>{
  it('gives at least twenty scene versions a real dated consequence; a saved wok sequel offers three exclusive choices',()=>{
    expect(SECT_COMEDY_TEMPLATES.filter(row=>row.effects.some(effect=>effect.kind==='sequel'||effect.kind==='visit')).length)
      .toBeGreaterThanOrEqual(20);
    const world=start(),m=world.sectManagement!;
    const cook=world.cultivators.find(row=>row.id===m.foundingDiscipleIds[0])!;
    cook.quirks=['lost','glutton'];
    let resolved=next(world,[{discipleId:cook.id,jobId:'gather'}]);
    const queued=resolved.sectManagement?.comedy?.pending?.find(row=>row.kind==='sequel'&&row.templateId==='the-wok');
    expect(queued).toMatchObject({kind:'sequel',templateId:'the-wok'});
    if(!queued)throw Error('Expected the real kitchen sequel in the native notebook');
    expect(projectSectComedyContinuations(resolved)).toEqual([]);
    while(resolved.tick<queued.dueTick-1)resolved=next(resolved);
    const saved=decodeEraWorldSave(encodeEraWorldSave(resolved));
    const utility=next(saved),cognitive=next(saved,[],.62,true);
    const id=comedyFollowUpKey(queued),story=projectSectComedyContinuations(utility).find(row=>row.id===id);
    expect(story?.choices.map(row=>row.id)).toEqual(['stand','recipe','feast']);
    expect(cognitive.sectManagement?.comedy).toEqual(utility.sectManagement?.comedy);
    expect(utility.events.filter(row=>row.id===comedyFollowUpEventId(m.sectId,queued,false))).toHaveLength(1);
    const bank=treasury(utility),raw=encodeEraWorldSave(utility);
    expect(applySectComedyChoice(utility,{id,choiceId:'foreign-order'})).toBe(false);
    expect(encodeEraWorldSave(utility)).toBe(raw);
    expect(applySectComedyChoice(utility,{id,choiceId:'recipe'})).toBe(true);
    expect(treasury(utility)).toBe(bank+12);
    expect(applySectComedyChoice(utility,{id,choiceId:'recipe'})).toBe(false);
    const chosen=encodeEraWorldSave(utility);
    const loaded=decodeEraWorldSave(chosen);
    expect(projectSectComedyContinuations(loaded).find(row=>row.id===id)?.resolved).toContain('十二枚灵石');
    expect(encodeEraWorldSave(loaded)).toBe(chosen);
    const forged=structuredClone(utility);
    forged.events=forged.events.filter(row=>row.id!==comedyFollowUpEventId(m.sectId,queued,true));
    expect(()=>encodeEraWorldSave(forged)).toThrow(/sectManagement.comedy.choice/u);
  });

  it('fixed guests actually reach headquarters and quote the linked old incident',()=>{
    let world=start();
    let counted=0;
    for(let i=0;i<12;i++){
      world=next(world);
      const m=world.sectManagement!;
      const visits=m.comedy?.pending?.filter(row=>row.kind==='visit'&&row.arrival?.tick===world.tick)??[];
      for(const row of visits){
        const id=comedyFollowUpKey(row);
        const cause=SECT_COMEDY_TEMPLATES.find(scene=>scene.id===row.originTemplateId)?.effects[row.effectIndex];
        const person=[...world.cultivators,...world.spiritBeasts].find(person=>person.id===row.arrival?.visitorId);
        expect(person?.locationId).toBe(m.homeSiteId);
        expect(cause?.kind).toBe('visit');
        if(cause?.kind==='visit')expect(projectSectComedyContinuations(world).find(view=>view.id===id)?.line).toContain(cause.reason);
        expect(world.events.find(event=>event.id===comedyFollowUpEventId(m.sectId,row,false))?.witnessScope).toBe('participants');
        counted++;
      }
      world=decodeEraWorldSave(encodeEraWorldSave(world));
    }
    expect(counted).toBeGreaterThanOrEqual(3);
  });

  it('plain co-workers with no prior edge can bicker without losing completed non-chore work',()=>{
    const world=start(),m=world.sectManagement!;
    const a=m.foundingDiscipleIds[0],b=m.foundingDiscipleIds[1];
    for(const actor of world.cultivators.filter(row=>row.id===a||row.id===b)){actor.age=23;actor.quirks=['shy'];}
    world.relationships=world.relationships.filter(row=>!(row.fromId===a&&row.toId===b||row.fromId===b&&row.toId===a));
    const orders=[{discipleId:a,jobId:'cultivate'},{discipleId:b,jobId:'cultivate'}] as const;
    expect(planSectPairDrama(world,new Map(orders.map(row=>[row.discipleId,row])))).toMatchObject({kind:'rivalry',pair:[a,b]});
    const changed=next(world,orders,0.05);
    expect(changed.sectManagement?.pairDrama).toMatchObject({kind:'rivalry',outcome:'completed',affinityChange:1});
    expect(changed.sectManagement?.latestReport?.rows.every(row=>row.phase==='performed')).toBe(true);
    expect(decodeEraWorldSave(encodeEraWorldSave(changed)).sectManagement?.pairDrama).toEqual(changed.sectManagement?.pairDrama);
  });
});
