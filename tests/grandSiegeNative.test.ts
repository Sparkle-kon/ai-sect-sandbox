import {describe,expect,it} from 'vitest';
import {createTerrainMapView} from '../src/components/terrainMapView';
import {possessAvatar} from '../src/engine/avatarEngine';
import {resolveCeasefireAction} from '../src/engine/ceasefireEngine';
import {availableGrandSiegeHeroActions,projectGrandSiegeTheatres,queueGrandSiegeHero} from '../src/engine/grandSiegeTheatreEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import type {WorldState} from '../src/types/world';
import {actualGrandSiege,actualSiege,attackSect,commander,disciple,location,patriarch,siegeActor,siegeSect,siegeTurn} from './grandSiegeNativeFixture';

function strict(world:WorldState){
  const raw=encodeEraWorldSave(world),reopened=decodeEraWorldSave(raw);
  expect(encodeEraWorldSave(reopened)).toBe(raw);
  return reopened;
}
const visible=(world:WorldState,id=patriarch)=>{
  const viewer=siegeActor(world,id);
  return projectGrandSiegeTheatres(world,createTerrainMapView(world,viewer,true),id);
};

describe('grand siege attached to a real opposing native campaign',()=>{
  it('declares, pays, gathers and arrives before one genuine array round and its local champion exchange',()=>{
    const {initial,launched,assembled,arrived,siege}=actualGrandSiege();
    expect(arrived.tick).toBe(7);
    expect(siege.rounds).toBe(0);
    expect(actualSiege(launched).theatre).toMatchObject({sourceLaunchId:'evt-5-dip-sect-qingyun-sect-bloodmoon-launch_siege',rounds:[]});
    expect(actualSiege(assembled).theatre?.arrivedTick).toBeUndefined();
    expect(siege.theatre?.arrivedTick).toBe(arrived.tick);
    const fought=siegeTurn(strict(arrived)),round=actualSiege(fought).theatre?.rounds[0]!;
    expect(round).toMatchObject({round:1,tick:8,wallBefore:200,wallMax:200});
    expect(round.hero).toBeUndefined();
    expect(round.wallAfter).toBe(siegeSect(fought).arrayHp);
    expect(round.wallAfter).toBeGreaterThan(0);
    expect(round.wallAfter).toBeLessThan(round.wallBefore);
    expect(new Set(round.attackers.map(row=>row.actorId))).toEqual(new Set(siege.participantIds));
    expect(siegeActor(initial,disciple).sectRank).toBe('真传弟子');
    expect(round.defenders).toContainEqual(expect.objectContaining({actorId:disciple,rank:'长老'}));
    expect(round.defenders.find(row=>row.actorId===disciple)?.rank).toBe(siegeActor(fought,disciple).sectRank);
    expect(round.defenders).toContainEqual(expect.objectContaining({actorId:patriarch,rank:'掌门'}));
    const clash=round.clash!;
    expect(clash.attackerDamage).toBeGreaterThan(0);
    expect(clash.defenderDamage).toBeGreaterThan(0);
    expect([clash.attackerId,clash.defenderId]).toContain(clash.winnerId);
    for(const [id,damage] of [[clash.attackerId,clash.attackerDamage],[clash.defenderId,clash.defenderDamage]] as const){
      expect(siegeActor(arrived,id).hp-siegeActor(fought,id).hp).toBeGreaterThan(damage); // Includes subsequent array fighting.
      expect(siegeActor(fought,id).locationId).toBe(location);
    }
    expect(fought.events).toContainEqual(expect.objectContaining({id:round.sourceEventId,title:'护山阵接战',locationId:location}));
    expect(visible(fought)).toContainEqual(expect.objectContaining({siegeId:siege.id,round}));
  });

  it('spends exactly one real current defending leader response and makes a durable fought terminal, not a conquest',()=>{
    const {arrived,siege}=actualGrandSiege();
    const afterOne=siegeTurn(arrived),actor=siegeActor(afterOne,patriarch);
    expect(possessAvatar(afterOne,actor.id)).toBe(true);
    expect(availableGrandSiegeHeroActions(actor,afterOne)).toContainEqual({
      action:'GRAND_SIEGE_HERO',targetGrandSiegeId:siege.id,grandSiegeHeroMove:'leader-last-stand',
    });
    expect(queueGrandSiegeHero(afterOne,disciple,siege.id,'leader-last-stand')).toBe(afterOne);
    const paid=queueGrandSiegeHero(afterOne,actor.id,siege.id,'leader-last-stand');
    const hold=queueGrandSiegeHero(afterOne,actor.id,siege.id,'hold');
    expect(paid.tick).toBe(afterOne.tick);
    expect(siegeActor(paid,actor.id).qiProgress).toBe(actor.qiProgress);
    const saved=siegeTurn(strict(paid)),control=siegeTurn(strict(hold));
    const first=actualSiege(saved).theatre?.rounds[0]!,second=actualSiege(saved).theatre?.rounds[1]!;
    const hero=second.hero!;
    expect(first.clash).toBeDefined();
    expect(second.clash).toBeUndefined();
    expect(hero).toMatchObject({actorId:actor.id,rank:'掌门',move:'leader-last-stand',origin:'player',paidQi:18,paidHp:12});
    expect(hero.wallSaved).toBeGreaterThan(0);
    expect(siegeActor(control,actor.id).qiProgress-siegeActor(saved,actor.id).qiProgress).toBe(hero.paidQi);
    expect(siegeActor(control,actor.id).hp-siegeActor(saved,actor.id).hp).toBe(hero.paidHp);
    expect(siegeSect(saved).arrayHp-siegeSect(control).arrayHp).toBe(hero.wallSaved);
    expect(actualSiege(control).theatre?.rounds[1].hero).toBeUndefined();
    let closed=saved;
    for(let i=0;i<8&&actualSiege(closed).status==='sieging';i++)closed=siegeTurn(closed);
    const ended=actualSiege(closed),theatre=ended.theatre!;
    expect(ended.status).toBe('victory');
    expect(theatre.rounds.filter(row=>row.hero)).toHaveLength(1);
    expect(theatre.rounds.some(row=>row.wallBefore>0&&row.wallAfter===0)).toBe(true);
    expect(theatre.terminal).toMatchObject({status:'victory',battlefield:true,tick:closed.tick});
    expect(closed.events).toContainEqual(expect.objectContaining({id:theatre.terminal?.sourceEventId,title:'攻山告捷',locationId:location}));
    expect(closed.locations.find(row=>row.id===location)?.ownerSectId).toBe(siege.defenderSectId);
    expect(siegeActor(closed,commander).locationId).toBe(siegeSect(closed,attackSect).headquartersId);
    expect(siegeSect(closed).headquartersId).toBe(location);
    const persisted=siegeTurn(strict(closed));
    expect(visible(persisted)).toContainEqual(expect.objectContaining({siegeId:siege.id,terminal:theatre.terminal}));
  });

  it('uses real bilateral peace before any fight and leaves no false battlefield',()=>{
    const {arrived,siege}=actualGrandSiege(1);
    expect(arrived.tick).toBe(8);
    expect(siege.rounds).toBe(0);
    const working=structuredClone(arrived);
    // Exact native proposal at the genuinely arrived T8 frame, before any battle; no manually synthesized agreement.
    const offer=resolveCeasefireAction(working,siegeActor(working,patriarch),{
      chosenAction:'CEASEFIRE',ceasefireMove:'offer',targetSectId:attackSect,innerMonologue:'先休兵，两宗实议。',
    });
    expect(offer).toMatchObject({tick:working.tick,witnessScope:'participants'});
    const terms=working.ceasefires.agreements[0];
    const peaceful=siegeTurn(working,{[commander]:{
      chosenAction:'CEASEFIRE',ceasefireMove:'accept',targetCeasefireId:terms.id,innerMonologue:'如约签署。'}});
    const ended=peaceful.sieges.find(row=>row.id===siege.id)!;
    expect(ended).toMatchObject({status:'withdrawn',rounds:0,theatre:{rounds:[],terminal:{
      tick:peaceful.tick,status:'withdrawn',battlefield:false,sourceEventId:`evt-${peaceful.tick}-${terms.id}-signed`,
    }}});
    expect(siegeSect(peaceful).arrayHp).toBe(200);
    expect(peaceful.ceasefires.agreements[0]).toMatchObject({status:'active',withdrawnSiegeIds:[siege.id]});
    expect(strict(peaceful).tick).toBe(peaceful.tick);
  });
});
