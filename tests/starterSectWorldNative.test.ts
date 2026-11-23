import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {createManagedSectWorld,previewStarterSect} from '../src/engine/starterSectWorld';
import {terrainTileAt} from '../src/engine/terrainEngine';
import {MAX_WORLD_SEED} from '../src/engine/worldRandom';
import {MANAGEMENT_BUILDING_IDS,SECT_QUIRK_IDS,STARTER_SECT_IDS} from '../src/types/sectManagement';
import type {StarterDraw} from '../src/types/sectManagement';
import type {WorldgenProfileId} from '../src/types/world';

const profiles:readonly WorldgenProfileId[]=['classic','spirit-bloom','fractured-frontier'];

describe('native new-game starter sects',()=>{
  it('uses the two authored starts and a deterministic seeded roster with exactly one alternative draw',()=>{
    const one=previewStarterSect(2031,'qingyun-odd-jobs',0),other=previewStarterSect(2031,'drunken-sword-hermitage',0);
    expect(one).toMatchObject({name:'青云杂役派',stones:12,debt:{creditorName:'王掌柜',principal:80,dueMonths:6},
      buildings:{hall:1,kitchen:1,furnace:0,trainingGround:0,gate:1,library:0}});
    expect(other).toMatchObject({name:'醉剑小筑',stones:30,buildings:{hall:1,kitchen:2,furnace:0,trainingGround:1,gate:0,library:0}});
    expect(other?.debt).toBeUndefined();
    expect(one?.disciples).toHaveLength(3);
    expect(other?.disciples).toHaveLength(4);
    for(const id of STARTER_SECT_IDS){
      const original=previewStarterSect(2031,id,0)!;
      const reroll=previewStarterSect(2031,id,1)!;
      expect(previewStarterSect(2031,id,0)).toEqual(original);
      expect(previewStarterSect(2031,id,1)).toEqual(reroll);
      expect(previewStarterSect(2032,id,0)?.disciples.map(row=>row.quirks)).not.toEqual(original.disciples.map(row=>row.quirks));
      expect(new Set([...original.disciples,...reroll.disciples].map(row=>row.name)).size).toBe(original.disciples.length+reroll.disciples.length);
      for(const member of [...original.disciples,...reroll.disciples]){
        expect(member.quirks.length).toBeGreaterThanOrEqual(1);
        expect(member.quirks.length).toBeLessThanOrEqual(2);
        expect(new Set(member.quirks).size).toBe(member.quirks.length);
        expect(member.quirks.every(quirk=>SECT_QUIRK_IDS.includes(quirk))).toBe(true);
      }
    }
    expect(previewStarterSect(2031,'qingyun-odd-jobs',2 as StarterDraw)).toBeUndefined();
    expect(previewStarterSect(-1,'qingyun-odd-jobs',0)).toBeUndefined();
  });

  it('materializes the preview through real sect, site, leader, disciples, owner tile and creditor without rewriting history',()=>{
    for(const seed of [0,2031,709,MAX_WORLD_SEED])for(const profile of profiles){
      const oldWorld=createInitialWorld(seed,profile);
      for(const starter of STARTER_SECT_IDS)for(const draw of [0,1] as const){
        const preview=previewStarterSect(seed,starter,draw)!;
        const world=createManagedSectWorld(seed,profile,starter,draw);
        if(!world?.sectManagement)throw new Error(`starter site unavailable for ${seed}/${profile}/${starter}/${draw}`);
        const management=world.sectManagement;
        const sect=world.sects.find(row=>row.id===management.sectId),home=world.locations.find(row=>row.id===management.homeSiteId);
        const leader=world.cultivators.find(row=>row.id===management.leaderId);
        expect(sect).toMatchObject({name:preview.name,spiritStones:preview.stones,leaderId:leader?.id,headquartersId:home?.id});
        expect(home).toMatchObject({type:'sect_hq',ownerSectId:sect?.id});
        expect(terrainTileAt(world,home!.x,home!.y)?.ownerSectId).toBe(sect?.id);
        expect(leader).toMatchObject({alive:true,sectRank:'掌门',sectId:sect?.id,locationId:home?.id});
        expect(management.foundingDiscipleIds).toEqual(preview.disciples.map(row=>row.id));
        for(const person of preview.disciples)expect(world.cultivators.find(row=>row.id===person.id)).toMatchObject({
          ...person,alive:true,sectRank:'外门弟子',sectId:sect?.id,locationId:home?.id,
        });
        expect(world.cultivators).toHaveLength(oldWorld.cultivators.length+preview.disciples.length+2);
        expect(world.cultivators.slice(0,oldWorld.cultivators.length).map(({quirks:_quirks,...original})=>original)).toEqual(oldWorld.cultivators);
        expect(world.locations.slice(0,-1)).toEqual(oldWorld.locations);
        expect(world.sects.slice(0,-1)).toEqual(oldWorld.sects);
        expect(world.events).toEqual(oldWorld.events);
        expect(world.random).toEqual(oldWorld.random);
        expect(world.playerAvatar).toEqual(oldWorld.playerAvatar);
        expect(world.tick).toBe(1);
        expect(world.storyteller?.focusActorId).toBe(leader?.id);
        expect(Object.keys(management.buildings)).toEqual([...MANAGEMENT_BUILDING_IDS]);
        const wang=world.cultivators.find(row=>row.name==='王掌柜');
        expect(wang).toMatchObject({alive:true,sectId:'',locationId:'loc-market'});
        if(preview.debt)expect(management.debt).toEqual({creditorId:wang?.id,principal:80,dueTick:7});
        else expect(management.debt).toBeUndefined();
      }
    }
  });
});
