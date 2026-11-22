import {afterEach,describe,expect,it,vi} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {activeAvatar,possessAvatar} from '../src/engine/avatarEngine';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {activeRoguelikeEncounter,resolveGuidedRoguelikeChoice} from '../src/engine/roguelikeEncounterEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMConfig,LLMDecisionPayload} from '../src/types/world';

const config:LLMConfig={enabled:true,apiBaseUrl:'https://gate-parity.invalid/v1',apiKey:'mock',model:'fixture'};
const owner='npc-2',siteId='loc-taixu';
const arrive=(mode:'utility'|'deferred')=>{
  const world=createInitialWorld(1,'spirit-bloom');
  expect(possessAvatar(world,owner)).toBe(true);
  const commands=Object.fromEntries(world.cultivators.map(actor=>[actor.id,actor.id===owner
    ?{chosenAction:'EXPLORE',targetLocationId:siteId,innerMonologue:'亲身抵达山门。'} satisfies LLMDecisionPayload
    :{chosenAction:'REST',innerMonologue:'静候。'} satisfies LLMDecisionPayload]));
  return advanceWorldTick(world,commands,()=>.9,mode);
};
afterEach(()=>vi.unstubAllGlobals());

describe('exact gate authority while either engine advances the world',()=>{
  it('uses the same true offered and settled receipt and never delegates the player choice to a provider',async()=>{
    const provider=vi.fn(async()=>new Response('{}'));
    vi.stubGlobal('fetch',provider);
    let first:unknown;
    for(const mode of ['utility','deferred'] as const){
      const world=arrive(mode),body=activeAvatar(world);
      if(!body)throw Error('Actual owner is missing');
      const offer=activeRoguelikeEncounter(world,body);
      expect(offer).toMatchObject({kind:'sect-gate',guided:true,status:'offered',siteId});
      if(!offer)throw Error('Native gate never opened');
      await expect(requestCultivatorLLMDecision(body,world,config,world.tick+1)).resolves.toBeUndefined();
      const next=resolveGuidedRoguelikeChoice(world,offer.id,'bold');
      const proof=next.roguelikeEncounters?.find(row=>row.id===offer.id);
      expect(proof).toMatchObject({choice:'bold',status:'resolved',outcome:{sectReputationDelta:1}});
      const receipt=next.events.find(row=>row.id===`evt-${offer.id}-settled`);
      expect(receipt).toMatchObject({witnessScope:'participants',actorIds:[owner],locationId:siteId});
      if(first===undefined)first={proof,receipt,random:next.random};
      else expect({proof,receipt,random:next.random}).toEqual(first);
    }
    expect(provider).not.toHaveBeenCalled();
  });
});
