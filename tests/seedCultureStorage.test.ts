import { describe,expect,it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { decodeWorldSave,encodeWorldSave } from '../src/engine/storageEngine';
import { matureSeedCulture,plantedSeedCulture,seedDecision,seedPerson,seedTurn } from './fixtures/seedCultureFixture';
import type { WorldState } from '../src/types/world';

const verify=(world:WorldState)=>decodeWorldSave(encodeWorldSave(world));
function corrupt(raw:string,edit:(world:WorldState)=>void){
  const parsed=JSON.parse(raw) as {world:WorldState};edit(parsed.world);
  return ()=>decodeWorldSave(JSON.stringify(parsed));
}

describe('seed culture persistence preserves measured facts and exact stock',()=>{
  it('loads an old save and round-trips a true growing plot, actual mature custody and actual harvest',()=>{
    const old=JSON.parse(encodeWorldSave(createInitialWorld(85))) as {world:Partial<WorldState>};
    delete old.world.seedCulture;
    expect(decodeWorldSave(JSON.stringify(old)).seedCulture).toEqual({lots:[],plots:[],nextLotId:1,nextPlotId:1});
    const planted=plantedSeedCulture();
    const active=verify(seedTurn(planted.world));
    expect(active.seedCulture.plots[0]).toMatchObject({status:'growing',weather:[{tick:active.tick}]});
    const t=matureSeedCulture();
    const ready=verify(t.world), plot=ready.seedCulture.plots[0];
    expect(plot.status).toBe('ready');
    const original=seedPerson(ready,t.ownerId).herbs.jade_leaf;
    const received=verify(seedTurn(ready,{[t.ownerId]:seedDecision('harvest',plot.id)}));
    expect(received.seedCulture.plots[0]).toMatchObject({status:'harvested',yield:plot.yield});
    expect(seedPerson(received,t.ownerId).herbs.jade_leaf-original).toBe(plot.yield);
    expect(received.seedCulture.lots).toEqual(ready.seedCulture.lots);
    expect(received.seedCulture.plots[0].weather).toEqual(plot.weather);
  });
  it('rejects changed sample, inflated seed stock, forged yield, and a changed exact fee/asset flow',()=>{
    const {world}=matureSeedCulture(), raw=encodeWorldSave(world);
    expect(corrupt(raw,state=>{
      const row=state.seedCulture.lots[0].tests[0];row.sprouted=row.sprouted===0?1:0;
    })).toThrow('seedCulture.lots.sample');
    expect(corrupt(raw,state=>{state.seedCulture.lots[0].remaining++;})).toThrow('seedCulture.lots.custody');
    expect(corrupt(raw,state=>{
      const row=state.seedCulture.plots[0];row.yield=row.yield===1?2:1;
    })).toThrow('seedCulture.plots.source');
    expect(corrupt(raw,state=>{
      state.resourceFlow.months.flatMap(month=>month.entries).find(row=>row.reason==='seed_plot_loss'||row.reason==='seed_crop_matured')!.reason='other_crop';
    })).toThrow('seedCulture.journal.source');
  });
});
