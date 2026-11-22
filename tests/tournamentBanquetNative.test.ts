import {describe, expect, it} from 'vitest';
import {possessAvatar} from '../src/engine/avatarEngine';
import {isPrivateTournamentBanquetEvent, projectTournamentBanquet} from '../src/engine/tournamentBanquet';
import {actualTournament,actualTournamentSignup,tournamentActor,tournamentFrame} from './tournamentArenaNativeFixture';

function wonNativeFinal() {
  let world = actualTournamentSignup();
  while (world.tick < 66) world = tournamentFrame(world);
  const occasion = actualTournament(world);
  const final = occasion.arena!.rounds.at(-1)!.bouts[0];
  const finalistIds = [final.firstId, final.secondId!] as const;
  expect(occasion.arena!.terminal).toMatchObject({status:'completed',tick:66});
  expect(occasion.arena!.prize?.actorId).toBe(final.winnerId);
  return {world,occasion,finalistIds};
}

describe('the actual contested Grand Arena banquet and scoped original receipts', () => {
  it('separates one public hall and one original thought for each independently present native finalist', () => {
    const {world,occasion,finalistIds} = wonNativeFinal();
    const proof = projectTournamentBanquet(world);
    expect(proof).toEqual({hall:{id:`evt-banquet-${occasion.id}-hall-66`,tick:66,siteName:expect.any(String),speech:expect.any(String)}});
    const privateRows = world.events.filter(isPrivateTournamentBanquetEvent);
    expect(privateRows.map(row=>row.actorIds)).toEqual(finalistIds.map(id=>[id]));
    expect(projectTournamentBanquet(world,tournamentActor(world,finalistIds[0]))).toEqual(proof);
    const left = structuredClone(world), right = structuredClone(world);
    expect(possessAvatar(left, finalistIds[0])).toBe(true);
    expect(possessAvatar(right, finalistIds[1])).toBe(true);
    const l = projectTournamentBanquet(left,tournamentActor(left,finalistIds[0]));
    const r = projectTournamentBanquet(right,tournamentActor(right,finalistIds[1]));
    expect(l?.thought?.text).toEqual(privateRows[0].description);
    expect(r?.thought?.text).toEqual(privateRows[1].description);
    expect(l?.thought?.text).not.toEqual(r?.thought?.text);
    expect(projectTournamentBanquet(left,tournamentActor(right,finalistIds[0]))).toEqual(proof);
    expect(world.chronicleArchive.anchors.some(row=>row.id===privateRows[0].id)).toBe(false);
    expect(world.witnessedPersonalStory.scenes.some(row=>row.eventId===privateRows[0].id)).toBe(false);
    const duplicate = {...world,events:[...world.events,...world.events.filter(row=>row.id===proof?.hall.id)]};
    expect(projectTournamentBanquet(duplicate)).toBeUndefined();
  });

  it('has no invented after-talk until these two bodies are again physically in public market and perform a later native SOCIALIZE', () => {
    const {world,occasion,finalistIds:[first,second]} = wonNativeFinal();
    const away = tournamentFrame(world,{
      [first]:{chosenAction:'SOCIALIZE',targetCultivatorId:second,innerMonologue:'不要把未曾碰面当作同席。'},
    });
    expect(away.events.some(row=>row.id.startsWith(`evt-banquet-${occasion.id}-after-`))).toBe(false);
    let later = tournamentFrame(world,Object.fromEntries([first,second].map(id=>[
      id,{chosenAction:'EXPLORE' as const,targetLocationId:occasion.locationId,innerMonologue:'循实路到坊市。'},
    ])));
    expect(tournamentActor(later,first).locationId).toBe(occasion.locationId);
    expect(tournamentActor(later,second).locationId).toBe(occasion.locationId);
    expect(possessAvatar(later,first)).toBe(true);
    later = tournamentFrame(later,{[first]:{chosenAction:'SOCIALIZE',targetCultivatorId:second,innerMonologue:'不得抄进宴后纸页。'}});
    expect(later.events).toContainEqual(expect.objectContaining({id:`evt-banquet-${occasion.id}-after-${later.tick}`,
      actorIds:[first,second],witnessScope:'participants'}));
    expect(projectTournamentBanquet(later)?.after).toBeUndefined();
    const personal = projectTournamentBanquet(later,tournamentActor(later,first));
    expect(personal?.after).toMatchObject({tick:later.tick,otherName:tournamentActor(later,second).name});
    expect(JSON.stringify(personal)).not.toContain('不得抄进宴后纸页');
  });

  it('does not emit a feast for a bracket whose original native prize ID is already occupied', () => {
    let world = actualTournamentSignup();
    while (world.tick < 65) world = tournamentFrame(world);
    // Negative-only collision: native prize settlement cannot truthfully mint a second original.
    const artifact = world.cultivators.flatMap(row => row.artifacts)[0]!;
    world.cultivators[0].artifacts.push({ ...artifact, id: `tournament-champion-${actualTournament(world).id}` });
    world = tournamentFrame(world);
    expect(actualTournament(world).arena?.prize).toBeUndefined();
    expect(world.events.some(row => row.id.startsWith('evt-banquet-'))).toBe(false);
    expect(projectTournamentBanquet(world)).toBeUndefined();
  });
});
