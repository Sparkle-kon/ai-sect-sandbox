import {afterEach,describe,expect,it,vi} from 'vitest';
import {possessAvatar} from '../src/engine/avatarEngine';
import {civicMemorialPinnedReliefIds,projectCivicMemorials} from '../src/engine/civicMemorialEngine';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick,executeGodIntervention} from '../src/engine/worldEngine';
import type {LLMConfig} from '../src/types/world';
import {civicActor,civicChoice,civicTurn} from './fixtures/civicMemorialFixture';
import {civicAppendChoice,civicRequire,nativeCivicAppended,nativeCivicNewRelief} from './civicMemorialAdditionNativeFixture';

const config:LLMConfig={enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture',model:'civic-addon-fixture'};
const reply=(decision:object)=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(decision)}}]}));
afterEach(()=>vi.unstubAllGlobals());

describe('a witnessed later relief stays separate from its original inscription',()=>{
  it('accepts the new exact pair through strict cognitive JSON and through the local native Utility witness only',async()=>{
    const f=nativeCivicNewRelief();
    const action=civicAppendChoice(f.world,f.editor,f.memorial.id,f.newDeed.id);
    const call=vi.fn(async()=>reply(action));
    vi.stubGlobal('fetch',call);
    for(const extras of [{causeOfDeath:'未经证实'},{stones:999},{name:'冒名'},{parentId:f.proposer},
      {targetCivicDeedId:f.deedId},{targetCivicMemorialId:'civic-memorial-missing'}]){
      call.mockImplementation(async()=>reply({...action,...extras}));
      await expect(requestCultivatorLLMDecision(civicActor(f.world,f.editor),f.world,config,f.world.tick+1)).resolves.toBeUndefined();
    }
    call.mockImplementation(async()=>reply(action));
    await expect(requestCultivatorLLMDecision(civicActor(f.world,f.witness),f.world,config,f.world.tick+1)).resolves.toBeUndefined();
    const selected=await requestCultivatorLLMDecision(civicActor(f.world,f.editor),f.world,config,f.world.tick+1);
    civicRequire(selected,'Exact independently witnessed later document must be an allowed model option');
    expect(selected).toMatchObject(action);
    const cognition=civicTurn(f.world,{[f.editor]:selected});
    const resting=Object.fromEntries(f.world.cultivators.filter(row=>row.id!==f.editor).map(({id})=>[id,civicChoice('REST')]));
    const utility=advanceWorldTick(f.world,resting,()=>.99);
    const additions=(world:typeof f.world)=>world.civicMemorials.memorials.find(row=>row.id===f.memorial.id)?.additions;
    expect(additions(utility)).toEqual(additions(cognition));
    expect(additions(utility)).toMatchObject([{deedId:f.newDeed.id,witnessId:f.editor,appendedTick:utility.tick}]);

    const possessed=structuredClone(f.world);
    expect(possessAvatar(possessed,f.editor)).toBe(true);
    await expect(requestCultivatorLLMDecision(civicActor(possessed,f.editor),possessed,config,possessed.tick+1)).resolves.toBeUndefined();
    expect(additions(civicTurn(possessed,{[f.editor]:selected}))).toBeUndefined();
  });

  it('keeps both actual local documentary accounts when genuine unrelated game events rotate out the recent event feed',()=>{
    const f=nativeCivicAppended();
    let world=f.world;
    const added=f.amendedMemorial.additions?.[0];
    civicRequire(added,'Actual signed appendix');
    const hotId=`evt-${added.id}-${added.appendedTick}`;
    expect(world.events.some(row=>row.id===hotId)).toBe(true);
    const projected=projectCivicMemorials(world,civicActor(world,f.proposer))?.plaques;
    const records=world.settlements.records;
    const secret='此为隔离验证中不能写入乡祠的私下传音';
    for(let i=0;i<124;i++)world=executeGodIntervention(world,{type:'WHISPER_MIND',targetCultivatorId:f.outsider,whisperText:secret});
    expect(world.tick).toBe(f.world.tick);
    expect(world.events.some(row=>row.id===hotId||row.id===f.sourceEventId||row.id==='evt-'+f.newDeed.reliefRecordId)).toBe(false);
    expect(world.settlements.records).toEqual(records);
    expect(civicMemorialPinnedReliefIds(world)).toEqual(new Set([f.sourceEventId.slice(4),f.newDeed.reliefRecordId]));
    expect(projectCivicMemorials(world,civicActor(world,f.proposer))?.plaques).toEqual(projected);
    expect(JSON.stringify(projected)).not.toContain(secret);
    const raw=encodeEraWorldSave(world);
    expect(encodeEraWorldSave(decodeEraWorldSave(raw))).toBe(raw);
  });
});
