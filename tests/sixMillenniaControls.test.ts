import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {SIX_MILLENNIA_SOURCE_TICK,SIX_MILLENNIA_STEWARD,SIX_MILLENNIA_WELL,
  sixMillenniaNativeOrders,sixMillenniaQueryPercentiles} from '../scripts/sixMillenniaControls';

describe('six-millennia portable acceptance controls',()=>{
  it('keeps the actual native actor and world unchanged by determining orders',()=>{
    const world=createInitialWorld(1,'spirit-bloom');
    const before=structuredClone(world);
    const orders=sixMillenniaNativeOrders(world);
    expect(world).toEqual(before);
    expect(Object.keys(orders)).toHaveLength(world.cultivators.filter(row=>row.alive&&row.hp>0).length);
    expect(Object.values(orders).every(row=>row.chosenAction==='REST')).toBe(true);
    const next=advanceWorldTick(world,orders,undefined,'utility');
    expect(next.tick).toBe(world.tick+1);
    expect(next.regionalSimulation).toBeUndefined();
    expect(next.authoredEraOrigin).toBeUndefined();
  });

  it('only calls for training of the one healthy lower original at the real old well when necessary',()=>{
    const origin=createInitialWorld(1,'spirit-bloom').cultivators.find(row=>row.id===SIX_MILLENNIA_STEWARD)!;
    // Isolated controller input boundary checks, not the historical acceptance lineage.
    const check=(attributes:Partial<typeof origin>)=>{
      const actor={...origin,locationId:SIX_MILLENNIA_WELL,age:3167,lifespan:5000,qiProgress:89,...attributes};
      return sixMillenniaNativeOrders({tick:SIX_MILLENNIA_SOURCE_TICK,cultivators:[actor]})[actor.id]?.chosenAction;
    };
    expect(check({})).toBe('CULTIVATE');
    expect(check({qiProgress:90})).toBe('BREAKTHROUGH');
    expect(check({hp:origin.maxHp*.89})).toBe('REST');
    expect(check({lifespan:12000})).toBe('REST');
    expect(check({locationId:'loc-vein-south'})).toBe('REST');
    expect(check({positionPlane:'frontier'})).toBe('REST');
    expect(check({id:'same-name-different-identity'})).toBe('REST');
    expect(check({alive:false})).toBeUndefined();
  });

  it('computes named nearest-rank percentiles without mutating the observed samples',()=>{
    const costs=[92,4,1,3,2];
    expect(sixMillenniaQueryPercentiles(costs)).toEqual({samples:5,p50Ms:3,p95Ms:92});
    expect(costs).toEqual([92,4,1,3,2]);
    expect(()=>sixMillenniaQueryPercentiles([])).toThrow();
    expect(()=>sixMillenniaQueryPercentiles([-1])).toThrow();
  });
});
