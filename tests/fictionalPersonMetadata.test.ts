import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {fictionalGenderFor} from '../src/engine/fictionalPersonMetadata';
import {createSettlementState} from '../src/engine/settlementEngine';

describe('creation-only fictional portrait metadata',()=>{
  it('leaves deterministic generation scalars and original simulation random stream untouched',()=>{
    const seed=42,world=createInitialWorld(seed,'spirit-bloom'),another=createInitialWorld(seed,'spirit-bloom');
    const founders=world.cultivators.filter(row=>row.id.startsWith('founder-'));
    expect(founders.length).toBeGreaterThan(0);
    expect(founders.every(row=>row.gender===fictionalGenderFor(seed,row.id))).toBe(true);
    const legacy=createSettlementState(world.locations,seed);
    const generated=createSettlementState(world.locations,seed,{generatedPersonMetadata:true});
    for(const village of generated.villages){
      for(const volunteer of village.volunteers)expect(volunteer.gender).toBe(fictionalGenderFor(seed,volunteer.id));
    }
    const withoutGender=structuredClone(generated);
    for(const village of withoutGender.villages)for(const actor of village.volunteers)delete actor.gender;
    expect(withoutGender).toEqual(legacy);
    const random=structuredClone(world.random);
    for(const actor of world.cultivators)fictionalGenderFor(seed,actor.id);
    expect(world.random).toEqual(random);
    expect(world.random).toEqual(another.random);
  });
  it('sets authored bodies explicitly and hashes generated original identities independently of same display names',()=>{
    const a=createInitialWorld(1),b=createInitialWorld(1909);
    for(const world of [a,b]){
      expect(world.cultivators.find(row=>row.id==='npc-2')?.gender).toBe('woman');
      expect(world.cultivators.find(row=>row.id==='elder-taixu-1')?.gender).toBe('man');
    }
    const volunteers=a.settlements.villages.flatMap(row=>row.volunteers);
    const woman=volunteers.find(row=>row.gender==='woman')!,man=volunteers.find(row=>row.gender==='man')!;
    expect(woman).toBeDefined();
    expect(man).toBeDefined();
    man.name=woman.name;
    expect(fictionalGenderFor(1,woman.id)).toBe('woman');
    expect(fictionalGenderFor(1,man.id)).toBe('man');
  });
});
