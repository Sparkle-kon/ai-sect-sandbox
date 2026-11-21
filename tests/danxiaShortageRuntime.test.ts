import {describe,expect,it} from 'vitest';
import {advanceDanxiaShortages,openDanxiaShortage,projectDanxiaShortages} from '../src/engine/danxiaShortageEngine';
import {decodeWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import {localQiWeather,weatherHerbRegrowth} from '../src/engine/weatherEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {DANXIA_FIXTURE,danxiaActor,danxiaPayload,danxiaSite,danxiaTurn,preparedDanxiaAppointment} from './fixtures/danxiaNativeFixture';
import type {WorldState} from '../src/types/world';

const fixture = DANXIA_FIXTURE;
const testWorld = () => preparedDanxiaAppointment();
const attend = (targetCareFollowupId:string) => danxiaPayload('CARE_FOLLOWUP',{careFollowupMove:'attend',targetCareFollowupId});
const read = (state:WorldState) => decodeWorldSave(JSON.stringify({format:'ai-sect-sandbox',version:1,world:state}));

describe('actual shortage calendar and independent willing parties',()=>{
  it('records the missing native jade pulse only for the same due clinic with an exhausted reserve, then ends without inventing treatment',()=>{
    const f=testWorld();
    const {patientId,sourceCaseId,appointmentId,villageId}=f;
    const adequate=structuredClone(f.world);
    // The compared games are the same snapshot and choices; each merely starts
    // this month with a different real clinic reserve. Nothing credits a crisis.
    danxiaSite(adequate).herbs.jade_leaf=1;
    expect(danxiaSite(f.world).herbs.jade_leaf).toBe(0);
    expect(f.world.tick).toBe(fixture.frostTick-1);
    const choice={[patientId]:attend(appointmentId)};
    const dry=danxiaTurn(f.world,choice);
    const supplied=danxiaTurn(adequate,choice);
    const answered=Object.fromEntries(f.world.cultivators.map(actor=>[actor.id,choice[actor.id]??danxiaPayload('REST')]));
    const deferred=advanceWorldTick(f.world,answered,()=>.99,'deferred',undefined,{modelActors:new Set([patientId])});
    expect(deferred.danxiaShortages).toEqual(dry.danxiaShortages);

    expect(localQiWeather(dry,danxiaSite(dry))).toMatchObject({kind:'霜息',intensity:.59});
    expect(weatherHerbRegrowth(dry,danxiaSite(dry),'jade_leaf',3)).toBe(0);
    expect(dry.danxiaShortages.cases).toHaveLength(1);
    expect(supplied.danxiaShortages.cases).toEqual([]);
    const incident=dry.danxiaShortages.cases[0];
    expect(incident).toMatchObject({siteId:fixture.siteId,openedTick:fixture.frostTick,discipleId:fixture.discipleId,patientId,
      settlementId:villageId,volunteerId:fixture.volunteerId,sourceCaseId,appointmentId,demandIds:[appointmentId],
      availableLeaves:0,requiredLeaves:1,regrowth:{tick:fixture.frostTick,kind:'霜息',intensity:.59,before:0,grown:0},status:'open'});
    expect(dry.infirmaries.cases.find(row=>row.id===sourceCaseId)?.receipt).toMatchObject({tick:fixture.frostTick-3,herbsSpent:2});
    expect(dry.careFollowups.appointments.find(row=>row.id===appointmentId)?.receipt).toBeUndefined();
    expect(supplied.careFollowups.appointments.find(row=>row.id===appointmentId)?.receipt).toMatchObject({tick:fixture.frostTick,
      guardId:fixture.followupStaffId,herbsSpent:1});
    expect(danxiaSite(supplied).herbs.jade_leaf).toBe(0);
    expect(dry.events.find(row=>row.id===`evt-${incident.id}-opened`)).toMatchObject({witnessScope:'participants',actorIds:[fixture.discipleId,patientId]});
    expect(projectDanxiaShortages(dry,danxiaActor(dry,patientId))).toHaveLength(1);
    const outsider=danxiaActor(dry,fixture.staffId);
    outsider.name=danxiaActor(dry,patientId).name;
    expect(projectDanxiaShortages(dry,outsider)).toEqual([]);
    expect(projectDanxiaShortages(dry,{...danxiaActor(dry,patientId)})).toEqual([]);
    expect(openDanxiaShortage(dry,incident.regrowth)).toEqual([]);
    expect(advanceDanxiaShortages(dry)).toEqual([]);
    expect(decodeWorldSave(encodeWorldSave(dry)).danxiaShortages).toEqual(dry.danxiaShortages);
    const ended=danxiaTurn(dry,choice);
    const final=ended.danxiaShortages.cases[0];
    expect(final.resolution).toEqual({tick:fixture.frostTick+1,reason:'commitment_ended',requiredLeaves:0,availableLeaves:0});
    expect(ended.careFollowups.appointments.find(row=>row.id===appointmentId)).toMatchObject({status:'closed',closure:'supplies_unavailable'});
    expect(ended.events.filter(row=>row.id===`evt-${incident.id}-closed`)).toHaveLength(1);
    expect(advanceDanxiaShortages(ended)).toEqual([]);
    expect(read(ended).danxiaShortages).toEqual(ended.danxiaShortages);
  });

  it('records a genuinely adequate counted reserve without debiting it or treating anyone',()=>{
    const f=testWorld();
    const dry=danxiaTurn(f.world,{[f.patientId]:attend(f.appointmentId)});
    const incident=dry.danxiaShortages.cases[0],person=danxiaActor(dry,f.patientId);
    const health={hp:person.hp,toxicity:person.pillToxicity};
    // Controlled late inventory input, not a simulated drug delivery or medical effect.
    danxiaSite(dry).herbs.jade_leaf=1;
    const events=advanceDanxiaShortages(dry);
    expect(events).toHaveLength(1);
    expect(incident.resolution).toEqual({tick:fixture.frostTick,reason:'adequate_stock',requiredLeaves:1,availableLeaves:1});
    expect(danxiaSite(dry).herbs.jade_leaf).toBe(1);
    expect({hp:person.hp,toxicity:person.pillToxicity}).toEqual(health);
    expect(dry.careFollowups.appointments.find(row=>row.id===f.appointmentId)?.receipt).toBeUndefined();
    expect(advanceDanxiaShortages(dry)).toEqual([]);
  });

  it('rejects forged chronology, aliases unrelated to authentic recruitment, or private receipts placed in the public archive',()=>{
    const f=testWorld();
    const old=structuredClone(f.world); Reflect.deleteProperty(old,'danxiaShortages');
    expect(read(old).danxiaShortages).toEqual({cases:[]});
    const opened=danxiaTurn(f.world,{[f.patientId]:attend(f.appointmentId)});
    for (const spoof of ['forecast','reserve','membership','demand','visibility','archive','duplicate'] as const) {
      const corrupt=structuredClone(opened);
      const incident=corrupt.danxiaShortages.cases[0];
      const original=corrupt.events.find(row=>row.id===`evt-${incident.id}-opened`)!;
      if (spoof==='forecast') Object.assign(incident.regrowth,{tick:incident.openedTick+1});
      if (spoof==='reserve') Object.assign(incident.regrowth,{before:incident.availableLeaves+1});
      if (spoof==='membership') Object.assign(incident,{volunteerId:'synthetic-homonym'});
      if (spoof==='demand') incident.demandIds.push(incident.appointmentId);
      if (spoof==='visibility') Reflect.deleteProperty(original,'witnessScope');
      if (spoof==='archive') {
        const anchor={...original};Reflect.deleteProperty(anchor,'witnessScope');corrupt.chronicleArchive.anchors.push(anchor);
      }
      if (spoof==='duplicate') corrupt.danxiaShortages.cases.push(structuredClone(incident));
      expect(()=>read(corrupt)).toThrow(expect.objectContaining({code:'invalid_world'}));
    }
  });
});
