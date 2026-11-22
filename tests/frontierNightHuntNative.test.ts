import {afterEach,describe,expect,it,vi} from 'vitest';
import {prepareNorthWellHistoricalSource} from './fixtures/northWellHistoricalNativeFixture';
import {availableFrontierNightHuntActions,projectFrontierNightHunt} from '../src/engine/frontierNightHunt';
import {frontierNightHuntCommand} from '../src/engine/frontierNightHuntCognition';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {frontierPhysicalSite,activeFrontierVisit} from '../src/engine/frontierMovementEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';
import type {FrontierNightHuntMove} from '../src/types/frontierNightHunt';

afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});

const id='elder-danxia-1',site='frontier-north-lee-mid';
const body=(world:WorldState,actorId=id)=>world.cultivators.find(row=>row.id===actorId)!;
const order=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'按实到的背风小路行事。',...fields});
function month(world:WorldState,action=order('REST'),modelActors?:ReadonlySet<string>){
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,row.id===id?action:order('REST')])),
    ()=>.99,modelActors?'deferred':'utility',undefined,modelActors?{modelActors}:undefined);
}
function hunt(world:WorldState,move:FrontierNightHuntMove){
  const quoted=availableFrontierNightHuntActions(body(world),world).find(row=>row.frontierNightHuntMove===move)!;
  expect(quoted).toBeDefined();
  return order('FRONTIER_NIGHT_HUNT',{targetFrontierSiteId:quoted.targetFrontierSiteId,frontierNightHuntMove:move});
}
function viaLee(){
  const original=prepareNorthWellHistoricalSource().world;
  expect(original.frontier?.nightHunt).toBeUndefined();
  const gathered=month(original,order('GATHER_HERBS',{targetHerbId:'earth_root'}));
  const entered=month(gathered,order('FRONTIER',{frontierMove:'enter',targetFrontierSiteId:'frontier-north-gate'}));
  expect(entered.frontier?.nightHunt?.beast).toMatchObject({siteId:site,introducedTick:entered.tick,hp:60,alive:true});
  expect(entered.spiritBeasts).toHaveLength(gathered.spiritBeasts.length);
  expect(projectFrontierNightHunt(entered,body(entered))?.observed).toBeUndefined();
  expect(projectFrontierNightHunt(entered,body(entered,'elder-danxia-2'))).toBeUndefined();
  const local=month(entered,order('FRONTIER',{frontierMove:'travel',targetFrontierSiteId:'frontier-north-lee-west'}));
  const reached=month(local,order('FRONTIER',{frontierMove:'travel',targetFrontierSiteId:site}));
  expect(frontierPhysicalSite(reached,body(reached))?.id).toBe(site);
  return reached;
}

