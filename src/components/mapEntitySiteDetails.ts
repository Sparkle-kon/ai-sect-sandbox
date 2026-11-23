import {projectBattlefieldAftermath} from '../engine/battlefieldAftermath';
import {projectVillageReunion} from '../engine/villageReunion';
import {formatAnomalyRelayMark,visibleAnomalyRelayMarks} from './anomalyRelayMapView';
import {projectLocalAlignedWeather} from '../engine/alignedWeatherEngine';
import {projectLocalCareFollowupCapacity} from '../engine/careFollowupEngine';
import {projectLocalCivicMemorialCount} from '../engine/civicMemorialEngine';
import {isScopedExpeditionGate} from '../engine/expeditionOmenTerms';
import {availableFurnaceSlotSummary} from '../engine/furnaceReservationEngine';
import {projectFurnaceSafety} from '../engine/furnaceSafetyEngine';
import {visibleInfirmaries} from '../engine/infirmaryEngine';
import {projectLocalPavilionDesk} from '../engine/pavilionLoanEngine';
import {projectLocalSeedCulture} from '../engine/seedCultureEngine';
import {projectLocalSectStipendStatus} from '../engine/sectStipendEngine';
import {projectLocalToolLoanStatus} from '../engine/toolLoanEngine';
import {projectLocalVillageFair} from '../engine/villageFairEngine';
import {projectVillageGranary} from '../engine/villageGranaryEngine';
import {localQiWeather} from '../engine/weatherEngine';
import type {Cultivator,LocationNode,WorldState} from '../types/world';
import {visibleLeaseMapSites} from './leaseMapView';
import {isGuardOnDuty} from './mapStatusLabels';
import {OCCASION_KIND} from './occasionLabels';
import {visibleSanctuaryMapMarks} from './sanctuaryView';
import {visibleSharedCommonsMapSites} from './sharedCommonsMapView';
import {visibleBeastsByLocation} from './spiritBeastView';
import type {createTerrainMapView} from './terrainMapView';

export interface MapEntitySiteDetail {label:string;text:string}
type TerrainView=ReturnType<typeof createTerrainMapView>;

