import type { WorldState } from '../types/world';
import { highDramaPreset, isBuiltinScenarioOrigin } from './highDramaPresetTerms';

type Fail=(path:string)=>never;
const NATIVE_ORIGIN_YEAR=1001;

/** V1 permits only the native calendar and provenance of the existing approved preset catalog. */
export function validateBuiltinScenarioOrigin(world:WorldState,fail:Fail):void{
  const origin=world.builtinScenarioOrigin;
  if(origin===undefined)return;
  const preset=isBuiltinScenarioOrigin(origin)?highDramaPreset(origin.id):undefined;
  const nativeMonth=(world.year-NATIVE_ORIGIN_YEAR)*12+world.month;
  if(!preset||world.scenarioOrigin!==undefined||world.scenarioAudit!==undefined||world.authoredEraOrigin!==undefined||
    world.random.seed!==preset.seed||world.worldgen?.seed!==preset.seed||world.worldgen.profileId!==preset.profileId||
    world.worldgen.birthTick!==1||world.tick<origin.openedTick||nativeMonth!==world.tick)
    return fail('builtinScenarioOrigin.references');
}