describe('native other-map night watch and true winter return',()=>{
  it('sees genuine weather and no early marker; a real wait hurts only after a paid successful local trace',()=>{
    const source=viaLee();
    const worldBytes=encodeEraWorldSave(source);
    expect(projectFrontierNightHunt(source,body(source))?.observed).toBeUndefined();
    const quiet=month(source,hunt(source,'wait'));
    expect(projectFrontierNightHunt(quiet,body(quiet))?.last).toMatchObject({outcome:'quiet',damage:0,beastDamage:0,paidQi:0});
    expect(body(quiet).hp).toBe(body(source).hp);
    const traced=month(source,hunt(source,'trace'));
    const read=projectFrontierNightHunt(traced,body(traced));
    expect(read?.last).toMatchObject({outcome:'found',paidQi:2,damage:0,beastDamage:0});
    expect(read?.observed).toEqual({kind:'妖兽',siteId:site,alive:true});
    expect(body(traced).qiProgress).toBe(body(quiet).qiProgress-2);
    expect(traced.frontier?.nightHunt?.beast.hp).toBe(60);
    const found=month(traced,hunt(traced,'wait'));
    const contact=projectFrontierNightHunt(found,body(found))?.last;
    expect(contact).toMatchObject({outcome:'contact',beastDamage:15});
    expect(body(found).hp).toBe(body(traced).hp-contact!.damage);
    expect(found.frontier?.nightHunt?.beast.hp).toBe(45);
    const again=month(found,hunt(found,'wait'));
    expect(projectFrontierNightHunt(again,body(again))?.last).toMatchObject({outcome:'quiet',damage:0,beastDamage:0});
    const encoded=encodeEraWorldSave(found);
    expect(encodeEraWorldSave(decodeEraWorldSave(encoded))).toBe(encoded);
    expect(encodeEraWorldSave(source)).toBe(worldBytes);
  });

  it('returns exactly one legal reverse lee step, then exits only through the real origin gate',()=>{
    const source=viaLee();
    const traced=month(source,hunt(source,'trace'));
    const quote=hunt(traced,'return');
    const rejected=month(traced,{...quote,targetFrontierSiteId:'loc-vein-north'});
    expect(body(rejected).locationId).toBe(site);
    let returning=month(traced,quote);
    expect(body(returning).locationId).toBe('frontier-north-lee-west');
    expect(projectFrontierNightHunt(returning,body(returning))?.observed).toBeUndefined();
    expect(returning.frontier?.nightHunt?.beast.hp).toBe(60);
    expect(returning.events).toContainEqual(expect.objectContaining({id:`evt-frontier-movement-${activeFrontierVisit(returning,id)!.id}-travel-${returning.tick}`,
      locationId:'frontier-north-lee-west',actorIds:[id]}));
    returning=month(returning,hunt(returning,'return'));
    expect(body(returning).locationId).toBe('frontier-north-gate');
    returning=month(returning,hunt(returning,'return'));
    expect(body(returning)).toMatchObject({locationId:'loc-vein-north'});
    expect(body(returning).positionPlane).toBeUndefined();
    expect(projectFrontierNightHunt(returning,body(returning))).toBeUndefined();
    expect(returning.frontier?.nightHunt?.beast.hp).toBe(60);
  });
  it('keeps proven tracks after the actual local beast is defeated, without replacing its body',()=>{
    let world=viaLee();
    let finished=false;
    for(let i=0;i<18;i++){
      const view=projectFrontierNightHunt(world,body(world))!;
      const ready=view.last?.outcome==='found'&&view.last.tick===world.tick&&
        view.options.some(row=>row.frontierNightHuntMove==='wait');
      world=month(world,hunt(world,ready?'wait':'trace'));
      if(!world.frontier!.nightHunt!.beast.alive){finished=true;break;}
    }
    expect(finished).toBe(true);
    expect(world.frontier?.nightHunt?.beast).toMatchObject({hp:0,alive:false,siteId:site});
    const end=projectFrontierNightHunt(world,body(world));
    expect(end?.observed).toEqual({kind:'妖兽',siteId:site,alive:false});
    expect(end?.last).toMatchObject({outcome:'contact',beastDamage:15});
    expect(world.frontier?.nightHunt?.receipts.filter(row=>row.outcome==='contact')).toHaveLength(4);
    const later=month(world,hunt(world,'wait'));
    expect(projectFrontierNightHunt(later,body(later))?.last).toMatchObject({outcome:'quiet',beastDamage:0,damage:0});
    expect(later.frontier?.nightHunt?.beast.hp).toBe(0);
    expect(()=>encodeEraWorldSave(later)).not.toThrow();
  });

  it('applies the same exact physical loss via separate Utility and strict Cognitive commands without exposing beasts to the model',async()=>{
    const source=viaLee();
    const traced=month(source,hunt(source,'trace'));
    const others=Object.fromEntries(traced.cultivators.filter(row=>row.id!==id).map(row=>[row.id,order('REST')]));
    const native=availableFrontierNightHuntActions(body(traced),traced).find(row=>row.frontierNightHuntMove==='wait')!;
    const exact=frontierNightHuntCommand(native);
    const request=(modelIdea:object)=>{
      const transport=vi.fn(async(_url:RequestInfo|URL,init?:RequestInit)=>{
        expect(String(init?.body)).not.toMatch(/frontier-north-snow-fox/);
        return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(modelIdea)}}]}));
      });
      vi.stubGlobal('fetch',transport);
      llmScheduler.resetTickBudget();
      return requestCultivatorLLMDecision(body(traced),traced,{enabled:true,apiBaseUrl:'https://provider.invalid/v1',
        apiKey:'fixture',model:'fixture'},traced.tick+1);
    };
    expect(await request({...exact,targetFrontierSiteId:'frontier-north-lee-east'})).toBeUndefined();
    expect(await request({...exact,targetBeastId:'guess'})).toBeUndefined();
    const accepted=await request(exact);
    expect(accepted).toMatchObject(exact);
    const cognitive=month(traced,accepted!,new Set([id]));
    const utility=advanceWorldTick(traced,others,()=>.99);
    expect(projectFrontierNightHunt(cognitive,body(cognitive))?.last).toMatchObject({outcome:'contact'});
    expect(projectFrontierNightHunt(cognitive,body(cognitive))?.last).toEqual(projectFrontierNightHunt(utility,body(utility))?.last);
    expect(body(cognitive).hp).toBe(body(utility).hp);
    expect(cognitive.frontier?.nightHunt?.beast.hp).toBe(utility.frontier?.nightHunt?.beast.hp);
  });

});