export function projectMapEntitySiteDetails(world:WorldState,view:TerrainView,site:LocationNode,
  residents:readonly Cultivator[],viewer?:Cultivator):MapEntitySiteDetail[]{
  if(isScopedExpeditionGate(site))return [];
  const details:MapEntitySiteDetail[]=[];
  const add=(label:string,text:string)=>details.push({label,text});
  const here=viewer&&residents.includes(viewer)?viewer:undefined;
  const matches=<T extends {siteId:string}>(fact:T|undefined)=>fact?.siteId===site.id?fact:undefined;

  const weather=localQiWeather(world,site);
  add('天象',weather.kind==='平息'?'灵气平息':`${weather.kind} · 强度 ${Math.round(weather.intensity*100)}%`);
  const relay=visibleAnomalyRelayMarks(world,view,viewer).get(site.id);
  if(relay)add('兽潮获讯',formatAnomalyRelayMark(relay));
  if(site.inheritanceScrolls.length>0)add('遗卷',`此地存 ${site.inheritanceScrolls.length} 卷`);
  const guards=residents.filter(actor=>isGuardOnDuty(actor,world)).length;
  if(guards>0)add('驻守',`正在值守 ${guards} 人`);
  const beasts=visibleBeastsByLocation(world,view,viewer).get(site.id);
  if(beasts?.length)add('灵兽',`此地可见 ${beasts.length} 只`);
  const occasions=view.visibleOpenOccasions.filter(row=>row.locationId===site.id);
  if(occasions.length>0)add('盛会',occasions.map(row=>`${OCCASION_KIND[row.kind]}${row.status==='registration'?'报名中':'进行中'}`).join('、'));
  const headquarters=world.sects.filter(sect=>sect.headquartersId===site.id);
  if(headquarters.length===1&&world.councils.some(row=>row.sectId===headquarters[0].id&&row.tick===world.tick))
    add('宗门议事','本月已有议事记载。');

  if(site.furnaceGrade>0){
    const safety=here&&matches(projectFurnaceSafety(world,here,site.id));
    const slots=here&&availableFurnaceSlotSummary(world,here,site.id);
    const status=safety?.status==='reopening'?' · 已签复炉，本月仍停用':
      safety?.status==='closed'||slots?.capacity===0?' · 现场停炉':'';
    const capacity=slots&&slots.capacity>0?` · 已用或预留 ${slots.used+slots.reserved}/${slots.capacity} 炉位`:'';
    add('丹炉',`${site.furnaceGrade} 阶${status}${capacity}${slots&&slots.queued>0?` · 候炉 ${slots.queued} 人`:''}`);
  }
  if(viewer){
    const sanctuary=visibleSanctuaryMapMarks(world,view,viewer).get(site.id);
    if(sanctuary!==undefined)add('本人通行权',sanctuary>0?`护阵尚可挡 ${sanctuary} 次决斗`:'护阵已耗尽');
    if(visibleSharedCommonsMapSites(world,view,viewer).has(site.id))add('共管之地','本月有可核对的共管安排。');
    const lease=visibleLeaseMapSites(world,view,viewer).get(site.id);
    if(lease)add('地契',`${lease.role==='owner'?'本宗为出让方':'本宗为承租方'} · 尚余 ${lease.remaining} 份采集额度`);
  }
  if(!here)return details;
  const localAftermath=projectBattlefieldAftermath(world,here);
  if(localAftermath?.siteId===site.id)add('战后拾愿','本人在此处亲历同一场已经结算的战事。');
  const localReunion=projectVillageReunion(world,here);
  if(localReunion?.siteId===site.id)add('旧村重逢','此处有本人确实重逢的旧村一幕。');

  const desk=matches(projectLocalPavilionDesk(world,here));
  if(desk&&(desk.staffed||desk.availableCopies>0||desk.heldCopies>0))
    add('藏经阁',`${desk.staffed?'本月有值守':'本月未见值守'} · 在架 ${desk.availableCopies} 册 · 借出未还 ${desk.heldCopies} 册`);
  const memorial=world.civicMemorials.memorials.length?matches(projectLocalCivicMemorialCount(world,here)):undefined;
  if(memorial&&memorial.count>0)add('乡祠',`现场可核实 ${memorial.count} 则`);
  const fair=world.villageFairs.fairs.length?matches(projectLocalVillageFair(world,here)):undefined;
  if(fair)add('乡集',`本月实开 · 摊位 ${fair.paidStalls} 席`);
  const stipend=world.sectStipends.stipends.length?matches(projectLocalSectStipendStatus(world,here)):undefined;
  if(stipend)add('本人相关俸养',`本月已兑 ${stipend.paid} 期 · 未兑 ${stipend.unpaid} 期`);
  const seeds=world.seedCulture.plots.length?matches(projectLocalSeedCulture(world,here)):undefined;
  if(seeds)add('苗圃',`生长期 ${seeds.growing} 处 · 成熟待收 ${seeds.ready} 处`);
  const tools=world.toolLoans.loans.length?matches(projectLocalToolLoanStatus(world,here)):undefined;
  if(tools)add('本人相关共器',`在账 ${tools.active} 件 · 待现场领回 ${tools.awaiting} 件`);
  const aligned=world.alignedWeather.comparisons.length?matches(projectLocalAlignedWeather(world,here)):undefined;
  if(aligned)add('本人观象校读',aligned.outcome==='agrees'?'两份实测吻合':'两份实测仍有出入');
  const granary=matches(projectVillageGranary(world,here));
  if(granary&&granary.roots>0&&granary.stones>0)add('义仓','在场确认有库存。');
  const clinic=matches(visibleInfirmaries(world,here));
  if(clinic?.capacity)add('静养院',`本月可受理 ${clinic.capacity.available}/${clinic.capacity.beds} 床`);
  const followup=matches(projectLocalCareFollowupCapacity(world,here));
  if(followup)add('静养复诊',`本月余 ${followup.available}/${followup.beds} 床可排`);
  return details;
}
