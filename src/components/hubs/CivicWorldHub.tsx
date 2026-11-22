import {useImmortalAuctionControls} from '../useImmortalAuctionControls';
import {useDungeonControls} from '../useDungeonControls';
import {useTournamentArenaControls} from '../useTournamentArenaControls';
import type {RingAudiencePanelProps} from '../RingAudiencePanel';
import React, {useMemo,type ReactNode} from 'react';
import {BarChart3,RotateCcw} from 'lucide-react';
import type {useWorldSimulationController} from '../../controllers/useWorldSimulationController';
import type {Cultivator} from '../../types/world';
import type {GodInterventionCommand} from '../../engine/worldEngine';
import {activeAvatar,canQueueAvatarSalvage,queueAvatarCivicMemorialAppend,queueAvatarDisasterShelter,queueAvatarMarketFreight} from '../../engine/avatarEngine';
import {availableCivicMemorialActions} from '../../engine/civicMemorialEngine';
import {availableDisasterShelterActions} from '../../engine/disasterShelterEngine';
import {availableMarketFreightActions} from '../../engine/escortEngine';
import {isScopedExpeditionGate} from '../../engine/expeditionOmenTerms';
import {configureRegionalSimulation,projectRegionalSimulation,regionForPoint} from '../../engine/regionalSimulationEngine';
import {projectRegionalPromotions} from '../../engine/regionalPromotionEngine';
import type {AuthoredEraLaunchController} from '../AuthoredEraLaunch';
import type {CivicMemorialAppendControls} from '../CivicMemorialAppendRead';
import type {DisasterShelterControls} from '../DisasterShelterRead';
import type {MarketFreightControls} from '../MarketFreightRead';
import type {HandednessPreference} from '../handednessPreference';
import {llmScheduler} from '../../engine/llmScheduler';
import {createTerrainMapView} from '../terrainMapView';
import {REGIONAL_BENCHMARK} from '../regionalBenchmark';
import type {RegionalFocusOption,RegionalSimulationControls} from '../RegionalSimulationPanel';
import {InstitutionHubPanel} from './InstitutionHubPanel';

const RegionalSimulationPanel=React.lazy(async()=>({default:(await import('../RegionalSimulationPanel')).RegionalSimulationPanel}));
const GodConsole = React.lazy(async () => ({ default: (await import('../GodConsole')).GodConsole }));
const BountyBoard = React.lazy(async () => ({ default: (await import('../BountyBoard')).BountyBoard }));
const WorldOccasionsPanel = React.lazy(async () => ({ default: (await import('../WorldOccasionsPanel')).WorldOccasionsPanel }));
const LlmTelemetryPanel = React.lazy(async () => ({ default: (await import('../LlmTelemetryPanel')).LlmTelemetryPanel }));
const WeatherAtlasPanel = React.lazy(async () => ({ default: (await import('../WeatherAtlasPanel')).WeatherAtlasPanel }));
const ShortShiftPanel = React.lazy(async () => ({ default: (await import('../ShortShiftPanel')).ShortShiftPanel }));
const MarketCaravansPanel = React.lazy(async () => ({ default: (await import('../MarketCaravansPanel')).MarketCaravansPanel }));
const VillageGranaryPanel = React.lazy(async () => ({ default: (await import('../VillageGranaryPanel')).VillageGranaryPanel }));
const CaravanRestitutionPanel = React.lazy(async () => ({ default: (await import('../CaravanRestitutionPanel')).CaravanRestitutionPanel }));
const MortalVillagesPanel = React.lazy(async () => ({ default: (await import('../MortalVillagesPanel')).MortalVillagesPanel }));
const HouseholdNamePanel = React.lazy(async () => ({ default: (await import('../HouseholdNamePanel')).HouseholdNamePanel }));
const ScenarioPanel = React.lazy(async () => ({ default: (await import('../ScenarioPanel')).ScenarioPanel }));
const WorldStoragePanel = React.lazy(async () => ({ default: (await import('../WorldStoragePanel')).WorldStoragePanel }));

const groups = [
  {id:'atlas',label:'九州观测',sectionIds:['weather','analytics']},
  {id:'livelihood',label:'民生商路',sectionIds:['markets','villages']},
  {id:'encounters',label:'盛会悬赏',sectionIds:['occasions','bounties']},
  {id:'governance',label:'天道设置',sectionIds:['god','scenario','settings']},
] as const;
const action = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-40';
const panel = 'space-y-2 rounded-xl border border-slate-800 bg-slate-900 p-3';

