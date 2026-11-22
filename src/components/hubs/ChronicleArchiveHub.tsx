import {lazy,Suspense,type ComponentProps} from 'react';
import type {useWorldSimulationController} from '../../controllers/useWorldSimulationController';
import {activeAvatar,canQueueAvatarSalvage,queueAvatarScribeCommission} from '../../engine/avatarEngine';
import {availableScribeCommissionActions} from '../../engine/scribeCommissionEngine';
import {TIMELINE_MAX_BRANCHES} from '../../engine/timelineEngine';
import type {Cultivator} from '../../types/world';
import {AuthoredEraChronicle} from '../AuthoredEraChronicle';
import {CampaignResumeNotice} from '../CampaignResumeNotice';
import type {ChronicleFeed as ArchiveFeed} from '../ChronicleFeed';
import type {CrossRegionConsequenceRead as ConsequenceRead} from '../CrossRegionConsequenceRead';
import type {EraEntryPanelProps} from '../EraEntryPanel';
import type {FastForwardControls} from '../FastForwardPanel';
import type {ScribeCommissionControls} from '../ScribeCommissionRead';
import {WitnessedPersonalStory,WitnessedStoryScopeToggle} from '../WitnessedPersonalStory';
import {findVisibleCampaignStopOption,type CampaignStopOption} from '../campaignStopOptions';
import {chooseWorkspaceSection} from '../workspacePreferences';
import {InstitutionHubPanel} from './InstitutionHubPanel';

const AttestationPanel=lazy(async()=>({default:(await import('../AttestationPanel')).AttestationPanel}));
const ChronicleFeed=lazy(async()=>({default:(await import('../ChronicleFeed')).ChronicleFeed}));
const ChronicleLibraryPanel=lazy(async()=>({default:(await import('../ChronicleLibraryPanel')).ChronicleLibraryPanel}));
const ChronicleNotebookPanel=lazy(async()=>({default:(await import('../ChronicleNotebookPanel')).ChronicleNotebookPanel}));
const CrossRegionConsequenceRead=lazy(async()=>({default:(await import('../CrossRegionConsequenceRead')).CrossRegionConsequenceRead}));
const EraEntryPanel=lazy(async()=>({default:(await import('../EraEntryPanel')).EraEntryPanel}));
const EstateMemorialPanel=lazy(async()=>({default:(await import('../EstateMemorialPanel')).EstateMemorialPanel}));
const RankSeasonPanel=lazy(async()=>({default:(await import('../RankSeasonPanel')).RankSeasonPanel}));
const TimelinePanel=lazy(async()=>({default:(await import('../TimelinePanel')).TimelinePanel}));
const WatchlistsPanel=lazy(async()=>({default:(await import('../WatchlistsPanel')).WatchlistsPanel}));

type Simulation=ReturnType<typeof useWorldSimulationController>;
const sections=['feed','library','notebook','rank-season','timeline','witness','estate'] as const;
const groups=[
  {id:'story',label:'见闻',sectionIds:['feed']},
  {id:'books',label:'藏书',sectionIds:['library']},
  {id:'history',label:'时线',sectionIds:['timeline']},
  {id:'evidence',label:'考据',sectionIds:['notebook','witness','estate','rank-season']},
];

export interface ChronicleArchiveHubProps {
  simulation:Simulation;
  selectedCultivator?:Cultivator;
  active:boolean;
  initialOpen?:string;
  rememberedOpen?:string|null;
  forcedOpen?:string;
  onOpenChange?:(id:string|null)=>void;
  feed:ComponentProps<typeof ArchiveFeed>;
  personal?:{available:boolean;active:boolean;story?:ComponentProps<typeof WitnessedPersonalStory>['story'];
    focusEventId?:string;onToggle:()=>void};
  scopedSupplyLinks:ComponentProps<typeof ConsequenceRead>['consequences'];
  writeAnnotation:ComponentProps<typeof ChronicleNotebookPanel>['onWrite'];
  writeWatchlist:ComponentProps<typeof WatchlistsPanel>['onWrite'];
  eraEntry?:EraEntryPanelProps;
  campaignStopOptions:readonly CampaignStopOption[];
  campaignSelectedStop?:FastForwardControls['campaignSelectedStop'];
}

const action='inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-40';

