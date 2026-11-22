import {resolveGuidedWorldTurn,type GuidedWorldTurn} from './guidedWorldTurn';
import {useCallback,useEffect,useRef,useState} from 'react';
import {createInitialWorld} from '../data/initialWorld';
import {useFastForwardCampaign} from '../components/useFastForwardCampaign';
import type {FastForwardPreflightBinding} from '../components/FastForwardPanel';
import {FAST_FORWARD_MAX_TICKS,type FastForwardCheckpoint,type FastForwardProgress,type FastForwardWorkerRequest,type FastForwardWorkerResponse} from '../engine/fastForwardEngine';
import {classifyFastForwardRunReport} from './fastForwardRunReport';
import {FAST_FORWARD_CAMPAIGN_MAX_TICKS,planFastForwardCampaign} from '../engine/fastForwardCampaignEngine';
import {advanceWorldTick,type GodInterventionCommand} from '../engine/worldEngine';
import {llmDecisionEndpoint,requestCultivatorLLMDecision} from '../engine/llmBrain';
import {llmScheduler} from '../engine/llmScheduler';
import {enrichAnnualReflections} from '../engine/reflectionEngine';
import {enrichTickDialogues} from '../engine/dialogueEngine';
import {settleChronicleOnline} from '../engine/chronicleRuntime';
import {recordEraHistoryTurn} from '../engine/eraHistoryIndex';
import {commitCouncilSnapshot,settleAnnualCouncilOnline} from '../engine/councilRuntime';
import {captureWatchDigests} from '../engine/watchlistEngine';
import {commitFairModelTurn,createFairModelTurnState,longestModelWait,type FairModelTurnState} from '../engine/fairModelTurnEngine';
import {modelDecisionCandidates,runModelDecisionTurn,type FairModelCoverage} from '../engine/modelDecisionTurn';
import {createDecisionReplayTape,replayOneTurn,type DecisionReplayTape,type DecisionReplayResult} from '../engine/decisionTraceEngine';
import {createTimeline,forkTimeline,forkTimelineCheckpoint,readTimelineHead,readTimelineSnapshot,recordTimelineWorld,selectTimelineBranch,TIMELINE_MAX_BRANCHES,type WorldTimeline} from '../engine/timelineEngine';
import type {SaveBranchSource} from '../engine/storageEngine';
import type {NarrativeArchivePlan} from '../engine/saveCapacityEngine';
import {applyArchiveOptimization} from '../engine/saveArchiveSeal';
import {isWorldSeed} from '../engine/worldRandom';
import {isWorldgenProfileId} from '../engine/worldgenProfiles';
import type {LLMConfig,WorldEvent,WorldState,WorldgenProfileId} from '../types/world';

type FastForwardPhase = 'idle' | 'running' | 'pausing' | 'paused' | 'staging' | 'ready' | 'error';
type FastForwardViewState = { phase: FastForwardPhase; progress?: FastForwardProgress; notice?: string };
interface ActiveFastForward {
  readonly id: string;
  readonly base: WorldState;
  readonly timeline: WorldTimeline;
  readonly branchId: string;
  readonly context: number;
  readonly requestedTicks: number;
  worker?: Worker;
  progress?: FastForwardProgress;
  checkpoint?: FastForwardCheckpoint;
}
const saveTimelineIdentity = (): string | undefined => {
  try { return globalThis.crypto?.randomUUID?.(); }
  catch { return undefined; }
};
function observe<T>(ref:{readonly current:T}):{readonly current:T}{return ref;}

interface WorldSimulationControllerOptions {
  playbackEnabled:boolean;
  inspectCampaign:boolean;
  onPreviewContextChange:()=>void;
  onHistoricalPreview:()=>void;
  onActivate:(incoming:WorldState)=>void;
}

