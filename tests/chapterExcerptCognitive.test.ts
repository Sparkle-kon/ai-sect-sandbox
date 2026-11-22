import {describe,expect,it,vi} from 'vitest';
import {confirmChapterExcerpt,prepareChapterExcerpt,projectChapterExcerpt} from '../src/components/chapterExcerptModel';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {availableChronicleChapter,resolveChronicleChapter} from '../src/engine/novelGenerator';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {personaLine} from '../src/engine/wildPersonaEngine';
import type {LLMConfig,LLMDecisionPayload} from '../src/types/world';
import {dialoguePerson,dialogueProofBase} from './fixtures/publicDialogueFixture';

describe('strict cognitive JSON and the same local excerpt boundary',()=>{
  it('keeps actual authored public speech without republishing behavioral model words or a branch label',async()=>{
    const {world:before,actorId,firstId}=dialogueProofBase();
    const config:LLMConfig={enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture',model:'excerpt-fixture'};
    const outerThought='只存于心念的模组密语';
    const providerDraft='未过此桥，且慢收剑。';
    const payload:LLMDecisionPayload={chosenAction:'DUEL',targetCultivatorId:firstId,innerMonologue:outerThought,spokenLine:providerDraft};
    const call=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(payload)}}]})));
    vi.stubGlobal('fetch',call);
    try{
      const choice=await requestCultivatorLLMDecision(dialoguePerson(before,actorId),before,config,before.tick+1);
      if(!choice)throw Error('Actual strict JSON must permit the locally legal native duel');
      expect(choice).toMatchObject({chosenAction:'DUEL',targetCultivatorId:firstId,innerMonologue:outerThought,spokenLine:providerDraft});
      const idle:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'调息。'};
      const next=advanceWorldTick(before,Object.fromEntries(before.cultivators.map(({id})=>[id,id===actorId?choice:idle])),()=>.5,'deferred');
      const authoredPublic=personaLine(dialoguePerson(next,actorId),'combat_open');
      const event=next.events.find(row=>row.tick===next.tick&&row.witnessScope===undefined&&
        row.actorIds[0]===actorId&&row.actorIds[1]===firstId&&row.dialogue?.turns[0]?.text===authoredPublic);
      const plan=availableChronicleChapter(next,true);
      const chapter=plan&&resolveChronicleChapter(next,plan);
      if(!event||!chapter)throw Error('Actual model decision did not leave an exact public source');
      const scope='仅在回放选择器使用的支名';
      const sheet=projectChapterExcerpt(next,chapter.id,scope,actorId);
      const draft=sheet&&prepareChapterExcerpt(sheet,[event.id]);
      const output=draft&&confirmChapterExcerpt(next,chapter.id,scope,actorId,draft);
      expect(output?.text).toContain(authoredPublic);
      expect(output?.text).not.toContain(providerDraft);
      expect(output?.text).not.toContain(outerThought);
      expect(output?.text).not.toContain(scope);
      const native:LLMDecisionPayload={chosenAction:'DUEL',targetCultivatorId:firstId,innerMonologue:'当面应战。'};
      const offline=advanceWorldTick(before,Object.fromEntries(before.cultivators.map(({id})=>[id,id===actorId?native:idle])),()=>.5,'deferred');
      const mechanics=(frame:typeof next)=>frame.cultivators.map(row=>[row.id,row.alive,row.hp,row.lifespan,row.spiritStones,row.currentAction]);
      expect(mechanics(next)).toEqual(mechanics(offline));
      expect(next.random).toEqual(offline.random);
      expect(next.events.find(row=>row.id===event.id)?.damage).toEqual(offline.events.find(row=>row.id===event.id)?.damage);
      expect(call).toHaveBeenCalledTimes(1);
    }finally{vi.unstubAllGlobals();}
  });
});
