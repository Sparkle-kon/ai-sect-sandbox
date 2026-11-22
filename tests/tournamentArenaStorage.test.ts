import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {possessAvatar} from '../src/engine/avatarEngine';
import {decodeEraWorldSave,decodeWorldSave,encodeEraWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import {knownMapLocations} from '../src/engine/terrainEngine';
import {placeTournamentWager} from '../src/engine/tournamentWagerEngine';
import {applyCultivatorBrainDecision} from '../src/engine/worldEngine';
import type {WorldState} from '../src/types/world';
import {actualTournament,actualTournamentSignup,tournamentActor,tournamentFrame,tournamentId} from './tournamentArenaNativeFixture';

const spectatorId='elder-danxia-1';
const arena=(world:WorldState)=>actualTournament(world).arena!;
const ticket=(world:WorldState)=>world.tournamentWagers!.tickets[0];
const reopen=(world:WorldState)=>{
  const raw=encodeEraWorldSave(world),reopened=decodeEraWorldSave(raw);
  expect(encodeEraWorldSave(reopened)).toBe(raw);
  return reopened;
};
function reject(world:WorldState,edit:(copy:WorldState)=>void,path:RegExp){
  const copy=structuredClone(world);edit(copy);
  expect(()=>encodeWorldSave(copy)).toThrow(path);
}
function finish(start:WorldState){
  let world=start;
  for(let i=0;i<5&&actualTournament(world).status==='running';i++)world=tournamentFrame(world);
  return world;
}
let cached:WorldState|undefined;
function nativeStart(){
  if(cached)return structuredClone(cached);
  const enrolled=actualTournamentSignup(),actor=tournamentActor(enrolled,spectatorId);
  const venue=actualTournament(enrolled).locationId;
  const known=knownMapLocations(enrolled,actor);
  const unknown=enrolled.locations.filter(site=>site.id!==actor.locationId&&!known.includes(site)&&site.expeditionOmenId===undefined);
  const targetKnown=known.some(site=>site.id===venue);
  const eligibleIndex=unknown.findIndex(site=>site.id===venue);
  let draws=0;
  expect(targetKnown||eligibleIndex>=0).toBe(true);
  applyCultivatorBrainDecision(enrolled,actor,{
    chosenAction:'EXPLORE',innerMonologue:'到实地看大比。',...(targetKnown?{targetLocationId:venue}:{}),
  },()=>!targetKnown&&draws++===0?(eligibleIndex+.2)/unknown.length:.99);
  expect(actor.locationId).toBe(venue);
  const opened=tournamentFrame(tournamentFrame(enrolled));
  expect(arena(opened)).toMatchObject({openedTick:opened.tick,rounds:[]});
  expect(possessAvatar(opened,spectatorId)).toBe(true);
  cached=opened;
  return structuredClone(opened);
}

describe('strict native tournament archive and fictional wager receipt',()=>{
  it('preserves old absent bytes and exact new distinct bracket/legacy mirror/actual championship',()=>{
    const old=encodeWorldSave(createInitialWorld(1,'spirit-bloom'));
    expect(old).not.toContain('"tournamentWagers"');
    expect(old).not.toContain('"arena"');
    expect(encodeWorldSave(decodeWorldSave(old))).toBe(old);
    const start=nativeStart(), first=tournamentFrame(reopen(start)), closed=finish(reopen(first));
    expect(arena(reopen(closed))).toEqual(arena(closed));
    expect(arena(closed).prize).toMatchObject({actorId:actualTournament(closed).championId,tick:closed.tick});
    const prior=structuredClone(first);
    delete actualTournament(prior).arena;
    expect(actualTournament(reopen(prior)).arena).toBeUndefined();
    expect(actualTournament(reopen(prior)).bouts).toEqual(actualTournament(first).bouts);
    expect(encodeEraWorldSave(tournamentFrame(reopen(first)))).toBe(encodeEraWorldSave(tournamentFrame(first)));
  });

  it('rejects duplicate or unregistered seeds, reordered pairings and terminal claims with conflicting retained authority',()=>{
    const start=nativeStart(),first=tournamentFrame(start),closed=finish(first);
    reject(start,w=>{arena(w).seededIds[1]=arena(w).seededIds[0];},/occasions.arena.opening/);
    reject(start,w=>{arena(w).seededIds[0]=spectatorId;},/occasions.arena.opening/);
    reject(first,w=>{arena(w).rounds[0].bouts.reverse();},/occasions.arena.pair/);
    reject(first,w=>{arena(w).rounds[0].bouts[0].secondDamage=undefined;},/occasions.arena.pair/);
    reject(first,w=>{arena(w).rounds[0].bouts[0].firstDamage=200_000_000;},/occasions.arena.pair/);
    reject(first,w=>{actualTournament(w).bouts[0].winnerId=spectatorId;},/occasions.arena.pair/);
    reject(first,w=>{arena(w).rounds[0].absentIds=[spectatorId];},/occasions.arena.round/);
    reject(first,w=>{w.events.find(event=>event.id===arena(w).rounds[0].eventId)!.witnessScope='participants';},/occasions.arena.source/);
    reject(closed,w=>{arena(w).terminal!.eventId='different-contest';},/occasions.arena.terminal/);
    reject(closed,w=>{
      const id=arena(w).terminal!.eventId;
      const anchor=w.chronicleArchive.anchors.find(row=>row.id===id)!;
      expect(anchor).toBeDefined();
      w.events=w.events.filter(row=>row.id!==id);
      anchor.actorIds=[spectatorId];
    },/occasions.arena.source/);
    reject(closed,w=>{arena(w).prize!.actorId=spectatorId;},/occasions.arena.prize/);
    reject(closed,w=>{arena(w).prize=undefined;},/occasions.arena.prize/);
  });

  it('binds original opened virtual stake and terminal payout to the exact native contested match',()=>{
    const opened=nativeStart(),control=finish(opened),champion=actualTournament(control).championId!;
    const wagered=placeTournamentWager(opened,{arenaId:tournamentId,spectatorId,contenderId:champion,stake:10});
    expect(wagered).not.toBe(opened);
    expect(tournamentActor(wagered,spectatorId).spiritStones).toBe(tournamentActor(opened,spectatorId).spiritStones-10);
    expect(ticket(reopen(wagered))).toMatchObject({stake:10,placedTick:opened.tick,status:'open'});
    reject(wagered,w=>{w.tournamentWagers!.tickets.push({...ticket(w)});},/tournamentWagers.tickets.source/);
    reject(wagered,w=>{ticket(w).spectatorId=arena(w).seededIds[0];},/tournamentWagers.tickets.source/);
    reject(wagered,w=>{ticket(w).placedTick++;},/tournamentWagers.tickets.source/);
    reject(wagered,w=>{ticket(w).contenderId=spectatorId;},/tournamentWagers.tickets.source/);
    const awarded=finish(reopen(wagered));
    expect(actualTournament(awarded).championId).toBe(champion);
    expect(ticket(reopen(awarded))).toMatchObject({status:'won',settlement:{
      winnerId:champion,eventId:arena(awarded).terminal!.eventId,payout:20,award:10,
    }});
    expect(tournamentActor(awarded,spectatorId).spiritStones-tournamentActor(control,spectatorId).spiritStones).toBe(10);
    reject(awarded,w=>{ticket(w).settlement!.award=20;},/tournamentWagers.tickets.amount/);
    reject(awarded,w=>{ticket(w).settlement!.eventId='mismatched-public-origin';},/tournamentWagers.tickets.settlement/);
    reject(awarded,w=>{ticket(w).settlement!.winnerId=spectatorId;},/tournamentWagers.tickets.settlement/);
    reject(awarded,w=>{ticket(w).status='forfeited';ticket(w).settlement!.award=0;ticket(w).settlement!.payout=0;},/tournamentWagers.tickets.settlement/);
  });
});
