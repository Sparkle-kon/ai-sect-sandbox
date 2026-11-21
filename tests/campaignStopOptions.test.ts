import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {findVisibleCampaignStopOption,visibleCampaignStopOptions} from '../src/components/campaignStopOptions';

describe('named stops use only current authorized identities',()=>{
  it('distinguishes genuinely seen same-name actors by identity and does not offer hidden or failed targets',()=>{
    const world=createInitialWorld(2031);
    const [owner,twin,hidden,fallen]=world.cultivators;
    twin.locationId=owner.locationId;twin.name=owner.name;twin.realm=owner.realm;twin.realmStage=owner.realmStage;
    hidden.locationId=world.locations.find(row=>row.type==='secret_realm')!.id;
    hidden.name='秘境私名不能出现';
    fallen.locationId=owner.locationId;fallen.name='已陨落者不能预约';fallen.alive=false;fallen.hp=0;
    const before=JSON.stringify(world),options=visibleCampaignStopOptions(world,owner);
    const person=(actorId:string)=>findVisibleCampaignStopOption(options,{kind:'actor_died',actorId});
    expect(person(owner.id)?.label).toMatch(/同名 1/);
    expect(person(twin.id)?.label).toMatch(/同名 2/);
    expect(person(hidden.id)).toBeUndefined();
    expect(person(fallen.id)).toBeUndefined();
    expect(JSON.stringify(options)).not.toContain('秘境私名');
    expect(options.filter(({condition})=>condition.kind==='site_owner_changed').every(({condition})=>
      condition.kind!=='site_owner_changed'||world.locations.find(({id})=>id===condition.siteId)?.type!=='secret_realm')).toBe(true);
    expect(visibleCampaignStopOptions(world,structuredClone(owner))).toEqual([]);
    expect(JSON.stringify(world)).toBe(before);
  });
});
