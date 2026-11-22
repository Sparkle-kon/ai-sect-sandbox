import {afterEach,describe,expect,it,vi} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {encodeEraWorldSave} from '../src/engine/storageEngine';
import {physicalAtlasHome} from '../src/engine/physicalAtlasEngine';
import {PHYSICAL_ATLAS_REGION_NAMES} from '../src/engine/physicalAtlasTerms';
import type {LLMConfig} from '../src/types/world';

const config:LLMConfig={enabled:true,apiBaseUrl:'https://fixture.invalid/v1',apiKey:'fixture',model:'atlas-test'};
afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});

describe('physical region facts in cognitive JSON prompts',()=>{
  it('shows only the established current region, not hidden borders or domain-wide ownership, and adds no actions',async()=>{
    const world=createInitialWorld();
    const actor=world.cultivators.find(row=>row.id==='elder-danxia-1')!;
    const local=physicalAtlasHome(world,actor);
    expect(local?.point.regionId).toBe('west');
    expect(physicalAtlasHome(world,structuredClone(actor))).toBeUndefined();
    const before=encodeEraWorldSave(world);
    const fetch=vi.fn(async(_url:RequestInfo|URL,_settings?:RequestInit)=>new Response(JSON.stringify({
      choices:[{message:{content:JSON.stringify({chosenAction:'REST',innerMonologue:'在此歇息。'})}}],
    })));
    vi.stubGlobal('fetch',fetch);
    const answer=await requestCultivatorLLMDecision(actor,world,config,world.tick+1);
    expect(answer?.chosenAction).toBe('REST');
    const prompt=String(fetch.mock.calls.at(-1)?.[1]?.body);
    expect(prompt).toContain(`脚下地域：${PHYSICAL_ATLAS_REGION_NAMES.west}`);
    expect(prompt).not.toMatch(/脚下地域：中州|脚下地域：东境|lower-base|全境归属/);
    expect(encodeEraWorldSave(world)).toBe(before);
  });
});
