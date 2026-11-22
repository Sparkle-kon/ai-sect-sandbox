import {describe,expect,it} from 'vitest';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {personaLine} from '../src/engine/wildPersonaEngine';
import {actualCommonBond,actualDefenderWinsLethally,bondActor,bondSite,bondTurn,firstId,nearId,secondId} from './dramaticBondNativeFixture';

describe('attributed native dialogue across actual outcomes',()=>{
  it('gives the true fallen initiator a single farewell before the verbatim native conclusion when the defender wins',()=>{
    const {clash}=actualCommonBond();
    const {world,death}=actualDefenderWinsLethally(clash);
    const fallen=bondActor(world),victor=bondActor(world,secondId),sameName=bondActor(world,nearId);
    expect(fallen).toMatchObject({alive:false,hp:0});
    expect(victor.alive).toBe(true);
    expect(victor.name).toBe(sameName.name);
    expect(death).toMatchObject({duelWinnerId:victor.id,actorIds:[fallen.id,victor.id],locationId:bondSite});
    const dialogue=death.dialogue!;
    expect(dialogue).toMatchObject({kind:'combat',source:'utility'});
    expect(dialogue.turns.map(({speakerId})=>speakerId)).toEqual([fallen.id,victor.id,fallen.id,fallen.id]);
    const farewell=dialogue.turns[2];
    expect(farewell).toMatchObject({speakerId:fallen.id,speakerName:fallen.name});
    expect(farewell.text).toBe(personaLine(fallen,'farewell'));
    expect(farewell.text).not.toContain(fallen.secretGoal);
    expect(farewell.text).not.toContain(bondActor(clash).innerMonologue);
    expect(dialogue.turns.at(-1)).toEqual({
      speakerId:fallen.id,speakerName:fallen.name,text:`${victor.name}胜出，${fallen.name}当场陨落。`,
    });
    expect(farewell.text).not.toBe(dialogue.turns.at(-1)?.text);
    const reopened=decodeEraWorldSave(encodeEraWorldSave(world));
    expect(reopened.events.find(row=>row.id===death.id)?.dialogue).toEqual(dialogue);
  });

  it('preserves three attributed slots and the original verdict for genuinely nonlethal combat',()=>{
    const {clash}=actualCommonBond();
    const wounded=bondActor(clash),victor=bondActor(clash,secondId);
    expect(wounded.alive).toBe(true);
    expect(victor.alive).toBe(true);
    const duel=clash.events.find(row=>row.id===`evt-${clash.tick}-${wounded.id}-duel`)!;
    expect(duel).toMatchObject({category:'combat',duelWinnerId:victor.id});
    expect(duel.dialogue?.turns.map(row=>row.speakerId)).toEqual([wounded.id,victor.id,wounded.id]);
    expect(duel.dialogue?.turns[2].text).toBe(`${victor.name}占得上风，${wounded.name}负伤离去。`);
  });

  it('keeps a real local diplomatic meeting and its treasury effect independent of the farewell lane',()=>{
    const {socially}=actualCommonBond(),opening='只转达两宗确曾商量的事。';
    const counterpart=bondActor(socially,nearId),actor=bondActor(socially,firstId);
    const meet=bondTurn(socially,{chosenAction:'SECT_DIPLOMACY',targetCultivatorId:counterpart.id,spokenLine:opening,
      innerMonologue:'这句内心盘算绝不作公开发言。'});
    const control=bondTurn(socially);
    const event=meet.events.find(row=>row.id===`evt-${meet.tick}-${actor.id}-sect_diplomacy`)!;
    expect(event.dialogue?.turns.map(row=>row.speakerId)).toEqual([actor.id,counterpart.id,actor.id]);
    expect(event.dialogue?.turns[0].text).toBe(opening);
    expect(event.dialogue?.turns[2].text).toBe(event.description);
    for(const sectId of [actor.sectId,counterpart.sectId]){
      const actual=meet.sects.find(row=>row.id===sectId)!;
      const prior=control.sects.find(row=>row.id===sectId)!;
      expect(prior.spiritStones-actual.spiritStones).toBe(30);
    }
  });
});
