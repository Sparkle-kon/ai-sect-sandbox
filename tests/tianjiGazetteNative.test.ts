import { describe,expect,it } from 'vitest';
import { createTerrainMapView } from '../src/components/terrainMapView';
import { decodeEraWorldSave,encodeEraWorldSave } from '../src/engine/storageEngine';
import { projectTianjiGazette } from '../src/engine/tianjiGazetteEngine';
import type { WorldState } from '../src/types/world';
import { firstId,secondId } from './dramaticBondNativeFixture';
import { siegeTurn } from './grandSiegeNativeFixture';
import { actualTournament,actualTournamentSignup,tournamentFrame,tournamentId } from "./tournamentArenaNativeFixture";
import { actualGazetteBounty,actualGazetteCampaign,actualGazettePeace,actualGazetteYear,rotateGazetteHotEvidence } from './tianjiGazetteNativeFixture';

const issues=(world:WorldState)=>world.tianjiGazette?.issues??[];
function strict(world:WorldState){
  const raw=encodeEraWorldSave(world),restored=decodeEraWorldSave(raw);
  expect(encodeEraWorldSave(restored)).toBe(raw);
  return restored;
}
const reader=(world:WorldState,viewerId:string,throughTick=world.tick)=>{
  const actor=world.cultivators.find(row=>row.id===viewerId);
  expect(actor?.alive).toBe(true);
  const view=createTerrainMapView(world,actor,true);
  return projectTianjiGazette(world,{viewerId,throughTick,currentVisibleSiteIds:new Set(view.seenLocations
    .filter(row=>view.isCurrentLocation(row.id)).map(row=>row.id))});
};

describe('native Tianji Gazette publication',()=>{
  it('publishes only at the actual new year and cites only both genuine public clashes, never their private sibling',()=>{
    const {world,lastDecember,source,control,privateSource,publicBefore}=actualGazetteYear();
    expect(lastDecember.month).toBe(12);
    expect(world.tick).toBe(13);
    expect(issues(lastDecember)).toEqual([]);
    const issue=issues(world).find(row=>row.tick===world.tick)!;
    expect(issue).toMatchObject({id:`gazette-${world.tick}`,tick:world.tick,year:world.year,month:1,trigger:'year_turn'});
    expect(issue.entries).toContainEqual(expect.objectContaining({
      kind:'rivalry',sourceEventId:source.id,siteId:'loc-market',earlier:expect.objectContaining({sourceEventId:publicBefore.id}),
    }));
    const rivalry=issue.entries.find(row=>row.kind==='rivalry');
    expect(rivalry?.kind==='rivalry'&&new Set(rivalry.actorIds)).toEqual(new Set([firstId,secondId]));
    expect(JSON.stringify(issue)).not.toContain(privateSource.id);
    expect(issues(control.world).find(row=>row.tick===world.tick)).toEqual(issue);
    expect(reader(world,secondId,world.tick-1).some(row=>row.id===issue.id)).toBe(false);
    expect(reader(strict(world),secondId)).toContainEqual(expect.objectContaining({id:issue.id,
      entries:expect.arrayContaining([expect.objectContaining({kind:'rivalry'})])}));
    expect(reader(world,'npc-8').some(row=>row.id===issue.id)).toBe(false);
  });

  it('prints the first real campaign conclusion, remains exact after hot event rotation, and preserves the original territorial result',()=>{
    const {arrived,reports,closed,ended,source}=actualGazetteCampaign();
    expect(issues(arrived)).toEqual([]);
    for(const current of reports.slice(0,-1))expect(issues(current).some(row=>row.trigger==='battle')).toBe(false);
    const issue=issues(closed).find(row=>row.trigger==='battle')!;
    expect(issue).toMatchObject({tick:closed.tick,year:closed.year,month:closed.month});
    expect(issue.entries).toContainEqual(expect.objectContaining({
      kind:'headline',story:'siege',siegeId:ended.id,outcome:'victory',attackerSectId:ended.attackerSectId,
      defenderSectId:ended.defenderSectId,sourceEventId:source.id,siteId:ended.destinationId,
    }));
    expect(closed.locations.find(row=>row.id===ended.destinationId)?.ownerSectId).toBe(ended.defenderSectId);
    const byDefender=reader(closed,'npc-3');
    expect(byDefender).toContainEqual(expect.objectContaining({id:issue.id,entries:expect.arrayContaining([
      expect.objectContaining({kind:'headline'}),
    ])}));
    expect(reader(closed,'npc-5').some(row=>row.id===issue.id)).toBe(false);
    const later=rotateGazetteHotEvidence(strict(closed),source.id);
    const reread=strict(later);
    expect(issues(reread).filter(row=>row.id===issue.id)).toEqual([issue]);
    expect(reader(reread,'npc-3').find(row=>row.id===issue.id)).toEqual(byDefender.find(row=>row.id===issue.id));
  });

  it('never prints an arriving army or an actually signed bloodless truce as a battle',()=>{
    const {signed,outcome,march}=actualGazettePeace();
    expect(march.arrived.tick).toBeLessThan(signed.tick);
    expect(outcome.rounds).toBe(0);
    let after=signed;
    while(after.tick<13)after=siegeTurn(after);
    expect(issues(strict(after)).flatMap(row=>row.entries).some(entry=>entry.kind==='headline'&&entry.story==='siege')).toBe(false);
    expect(issues(after).some(row=>row.trigger==='battle')).toBe(false);
  });
});

it('uses the real funded bounty notice without publishing the target current whereabouts or raw causal story',()=>{
  const {world,bounty,source}=actualGazetteBounty();
  const issue=issues(world).find(row=>row.tick===world.tick)!;
  expect(issue?.entries).toContainEqual(expect.objectContaining({kind:'bounty',bountyId:bounty.id,
    reward:bounty.reward,targetActorId:bounty.targetCultivatorId,sourceEventId:source.id,siteId:source.locationId}));
  expect(source.locationId).not.toBe(world.cultivators.find(row=>row.id===bounty.targetCultivatorId)?.locationId);
  expect(issues(strict(world))).toEqual(issues(world));
});

it('prints champions only after the genuine eight-entrant native arena awards one',()=>{
  let world=actualTournamentSignup();
  while(world.tick<66){
    expect(issues(world).some(row=>row.trigger==='finale')).toBe(false);
    world=tournamentFrame(world);
  }
  const arena=actualTournament(world).arena!;
  expect(arena.seededIds).toHaveLength(8);
  expect(arena.prize).toMatchObject({tick:world.tick});
  const issue=issues(world).find(row=>row.tick===world.tick&&row.trigger==='finale');
  expect(issue?.entries).toContainEqual(expect.objectContaining({kind:'headline',story:'tournament',occasionId:tournamentId,
    winnerId:arena.prize?.actorId,siteId:'loc-market'}));
  expect(issues(strict(world))).toEqual(issues(world));
});
