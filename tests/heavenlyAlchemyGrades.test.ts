import {describe,expect,it} from 'vitest';
import {heavenlyAlchemyLightning,projectHeavenlyAlchemy} from '../src/engine/heavenlyAlchemyEngine';
import {heavenlyAlchemyEventId,heavenlyPillQuality} from '../src/engine/heavenlyAlchemyTerms';
import {HEAVENLY_QUALITIES} from '../src/types/heavenlyAlchemy';
import {actualHighAlchemyMaterials,brewActor,brewActorId,brewMonth,highBrew,highTake} from './alchemyLightningNativeFixture';
import {executeGodIntervention} from '../src/engine/worldEngine';

describe('refined recipes use each actual authored grade, not a visual reskin',()=>{
  it('makes and consumes each distinct grade in same-source genuine native branches',()=>{
    const available=executeGodIntervention(actualHighAlchemyMaterials(),{type:'TRIBULATION_STRIKE',targetCultivatorId:brewActorId});
    const baseline=brewActor(available);
    const seenQi:number[]=[],seenHeal:number[]=[];
    for(const quality of HEAVENLY_QUALITIES){
      const roll=Array.from({length:1000},(_,n)=>n).find(n=>heavenlyPillQuality({
        recipeId:'nine_turn_golden',heat:'fierce',roll:n,mastery:baseline.techniqueMastery,toxicity:baseline.pillToxicity,
        fireRoot:baseline.spiritRoot==='火',
      })===quality);
      expect(roll).toBeDefined();
      const brewed=brewMonth(available,highBrew('nine_turn_golden','fierce'),(roll!+.5)/1000);
      const actor=brewActor(brewed);
      const event=brewed.events.find(row=>row.id===heavenlyAlchemyEventId(brewActorId,brewed.tick,'brew'))!;
      const marker=heavenlyAlchemyLightning(brewed,event);
      expect(actor.heavenlyAlchemy?.attempts.at(-1)?.quality).toBe(quality);
      expect(marker?.quality).toBe(quality==='immortal'||quality==='peerless'?quality:undefined);
      expect(heavenlyAlchemyLightning(brewed,{...event})).toBeUndefined();
      expect(projectHeavenlyAlchemy(brewed,actor)?.attempts[0]).not.toHaveProperty('roll');
      const used=brewActor(brewMonth(brewed,highTake('nine_turn_golden',quality)));
      seenQi.push(used.qiProgress-actor.qiProgress);
      seenHeal.push(used.hp-actor.hp);
    }
    expect(seenQi).toEqual([18,26,36,48]);
    expect(new Set(seenHeal).size).toBe(4);
  });
});
