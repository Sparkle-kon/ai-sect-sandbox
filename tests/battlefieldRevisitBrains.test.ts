import { afterEach, describe, expect, it, vi } from 'vitest';
import { battlefieldRevisitCommand } from '../src/engine/battlefieldRevisitCognition';
import { availableBattlefieldRevisits, isBattlefieldRevisitEvent } from '../src/engine/battlefieldRevisit';
import { resolveGuidedBattlefieldRevisitTurn } from '../src/controllers/guidedBattlefieldRevisitTurn';
import { requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMDecisionPayload } from '../src/types/world';
import { actualGrandSiege, actualSiege, disciple, location, patriarch, siegeActor, siegeTurn } from './grandSiegeNativeFixture';

const config={enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture-only',model:'test'};
const explore=(targetLocationId:string):LLMDecisionPayload=>({chosenAction:'EXPLORE',targetLocationId,innerMonologue:'走到这个确切地方。'});
function returnedFrame(){
  let world=siegeTurn(actualGrandSiege().arrived,{[disciple]:{chosenAction:'SOCIALIZE',targetCultivatorId:patriarch,innerMonologue:'真在同处见过。'}});
  for(let i=0;i<7&&actualSiege(world).status==='sieging';i++)world=siegeTurn(world);
  return siegeTurn(siegeTurn(world,{[disciple]:explore('loc-secret-1')}),{[disciple]:explore(location)});
}
const seedReply=(value:unknown)=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}]}));
afterEach(()=>vi.unstubAllGlobals());

describe('true battlefield return through both decision paths',()=>{
  it('admits only an exact choice through Cognitive, rejects authored extras, and executes a scoped real result',async()=>{
    const returned=returnedFrame(),body=siegeActor(returned,disciple);
    const choice=availableBattlefieldRevisits(returned,body).find(row=>row.battlefieldRevisitMove==='repair')!;
    const raw=battlefieldRevisitCommand(choice);
    let next:unknown=raw;
    const transport=vi.fn(async()=>seedReply(next));
    vi.stubGlobal('fetch',transport);
    const valid=await requestCultivatorLLMDecision(body,returned,config,returned.tick+1);
    expect(valid).toMatchObject(raw);
    next={...raw,innerMonologue:'替本人说话'};
    expect(await requestCultivatorLLMDecision(body,returned,config,returned.tick+1)).toBeUndefined();
    expect(transport).toHaveBeenCalled();
    const trueTurn=siegeTurn(returned,{[disciple]:valid!});
    expect(trueTurn.events.filter(isBattlefieldRevisitEvent)).toContainEqual(expect.objectContaining({
      title:'幸存者续起旧阵眼',actorIds:[disciple],witnessScope:'participants',
    }));
    const direct=resolveGuidedBattlefieldRevisitTurn({kind:'battlefield-revisit',world:returned,branchId:'main',revision:4,actorId:disciple,option:choice},
      returned,'main',4);
    expect(direct?.decision).toMatchObject(raw);
    expect(resolveGuidedBattlefieldRevisitTurn({kind:'battlefield-revisit',world:returned,branchId:'main',revision:4,actorId:disciple,option:choice},
      structuredClone(returned),'main',4)).toBeUndefined();
  });

  it('lets the Utility body decide a lawful same-site follow-up without a model or a new route',()=>{
    const world=returnedFrame();
    const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'只在实地留守。'};
    const orders=Object.fromEntries(world.cultivators.filter(row=>row.id!==disciple).map(row=>[row.id,rest]));
    const after=advanceWorldTick(world,orders,()=>.5);
    expect(after.events.filter(isBattlefieldRevisitEvent)).toContainEqual(expect.objectContaining({
      title:'昔日师友在旧阵眼相见',actorIds:[disciple,patriarch],witnessScope:'participants',
    }));
    expect(siegeActor(after,disciple).locationId).toBe(location);
  });
});
