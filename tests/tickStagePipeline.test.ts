import {describe,expect,it} from 'vitest';
import {defineTickPlugins,runTickPlugins} from '../src/engine/tick/tickPlugins';
import {tickStagePipeline} from '../src/engine/tick/tickStagePipeline';

describe('native monthly stages have one explicit execution order',()=>{
  it('keeps the five phase registrations immutable and in their contractual order',()=>{
    expect(tickStagePipeline.map(stage=>stage.id)).toEqual([
      'PreTurn','MovementAndEncounter','ActionAndCombat','InstitutionAndWorld','ChronicleAndPostTurn',
    ]);
    expect(Object.isFrozen(tickStagePipeline)).toBe(true);
    expect(tickStagePipeline.every(stage=>Object.isFrozen(stage))).toBe(true);
  });

  it('registers deterministic named hooks once and rejects duplicate or blank IDs',()=>{
    const context:{observations:string[];elapsed:number}={observations:[],elapsed:0};
    type C=typeof context;
    const arrive={id:'arrive',run:(state:C,prefix:string)=>{
      state.elapsed++;
      state.observations.push(`${prefix}:arrived`);
    }};
    const witness={id:'record',run:(state:C,prefix:string)=>{
      state.observations.push(`${prefix}:witnessed ${state.elapsed}`);
    }};
    const authored=[arrive,witness];
    const plugins=defineTickPlugins<C,[string]>(authored);
    authored.reverse();
    runTickPlugins(context,plugins,'甲');
    expect(context.observations).toEqual(['甲:arrived','甲:witnessed 1']);
    expect(Object.isFrozen(plugins)).toBe(true);
    expect(plugins.every(Object.isFrozen)).toBe(true);
    expect(()=>defineTickPlugins<C,[string]>([arrive,arrive])).toThrow(/duplicate/);
    expect(()=>defineTickPlugins<C,[string]>([{...arrive,id:' '}])).toThrow(/tick plugin/);
  });
});