/** Owns one live simulation, its branching history, and asynchronous work tied to that source. */
export function useWorldSimulationController({
  playbackEnabled,inspectCampaign,onPreviewContextChange,onHistoricalPreview,onActivate,
}:WorldSimulationControllerOptions){
  const [world, setWorld] = useState<WorldState>(() => createInitialWorld());
  const [viewEpoch, setViewEpoch] = useState(0);
  const saveContextVersion = useRef(0);
  const fastForwardSerial = useRef(0);
  const fastForwardRun = useRef<ActiveFastForward>();
  const campaignGuard = useRef(false);
  const modelStepAbort = useRef<AbortController>();
  const fairTurns = useRef(new Map<string, { state: FairModelTurnState; coverage: FairModelCoverage }>());
  const [fastForwardView, setFastForwardView] = useState<FastForwardViewState>({ phase: 'idle' });
  useEffect(() => () => {
    fastForwardRun.current?.worker?.terminate();
    fastForwardRun.current = undefined;
    modelStepAbort.current?.abort();
  }, []);
  const [saveTimelineId, setSaveTimelineId] = useState(saveTimelineIdentity);
  const [restoredReadingOrigin, setRestoredReadingOrigin] = useState<{ world:WorldState; timelineId:string; branchId:string; restoredBranchId:string }>();
  const authority = useRef(world);
  const [timeline, setTimeline] = useState(() => createTimeline(world));
  const history = useRef(timeline);
  const replayTapes = useRef(new Map<string, Map<number, { tape: DecisionReplayTape; committed: WorldState }>>());
  const retainReplay = useCallback((branchId: string, tape: DecisionReplayTape, committed: WorldState) => {
    const byTick = replayTapes.current.get(branchId) ?? new Map<number, { tape: DecisionReplayTape; committed: WorldState }>();
    byTick.set(committed.tick, { tape, committed });
    while (byTick.size > 12) {
      const oldest = byTick.keys().next().value;
      if (oldest === undefined) break;
      byTick.delete(oldest);
    }
    replayTapes.current.set(branchId, byTick);
  }, []);
  const [preview, setPreview] = useState<{ tick: number; world: WorldState }>();
  const browsing = useRef(false);
  const [timelineNotice, setTimelineNotice] = useState<string>();
  const updateTimeline = useCallback((next: WorldTimeline) => {
    history.current = next;
    setTimeline(next);
  }, []);
  const updateWorld = useCallback((change: (current: WorldState) => WorldState, record = true) => {
    const current = authority.current;
    const next = change(current);
    if (next !== current) {
      modelStepAbort.current?.abort();
      authority.current = next;
      if (record) updateTimeline(recordTimelineWorld(history.current, next));
      setWorld(next);
    }
    return next;
  }, [updateTimeline]);
  const [isRunning, setIsRunning] = useState(false);
  const [isStepping, setIsStepping] = useState(false);
  const stepInFlight = useRef(false);
  const tryBeginInteraction = useCallback(() => {
    if(stepInFlight.current||browsing.current)return false;
    stepInFlight.current=true;
    setIsStepping(true);
    return true;
  },[]);
  const endInteraction = useCallback(() => {
    stepInFlight.current=false;
    setIsStepping(false);
  },[]);
  const [tickIntervalMs, setTickIntervalMs] = useState(1500);
  const [llmConfig, setLlmConfig] = useState<LLMConfig>({
    enabled: false,
    apiBaseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
  });
  const changeLlmConfig = (config: LLMConfig) => {
    modelStepAbort.current?.abort();
    setLlmConfig(config);
  };

  const handleStepTick = useCallback(async (guide?:GuidedWorldTurn) => {
    if (fastForwardRun.current || campaignGuard.current || !tryBeginInteraction()) return;
    let modelAbort: AbortController | undefined;
    try {
      const starting = authority.current;
      const branchId = history.current.activeBranchId;
      const revision=saveContextVersion.current;
      const directed=guide&&resolveGuidedWorldTurn(guide,starting,branchId,revision);
      if(guide&&!directed)return;
      if (llmConfig.enabled && llmConfig.apiKey.trim()) {
        const controller = new AbortController();
        modelAbort = controller;
        modelStepAbort.current = controller;
        const context = saveContextVersion.current;
        const current = () => !controller.signal.aborted && authority.current === starting && !browsing.current &&
          history.current.activeBranchId === branchId && saveContextVersion.current === context;
        const requestedTick = starting.tick + 1;
        const endpoint = llmDecisionEndpoint(llmConfig);
        llmScheduler.beginTick(requestedTick);
        const fairness = fairTurns.current.get(branchId)?.state ?? createFairModelTurnState();
        const admission = () => llmScheduler.decisionAdmission(requestedTick, endpoint);
        const turn = await runModelDecisionTurn({
          state: fairness, eligible: modelDecisionCandidates(starting).filter(actor=>actor.id!==directed?.actorId), signal: controller.signal,
          admission: admission(), currentAdmission: admission,
          request: (actor, signal, onStart) => requestCultivatorLLMDecision(actor, starting, llmConfig, requestedTick, { signal, onStart }),
        });
        const modelActors = new Set(turn.orders.keys());
        llmScheduler.markDecision('validated', modelActors.size);
        if (turn.stale || !current()) {
          llmScheduler.markDecision('stale', modelActors.size);
          return;
        }
        const decisions = Object.fromEntries(turn.orders);
        if(directed)decisions[directed.actorId]=directed.decision;
        const applied = new Set<string>();
        const tape = createDecisionReplayTape(starting, 'deferred');
        let canonicalWatchBatch: readonly WorldEvent[] = [];
        let canonicalEraBatch:readonly WorldEvent[]=[];
        const tick = advanceWorldTick(starting, decisions, undefined, 'deferred', (id, effective) => {
          if (effective && modelActors.has(id)) applied.add(id);
        }, { tape, modelActors, onWatchBatch: (events) => { canonicalWatchBatch = events; },
          onCompletedEvents:events=>{canonicalEraBatch=events;} });
        const [reflected, dramatized] = await Promise.all([
          enrichAnnualReflections(tick, llmConfig), enrichTickDialogues(tick, llmConfig),
        ]);
        if (!current()) {
          llmScheduler.markDecision('stale', modelActors.size);
          return;
        }
        const withCouncil = await settleAnnualCouncilOnline({ ...reflected, events: dramatized.events }, llmConfig);
        if (!current()) {
          llmScheduler.markDecision('stale', modelActors.size);
          return;
        }
        const next = await settleChronicleOnline(withCouncil, llmConfig);
        if (!current()) {
          llmScheduler.markDecision('stale', modelActors.size);
          return;
        }
        const nativeEraIds=new Set(canonicalEraBatch.map(({id})=>id));
        recordEraHistoryTurn(starting,next,[...canonicalEraBatch,...next.events.filter(({tick,id})=>tick===next.tick&&!nativeEraIds.has(id))]);
        if (next.watchlists.watches.length) {
          const beforeCouncil = new Set(dramatized.events.map(({ id }) => id));
          const endingCouncil = withCouncil.events.filter(({ id, tick: at }) => at === next.tick && !beforeCouncil.has(id));
          captureWatchDigests(next, [...canonicalWatchBatch, ...endingCouncil]);
        }
        modelStepAbort.current = undefined;
        if (updateWorld((live) => commitCouncilSnapshot(live, starting, next)) === next) {
          retainReplay(branchId, tape, next);
          const livingActorIds = next.cultivators.filter(({ alive, hp }) => alive && hp > 0).map(({ id }) => id);
          const state = commitFairModelTurn(fairness, { ...turn, livingActorIds });
          const utility = turn.eligibleActorIds.length - modelActors.size;
          fairTurns.current.set(branchId, { state, coverage: {
            tick: next.tick, eligible: turn.eligibleActorIds.length, planned: turn.plannedActorIds.length,
            started: turn.startedActorIds.length, validated: modelActors.size, applied: applied.size,
            utility, longestWait: longestModelWait(state, turn.eligibleActorIds), ...(turn.limit ? { limit: turn.limit } : {}),
          } });
          llmScheduler.markDecision('local_fallback', utility);
          llmScheduler.markDecision('applied', applied.size);
          llmScheduler.markDecision('simulation_rejected', modelActors.size - applied.size);
        } else {
          llmScheduler.markDecision('stale', modelActors.size);
        }
      } else {
        const tape = createDecisionReplayTape(starting, 'utility');
        const next = updateWorld((prev) => advanceWorldTick(prev,directed?{[directed.actorId]:directed.decision}:undefined,undefined,'utility',undefined,{ tape }));
        retainReplay(branchId, tape, next);
      }
    } finally {
      if (modelStepAbort.current === modelAbort) modelStepAbort.current = undefined;
      endInteraction();
    }
  }, [llmConfig, updateWorld, retainReplay, tryBeginInteraction, endInteraction]);

  useEffect(() => {
    if (!playbackEnabled || !isRunning) return;
    const timer = setInterval(() => {
      void handleStepTick();
    }, tickIntervalMs);
    return () => clearInterval(timer);
  }, [playbackEnabled, isRunning, tickIntervalMs, handleStepTick]);

  const clearPreview = () => {
    onPreviewContextChange();
    browsing.current = false;
    setPreview(undefined);
  };

  const stopFastForward = (notice?: string, phase: FastForwardPhase = 'idle') => {
    const former = fastForwardRun.current;
    fastForwardRun.current = undefined;
    former?.worker?.terminate();
    setFastForwardView({ phase, ...(notice ? { notice } : {}) });
  };

  const activateTimeline = (next: WorldTimeline, incoming: WorldState) => {
    if (fastForwardRun.current) stopFastForward('原分支已改变，暂存快进已丢弃。');
    modelStepAbort.current?.abort();
    saveContextVersion.current += 1;
    setIsRunning(false);
    clearPreview();
    updateTimeline(next);
    updateWorld(() => incoming, false);
    llmScheduler.resetTickBudget();
    onActivate(incoming);
  };
  // Era-entry return activates the original branch and restores its already-verified frame as one operation.
  const restoreHistoricalFrame = (next:WorldTimeline,incoming:WorldState,tick:number,former:WorldState) => {
    activateTimeline(next,incoming);
    onPreviewContextChange();
    browsing.current=true;
    setPreview({tick,world:former});
    setTimelineNotice(undefined);
  };
  const canUseSaveContext = (expected: WorldState, contextVersion?: number): boolean =>
    !stepInFlight.current && !browsing.current && authority.current === expected &&
    (contextVersion === undefined || contextVersion === saveContextVersion.current);

  const replaceWorld = (next: WorldState, expected: WorldState, expectedContextVersion?: number, verifiedSource?: SaveBranchSource): boolean => {
    if (!canUseSaveContext(expected, expectedContextVersion)) return false;
    const nextTimeline = createTimeline(next);
    setRestoredReadingOrigin(verifiedSource?.timelineId ?
      {world:next,timelineId:verifiedSource.timelineId,branchId:verifiedSource.branchId,restoredBranchId:nextTimeline.activeBranchId} : undefined);
    replayTapes.current.clear();
    fairTurns.current.clear();
    setSaveTimelineId(saveTimelineIdentity());
    setViewEpoch((previous) => previous + 1);
    activateTimeline(nextTimeline, next);
    return true;
  };

  const archiveCurrentNarrative = async (plan: NarrativeArchivePlan, expected: WorldState, contextVersion: number,
    source?: SaveBranchSource): Promise<boolean> => {
    const branchId = source?.branchId;
    const ready = () => canUseSaveContext(expected, contextVersion) && !fastForwardRun.current &&
      branchId === history.current.activeBranchId;
    if (!ready()) return false;
    const candidate = applyArchiveOptimization(expected, plan);
    if (!candidate) return false;
    const original = history.current;
    const archived = recordTimelineWorld(original, candidate, branchId);
    if (archived === original) return false;
    saveContextVersion.current += 1;
    updateTimeline(archived);
    updateWorld(() => candidate, false);
    return true;
  };

  const newWorldFromSeed = (seed: number, profileId: WorldgenProfileId, expected: WorldState, expectedContextVersion?: number): boolean =>
    isWorldSeed(seed) && isWorldgenProfileId(profileId) && canUseSaveContext(expected, expectedContextVersion) &&
    replaceWorld(createInitialWorld(seed, profileId), expected, expectedContextVersion);

  const handleReset = () => {
    if (browsing.current) return;
    const active = authority.current;
    const next = createInitialWorld(active.random.seed, active.worldgen?.profileId ?? 'classic');
    replayTapes.current.clear();
    fairTurns.current.clear();
    setRestoredReadingOrigin(undefined);
    // Emergency reset invalidates an in-flight model tick, which cannot commit afterward.
    setSaveTimelineId(saveTimelineIdentity());
    setViewEpoch((previous) => previous + 1);
    activateTimeline(createTimeline(next), next);
  };

  const handleTimelinePreview = (tick: number | null) => {
    if (stepInFlight.current) return;
    setTimelineNotice(undefined);
    if (tick === null) { clearPreview(); return; }
    const snapshot = readTimelineSnapshot(history.current, tick);
    if (!snapshot) { setTimelineNotice('此快照不在当前分支保留的范围内。'); return; }
    setIsRunning(false);
    onHistoricalPreview();
    saveContextVersion.current += 1;
    onPreviewContextChange();
    browsing.current = true;
    setPreview({ tick, world: snapshot });
  };

  const handleTimelineSelectBranch = (branchId: string) => {
    if (stepInFlight.current) return;
    setTimelineNotice(undefined);
    try {
      const next = selectTimelineBranch(history.current, branchId);
      const incoming = next.activeBranchId === branchId ? readTimelineHead(next) : undefined;
      if (incoming) activateTimeline(next, incoming);
      else setTimelineNotice('未找到这个分支，当前世界不变。');
    } catch {
      setTimelineNotice('未找到这个分支，当前世界不变。');
    }
  };

  const handleTimelineFork = (sourceBranchId: string, tick: number, command: GodInterventionCommand) => {
    if (stepInFlight.current || !browsing.current || preview?.tick !== tick || sourceBranchId !== history.current.activeBranchId) return;
    try {
      const next = forkTimeline(history.current, tick, command);
      const incoming = readTimelineSnapshot(next, tick);
      if (!incoming) throw new Error('无法读取分支首个快照。');
      activateTimeline(next, incoming);
      setTimelineNotice('已开启新分支并施加所选干预，原时间线完整保留。');
    } catch (error) {
      setTimelineNotice(error instanceof Error ? error.message : '分支未建立，当前世界不变。');
    }
  };

  const visibleWorld = preview?.world ?? world;
  const isFastForwardSourceCurrent = (run: ActiveFastForward) =>
    authority.current === run.base && history.current === run.timeline && history.current.activeBranchId === run.branchId &&
    saveContextVersion.current === run.context && !browsing.current && !stepInFlight.current;

  useEffect(() => {
    const run = fastForwardRun.current;
    if (run && !isFastForwardSourceCurrent(run)) stopFastForward('原分支已经变化，隔离结果未提交。');
  }, [world, timeline, preview]);

  const startFastForward = (requestedTicks: number, binding: FastForwardPreflightBinding, isVisibleStop: (stop: NonNullable<FastForwardPreflightBinding['stopCondition']>) => boolean) => {
    if (fastForwardRun.current || campaignGuard.current || typeof Worker !== 'function' || stepInFlight.current || browsing.current ||
        !Number.isSafeInteger(requestedTicks) || requestedTicks < 1 || requestedTicks > FAST_FORWARD_CAMPAIGN_MAX_TICKS) return;
    const at = history.current;
    const head = at.branches.find(({id})=>id===at.activeBranchId)?.snapshots.at(-1);
    if (!binding || binding.world !== authority.current || binding.timeline !== at || binding.branchId !== at.activeBranchId ||
        binding.head !== head || binding.count !== requestedTicks || binding.contextVersion !== saveContextVersion.current ||
        binding.scopeKey !== viewScopeKey) {
      setFastForwardView({ phase: 'error', notice: '快进预检已与当前分支不符，请重新预检。当前世界未推进。' });
      return;
    }
    const plan = binding.target && head && planFastForwardCampaign(head.world,String(binding.target.year),String(binding.target.month));
    if (!head || !plan || !plan.ok || plan.months !== requestedTicks || binding.world.year !== head.world.year ||
        binding.world.month !== head.world.month) {
      setFastForwardView({phase:'error',notice:'目标仙历与当前分支年月不符，请重新预检。当前世界未改变。'});
      return;
    }
    if (at.branches.length >= TIMELINE_MAX_BRANCHES) {
      setFastForwardView({ phase: 'error', notice: '分支位已满，未开始快进，也没有删除任何分支。' });
      return;
    }
    if(binding.stopCondition&&!isVisibleStop(binding.stopCondition)){
      setFastForwardView({phase:'error',notice:'停止对象已与当前分支或视角不符，请重新预检。'});
      return;
    }
    if(requestedTicks>FAST_FORWARD_MAX_TICKS||binding.stopCondition){campaign.start(binding);return;}
    let worker: Worker;
    try { worker = new Worker(new URL('../engine/fastForward.worker.ts', import.meta.url), { type: 'module' }); }
    catch { setFastForwardView({ phase: 'error', notice: '浏览器未能启动隔离推演，当前世界未改变。' }); return; }
    const run: ActiveFastForward = {
      id: `fast-forward-${++fastForwardSerial.current}`, base: authority.current, timeline: at,
      branchId: at.activeBranchId, context: saveContextVersion.current, requestedTicks, worker,
    };
    fastForwardRun.current = run;
    setIsRunning(false);
    setFastForwardView({ phase: 'running' });
    const fail = (notice: string) => {
      if (fastForwardRun.current === run) stopFastForward(notice, 'error');
    };
    worker.onerror = () => fail('隔离推演失败，当前世界与原分支未改变。');
    worker.onmessageerror = () => fail('无法读取隔离推演结果，当前世界未改变。');
    worker.onmessage = ({ data }: MessageEvent<FastForwardWorkerResponse>) => {
      const report=classifyFastForwardRunReport(run,data,fastForwardRun.current===run,()=>isFastForwardSourceCurrent(run));
      if(report==='ignored')return;
      if(report==='stale_source'){fail('原分支已经变化，隔离结果未提交。');return;}
      if(report==='invalid_progress'){fail('快进回报与原分支年月不符，当前世界未改变。');return;}
      if (data.type === 'error') { fail(data.message); return; }
      if (data.type === 'cancelled') { stopFastForward('已取消，当前世界不变。'); return; }
      const progress = data.progress;
      run.progress = progress;
      if (data.type === 'staged') {
        run.checkpoint = data.checkpoint;
        run.worker?.terminate();
        run.worker = undefined;
        setFastForwardView({ phase: 'ready', progress: data.progress });
      } else if (data.type === 'paused') {
        setFastForwardView({ phase: 'paused', progress: data.progress });
      } else {
        setFastForwardView((previous) => ({ ...previous, progress: data.progress }));
      }
    };
    const request: FastForwardWorkerRequest = { type: 'start', runId: run.id, base: run.base, requestedTicks };
    try { worker.postMessage(request); }
    catch { fail('无法交给隔离推演处理，当前世界未改变。'); }
  };

  const commandFastForward = (type: 'pause' | 'resume' | 'stage') => {
    const run = fastForwardRun.current;
    if (!run?.worker || !isFastForwardSourceCurrent(run)) return;
    const expected = type === 'pause' ? 'running' : 'paused';
    if (fastForwardView.phase !== expected || (type === 'stage' && !run.progress?.completedTicks)) return;
    setFastForwardView({ phase: type === 'pause' ? 'pausing' : type === 'stage' ? 'staging' : 'running', progress: run.progress });
    const request: FastForwardWorkerRequest = { type, runId: run.id };
    try { run.worker.postMessage(request); }
    catch { stopFastForward('隔离推演已断开，当前世界未改变。', 'error'); }
  };

  const applyFastForward = () => {
    const run = fastForwardRun.current;
    if (!run?.checkpoint || fastForwardView.phase !== 'ready') return;
    if (!isFastForwardSourceCurrent(run)) { stopFastForward('原分支已经变化，暂存结果未提交。', 'error'); return; }
    try {
      const next = forkTimelineCheckpoint(run.timeline, run.branchId, run.base.tick, run.checkpoint);
      const received = readTimelineHead(next);
      if (!received) throw new Error('无法读取已验证检查点。');
      stopFastForward(`已把 ${run.checkpoint.completedTicks} 个完整回合放入新分支；原分支保留。`);
      activateTimeline(next, received);
    } catch {
      stopFastForward('检查点未通过校验或分支位不足，未替换当前世界。', 'error');
    }
  };

  const campaign=useFastForwardCampaign({
    world,timeline,timelineId:saveTimelineId,inspect:inspectCampaign,inPreview:!!preview,guard:campaignGuard,
    isCurrent:(candidate,source)=>authority.current===candidate&&history.current===source&&!browsing.current&&!stepInFlight.current&&!fastForwardRun.current,
    pauseLive:()=>setIsRunning(false),
    openSource:(source)=>{
      replayTapes.current.clear();fairTurns.current.clear();setRestoredReadingOrigin(undefined);
      setSaveTimelineId(source.timelineId);setViewEpoch((prev)=>prev+1);
      activateTimeline(source.timeline,source.world);
    },
    openResult:(next,incoming,sourceTimelineId)=>{
      if(sourceTimelineId){
        replayTapes.current.clear();fairTurns.current.clear();setRestoredReadingOrigin(undefined);
        setSaveTimelineId(sourceTimelineId);setViewEpoch((prev)=>prev+1);
      }
      activateTimeline(next,incoming);
    },
  });
  const campaignPhase:FastForwardPhase = campaign.working?'staging':
    campaign.state?.phase==='checkpointing'||campaign.state?.phase==='cancelling'?'staging':
    campaign.state?.phase==='running'||campaign.state?.phase==='pausing'||campaign.state?.phase==='paused'||campaign.state?.phase==='ready'
      ?campaign.state.phase:'idle';
  const fastForwardLocked = (fastForwardView.phase !== 'idle' && fastForwardView.phase !== 'error')||campaign.active||campaign.working;
  const activeSaveBranch = timeline.branches.find(({ id }) => id === timeline.activeBranchId);
  const sourceBranch: SaveBranchSource | undefined = activeSaveBranch ? {
    branchId: activeSaveBranch.id, label: activeSaveBranch.label, ...(saveTimelineId ? { timelineId: saveTimelineId } : {}),
  } : undefined;
  const viewScopeKey = `${viewEpoch}:${timeline.activeBranchId}:${preview?.tick ?? 'live'}`;
  const compareDecision = (traceId: string, candidateId: string): DecisionReplayResult => {
    const trace = visibleWorld.decisionTrace.records.find(({ id }) => id === traceId);
    const saved = trace && replayTapes.current.get(history.current.activeBranchId)?.get(trace.tick);
    if (!saved) return { ok: false, reason: '原始决策快照不在本分支最近 12 轮的复演缓存中。' };
    return replayOneTurn(saved.tape, saved.committed, traceId, candidateId,
      (base, orders, mode, onActor, replayDraws, replayHeartModelActors, replayForbiddenModelActors, replayGrandSiegeModelActors) =>
        advanceWorldTick(base, orders, undefined, mode, undefined, {
          captureTrace: false, onActor, replayDraws, replayHeartModelActors, replayForbiddenModelActors, replayGrandSiegeModelActors,
        }));
  };
  const toggleAutoplay = () => { if (!fastForwardRun.current && !campaignGuard.current) setIsRunning((current) => !current); };
  const fairModelCoverage=preview?undefined:fairTurns.current.get(timeline.activeBranchId)?.coverage;
  // Consumers check exact sources after awaits, but only the controller may write these references.
  const freshness = {
    authority: observe(authority),history: observe(history),saveContextVersion: observe(saveContextVersion),
    browsing: observe(browsing),stepInFlight: observe(stepInFlight),campaignGuard: observe(campaignGuard),
    fastForwardRun: observe<Readonly<Pick<ActiveFastForward,'id'>>|undefined>(fastForwardRun),
  };
  return {
    ...freshness,
    world,visibleWorld,timeline,saveTimelineId,restoredReadingOrigin,
    viewEpoch,viewScopeKey,sourceBranch,preview,activateTimeline,restoreHistoricalFrame,clearPreview,
    updateWorld,replaceWorld,newWorldFromSeed,canUseSaveContext,archiveCurrentNarrative,handleReset,
    isRunning,setIsRunning,isStepping,tryBeginInteraction,endInteraction,tickIntervalMs,setTickIntervalMs,
    llmConfig,changeLlmConfig,handleStepTick,toggleAutoplay,compareDecision,fairModelCoverage,
    handleTimelinePreview,handleTimelineSelectBranch,handleTimelineFork,timelineNotice,
    fastForwardView,fastForwardLocked,startFastForward,stopFastForward,
    commandFastForward,applyFastForward,campaign,campaignPhase,
  };
}
