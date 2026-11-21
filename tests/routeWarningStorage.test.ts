import { describe,expect,it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { decodeWorldSave,encodeWorldSave } from '../src/engine/storageEngine';
import { routeWarningFixture,routeWarningFixtureAction,routeWarningFixtureTurn } from './fixtures/routeWarningFixture';
import type { WorldState } from '../src/types/world';

function confirmed() {
  const {world,one,two,partner}=routeWarningFixture();
  const first=world.routeWarnings.observations.find((proof)=>proof.actorId===one)!;
  const second=world.routeWarnings.observations.find((proof)=>proof.actorId===two)!;
  const posted=routeWarningFixtureTurn(world,{[one]:routeWarningFixtureAction('post',first.id)});
  const state=routeWarningFixtureTurn(posted,{[two]:routeWarningFixtureAction('corroborate',second.id,posted.routeWarnings.notices[0].id)});
  expect(state.routeWarnings.notices[0].corroboration?.observation.id).toBe(second.id);
  return {state,partner};
}
function corrupt(save:string,transform:(world:WorldState)=>void) {
  const data=JSON.parse(save) as {world:WorldState};
  transform(data.world);
  return () => decodeWorldSave(JSON.stringify(data));
}

describe('persisted travel observations, not substitute warnings',()=>{
  it('seeds empty legacy books and keeps exact separately recorded parties after actual expiry',()=>{
    const old=JSON.parse(encodeWorldSave(createInitialWorld(41))) as {world:Partial<WorldState>};
    delete old.world.routeWarnings;
    expect(decodeWorldSave(JSON.stringify(old)).routeWarnings).toEqual({nextId:1,nextObservationId:1,notices:[],observations:[]});
    const {state}=confirmed();
    let live=state;
    while(live.tick<state.routeWarnings.notices[0].expiresTick) live=routeWarningFixtureTurn(live);
    expect(live.routeWarnings.observations).toHaveLength(0);
    const reloaded=decodeWorldSave(encodeWorldSave(live));
    expect(reloaded.routeWarnings.notices[0]).toEqual(state.routeWarnings.notices[0]);
    const before=state.routeWarnings.notices[0];
    expect(before.observation.partyIds.every((id)=>!before.corroboration?.observation.partyIds.includes(id))).toBe(true);
  });

  it('rejects a forged entry, future hazard, changed lifetime, or copied companion as a second party',()=>{
    const {state,partner}=confirmed();
    const raw=encodeWorldSave(state);
    expect(corrupt(raw,(world)=>{world.routeWarnings.notices[0].observation.fromTileId='tile-0-0';})).toThrow('routeWarnings.observations.source');
    expect(corrupt(raw,(world)=>{world.routeWarnings.notices[0].observation.hazard.createdTick++;})).toThrow('routeWarnings.observations.source');
    expect(corrupt(raw,(world)=>{world.routeWarnings.notices[0].expiresTick++;})).toThrow('routeWarnings.notices.lifetime');
    expect(corrupt(raw,(world)=>{
      const unspent=world.routeWarnings.observations.find((proof)=>proof.actorId===partner)!;
      world.routeWarnings.observations=world.routeWarnings.observations.filter((proof)=>proof.id!==unspent.id);
      world.routeWarnings.notices[0].corroboration!.observation=unspent;
    })).toThrow('routeWarnings.notices.corroboration');
  });
});
