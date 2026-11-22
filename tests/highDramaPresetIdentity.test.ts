import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {
  builtinScenarioOriginFor,HIGH_DRAMA_PRESETS,highDramaPreset,isBuiltinScenarioOrigin,
} from '../src/engine/highDramaPresetTerms';
import {sameGeneratedWorld} from '../src/engine/worldIdentity';

describe('built-in high drama catalog and isolated world identity',()=>{
  it('fixes the catalog order and strictly distinguishes marker from unknown fields or dates',()=>{
    expect(HIGH_DRAMA_PRESETS.map(({id,openedTick})=>[id,openedTick])).toEqual([
      ['storm-at-blood-moon',7],['tournament-eve',62],['cold-jade-disciple',3],
    ]);
    expect(highDramaPreset('ordinary-gauntlet')).toBeUndefined();
    for(const preset of HIGH_DRAMA_PRESETS){
      const origin=builtinScenarioOriginFor(preset.id);
      expect(origin).toEqual({version:1,id:preset.id,openedTick:preset.openedTick});
      expect(isBuiltinScenarioOrigin(origin)).toBe(true);
      expect(isBuiltinScenarioOrigin({...origin,openedTick:preset.openedTick+1})).toBe(false);
      expect(isBuiltinScenarioOrigin({...origin,version:2})).toBe(false);
      expect(isBuiltinScenarioOrigin({...origin,title:preset.title})).toBe(false);
    }
    expect(isBuiltinScenarioOrigin({version:1,id:'unknown',openedTick:7})).toBe(false);
  });

  it('separates three matching-seed preset roots, normal, and imported scenario while preserving a descendant',()=>{
    const normal=createInitialWorld(1,'spirit-bloom');
    const portable={...structuredClone(normal),scenarioOrigin:{id:'storm-at-blood-moon',version:1 as const,ruleset:1 as const,endTick:7}};
    const roots=HIGH_DRAMA_PRESETS.map(({id})=>({...structuredClone(normal),builtinScenarioOrigin:builtinScenarioOriginFor(id)}));
    for(const root of roots){
      expect(sameGeneratedWorld(root,normal)).toBe(false);
      expect(sameGeneratedWorld(root,portable)).toBe(false);
      expect(sameGeneratedWorld(root,{...structuredClone(root),tick:root.tick+40})).toBe(true);
    }
    for(let i=0;i<roots.length;i++)for(let j=i+1;j<roots.length;j++)expect(sameGeneratedWorld(roots[i],roots[j])).toBe(false);
    expect(sameGeneratedWorld(normal,structuredClone(normal))).toBe(true);
    expect(normal.builtinScenarioOrigin).toBeUndefined();
  });
});
