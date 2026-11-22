import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {activeAvatar,possessAvatar} from '../src/engine/avatarEngine';
import {executeGodIntervention} from '../src/engine/worldEngine';
import {queueGuidedForbiddenArt} from '../src/engine/forbiddenArtEngine';
import {decodeEraWorldSave,decodeWorldSave,encodeEraWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import type {WorldState} from '../src/types/world';
import {actualForbiddenContact,artActor,artDuel,artOwnerId,artTurn,strongRivalId} from './forbiddenArtNativeFixture';

function contact(world:WorldState){
  const row=world.forbiddenDuels?.[0];
  if(!row)throw Error('Native DUEL must have created one active contact');
  return row;
}
function scar(world:WorldState){
  const paid=artActor(world).forbiddenScars?.[0];
  if(!paid)throw Error('Native settled art must have left an actual scar');
  return paid;
}
const reopen=(world:WorldState)=>{
  const raw=encodeWorldSave(world),restored=decodeWorldSave(raw);
  expect(encodeWorldSave(restored)).toBe(raw);
  return restored;
};
function actualPaid(){
  const {offered,contact:row}=actualForbiddenContact();
  const queued=queueGuidedForbiddenArt(offered,row.ownerId,row.id,'severed-shadow-flight');
  expect(queued).not.toBe(offered);
  const settled=artTurn(queued);
  expect(scar(settled)).toMatchObject({contactId:row.id,artId:'severed-shadow-flight',origin:'player',result:'escape'});
  return {offered,queued,settled};
}

describe('strict forbidden art save proofs',()=>{
  it('preserves legacy absence and round-trips genuinely opened, sealed and completed contact frames',()=>{
    const absent=createInitialWorld();
    const raw=encodeWorldSave(absent);
    expect(raw).not.toMatch(/"forbidden(Duels|Art|Scars)"/);
    expect(encodeWorldSave(reopen(absent))).toBe(raw);

    const {offered,queued,settled}=actualPaid();
    expect(contact(reopen(offered))).toEqual(contact(offered));
    expect(contact(reopen(queued)).queued).toEqual(contact(queued).queued);
    expect(encodeEraWorldSave(artTurn(reopen(queued)))).toBe(encodeEraWorldSave(settled));
    expect(scar(reopen(settled))).toEqual(scar(settled));
    expect(encodeEraWorldSave(decodeEraWorldSave(encodeEraWorldSave(settled)))).toBe(encodeEraWorldSave(settled));
  });

  it('rejects fabricated contact, mismatched item/participant/site, duplicated parties and invalid original rolls',()=>{
    const {offered}=actualForbiddenContact();
    const edit=(patch:(world:WorldState)=>void)=>{
      const world=structuredClone(offered);patch(world);return ()=>encodeWorldSave(world);
    };
    expect(edit(world=>{contact(world).artifactId='lookalike-not-the-bound-object';})).toThrow(/forbiddenDuels.contact/);
    expect(edit(world=>{contact(world).ownerId='npc-2';})).toThrow(/forbiddenDuels.contact/);
    expect(edit(world=>{contact(world).siteId='loc-vein-north';})).toThrow(/forbiddenDuels.contact/);
    expect(edit(world=>{contact(world).id+='-duplicate';})).toThrow(/forbiddenDuels.contact/);
    expect(edit(world=>{world.forbiddenDuels!.push({...contact(world)});})).toThrow(/forbiddenDuels.contact/);
    expect(edit(world=>{contact(world).rolls.pop();})).toThrow(/forbiddenDuels.contact/);
    expect(edit(world=>{contact(world).rolls[1]=-0.1;})).toThrow(/forbiddenDuels\[0\].rolls/);
    expect(edit(world=>{Object.assign(contact(world),{extraBloodPrice:0});})).toThrow(/extraBloodPrice/);
  });

  it('cannot smuggle an out-of-frame sealed authorization or an authored effect into the native contact',()=>{
    const {queued}=actualPaid();
    const copy=structuredClone(queued);
    contact(copy).queued!.tick=queued.tick+1;
    expect(()=>encodeWorldSave(copy)).toThrow(/forbiddenDuels.queued/);
    contact(copy).queued!.tick=queued.tick;
    contact(copy).guided=false;
    expect(()=>encodeWorldSave(copy)).toThrow(/forbiddenDuels.queued/);
    contact(copy).guided=true;
    Object.assign(contact(copy).queued!,{chosenOutcome:'reversal'});
    expect(()=>encodeWorldSave(copy)).toThrow(/chosenOutcome/);
  });

  it('retains the first scar when the same original body later truly pays for the same art in a new contact',()=>{
    const {settled}=actualPaid();
    const first=scar(settled);
    let rested=settled;
    for(let i=0;i<3;i++)rested=artTurn(rested);
    expect(artActor(rested).hp).toBe(artActor(rested).maxHp);
    rested=executeGodIntervention(rested,{type:'TRIBULATION_STRIKE',targetCultivatorId:artOwnerId});
    rested=executeGodIntervention(rested,{type:'TRIBULATION_STRIKE',targetCultivatorId:artOwnerId});
    if(activeAvatar(rested)?.id!==artOwnerId)expect(possessAvatar(rested,artOwnerId)).toBe(true);
    const newContact=artTurn(rested,{[strongRivalId]:artDuel(artOwnerId)});
    const now=contact(newContact);
    expect(now.id).not.toBe(first.contactId);
    const answered=queueGuidedForbiddenArt(newContact,now.ownerId,now.id,first.artId);
    expect(answered).not.toBe(newContact);
    const repeated=reopen(artTurn(answered));
    expect(artActor(repeated).forbiddenScars).toEqual([first]);
    expect(repeated.events.filter(row=>row.forbiddenArt?.artId===first.artId).map(row=>row.forbiddenArt?.contactId))
      .toEqual([now.id,first.contactId]);
  });

  it('rejects duplicated scars, wrong exact historical cost, and contradictory typed combat receipts',()=>{
    const {settled}=actualPaid();
    const edit=(patch:(world:WorldState)=>void)=>{
      const world=structuredClone(settled);patch(world);return ()=>encodeWorldSave(world);
    };
    expect(edit(world=>{artActor(world).forbiddenScars!.push({...scar(world)});})).toThrow(/forbiddenScars.owner/);
    expect(edit(world=>{scar(world).paid.lifespan=7;})).toThrow(/forbiddenArt.cost/);
    expect(edit(world=>{scar(world).paid.durability--;})).toThrow(/forbiddenArt.cost/);
    expect(edit(world=>{scar(world).paid.hp=0;})).toThrow(/forbiddenArt.cost/);
    expect(edit(world=>{world.events.find(row=>row.forbiddenArt)!.forbiddenArt!.artifactId='substituted-original-id';}))
      .toThrow(/events.forbiddenArt/);
    expect(edit(world=>{delete world.events.find(row=>row.forbiddenArt)!.forbiddenArt;})).toThrow(/forbiddenScars.event/);
  });
});