function PendingCampaign({simulation}:{simulation:Simulation}){
  const {campaign,preview,isStepping}=simulation;
  if(!campaign.pending)return null;
  if(campaign.pending.status==='cancelled')return <div className="space-y-1">
    <p>这次长局已取消，不可再续跑。</p>
    <button type="button" className={action} disabled={campaign.working} onClick={campaign.discard}>清除已取消记录</button>
  </div>;
  return <CampaignResumeNotice receipt={{source:campaign.pending.source,target:campaign.pending.target,
    verified:campaign.pending.completedTicks?campaign.pendingDate:undefined,completedMonths:campaign.pending.completedTicks,
    requestedMonths:campaign.pending.requestedTicks}} scope={campaign.sameSource?'same_source':'different_context'}
    confirmedResult={campaign.pending.status==='finalized'} confirmingRestore={campaign.reviewing}
    restoringOnlyOriginal={campaign.reviewingOriginal} onReviewOriginal={campaign.showOriginalOnly?campaign.reviewOriginal:undefined}
    disabled={campaign.working||Boolean(preview)||isStepping}
    onResume={campaign.resumePending} onReviewRestore={campaign.review} onConfirmRestore={campaign.restore}
    onCancelRestore={campaign.cancelReview} onDiscard={campaign.discard} />;
}