export interface CivicWorldHubProps {
  simulation:ReturnType<typeof useWorldSimulationController>;
  active:boolean;
  selectedCultivator?:Cultivator;
  atlasExtras?:ReactNode;
  initialOpen?:string;
  rememberedOpen?:string|null;
  onOpenChange?:(id:string|null)=>void;
  authoredEra?:AuthoredEraLaunchController;
  handedness:HandednessPreference;
  onChangeHandedness:(value:string)=>void;
  audience?:RingAudiencePanelProps;
  onIntervene:(command:GodInterventionCommand)=>void;
  onAnalytics:()=>void;
}

export function CivicWorldHub({
  simulation,active,selectedCultivator,atlasExtras,initialOpen='weather',rememberedOpen,onOpenChange,
  authoredEra,handedness,onChangeHandedness,audience,onIntervene,onAnalytics,
}:CivicWorldHubProps) {
  const {
    world,visibleWorld,authority,timeline,history,saveContextVersion,viewScopeKey,sourceBranch,preview,browsing,
    updateWorld,replaceWorld,newWorldFromSeed,canUseSaveContext,archiveCurrentNarrative,handleReset,
    isRunning,setIsRunning,isStepping,stepInFlight,tickIntervalMs,setTickIntervalMs,llmConfig,changeLlmConfig,
    fairModelCoverage,fastForwardRun,campaignGuard,fastForwardLocked,
  }=simulation;
  const arenaControls=useTournamentArenaControls(simulation,active,selectedCultivator);
  const dungeonControls=useDungeonControls(simulation,active,selectedCultivator);
  const auctionControls=useImmortalAuctionControls(simulation,active?selectedCultivator:undefined);
  const activeActorId=selectedCultivator?.id??null;
  const selectedSettlementId=visibleWorld.settlements.villages.find(village=>village.locationId===selectedCultivator?.locationId)?.id;
  const regionalReadActive=active&&!preview;
  const regionalAvatar=regionalReadActive?activeAvatar(world):undefined;
  const regionalViewer=regionalAvatar??selectedCultivator;
  const regionalSites=useMemo<RegionalFocusOption[]>(()=>{
    if(!regionalReadActive||!regionalViewer?.alive)return [];
    const map=createTerrainMapView(world,regionalViewer,true);
    return map.seenLocations.flatMap(site=>{
      const region=regionForPoint(world,site);
      return region&&site.type!=='secret_realm'&&site.type!=='abyss'&&!isScopedExpeditionGate(site)?
        [{siteId:site.id,name:site.name,region}]:[];
    });
  },[regionalReadActive,regionalViewer,world]);
  const regionalView=regionalReadActive?projectRegionalSimulation(world):undefined;
  const regionalRevision=saveContextVersion.current;
  const regionalDisabled=isRunning||isStepping||fastForwardLocked;
  const regionalControls:RegionalSimulationControls={
    scopeKey:`${viewScopeKey}:${regionalRevision}:${regionalViewer?.id??''}`,
    revisionKey:world,availableSites:regionalSites,comparison:REGIONAL_BENCHMARK,
    mode:{enabled:!!world.regionalSimulation,version:regionalView?.version,
      focus:regionalSites.find(row=>row.siteId===world.regionalSimulation?.focusSiteId),
      effective:regionalView&&{region:regionalView.focus,avatarDriven:!!regionalAvatar},
      registeredRegions:regionalView?.registeredRegions,annual:regionalView?.annual,
      recentOpenings:regionalView?{clock:{tick:world.tick,year:world.year,month:world.month},
        rows:projectRegionalPromotions(world,regionalViewer)}:undefined},
    disabled:regionalDisabled,disabledReason:regionalDisabled?'先暂停推演或长局，再调整本分支。':undefined,
    onChange:change=>{
      if(change.kind!=='set_focus'||!regionalReadActive||regionalDisabled||
        !canUseSaveContext(world,regionalRevision)||history.current!==timeline||
        !!fastForwardRun.current||campaignGuard.current||
        !regionalSites.some(row=>row.siteId===change.siteId))return false;
      const changed=updateWorld(current=>{
        if(current!==world||current.regionalSimulation?.focusSiteId===change.siteId)return current;
        const draft={...current,regionalSimulation:current.regionalSimulation&&structuredClone(current.regionalSimulation)};
        return configureRegionalSimulation(draft,change.siteId)?draft:current;
      });
      return changed!==world;
    },
  };
  const queue=(revision:object,enqueue:(incoming:typeof world)=>boolean)=>{
    if(revision!==world||browsing.current||stepInFlight.current||fastForwardRun.current||campaignGuard.current||
      history.current!==timeline||authority.current!==world||saveContextVersion.current!==regionalRevision)return false;
    const updated=updateWorld(current=>{
      const clone=structuredClone(current);
      return enqueue(clone)?clone:current;
    });
    if(updated!==world)setIsRunning(false);
    return updated!==world;
  };
  const shelterAvatar=!preview&&active&&rememberedOpen==='villages'&&selectedCultivator&&
    activeAvatar(world)?.id===selectedCultivator.id?selectedCultivator:undefined;
  const disasterShelterControls:DisasterShelterControls|undefined=shelterAvatar?{
    scopeKey:`${viewScopeKey}:${shelterAvatar.id}`,revisionKey:world,disabled:isStepping||fastForwardLocked,
    choices:canQueueAvatarSalvage(world,shelterAvatar.id)?availableDisasterShelterActions(shelterAvatar,world,world.tick+1):[],
    pending:world.playerAvatar.pendingOrder?.action==='DISASTER_SHELTER'?world.playerAvatar.pendingOrder:undefined,
    onQueue:(choice,revision)=>queue(revision,clone=>queueAvatarDisasterShelter(clone,shelterAvatar.id,choice)),
  }:undefined;
  const freightAvatar=!preview&&active&&rememberedOpen==='markets'&&selectedCultivator&&
    activeAvatar(world)?.id===selectedCultivator.id?selectedCultivator:undefined;
  const marketFreightControls:MarketFreightControls|undefined=freightAvatar?{
    scopeKey:`${viewScopeKey}:${freightAvatar.id}`,revisionKey:world,disabled:isStepping||fastForwardLocked,
    choices:canQueueAvatarSalvage(world,freightAvatar.id)?availableMarketFreightActions(freightAvatar,world,world.tick+1):[],
    pending:world.playerAvatar.pendingOrder?.action==='MARKET_FREIGHT'?world.playerAvatar.pendingOrder:undefined,
    onQueue:(choice,revision)=>queue(revision,clone=>queueAvatarMarketFreight(clone,freightAvatar.id,choice)),
  }:undefined;
  const memorialControls:CivicMemorialAppendControls|undefined=shelterAvatar?{
    scopeKey:`${viewScopeKey}:${shelterAvatar.id}`,revisionKey:world,disabled:isStepping||fastForwardLocked,
    choices:canQueueAvatarSalvage(world,shelterAvatar.id)?availableCivicMemorialActions(shelterAvatar,world,world.tick+1)
      .filter(option=>option.civicMemorialMove==='append_relief'):[],
    pending:world.playerAvatar.pendingOrder?.action==='CIVIC_MEMORIAL'?world.playerAvatar.pendingOrder:undefined,
    onQueue:(choice,revision)=>queue(revision,clone=>queueAvatarCivicMemorialAppend(clone,shelterAvatar.id,choice)),
  }:undefined;

  return <InstitutionHubPanel label="世界与设置" groups={groups} initialOpen={initialOpen} rememberedOpen={rememberedOpen}
    onOpenChange={onOpenChange} sections={[
      { id: 'weather', label: '灵候图与观测', content: <div className="space-y-2.5">
        <React.Suspense fallback={<p role="status">载入世界记录…</p>}><WeatherAtlasPanel world={visibleWorld} cultivator={selectedCultivator} /></React.Suspense>
        {atlasExtras}
        {activeActorId && visibleWorld.shortShifts.shifts.some(({ hostId, workerId }) => activeActorId === hostId || activeActorId === workerId) &&
          <React.Suspense fallback={<p role="status">载入短聘凭证…</p>}><ShortShiftPanel world={visibleWorld} cultivator={selectedCultivator} /></React.Suspense>}
      </div> },
      { id: 'markets', label: '坊市与商队', content: selectedCultivator
        ? <div className="space-y-2.5">
          <React.Suspense fallback={<p role="status">载入世界记录…</p>}><MarketCaravansPanel world={visibleWorld} cultivator={selectedCultivator} freightControls={marketFreightControls} auctionControls={auctionControls} /></React.Suspense>
          {visibleWorld.caravanRestitution.lots.length > 0 &&
            <React.Suspense fallback={null}><CaravanRestitutionPanel world={visibleWorld} cultivator={selectedCultivator} /></React.Suspense>}
        </div>
        : <p className="text-xs text-slate-300">从人物名册选择实际修士后查看坊市。</p> },
      { id: 'villages', label: '凡人村镇与赈济', content: <div className="space-y-2.5">
        <React.Suspense fallback={<p role="status">载入世界记录…</p>}><MortalVillagesPanel world={visibleWorld} cultivator={selectedCultivator} shelterControls={disasterShelterControls} memorialControls={memorialControls} /></React.Suspense>
        {selectedCultivator && selectedSettlementId &&
          <>
            <React.Suspense fallback={null}><HouseholdNamePanel world={visibleWorld} cultivator={selectedCultivator} settlementId={selectedSettlementId} /></React.Suspense>
            <React.Suspense fallback={null}><VillageGranaryPanel world={visibleWorld} cultivator={selectedCultivator} settlementId={selectedSettlementId} /></React.Suspense>
          </>}
      </div> },
      { id: 'occasions', label: '比武与秘境盛会', content: selectedCultivator
        ? <React.Suspense fallback={<p role="status">载入盛会记录…</p>}><WorldOccasionsPanel world={visibleWorld} cultivator={selectedCultivator} arenaControls={arenaControls} dungeonControls={dungeonControls} /></React.Suspense>
        : <p className="text-xs text-slate-300">从人物名册选择实际修士后查看盛会。</p> },
      { id: 'bounties', label: '天机悬赏榜', content: <React.Suspense fallback={<p role="status">载入悬赏榜…</p>}><BountyBoard world={visibleWorld} /></React.Suspense> },
      { id: 'analytics', label: '天道观测与演化统计', content: <button type="button" onClick={() => onAnalytics()}
        className={`${action} bg-sky-900/60 text-sky-100 hover:bg-sky-800`}><BarChart3 aria-hidden="true" className="h-4 w-4" />打开天道观测</button> },
      ...(preview ? [] : [
        { id: 'god', label: '天道干预与模型设置', content: <div className="space-y-2.5">
          <React.Suspense fallback={<p role="status">载入模型状态…</p>}><LlmTelemetryPanel scheduler={llmScheduler}
            coverage={fairModelCoverage}
            configured={llmConfig.enabled} hasCredential={Boolean(llmConfig.apiKey.trim())} model={llmConfig.model || 'gpt-4o-mini'} /></React.Suspense>
          <React.Suspense fallback={<p role="status">载入天道控制台…</p>}><GodConsole world={world} selectedCultivatorId={activeActorId} llmConfig={llmConfig}
            onUpdateLLMConfig={changeLlmConfig} audience={audience} audienceScope={viewScopeKey} onIntervene={onIntervene} /></React.Suspense>
        </div> },
        { id: 'scenario', label: '剧本编辑与复演', content: <React.Suspense fallback={<p role="status">载入剧本编辑器…</p>}>
          <ScenarioPanel world={world} busy={isStepping} onApply={replaceWorld} authoredEra={authoredEra} />
        </React.Suspense> },
        { id: 'settings', label: '存档、世界种子与推演速度', content: <div className="space-y-2.5">
          <div className={`${panel} flex flex-wrap items-center gap-x-2 gap-y-1.5`}>
            <label htmlFor="world-tick-interval" className="text-xs font-semibold">推演速度</label>
            <select id="world-tick-interval" value={tickIntervalMs} onChange={(e) => setTickIntervalMs(Number(e.target.value))}
              className="min-h-11 max-w-full rounded-md border border-slate-700 bg-slate-950 px-2 text-sm text-slate-100">
              <option value={2500}>慢速 (2.5 秒/月)</option><option value={1500}>标准 (1.5 秒/月)</option><option value={600}>极速 (0.6 秒/月)</option>
            </select>
            <label htmlFor="one-hand-control" className="text-xs font-semibold">单手操作</label>
            <select id="one-hand-control" value={handedness} onChange={(event) => onChangeHandedness(event.currentTarget.value)}
              aria-describedby="one-hand-control-help"
              className="min-h-11 max-w-full rounded-md border border-slate-700 bg-slate-950 px-2 text-base text-slate-100 sm:text-sm">
              <option value="default">默认布局</option><option value="left">左手靠左</option><option value="right">右手靠右</option>
            </select>
            <p id="one-hand-control-help" className="sr-only">仅将窄屏的推演、返回和地图工具移到同一侧。本机保存；不改变人物、分支或键盘顺序。</p>
            <button type="button" disabled={isStepping} onClick={handleReset} className={`${action} bg-slate-800 text-slate-200 hover:bg-slate-700`}>
              <RotateCcw aria-hidden="true" className="h-4 w-4" />{world.builtinScenarioOrigin?'退出剧本，重置为普通创世':'重置修仙纪元'}</button>
          </div>
          <React.Suspense fallback={null}><RegionalSimulationPanel {...regionalControls}/></React.Suspense>
          <React.Suspense fallback={<p role="status">载入存档管理…</p>}>
            <WorldStoragePanel world={world} busy={isStepping} eraBlocked={fastForwardLocked || isRunning} canUseEraContext={(candidate,version)=>!fastForwardRun.current && canUseSaveContext(candidate,version)} contextVersion={saveContextVersion.current}
              canUseContext={canUseSaveContext} sourceBranch={sourceBranch} timeline={timeline}
              onArchiveNarrative={archiveCurrentNarrative} onRestore={replaceWorld} onNewWorld={newWorldFromSeed} />
          </React.Suspense>
        </div> },
      ]),
    ]} />;
}
