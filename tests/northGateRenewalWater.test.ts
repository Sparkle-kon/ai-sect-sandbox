import {describe,expect,it} from 'vitest';
import type {WaterVeinOpening} from '../src/types/world';
import {WATER_VEIN_RENEWAL_FUNDING,waterVeinApertureActive,waterVeinPhase} from '../src/engine/waterVeinTerms';

const opening:WaterVeinOpening={id:'water-gate-42',openedTick:42,year:1004,month:6,
  openerId:'elder-danxia-1',sectId:'sect-danxia',wellProjectId:'village-work-1',paidStones:40,borrowedUnits:9};
const ticks=[0,1,2,3,4,5,6,7].map(offset=>opening.openedTick+offset);

describe('north-gate funding and physical aperture are independent of water debt',()=>{
  it('preserves all original nine-unit opening thresholds and adds no field damage before it is affected',()=>{
    const phases=ticks.map(tick=>waterVeinPhase(opening,tick));
    expect(phases.map(row=>row.wellDepth)).toEqual([24,21,21,21,22,23,24,24]);
    expect(phases.map(row=>row.fieldDeficit)).toEqual([undefined,undefined,3,3,2,1,undefined,undefined]);
    expect(phases.map(row=>row.remainingUnits)).toEqual([9,9,9,9,6,3,0,0]);
    expect(phases.map(row=>row.mineYield)).toEqual([2,2,2,1,1,1,2,2]);
    expect(phases.map(row=>row.symptom)).toEqual([undefined,'well','field','mine','mine','mine','recovered',undefined]);
    expect(ticks.map(tick=>waterVeinApertureActive(opening,tick))).toEqual([false,true,true,true,true,true,false,false]);
  });

  it('matches exact 40+24/0 and 40+8/3 funding with calendar-valid dry and reduced-borrow apertures',()=>{
    const dry:WaterVeinOpening={...opening,borrowedUnits:WATER_VEIN_RENEWAL_FUNDING.sect.borrowedUnits,renewal:{id:'hearing',stance:'sect'}};
    const accord:WaterVeinOpening={...opening,borrowedUnits:WATER_VEIN_RENEWAL_FUNDING.accord.borrowedUnits,renewal:{id:'hearing',stance:'accord'}};
    expect(WATER_VEIN_RENEWAL_FUNDING).toEqual({reuse:{extraStones:0,roots:0,borrowedUnits:9},
      sect:{extraStones:24,roots:0,borrowedUnits:0},accord:{extraStones:8,roots:1,borrowedUnits:3}});
    expect(ticks.map(tick=>waterVeinPhase(dry,tick))).toEqual(ticks.map(()=>({
      wellDepth:24,fieldDeficit:undefined,mineYield:2,remainingUnits:0,symptom:undefined,
    })));
    expect(ticks.map(tick=>waterVeinApertureActive(dry,tick))).toEqual([false,true,true,true,true,true,false,false]);
    expect(ticks.map(tick=>waterVeinPhase(accord,tick).fieldDeficit)).toEqual([undefined,undefined,1,1,1,1,undefined,undefined]);
    expect(ticks.map(tick=>waterVeinPhase(accord,tick).remainingUnits)).toEqual([3,3,3,3,2,1,0,0]);
    expect(waterVeinApertureActive({...dry,renewal:undefined},opening.openedTick+1)).toBe(false);
    expect(waterVeinApertureActive({...accord,borrowedUnits:9},opening.openedTick+1)).toBe(false);
    expect(waterVeinApertureActive({...dry,paidStones:0},opening.openedTick+1)).toBe(false);
  });
});
