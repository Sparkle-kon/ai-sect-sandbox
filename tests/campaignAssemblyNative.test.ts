import {afterEach,describe,expect,it,vi} from 'vitest';
import {availableCampaignAssemblyActions,projectCampaignAssembly} from '../src/engine/campaignAssembly';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload} from '../src/types/world';
import {possessAvatar} from '../src/engine/avatarEngine';
import {queueGrandSiegeHero} from '../src/engine/grandSiegeTheatreEngine';
import {actualGrandSiege,actualSiege,commander,disciple,patriarch,location,attackSect,defendSect,siegeActor,siegeSect,siegeTurn} from './grandSiegeNativeFixture';

afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});

describe('exact native alliance, dispatch, arrival, and independently lawful choices',()=>{
  it('counts actual arrived separate sect cohorts and does not mistake muster, private or duplicate original for arrival',()=>{
    const {declared,launched,assembled,arrived,siege}=actualGrandSiege();
    for(const early of [declared,launched,assembled])expect(projectCampaignAssembly(early,siegeActor(early,commander))).toBeUndefined();
    const scene=projectCampaignAssembly(arrived,siegeActor(arrived,commander))!;
    expect(scene).toMatchObject({phase:'arrived',siteName:arrived.locations.find(row=>row.id===location)?.name});
    expect(scene.cohorts.filter(row=>row.side==='attacker').length).toBeGreaterThanOrEqual(2);
    expect(scene.cohorts.filter(row=>row.side==='attacker').reduce((sum,row)=>sum+row.count,0)).toBe(siege.participantIds.length);
    expect(scene.cohorts.filter(row=>row.side==='defender').reduce((sum,row)=>sum+row.count,0)).toBeGreaterThanOrEqual(2);
    const source=arrived.events.find(row=>row.id===`evt-${arrived.tick}-dip-${siege.id}`)!;
    const disputed=structuredClone(arrived);
    disputed.events.push({...source,witnessScope:'participants'});
    expect(projectCampaignAssembly(disputed,siegeActor(disputed,commander))).toBeUndefined();
    const noPactProof=structuredClone(arrived);
    noPactProof.events=noPactProof.events.filter(row=>!row.id.endsWith('-offer_alliance'));
    expect(projectCampaignAssembly(noPactProof,siegeActor(noPactProof,commander))).toBeUndefined();
    const nominalOnly=structuredClone(arrived);
    for(const id of siege.participantIds){
      const warrior=siegeActor(nominalOnly,id);
      if(warrior.sectId!==attackSect)warrior.locationId='loc-danxia';
    }
    expect(projectCampaignAssembly(nominalOnly,siegeActor(nominalOnly,commander))).toBeUndefined();
  });

  it('never spends early, then adapts the genuine paid leader defense and leaves other leaders/sects independent',()=>{
    const {arrived,siege}=actualGrandSiege();
    const here=siegeActor(arrived,patriarch);
    expect(availableCampaignAssemblyActions(here,arrived).filter(row=>row.kind==='guard')).toEqual([]);
    const front=siegeTurn(arrived);
    expect(projectCampaignAssembly(front,siegeActor(front,patriarch))?.phase).toBe('engaged');
    expect(availableCampaignAssemblyActions(siegeActor(front,patriarch),front)).toContainEqual(expect.objectContaining({
      kind:'guard',siegeId:siege.id,command:{chosenAction:'GRAND_SIEGE_HERO',targetGrandSiegeId:siege.id,
        grandSiegeHeroMove:'leader-last-stand'},
    }));
    expect(availableCampaignAssemblyActions(siegeActor(front,commander),front).some(row=>row.kind==='guard')).toBe(false);
    expect(availableCampaignAssemblyActions(siegeActor(front,disciple),front).some(row=>row.kind==='negotiate')).toBe(false);
    expect(possessAvatar(front,patriarch)).toBe(true);
    const active=siegeTurn(queueGrandSiegeHero(front,patriarch,siege.id,'leader-last-stand'));
    const held=siegeTurn(queueGrandSiegeHero(front,patriarch,siege.id,'hold'));
    const paid=actualSiege(active).theatre?.rounds[1].hero!;
    expect(paid).toMatchObject({actorId:patriarch,paidQi:18,paidHp:12});
    expect(siegeSect(active).arrayHp-siegeSect(held).arrayHp).toBe(paid.wallSaved);
    expect(siegeActor(active,commander).qiProgress).toBe(siegeActor(held,commander).qiProgress);
  });

  it('uses actual proposal and independent signature only, then shows withdrawal without a fabricated victory',()=>{
    const {arrived,siege}=actualGrandSiege(1);
    const offer=availableCampaignAssemblyActions(siegeActor(arrived,patriarch),arrived).find(row=>row.kind==='negotiate')!;
    expect(offer.command).toMatchObject({chosenAction:'CEASEFIRE',ceasefireMove:'offer',targetSectId:attackSect});
    const waiting=siegeTurn(arrived,{[patriarch]:{...offer.command,innerMonologue:'独立提议。'}});
    expect(waiting.ceasefires.agreements.at(-1)?.status).toBe('offered');
    const reply=availableCampaignAssemblyActions(siegeActor(waiting,commander),waiting).find(row=>row.kind==='negotiate')!;
    expect(reply.command).toMatchObject({chosenAction:'CEASEFIRE',ceasefireMove:'accept'});
    const independent=siegeTurn(waiting,{[commander]:{...reply.command,innerMonologue:'独立答复。'}});
    expect(independent.sieges.find(row=>row.id===siege.id)).toMatchObject({status:'withdrawn'});
    expect(projectCampaignAssembly(independent,siegeActor(independent,patriarch))).toMatchObject({phase:'withdrawn',options:[],cohorts:[]});
    expect(independent.locations.find(row=>row.id===location)?.ownerSectId).toBe(siege.defenderSectId);
  });
  it('lets a genuine delayed defender travel to the actual venue without reading the offsite roster',async()=>{
    const {declared}=actualGrandSiege();
    const launched=siegeTurn(siegeTurn(siegeTurn(declared)),{[commander]:{
      chosenAction:'LAUNCH_SIEGE',targetSectId:defendSect,innerMonologue:'按已生效的战书出征。'}});
    const arrived=siegeTurn(siegeTurn(launched));
    expect(actualSiege(arrived).theatre?.arrivedTick).toBe(arrived.tick);
    const first=siegeTurn(arrived);
    expect(siegeActor(first,disciple).locationId).not.toBe(location);
    expect(actualSiege(first).theatre?.rounds[0].defenders.some(row=>row.actorId===disciple)).toBe(false);
    const outside=projectCampaignAssembly(first,siegeActor(first,disciple))!;
    expect(outside).toMatchObject({phase:'engaged',cohorts:[]});
    const entry=outside.options.find(row=>row.kind==='join')!;
    expect(entry.command).toEqual({chosenAction:'EXPLORE',targetLocationId:location});
    const joined=siegeTurn(first,{[disciple]:{...entry.command,innerMonologue:'由实际可行的旧路赴阵。'}});
    expect(siegeActor(joined,disciple).locationId).toBe(location);
    const rounds=actualSiege(joined).theatre?.rounds!;
    expect(rounds[0].defenders.some(row=>row.actorId===disciple)).toBe(false);
    expect(rounds[1].defenders.some(row=>row.actorId===disciple)).toBe(true);
    const model=(value:object)=>{
      vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}]}))));
      llmScheduler.resetTickBudget();
      return requestCultivatorLLMDecision(siegeActor(first,disciple),first,{enabled:true,apiBaseUrl:'https://provider.invalid/v1',
        apiKey:'fixture',model:'fixture'},first.tick+1);
    };
    expect(await model({...entry.command,targetLocationId:'loc-taixu'})).toBeUndefined();
    expect(await model({...entry.command,winner:disciple})).toBeUndefined();
    const accepted=await model(entry.command);
    expect(accepted).toMatchObject({...entry.command,targetCampaignAssemblySiegeId:entry.siegeId});
    const idle:LLMDecisionPayload={chosenAction:'REST',innerMonologue:''};
    const modelArgs=Object.fromEntries(first.cultivators.map(row=>[row.id,row.id===disciple?accepted!:idle]));
    const native=advanceWorldTick(first,modelArgs,()=>.5,'deferred',undefined,{modelActors:new Set([disciple])});
    expect(siegeActor(native,disciple).locationId).toBe(location);
    expect(actualSiege(native).theatre?.rounds[1].defenders).toEqual(rounds[1].defenders);
  });

});