export function ChronicleArchiveHub({simulation,selectedCultivator,active,initialOpen='feed',rememberedOpen,forcedOpen,onOpenChange,
  feed,personal,scopedSupplyLinks,writeAnnotation,writeWatchlist,eraEntry,campaignStopOptions,campaignSelectedStop}:ChronicleArchiveHubProps){
  if(!active)return null;
  const {world,visibleWorld,timeline,preview,viewScopeKey,viewEpoch,isStepping,isRunning,fastForwardLocked,campaign,campaignPhase,
    fastForwardView,startFastForward,stopFastForward,commandFastForward,applyFastForward,saveContextVersion,handleTimelinePreview,
    handleTimelineSelectBranch,handleTimelineFork,timelineNotice}=simulation;
  const actorId=selectedCultivator?.id??null;
  const ordinary=chooseWorkspaceSection(sections,initialOpen,rememberedOpen);
  const isReturning=Boolean(feed.returnPosition);
  const forced=forcedOpen??(isReturning&&ordinary!=='feed'?'feed':undefined);
  const scribeAvatar=!preview&&!isReturning&&(forced??ordinary)==='library'&&selectedCultivator&&
    activeAvatar(world)?.id===selectedCultivator.id?selectedCultivator:undefined;
  const contextVersion=saveContextVersion.current;
  const scribeControls:ScribeCommissionControls|undefined=scribeAvatar?{
    scopeKey:`${viewScopeKey}:${scribeAvatar.id}`,revisionKey:world,disabled:isStepping||fastForwardLocked,
    choices:canQueueAvatarSalvage(world,scribeAvatar.id)?availableScribeCommissionActions(scribeAvatar,world,world.tick+1):[],
    pending:world.playerAvatar.pendingOrder?.action==='SCRIBE_COMMISSION'?world.playerAvatar.pendingOrder:undefined,
    onQueue:(choice,revision)=>{
      const {browsing,stepInFlight,fastForwardRun,campaignGuard,history,authority,updateWorld,setIsRunning}=simulation;
      if(revision!==world||browsing.current||stepInFlight.current||fastForwardRun.current||campaignGuard.current||
        history.current!==timeline||authority.current!==world||saveContextVersion.current!==contextVersion)return false;
      const updated=updateWorld(current=>{
        const clone=structuredClone(current);
        return queueAvatarScribeCommission(clone,scribeAvatar.id,choice)?clone:current;
      });
      if(updated!==world)setIsRunning(false);
      return updated!==world;
    },
  }:undefined;

  return <InstitutionHubPanel label="纪事与历史" initialOpen={initialOpen} rememberedOpen={rememberedOpen}
    forcedOpen={forced} onOpenChange={onOpenChange} groups={groups} sections={[
      {id:'feed',label:'山河见闻',content:<Suspense fallback={<p role="status">载入山河见闻…</p>}>
        <AuthoredEraChronicle world={visibleWorld} visible={feed.events}/>
        {!isReturning&&scopedSupplyLinks.length>0&&<CrossRegionConsequenceRead key={viewScopeKey} consequences={scopedSupplyLinks}
          viewerName={selectedCultivator?.name} frame={visibleWorld.authoredEraOrigin?undefined:visibleWorld}/>}
        {selectedCultivator&&personal?.available&&!isReturning&&<WitnessedStoryScopeToggle selectedName={selectedCultivator.name}
          active={personal.active} onToggle={personal.onToggle}/>}
        {personal?.story&&!isReturning?<WitnessedPersonalStory story={personal.story} focusEventId={personal.focusEventId}/>:
          <ChronicleFeed {...feed} reading={isReturning?undefined:feed.reading}/>}
      </Suspense>},
      {id:'library',label:'藏书阁与故事',content:<Suspense fallback={<p role="status">载入藏书阁…</p>}>
        <ChronicleLibraryPanel world={visibleWorld} cultivator={selectedCultivator} scopeKey={viewScopeKey} scribeControls={scribeControls}/>
      </Suspense>},
      {id:'notebook',label:'书签与地图批注',content:<Suspense fallback={<p role="status">载入分支记录…</p>}>
        <ChronicleNotebookPanel key={`${timeline.activeBranchId}:${preview?.tick??'live'}:${actorId??''}`}
          world={visibleWorld} actorId={actorId} branchId={timeline.activeBranchId} readOnly={!!preview} busy={isStepping} onWrite={writeAnnotation}/>
        <WatchlistsPanel key={`${viewScopeKey}:${actorId??''}`}
          world={visibleWorld} actorId={actorId} branchId={timeline.activeBranchId} readOnly={!!preview} busy={isStepping} onWrite={writeWatchlist}/>
      </Suspense>},
      {id:'rank-season',label:'赛季榜与荣誉',content:<Suspense fallback={<p role="status">载入赛季榜…</p>}>
        <RankSeasonPanel world={visibleWorld} cultivator={selectedCultivator}/>
      </Suspense>},
      {id:'timeline',label:'原始时间线与分支',content:<Suspense fallback={<p role="status">载入时间线…</p>}>
        <TimelinePanel timeline={timeline} previewTick={preview?.tick??null} busy={isStepping}
          eraEntry={eraEntry&&<Suspense fallback={null}><EraEntryPanel {...eraEntry}/></Suspense>}
          comparisonViewerId={actorId??undefined} comparisonScopeKey={viewScopeKey}
          verificationSource={{world:visibleWorld,branchId:timeline.activeBranchId,scopeKey:viewScopeKey,sessionEpoch:viewEpoch,
            busy:isStepping||isRunning||fastForwardLocked}}
          onPreview={handleTimelinePreview} onSelectBranch={handleTimelineSelectBranch} onFork={handleTimelineFork} notice={timelineNotice}
          fastForward={{...(campaign.active||campaign.working?{phase:campaignPhase}:fastForwardView),
            available:typeof Worker==='function'&&!preview&&!isStepping&&timeline.branches.length<TIMELINE_MAX_BRANCHES,
            capacitySource:{world,contextVersion,scopeKey:viewScopeKey},
            campaignAvailable:campaign.available,campaignState:campaign.state,campaignPreparing:campaign.working,
            pendingCampaign:campaign.pending?<PendingCampaign simulation={simulation}/>:undefined,campaignNotice:campaign.notice,
            campaignStopOptions:campaign.available?campaignStopOptions:undefined,campaignSelectedStop,
            onStart:(months,binding)=>startFastForward(months,binding,stop=>Boolean(findVisibleCampaignStopOption(campaignStopOptions,stop))),
            onPause:campaign.active?campaign.pause:()=>commandFastForward('pause'),
            onResume:campaign.active?campaign.resume:()=>commandFastForward('resume'),
            onStage:()=>commandFastForward('stage'),
            onCancel:campaign.active?campaign.cancel:campaign.working?campaign.abortOperation:()=>stopFastForward('已取消并丢弃暂存结果，原分支不变。'),
            onApply:campaign.active?campaign.apply:applyFastForward}}/>
      </Suspense>},
      {id:'witness',label:'证词与名誉复核',content:<Suspense fallback={<p role="status">载入证词记录…</p>}>
        <AttestationPanel world={visibleWorld} cultivator={selectedCultivator}/>
      </Suspense>},
      {id:'estate',label:'归葬与遗产',content:<Suspense fallback={<p role="status">载入遗产账簿…</p>}>
        <EstateMemorialPanel world={visibleWorld} cultivator={selectedCultivator}/>
      </Suspense>},
    ]}/>;
}
