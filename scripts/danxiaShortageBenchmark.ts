import {projectDanxiaShortages} from '../src/engine/danxiaShortageEngine';
import {campaignSHA256} from '../src/engine/campaignMemento';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {localQiWeather,weatherHerbRegrowth} from '../src/engine/weatherEngine';
import {DANXIA_FIXTURE,danxiaActor,danxiaPayload,danxiaSite,danxiaTurn,preparedDanxiaAppointment} from '../tests/fixtures/danxiaNativeFixture';
declare const __SECT_UTILITY_RULE_VERSION__:string;

const {world,patientId,sourceCaseId,appointmentId}=preparedDanxiaAppointment();
const stocked=structuredClone(world);
danxiaSite(stocked).herbs.jade_leaf=1; // explicitly controlled counterfactual reserve, never a claimed delivery
const choice={[patientId]:danxiaPayload('CARE_FOLLOWUP',{careFollowupMove:'attend',targetCareFollowupId:appointmentId})};
const dry=danxiaTurn(world,choice),adequate=danxiaTurn(stocked,choice),later=danxiaTurn(dry,choice);
const shortage=dry.danxiaShortages.cases[0];
const reading=localQiWeather(dry,danxiaSite(dry));
const stockReading=weatherHerbRegrowth(dry,danxiaSite(dry),'jade_leaf',3);
const recorded=projectDanxiaShortages(dry,danxiaActor(dry,patientId))[0];
if(!shortage||!recorded||stockReading!==0||reading.kind!=='霜息'||adequate.danxiaShortages.cases.length)
  throw Error('缺货或库存充足的世界没有通过实际对照。');
for(const [label,state] of [['shortage',dry],['adequate',adequate],['shortage_closed',later]] as const){
  const data=encodeEraWorldSave(state);
  if(data!==encodeEraWorldSave(decodeEraWorldSave(data)))throw Error('原生读回字节有变化。');
  console.log(JSON.stringify({label,rule:__SECT_UTILITY_RULE_VERSION__,seed:DANXIA_FIXTURE.seed,profile:'classic',
    year:state.year,month:state.month,tick:state.tick,priorTreat:state.infirmaries.cases.find(row=>row.id===sourceCaseId)?.receipt,
    followup:state.careFollowups.appointments.find(row=>row.id===appointmentId),
    receipt:projectDanxiaShortages(state,danxiaActor(state,patientId))[0]??null,worldSHA256:await campaignSHA256(new TextEncoder().encode(data)),
    earlierGlobalWeather:label==='shortage'?reading:undefined,
    actualRegrew:label==='shortage'?stockReading:undefined,byteExactRestore:true}));
}
