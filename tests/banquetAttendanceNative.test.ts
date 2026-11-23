import {writeChronicleScene} from '../src/engine/chronicleScene';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { possessAvatar } from '../src/engine/avatarEngine';
import { projectTournamentBanquet } from '../src/engine/tournamentBanquet';
import { availableBanquetSeatActions, projectBanquetSeats } from '../src/engine/banquetSeats';
import { requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { llmScheduler } from '../src/engine/llmScheduler';
import { advanceWorldTick } from '../src/engine/worldEngine';
import { publicChronicleSceneEvents } from '../src/engine/chronicleLead';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';
import { actualTournament, actualTournamentSignup, tournamentActor, tournamentFrame, tournamentId } from './tournamentArenaNativeFixture';

afterEach(() => { vi.unstubAllGlobals(); llmScheduler.resetTickBudget(); });

const winner = 'npc-3';
const runnerUp = 'npc-1';
const otherEntrant = 'npc-2';
const market = 'loc-market';
const crownEvent = 'evt-66-occasion-60-tournament-champion';
const invitation = 'evt-banquet-occasion-60-tournament-hall-66';
const oldAfterPrefix = 'evt-banquet-occasion-60-tournament-after-';
const decision = (chosenAction: LLMDecisionPayload['chosenAction'],
  fields: Partial<LLMDecisionPayload> = {}): LLMDecisionPayload =>
  ({ chosenAction, innerMonologue: '用实际邀辞、座位与亲见对话。', ...fields });
const at = (world: WorldState, id: string) => tournamentActor(world, id).locationId;
const explore = decision('EXPLORE', { targetLocationId: market });
const talkToWinner = decision('SOCIALIZE', { targetCultivatorId: winner });
const reopen = (world: WorldState) => {
  const literal = encodeEraWorldSave(world);
  const loaded = decodeEraWorldSave(literal);
  expect(encodeEraWorldSave(loaded)).toBe(literal);
  return loaded;
};

function invitedAtFinal() {
  let world = actualTournamentSignup();
  while (world.tick < 66) world = tournamentFrame(world);
  world = reopen(world);
  const occasion = actualTournament(world);
  expect(occasion).toMatchObject({ id: tournamentId, status: 'completed', championId: winner, locationId: market });
  expect(occasion.arena?.rounds.at(-1)?.bouts).toEqual([{
    firstId: winner, secondId: runnerUp, winnerId: winner, firstDamage: 133, secondDamage: 252,
  }]);
  expect(occasion.arena).toMatchObject({
    terminal: { status: 'completed', tick: 66, eventId: crownEvent },
    prize: { actorId: winner, tick: 66, artifactId: 'tournament-champion-occasion-60-tournament' },
  });
  expect(world.events.find(row => row.id === crownEvent)).toMatchObject({ actorIds: [winner], tick: 66, locationId: market });
  const invite = world.events.find(row => row.id === invitation);
  expect(invite).toMatchObject({ actorIds: [winner, runnerUp], tick: 66, locationId: market });
  expect(invite?.witnessScope).toBeUndefined();
  expect(publicChronicleSceneEvents(world).map(row => row.id)).toContain(invitation);
  expect([at(world, winner), at(world, runnerUp)]).toEqual(['loc-blood', 'loc-taixu']);
  return world;
}

const tableId = `banquet-seat-${tournamentId}`;
const table = (world: WorldState) => world.banquetSeats?.tables.find(row => row.id === tableId);
const available = (world: WorldState, actorId: string) => availableBanquetSeatActions(tournamentActor(world, actorId), world);
type Move = ReturnType<typeof available>[number]['banquetSeatMove'];
const rsvp = (world: WorldState, actorId: string, move: Move) => {
  const option = available(world, actorId).find(row => row.banquetSeatMove === move)!;
  expect(option).toBeDefined();
  expect(option.targetBanquetSeatId).toBe(tableId);
  return decision('BANQUET_SEAT', { banquetSeatMove: move, targetBanquetSeatId: option.targetBanquetSeatId });
};
const publicSeat = (world: WorldState, expected: string[]) => {
  const eventId = `evt-${tableId}-summary-67`;
  const summary = table(world)?.summary;
  expect(summary).toMatchObject({ tick: 67, eventId });
  expect([...summary!.presentIds].sort()).toEqual([...expected].sort());
  expect(world.events.find(row => row.id === eventId)).toMatchObject({ tick: 67, actorIds: [], locationId: market });
  expect(world.events.find(row => row.id === eventId)?.witnessScope).toBeUndefined();
  expect(publicChronicleSceneEvents(world).map(row => row.id)).toContain(eventId);
};
const privateRsvp = (world: WorldState, actorId: string, move: Move, tick = world.tick) => {
  const id = `evt-${tableId}-${actorId}-${move}-${tick}`;
  expect(world.events.find(row => row.id === id)).toMatchObject({ witnessScope: 'participants', actorIds: [actorId], tick });
  expect(publicChronicleSceneEvents(world).map(row => row.id)).not.toContain(id);
};

describe('the real Grand Arena feast after the native final (P22-8)', () => {
  it('keeps the public absence scene quiet without inventing refusal or a closed market',()=>{
    const text=writeChronicleScene({category:'diplomacy',title:'论剑夜宴·席时已过',
      description:'约定时候已过；这两席，都不曾有人按约入座。'});
    expect(text.title).toBe('夜宴的两张空椅');
    expect(text.paragraph).not.toMatch(/辞席|坊市无一人|认输/u);
  });

  it('does not confuse the exact public invitation or previous arena co-presence for either native finalist actually seated', () => {
    const invited = invitedAtFinal();
    expect(table(invited)).toMatchObject({ id: tableId, invitedTick: 66, seatTick: 67, choices: [] });
    expect(table(invited)?.summary).toBeUndefined();
    const possessing = reopen(invited);
    expect(possessAvatar(possessing, runnerUp)).toBe(true);
    expect(projectTournamentBanquet(possessing, tournamentActor(possessing, runnerUp))?.thought)
      .toMatchObject({ phase: 'invited', text: expect.stringContaining('尚未开口') });
    expect(actualTournament(invited).participantIds).toContain(otherEntrant);
    expect(invited.events.find(row => row.id === invitation)?.actorIds).not.toContain(otherEntrant);
    expect(available(invited, otherEntrant)).toEqual([]);
    const stolen = rsvp(invited, runnerUp, 'attend');
    const somebodyWalked = reopen(tournamentFrame(invited, { [runnerUp]: explore, [otherEntrant]: stolen }));
    expect(table(somebodyWalked)?.choices).toEqual([]);
    publicSeat(somebodyWalked, []);
    expect(somebodyWalked.tick).toBe(67);
    expect([at(somebodyWalked, winner), at(somebodyWalked, runnerUp)]).toEqual(['loc-blood', market]);
    const tryingRemote = reopen(tournamentFrame(somebodyWalked, { [runnerUp]: talkToWinner }));
    expect(tryingRemote.events.some(row => row.id === 'evt-68-npc-1-social')).toBe(false);
    expect(tryingRemote.events.some(row => row.id.startsWith(oldAfterPrefix))).toBe(false);
  });

  it('distinguishes a silent empty table, an explicit private refusal and one true timely seat from the same native invite', () => {
    const invited = invitedAtFinal();
    const noAnswer = reopen(tournamentFrame(invited));
    const refusal = reopen(tournamentFrame(invited, { [winner]: rsvp(invited, winner, 'decline') }));
    const one = reopen(tournamentFrame(invited, { [runnerUp]: rsvp(invited, runnerUp, 'attend') }));
    publicSeat(noAnswer, []);
    publicSeat(refusal, []);
    publicSeat(one, [runnerUp]);
    expect(table(noAnswer)?.choices).toEqual([]);
    expect(table(refusal)?.choices).toHaveLength(1);
    expect(table(refusal)?.choices[0]).toMatchObject({ actorId: winner, move: 'decline', tick: 67 });
    expect(at(refusal, winner)).toBe('loc-blood');
    privateRsvp(refusal, winner, 'decline');
    expect(table(one)?.choices).toHaveLength(1);
    expect(table(one)?.choices[0]).toMatchObject({ actorId: runnerUp, move: 'attend', tick: 67, fromSiteId: 'loc-taixu' });
    expect(at(one, runnerUp)).toBe(market);
    expect(at(one, winner)).toBe('loc-blood');
    privateRsvp(one, runnerUp, 'attend');
    const count = (world: WorldState) => projectBanquetSeats(world, tournamentActor(world, runnerUp))?.presentCount;
    expect(count(noAnswer)).toBe(0);
    expect(count(refusal)).toBe(0);
    expect(count(one)).toBe(1);
    expect(projectBanquetSeats(noAnswer, tournamentActor(noAnswer, runnerUp))?.tableLine)
      .not.toBe(projectBanquetSeats(one, tournamentActor(one, runnerUp))?.tableLine);
  });

  it('counts two actual timely bodies and does not recompute the original atmosphere from where they go later', () => {
    const invited = invitedAtFinal();
    const two = reopen(tournamentFrame(invited, {
      [runnerUp]: rsvp(invited, runnerUp, 'attend'), [winner]: rsvp(invited, winner, 'attend'),
    }));
    publicSeat(two, [winner, runnerUp]);
    expect([at(two, winner), at(two, runnerUp)]).toEqual([market, market]);
    expect(table(two)?.choices).toHaveLength(2);
    privateRsvp(two, winner, 'attend');
    privateRsvp(two, runnerUp, 'attend');
    const togetherTalk = reopen(tournamentFrame(two, { [runnerUp]: talkToWinner }));
    expect(togetherTalk.events.find(row => row.id === 'evt-68-npc-1-social')).toMatchObject({
      actorIds: [runnerUp, winner], locationId: market, tick: 68,
    });
    const expectedAfter = togetherTalk.events.find(row => row.id.startsWith(oldAfterPrefix))!;
    expect(expectedAfter).toMatchObject({ title: '论剑夜宴·会后对谈', tick: 68,
      witnessScope: 'participants', actorIds: [runnerUp, winner] });
    const ownEvening = reopen(togetherTalk);
    expect(possessAvatar(ownEvening, runnerUp)).toBe(true);
    expect(projectTournamentBanquet(ownEvening, tournamentActor(ownEvening, runnerUp))?.after)
      .toMatchObject({ phase: 'shared_table', tick: 68 });
    expect(publicChronicleSceneEvents(togetherTalk).map(row => row.id)).not.toContain(expectedAfter.id);
    const parted = reopen(tournamentFrame(togetherTalk, { [winner]: decision('EXPLORE', { targetLocationId: 'loc-blood' }) }));
    expect(at(parted, winner)).toBe('loc-blood');
    expect(table(parted)?.summary).toEqual(table(two)?.summary);
    expect(available(parted, winner).some(row => row.banquetSeatMove === 'late')).toBe(false);
  });

  it('treats a later actual arrival and its separately witnessed conversation as something other than the missed formal seat', () => {
    const invited = invitedAtFinal();
    const one = reopen(tournamentFrame(invited, {
      [runnerUp]: rsvp(invited, runnerUp, 'attend'), [winner]: rsvp(invited, winner, 'decline'),
    }));
    const stillAway = reopen(tournamentFrame(one, { [runnerUp]: talkToWinner }));
    expect(at(stillAway, winner)).toBe('loc-blood');
    expect(stillAway.events.some(row => row.id === 'evt-68-npc-1-social' || row.id.startsWith(oldAfterPrefix))).toBe(false);
    const late = reopen(tournamentFrame(one, { [winner]: rsvp(one, winner, 'late') }));
    expect(late.tick).toBe(68);
    expect([at(late, winner), at(late, runnerUp)]).toEqual([market, market]);
    expect(table(late)?.choices).toContainEqual(expect.objectContaining({
      actorId: winner, move: 'late', tick: 68, fromSiteId: 'loc-blood',
    }));
    privateRsvp(late, winner, 'late');
    expect(table(late)?.summary).toEqual(table(one)?.summary);
    expect(late.events.some(row => row.id.startsWith(oldAfterPrefix))).toBe(false);
    const met = reopen(tournamentFrame(late, { [runnerUp]: talkToWinner }));
    expect(met.events.find(row => row.id === 'evt-69-npc-1-social')).toMatchObject({
      locationId: market, actorIds: [runnerUp, winner], tick: 69,
    });
    const afterward = met.events.find(row => row.id.startsWith(oldAfterPrefix))!;
    expect(afterward).toMatchObject({ title: '论剑之后·另日相逢', tick: 69,
      witnessScope: 'participants', actorIds: [runnerUp, winner] });
    const recollect = reopen(met);
    expect(possessAvatar(recollect, runnerUp)).toBe(true);
    expect(projectTournamentBanquet(recollect, tournamentActor(recollect, runnerUp))?.after)
      .toMatchObject({ phase: 'later_meeting', tick: 69 });
    expect(projectTournamentBanquet(recollect, tournamentActor(recollect, otherEntrant))?.after).toBeUndefined();
    expect(afterward.description).not.toMatch(/既已散席|同席/);
    expect(publicChronicleSceneEvents(met).map(row => row.id)).not.toContain(afterward.id);
    expect(table(met)?.summary).toEqual(table(one)?.summary);

    // A real two-decliner evening can lead to two independent arrivals at different later times.
    // This is four native records, not four seats; the original public table remains emphatically empty.
    const twiceDeclined = reopen(tournamentFrame(invited, {
      [winner]: rsvp(invited, winner, 'decline'), [runnerUp]: rsvp(invited, runnerUp, 'decline'),
    }));
    const winnerLater = reopen(tournamentFrame(twiceDeclined, { [winner]: rsvp(twiceDeclined, winner, 'late') }));
    const bothLater = reopen(tournamentFrame(winnerLater, { [runnerUp]: rsvp(winnerLater, runnerUp, 'late') }));
    expect(table(bothLater)?.choices).toHaveLength(4);
    expect(table(bothLater)?.choices.filter(row => row.move === 'late').map(row => [row.actorId, row.tick]))
      .toEqual([[winner, 68], [runnerUp, 69]]);
    expect([at(bothLater, winner), at(bothLater, runnerUp)]).toEqual([market, market]);
    expect(table(bothLater)?.summary).toEqual(table(twiceDeclined)?.summary);
    publicSeat(bothLater, []);
  });


  it('accepts the same real attendance in the Cognitive and Utility lanes without trusting invented seats or speech', async () => {
    const invited = invitedAtFinal();
    const official = rsvp(invited, runnerUp, 'attend');
    const exact = { chosenAction: 'BANQUET_SEAT', banquetSeatMove: 'attend', targetBanquetSeatId: tableId } as const;
    const withReply = async (reply: object) => {
      llmScheduler.resetTickBudget();
      const fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] })));
      vi.stubGlobal('fetch', fetch);
      const proposal = await requestCultivatorLLMDecision(tournamentActor(invited, runnerUp), invited, {
        enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture-only', model: 'fixture',
      }, invited.tick + 1);
      expect(fetch).toHaveBeenCalledTimes(1);
      return proposal;
    };
    expect(await withReply({ ...exact, targetBanquetSeatId: tournamentId })).toBeUndefined();
    expect(await withReply({ ...exact, targetCultivatorId: winner })).toBeUndefined();
    expect(await withReply({ ...exact, spokenLine: '替别人把缺的话补上。' })).toBeUndefined();
    const admitted = await withReply(exact);
    expect(admitted).toMatchObject(exact);
    const cognitive = reopen(advanceWorldTick(invited, Object.fromEntries(invited.cultivators
      .map(({ id }) => [id, id === runnerUp ? admitted! : decision('REST')])),
    undefined, 'deferred', undefined, { modelActors: new Set([runnerUp]) }));
    const utility = reopen(tournamentFrame(invited, { [runnerUp]: official }));
    expect(table(cognitive)).toEqual(table(utility));
    expect(at(cognitive, runnerUp)).toBe(market);
    expect(at(cognitive, winner)).toBe('loc-blood');
    const atDoor = reopen(tournamentFrame(invited,{[runnerUp]:decision('EXPLORE',{targetLocationId:market})}));
    publicSeat(atDoor, []);
    const autonomous = reopen(advanceWorldTick(atDoor,Object.fromEntries(atDoor.cultivators
      .filter(row=>row.id!==runnerUp).map(({id})=>[id,decision('REST')])),undefined,'utility'));
    expect(table(autonomous)?.choices).toContainEqual(expect.objectContaining({actorId:runnerUp,move:'late',tick:68}));
    publicSeat(autonomous, []);
  });

});
