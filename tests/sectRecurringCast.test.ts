import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {ensureSectRecurringCast} from '../src/engine/sectRecurringCast';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {terrainTileAt} from '../src/engine/terrainEngine';
import {STARTER_SECT_IDS,starterSectIdentity,type StarterSectId} from '../src/types/sectManagement';
import {sectRecurringIdentity} from '../src/types/sectRecurring';
import type {WorldState,WorldgenProfileId} from '../src/types/world';

const profiles:readonly WorldgenProfileId[]=['classic','spirit-bloom','fractured-frontier'];
function newSchool(seed=13071,profile:WorldgenProfileId='classic',starter:StarterSectId='qingyun-odd-jobs'){
  const world=createManagedSectWorld(seed,profile,starter,0);
  if(!world?.sectManagement)throw new Error('expected playable managed school');
  return world;
}
function followingMonth(world:WorldState){
  world.tick++;
  world.month++;
  return world;
}

describe('recurring guests are actual native people and creatures',()=>{
  it('creates no guests in an observer world or at the founding month',()=>{
    const legacy=createInitialWorld(13071),founding=newSchool();
    const original=structuredClone([legacy,founding]);
    expect(ensureSectRecurringCast(legacy)).toBe(false);
    expect(ensureSectRecurringCast(founding)).toBe(false);
    expect([legacy,founding]).toEqual(original);
  });

  it('makes deterministically placed, native living cast with no rewrites of existing terrain geometry or people',()=>{
    for(const seed of [1,13071,4294967295])for(const profile of profiles)for(const starter of STARTER_SECT_IDS){
      const world=followingMonth(newSchool(seed,profile,starter)),identical=structuredClone(world),base=structuredClone(world);
      const management=world.sectManagement!;
      const origin=starterSectIdentity(seed,starter,0),identity=sectRecurringIdentity(origin.sectId,origin.creditorId);
      expect(ensureSectRecurringCast(world)).toBe(true);
      expect(ensureSectRecurringCast(identical)).toBe(true);
      expect(world).toEqual(identical);
      expect(world.random).toEqual(base.random);
      expect(world.cultivators.slice(0,base.cultivators.length)).toEqual(base.cultivators);
      expect(world.sects.slice(0,base.sects.length)).toEqual(base.sects);
      expect(world.locations.slice(0,base.locations.length)).toEqual(base.locations);
      expect(world.spiritBeasts.slice(0,base.spiritBeasts.length)).toEqual(base.spiritBeasts);
      expect(world.terrain.tiles.map(({ownerSectId:_owner,...tile})=>tile))
        .toEqual(base.terrain.tiles.map(({ownerSectId:_owner,...tile})=>tile));
      expect(world.cultivators.find(row=>row.id===identity.wang)?.name).toBe('王掌柜');
      expect(world.cultivators.find(row=>row.id===identity.host)?.name).toBe('蒋观星');
      expect(management.recurring).toMatchObject({openedTick:2,encounters:[]});
      const hills=world.locations.find(row=>row.id===management.recurring?.ancestorSiteId)!;
      const home=world.locations.find(row=>row.id===management.homeSiteId)!;
      expect(Math.hypot(hills.x-home.x,hills.y-home.y)).toBeLessThanOrEqual(140);
      expect(hills.type).toBe('spirit_vein');
      expect(hills.ownerSectId).toBeUndefined();
      expect(terrainTileAt(world,hills.x,hills.y)?.ownerSectId).toBeUndefined();
      expect(world.cultivators.find(row=>row.id===identity.ancestor)).toMatchObject({
        name:'后山老祖',alive:true,sectId:'',locationId:hills.id,
      });
      const cat=world.spiritBeasts.find(row=>row.id===identity.cat)!;
      expect(cat).toMatchObject({name:'偷丹灵猫',kind:'瑞兽',alive:true,locationId:hills.id,homeLocationId:management.recurring?.catHomeSiteId});
      expect(cat.tamedBy).toBeUndefined();
      expect(world.sects.find(row=>row.id===identity.rivalSectId)).toMatchObject({
        alignment:'中立',leaderId:identity.rival,headquartersId:identity.rivalSiteId,
      });
      const rivalSite=world.locations.find(row=>row.id===identity.rivalSiteId)!;
      expect(rivalSite).toMatchObject({type:'sect_hq',ownerSectId:identity.rivalSectId});
      expect(terrainTileAt(world,rivalSite.x,rivalSite.y)?.ownerSectId).toBe(identity.rivalSectId);
      expect(world.cultivators.find(row=>row.id===identity.rival)).toMatchObject({
        name:'赵掌门',alive:true,sectRank:'掌门',sectId:identity.rivalSectId,locationId:rivalSite.id,
      });
    }
  });

  it('does not repair a collision, resurrect a fallen guest, or replace missing cast after the first introduction',()=>{
    const world=followingMonth(newSchool());
    const identity=sectRecurringIdentity(world.sectManagement!.sectId,
      starterSectIdentity(world.random.seed,world.sectManagement!.starterId,world.sectManagement!.draw).creditorId);
    const collision=structuredClone(world);
    collision.spiritBeasts[0].id=identity.cat;
    const before=structuredClone(collision);
    expect(ensureSectRecurringCast(collision)).toBe(false);
    expect(collision).toEqual(before);
    expect(ensureSectRecurringCast(world)).toBe(true);
    world.spiritBeasts=world.spiritBeasts.filter(row=>row.id!==identity.cat);
    const rival=world.cultivators.find(row=>row.id===identity.rival)!;
    rival.alive=false;
    rival.hp=0;
    followingMonth(world);
    const after=structuredClone(world);
    expect(ensureSectRecurringCast(world)).toBe(false);
    expect(world).toEqual(after);
  });
});
