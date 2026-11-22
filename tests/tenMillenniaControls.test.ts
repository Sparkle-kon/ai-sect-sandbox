import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {SIX_MILLENNIA_ROOT_TICK,SIX_MILLENNIA_SEAL_INTERVAL,SIX_MILLENNIA_STEWARD,SIX_MILLENNIA_WELL} from '../scripts/sixMillenniaControls';
import {TEN_MILLENNIA_SOURCE_TICK,TEN_MILLENNIA_TERM_TICK,tenMillenniaNativeOrders} from '../scripts/tenMillenniaControls';

describe('ten-millennia physical acceptance controller',()=>{
  it('counts only native elapsed months from the actual continuation and original freight roots',()=>{
    expect(TEN_MILLENNIA_TERM_TICK-TEN_MILLENNIA_SOURCE_TICK).toBe(48_000);
    expect(TEN_MILLENNIA_TERM_TICK-SIX_MILLENNIA_ROOT_TICK).toBe(120_000);
    expect((TEN_MILLENNIA_TERM_TICK-TEN_MILLENNIA_SOURCE_TICK)/SIX_MILLENNIA_SEAL_INTERVAL).toBe(40);
  });

  it('does not train the actual qualified original when remaining natural lifespan is already enough',()=>{
    const source=createInitialWorld(1,'spirit-bloom').cultivators.find(row=>row.id===SIX_MILLENNIA_STEWARD)!;
    // Isolated test inputs for the controller only; the actual native acceptance starts from E48 bytes.
    const eligible={...source,locationId:SIX_MILLENNIA_WELL,age:6167,lifespan:12000,qiProgress:100};
    const similar={...eligible,id:'not-the-original',lifespan:6500};
    const check=(cultivators:typeof eligible[])=>tenMillenniaNativeOrders({tick:TEN_MILLENNIA_SOURCE_TICK,cultivators});
    const before=structuredClone(eligible);
    expect(check([eligible,similar])).toMatchObject({[eligible.id]:{chosenAction:'REST'},[similar.id]:{chosenAction:'REST'}});
    expect(eligible).toEqual(before);
    const short={...eligible,lifespan:6500};
    expect(check([short])[short.id].chosenAction).toBe('BREAKTHROUGH');
    expect(check([{...short,hp:short.maxHp*.89}])[short.id].chosenAction).toBe('REST');
    expect(check([{...short,locationId:'loc-danxia'}])[short.id].chosenAction).toBe('REST');
    expect(check([{...short,positionPlane:'upper'}])[short.id].chosenAction).toBe('REST');
    expect(check([{...short,qiProgress:89}])[short.id].chosenAction).toBe('CULTIVATE');
  });

  it('provides only normal native action commands, letting the real calendar and engine advance',()=>{
    const world=createInitialWorld(1,'spirit-bloom');
    const before=structuredClone(world);
    const next=advanceWorldTick(world,tenMillenniaNativeOrders(world),undefined,'utility');
    expect(world).toEqual(before);
    expect(next.tick).toBe(world.tick+1);
    expect(next.regionalSimulation).toBeUndefined();
    expect(next.authoredEraOrigin).toBeUndefined();
  });
});
