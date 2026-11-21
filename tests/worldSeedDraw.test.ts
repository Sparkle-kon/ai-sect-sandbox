import {describe,expect,it,vi} from 'vitest';
import {copyWorldSeed,drawWorldSeed,type SeedEntropy} from '../src/components/worldSeedDraw';
import {parseWorldSeed} from '../src/components/WorldStoragePanel';
import {createInitialWorld} from '../src/data/initialWorld';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick,executeGodIntervention} from '../src/engine/worldEngine';
import type {WorldState} from '../src/types/world';

const word=(seed:number):SeedEntropy=>({getRandomValues<T extends ArrayBufferView|null>(array:T):T{
  if(!(array instanceof Uint32Array)||array.length!==1)throw Error('expected one uniformly distributed uint32');
  array[0]=seed;
  return array;
}});
const restOfEra=(world:WorldState,through:number,cacheCombat:Set<string>)=>{
  let current=world;
  while(current.tick<through){
    current=advanceWorldTick(current,undefined,undefined,'utility');
    for(const event of current.events)if(event.tick===current.tick&&event.category==='combat')cacheCombat.add(event.id);
  }
  return current;
};
const create=(seed:number)=>executeGodIntervention(createInitialWorld(seed,'fractured-frontier'),
  {type:'SPAWN_TREASURE',targetLocationId:'loc-vein-north'});

describe('explicit random start uses portable exact seed and native deterministic replay',()=>{
  it('draws the full unsigned range including zero without changing the current world',()=>{
    const snapshot=createInitialWorld(2031),before=encodeEraWorldSave(snapshot);
    for(const seed of [0,1,2031,0xffffffff])expect(parseWorldSeed(String(drawWorldSeed(word(seed))))).toBe(seed);
    expect(drawWorldSeed({getRandomValues(){throw Error('entropy unavailable');}})).toBeUndefined();
    expect(encodeEraWorldSave(snapshot)).toBe(before);
  });

  it('copies only the canonical decimal seed, with a real false result for unavailable or denied clipboard',async()=>{
    const writeText=vi.fn(async (_text:string)=>{});
    expect(await copyWorldSeed(0,{writeText})).toBe(true);
    expect(await copyWorldSeed(0xffff_ffff,{writeText})).toBe(true);
    expect(await copyWorldSeed(-1,{writeText})).toBe(false);
    expect(await copyWorldSeed(1.5,{writeText})).toBe(false);
    expect(await copyWorldSeed(0x1_0000_0000,{writeText})).toBe(false);
    expect(await copyWorldSeed(17,undefined)).toBe(false);
    expect(await copyWorldSeed(17,{writeText:async()=>{throw Error('clipboard denied');}})).toBe(false);
    expect(writeText.mock.calls).toEqual([['0'],['4294967295']]);
  });

  it('replays each drawn seed, unchanged profile and identical real gift, across a verified midpoint read; different draws diverge',()=>{
    const seen=[];
    for(const integer of [0,1]){
      const seed=drawWorldSeed(word(integer))!;
      const start=create(seed),combatWhole=new Set<string>(),combatAcross=new Set<string>();
      const end=restOfEra(start,25,combatWhole);
      const midpoint=restOfEra(create(seed),13,combatAcross);
      const restored=decodeEraWorldSave(encodeEraWorldSave(midpoint));
      const replayed=restOfEra(restored,25,combatAcross);
      expect(encodeEraWorldSave(replayed)).toBe(encodeEraWorldSave(end));
      expect(combatAcross).toEqual(combatWhole);
      expect(start.worldgen).toMatchObject({seed,profileId:'fractured-frontier'});
      expect(start.events.some(event=>event.id==='evt-god-treasure-1-1')).toBe(true);
      seen.push({
        names:start.cultivators.filter(actor=>actor.id.startsWith('founder-')).map(actor=>actor.name),
        combat:[...combatWhole],
        deeds:end.cultivators.filter(actor=>actor.alive).map(actor=>actor.currentAction),
      });
    }
    expect(seen[0]?.names).not.toEqual(seen[1]?.names);
    expect(seen[0]?.combat[0]).toBe('evt-15-npc-3-duel');
    expect(seen[1]?.combat[0]).toBe('evt-11-npc-3-duel');
    expect(seen[0]?.deeds).not.toEqual(seen[1]?.deeds);
  },30_000);
});
