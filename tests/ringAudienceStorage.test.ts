import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { closeRingAudience, exchangeRingAudience, openRingAudience, sealRingAudience } from '../src/engine/ringAudienceEngine';
import { buildConfirmedShareSave, inspectShareSavePrivacy, prepareShareSavePrivacy, SHARE_SAVE_REDACTED_TEXT } from '../src/engine/shareSavePrivacy';
import { decodeEraWorldSave, decodeWorldSave, encodeEraWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import type { WorldState } from '../src/types/world';
import { actualAcceptedAudience, audienceActor, audienceCursor, audienceId, audienceRow, audienceTurn, privateLines } from './ringAudienceNativeFixture';

const reopen=(world:WorldState)=>{
  const raw=encodeWorldSave(world);
  const opened=decodeWorldSave(raw);
  expect(encodeWorldSave(opened)).toBe(raw);
  return opened;
};
function reject(world:WorldState,mutate:(copy:WorldState)=>void,expected:RegExp){
  const copy=structuredClone(world);
  mutate(copy);
  expect(()=>encodeWorldSave(copy)).toThrow(expected);
}
const sealedFixture=()=>{
  const {world,row}=actualAcceptedAudience('heaven');
  const sealed=sealRingAudience(world,audienceCursor(row));
  expect(sealed).not.toBe(world);
  return {world,sealed,executed:audienceTurn(sealed)};
};

describe('strict private native audience proof',()=>{
  it('leaves older bytes unchanged and reopens current same-month roles and actual sealed execution',()=>{
    const initial=encodeWorldSave(createInitialWorld());
    expect(initial).not.toContain('"audience"');
    expect(encodeWorldSave(decodeWorldSave(initial))).toBe(initial);
    const f=actualAcceptedAudience('heaven');
    expect(audienceRow(reopen(f.opened)).turns).toEqual([]);
    const staged=sealRingAudience(reopen(f.world),audienceCursor(f.row));
    expect(audienceRow(reopen(staged))).toMatchObject({role:'heaven',status:'sealed',targetId:audienceId});
    expect(audienceRow(staged).turns.every(item=>item.cost===4)).toBe(true);
    const executed=audienceTurn(staged);
    expect(audienceActor(executed).sectId).toBe('');
    const raw=encodeEraWorldSave(executed);
    expect(encodeEraWorldSave(decodeEraWorldSave(raw))).toBe(raw);
    expect(audienceRow(reopen(executed)).execution).toEqual(audienceRow(executed).execution);
    expect(audienceRow(reopen(audienceTurn(f.world))).status).toBe('expired');
  });

  it('verifies exact historical actor, session serial, turn order, tone, cost and native stance before accepting a seal',()=>{
    const {world,sealed}=sealedFixture();
    reject(world,w=>{audienceRow(w).targetId='unregistered';},/playerAvatar.audience.session/);
    reject(world,w=>{audienceRow(w).id='ring-audience-9';},/playerAvatar.audience.session/);
    reject(world,w=>{audienceRow(w).turns[0].index=3;},/playerAvatar.audience.turn/);
    reject(world,w=>{audienceRow(w).turns[0].tick++;},/playerAvatar.audience.turn/);
    reject(world,w=>{audienceRow(w).turns[0].before++;},/playerAvatar.audience.turn/);
    reject(world,w=>{audienceRow(w).turns[0].cost=3;},/playerAvatar.audience.turn/);
    reject(world,w=>{audienceRow(w).turns[0].tone='pressure';},/playerAvatar.audience.turn/);
    reject(world,w=>{audienceRow(w).turns[0].after++;},/playerAvatar.audience.stance/);
    reject(world,w=>{audienceRow(w).turns[0].reply += '\u0000';},/playerAvatar.audience.turn/);
    reject(sealed,w=>{audienceRow(w).sealedTick=undefined;},/playerAvatar.audience.status/);
    reject(sealed,w=>{audienceRow(w).stance='steady';},/playerAvatar.audience.status/);
    reject(sealed,w=>{audienceRow(w).closedTick=w.tick;},/playerAvatar.audience.status/);
    reject(sealed,w=>{Object.assign(audienceRow(w),{rawPrompt:'不可作为存档字段'});},/rawPrompt/);
  });

  it('separates direct refusal and explicit close from stale expiry, without a false subsequent event',()=>{
    const {opened}=actualAcceptedAudience();
    const first=audienceRow(opened);
    const refused=exchangeRingAudience(opened,{...audienceCursor(first),message:'听令。你必须听我的。'});
    expect(audienceRow(refused)).toMatchObject({status:'declined',closedTick:opened.tick,stance:'rebels'});
    expect(audienceRow(reopen(refused)).execution).toBeUndefined();
    const ended=closeRingAudience(opened,audienceCursor(first));
    expect(audienceRow(reopen(ended))).toMatchObject({status:'closed',closedTick:opened.tick,turns:[]});
    const later=audienceTurn(ended);
    expect(audienceRow(reopen(later))).toEqual(audienceRow(ended));
    expect(openRingAudience(ended,{targetId:audienceId,role:'heaven',aim:'leave_sect'}).playerAvatar.audience!.sessions).toHaveLength(2);
  });

  it('fails closed on forged action dates/effects or public copies of the exact private native execution',()=>{
    const {executed}=sealedFixture();
    const real=audienceRow(executed).execution!;
    reject(executed,w=>{audienceRow(w).execution!.eventId='made-up';},/playerAvatar.audience.execution/);
    reject(executed,w=>{audienceRow(w).execution!.tick++;},/playerAvatar.audience.execution/);
    reject(executed,w=>{audienceRow(w).execution!.effect='learned';},/playerAvatar.audience.execution/);
    reject(executed,w=>{w.events=w.events.filter(event=>event.id!==real.eventId);},/playerAvatar.audience.execution/);
    reject(executed,w=>{w.events.find(event=>event.id===real.eventId)!.witnessScope=undefined;},/playerAvatar.audience.event/);
    reject(executed,w=>{w.events.find(event=>event.id===real.eventId)!.actorIds=['npc-8'];},/playerAvatar.audience.event/);
    reject(executed,w=>{
      const exact=w.events.find(event=>event.id===real.eventId)!;
      const {id,tick,year,month,title,description,category,actorIds,locationId}=exact;
      w.chronicleArchive.anchors.push({id,tick,year,month,title,description,category,actorIds,locationId});
      delete w.playerAvatar.audience;
    },/playerAvatar.audience.publicArchive/);
  });

  it('redacts exactly approved private user/reply prose and incident copies but keeps the sealed stance, costs, and paid proof',()=>{
    const {executed}=sealedFixture(),source=audienceRow(executed),exactBefore=encodeWorldSave(executed);
    const publicPreview=inspectShareSavePrivacy(executed);
    expect(publicPreview.counts.avatarTranscriptFields).toBe(source.turns.length*2);
    expect(executed.cultivators.flatMap(actor=>actor.rumors).some(rumor=>rumor.originEventId===source.execution?.eventId)).toBe(false);
    for(const line of source.turns)expect(JSON.stringify(publicPreview)).not.toContain(line.message);
    const review=prepareShareSavePrivacy(executed);
    expect(review).toMatchObject({status:'ready',protectedStateVerified:true});
    const output=buildConfirmedShareSave(executed,review)!;
    const safe=decodeWorldSave(output.json);
    expect(audienceRow(safe)).toEqual({...source,turns:source.turns.map(row=>({...row,
      message:SHARE_SAVE_REDACTED_TEXT,reply:SHARE_SAVE_REDACTED_TEXT,
    }))});
    for(const original of privateLines)expect(output.json).not.toContain(original);
    for(const turn of source.turns)expect(output.json).not.toContain(turn.reply);
    expect(safe.events.find(row=>row.id===source.execution?.eventId)).toMatchObject({
      actorIds:[audienceId],witnessScope:'participants',title:SHARE_SAVE_REDACTED_TEXT,description:SHARE_SAVE_REDACTED_TEXT,
    });
    expect(output.json).not.toContain('离山立身');
    expect(safe.playerAvatar.essence).toBe(executed.playerAvatar.essence);
    expect(encodeWorldSave(executed)).toBe(exactBefore);
  });
});
