import {FastForwardCapacityNotice,campaignFrameBlocksStart} from './FastForwardCapacityNotice';
import { useEffect, useRef, useState } from 'react';
import type { TimelineSnapshot, WorldTimeline } from '../engine/timelineEngine';
import type { WorldState } from '../types/world';
import { FAST_FORWARD_MAX_TICKS } from '../engine/fastForwardEngine';
import { measureSaveCapacity } from '../engine/saveCapacityEngine';
import type { FastForwardProgress } from '../engine/fastForwardEngine';
import { addFastForwardCalendarMonths, planFastForwardCalendar } from '../engine/fastForwardCalendar';
import { FAST_FORWARD_CAMPAIGN_MAX_TICKS, planFastForwardCampaign, type CampaignControllerState } from '../engine/fastForwardCampaignEngine';
import type { ReactNode } from 'react';
import {sameCampaignStopCondition,type CampaignStopCondition} from '../engine/campaignStopCondition';
import {CampaignStopPicker,CampaignStopProgress,findCampaignStopOption,type CampaignStopDraft,type CampaignStopOption} from './CampaignStopPicker';



export interface FastForwardCapacitySource { world: WorldState; contextVersion: number; scopeKey: string }
export interface FastForwardPreflightBinding {
  world: WorldState;
  timeline: WorldTimeline;
  branchId: string;
  head: TimelineSnapshot;
  count: number;
  target?: { year: number; month: number };
  stopCondition?:CampaignStopCondition;
  contextVersion?: number;
  scopeKey?: string;
}
interface FastForwardCapacityReport {
  bytes: number;
  limit: number;
  branches: number;
  snapshots: number;
  uniqueSnapshots: number;
  branchSnapshots: number;
}
type Prepare = { phase: 'measuring'; binding: FastForwardPreflightBinding } |
  { phase: 'measured'; binding: FastForwardPreflightBinding; report: FastForwardCapacityReport } |
  { phase: 'unavailable'; binding: FastForwardPreflightBinding };

export function sameFastForwardBinding(a: FastForwardPreflightBinding, b?: FastForwardPreflightBinding): boolean {
  return !!b && a.world === b.world && a.timeline === b.timeline && a.branchId === b.branchId &&
    a.head === b.head && a.count === b.count && a.target?.year === b.target?.year &&
    a.target?.month === b.target?.month && sameCampaignStopCondition(a.stopCondition,b.stopCondition) && a.contextVersion === b.contextVersion && a.scopeKey === b.scopeKey;
}

export interface FastForwardControls {
  available: boolean;
  phase: 'idle' | 'running' | 'pausing' | 'paused' | 'staging' | 'ready' | 'error';
  progress?: FastForwardProgress;
  notice?: string;
  capacitySource?: FastForwardCapacitySource;
  campaignAvailable?:boolean;
  campaignState?:CampaignControllerState;
  campaignPreparing?:boolean;
  pendingCampaign?:ReactNode;
  campaignNotice?:string;
  campaignStopOptions?:readonly CampaignStopOption[];
  campaignSelectedStop?:{condition:CampaignStopCondition;label?:string};

  onStart: (count: number, binding: FastForwardPreflightBinding) => void;
  onPause: () => void;
  onResume: () => void;
  onStage: () => void;
  onCancel: () => void;
  onApply: () => void;
}

const phaseLabel: Record<FastForwardControls['phase'], string> = {
  idle: '未开始', running: '正在独立推演', pausing: '等待当前一批回合完整结束后暂停', paused: '已暂停',
  staging: '正在核验检查点', ready: '检查点已核验，等待确认', error: '本次快进未能完成',
};
const dateLabel = ({ year, month }: { year: number; month: number }) => `仙历 ${year} 年 ${month} 月`;
const dateError = {
  invalid_date: '请输入有效的目标年和月份（1 至 12 月）。',
  not_future: '目标必须晚于当前分支的仙历。',
  out_of_range: `目标超出单批 ${FAST_FORWARD_MAX_TICKS} 个月的范围。`,
} as const;
const actionBase = 'min-h-11 min-w-0 rounded border border-violet-500/50 bg-violet-950/55 px-2.5 text-violet-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300 disabled:opacity-40';
const action = `${actionBase} text-xs`;

export function FastForwardPanel({ controls, timeline, branchLimit, blocked }: {
  controls: FastForwardControls;
  timeline: WorldTimeline;
  branchLimit: boolean;
  blocked: boolean;
}) {
  const [stopDraft,setStopDraft]=useState<{scope:string;value?:CampaignStopDraft}>();
  const [dateDraft, setDateDraft] = useState<{ scope: string; year: string; month: string }>();
  const [approval, setApproval] = useState<FastForwardProgress | CampaignControllerState>();
  const [preflight, setPreflight] = useState<Prepare>();
  const { available, phase, progress, campaignState, pendingCampaign } = controls;
  const proof = campaignState?.phase==='ready'?campaignState:progress;
  const max=controls.campaignAvailable?FAST_FORWARD_CAMPAIGN_MAX_TICKS:FAST_FORWARD_MAX_TICKS;
  const isActive = phase === 'running' || phase === 'pausing' || phase === 'paused' || phase === 'staging' || phase === 'ready';
  const branch = timeline.branches.find(({ id }) => id === timeline.activeBranchId);
  const head = branch?.snapshots.at(-1);
  const source = controls.capacitySource;
  const dateScope = JSON.stringify([branch?.id, source?.scopeKey]);
  const selectedStop=stopDraft?.scope===dateScope?stopDraft.value:undefined;
  const stopOptions=controls.campaignStopOptions;
  const stop=findCampaignStopOption(stopOptions??[],selectedStop);
  const defaultDate = head && addFastForwardCalendarMonths(head.world, Math.min(12, FAST_FORWARD_MAX_TICKS));
  const date = dateDraft?.scope === dateScope ? dateDraft :
    { year: defaultDate ? String(defaultDate.year) : '', month: defaultDate ? String(defaultDate.month) : '' };
  const datePlan = head && (controls.campaignAvailable ? planFastForwardCampaign : planFastForwardCalendar)(head.world,date.year,date.month);
  const sourceMismatch = !!source && !!head &&
    (source.world.tick !== head.tick || source.world.year !== head.world.year || source.world.month !== head.world.month);
  const mayChoose = available && !branchLimit && !blocked && !isActive && !!head && !sourceMismatch;
  const mayPreview = mayChoose&&!!datePlan?.ok&&(!selectedStop||!!stop&&!!controls.campaignAvailable)&&
    (!pendingCampaign||datePlan.months<=FAST_FORWARD_MAX_TICKS&&!stop);
  const binding = mayPreview && branch && head && datePlan?.ok ? {
    world: source?.world ?? head.world, timeline, branchId: branch.id, head, count: datePlan.months, target: datePlan.target,stopCondition:stop?.condition,
    contextVersion: source?.contextVersion, scopeKey: source?.scopeKey,
  } : undefined;
  const changeDate = (field: 'year' | 'month', value: string) => {
    serial.current++;
    setPreflight(undefined);
    setDateDraft({ scope: dateScope, year: date.year, month: date.month, [field]: value });
  };
  const progressBase = !sourceMismatch && progress && head?.tick === progress.startTick ? head.world : undefined;
  const progressDate = progressBase && progress && addFastForwardCalendarMonths(progressBase, progress.completedTicks);
  const progressTarget = progressBase && progress && addFastForwardCalendarMonths(progressBase, progress.requestedTicks);
  const activeBinding = useRef(binding);
  activeBinding.current = binding;
  const serial = useRef(0);
  const observedBinding = useRef(binding);
  const alreadyStarted = useRef<Prepare>();
  const validPreflight = preflight && sameFastForwardBinding(preflight.binding, binding) ? preflight : undefined;
  const campaignPlan=!!controls.campaignAvailable&&!!datePlan?.ok&&(datePlan.months>FAST_FORWARD_MAX_TICKS||!!stop);
  const mayStart=validPreflight?.phase==='measured'&&!campaignFrameBlocksStart(campaignPlan,validPreflight.report.bytes);
  useEffect(() => {
    return () => { serial.current++; };
  }, []);
  useEffect(() => {
    const previous = observedBinding.current;
    const next = activeBinding.current;
    observedBinding.current = next;
    if (previous ? !sameFastForwardBinding(previous,next) : !!next) {
      serial.current++;
      setPreflight(undefined);
    }
  }, [timeline, head, source?.world, source?.contextVersion, source?.scopeKey, available, date.year, date.month, blocked, branchLimit, isActive, controls.campaignAvailable, pendingCampaign!==undefined, selectedStop?.kind,selectedStop?.targetId,stop?.condition]);
  const measure = async () => {
    const start = activeBinding.current;
    if (!start) return;
    const token = ++serial.current;
    setPreflight({phase:'measuring',binding:start});
    try {
      await Promise.resolve(); // Recheck the exact binding after the preview starts.
      if (token !== serial.current || !sameFastForwardBinding(start,activeBinding.current)) return;
      const capacity = measureSaveCapacity(start.world,start.timeline);
      if (capacity.jsonBytes===null || !capacity.timeline) throw new Error('Capacity measurement unavailable');
      const branchSnapshots = start.timeline.branches.find(({id})=>id===start.branchId)?.snapshots.length ?? 0;
      const report = { bytes:capacity.jsonBytes,limit:capacity.limitBytes,branches:capacity.timeline.branchCount,
        snapshots:capacity.timeline.snapshotReferences,uniqueSnapshots:capacity.timeline.uniqueSnapshots,branchSnapshots };
      if (token === serial.current && sameFastForwardBinding(start,activeBinding.current)) {
        setPreflight({phase:'measured',binding:start,report});
      }
    } catch {
      if (token === serial.current && sameFastForwardBinding(start,activeBinding.current)) {
        setPreflight({phase:'unavailable',binding:start});
      }
    }
  };
  const mayApply = available && !branchLimit && !blocked && phase === 'ready' && !!proof && proof.completedTicks > 0 && !controls.campaignPreparing;
  const approved = mayApply && approval !== undefined && approval === proof;
  useEffect(() => { if (phase !== 'ready') setApproval(undefined); }, [phase]);
  return <details className="min-w-0 rounded border border-violet-400/25 bg-slate-950/55">
    <summary className="min-h-11 cursor-pointer break-words px-2.5 py-2.5 text-xs font-semibold text-violet-100">长局快进与可取消回放</summary>
    <div className="space-y-2 px-2.5 pb-2.5 text-xs leading-relaxed text-slate-300">
      <p>从当前时刻在独立副本推演，单批最多 {FAST_FORWARD_MAX_TICKS} 个月；原分支不变，不调用模型。</p>
      {controls.campaignAvailable && <p>目标最多 {FAST_FORWARD_CAMPAIGN_MAX_TICKS} 个月。超出单批会暂存在本机，只有最终确认才占一个新分支。</p>}
      {pendingCampaign}
      {controls.campaignNotice && <p role="status" className="break-words text-violet-200">{controls.campaignNotice}</p>}
      {!available && <p className="text-amber-200">当前无法启动独立快进（此上下文不可用或浏览器不支持独立推演所需的工作线程）。</p>}
      {branchLimit && <p className="text-amber-200">分支上限已到，暂不能应用新检查点。</p>}
      {blocked && !isActive && <p className="text-amber-200">先返回实时状态并结束其他待确认操作，再开始快进。</p>}
      {sourceMismatch && !blocked && !isActive && <p className="text-amber-200">实时状态与分支最新记录的轮次或日期不一致，暂不能预检。</p>}
      {!isActive && <form className="space-y-1.5" onSubmit={(event) => {
        event.preventDefault();
        if (!mayStart || validPreflight?.phase !== 'measured' || alreadyStarted.current === validPreflight ||
          !sameFastForwardBinding(validPreflight.binding,activeBinding.current)) return;
        alreadyStarted.current = validPreflight;
        const checked = validPreflight.binding;
        setPreflight(undefined);
        controls.onStart(checked.count,checked);
      }}>
        <div className="flex min-w-0 flex-wrap items-end gap-1.5">
        <fieldset className="min-w-0 basis-full">
          <legend className="font-semibold text-slate-100">目标仙历</legend>
          <div className="flex min-w-0 flex-wrap gap-1.5">
            <label className="grid min-w-0 flex-1 basis-32 gap-1">目标年
              <input type="text" inputMode="numeric" maxLength={32} className={`${actionBase} w-full text-base`}
                value={date.year} disabled={!mayChoose}
                onChange={(event) => changeDate('year', event.currentTarget.value)} />
            </label>
            <label className="grid min-w-0 flex-1 basis-24 gap-1">目标月
              <input type="text" inputMode="numeric" maxLength={32} className={`${actionBase} w-full text-base`}
                value={date.month} disabled={!mayChoose}
                onChange={(event) => changeDate('month', event.currentTarget.value)} />
            </label>
          </div>
          {head && <p className="mt-1">当前分支：{dateLabel(head.world)}。</p>}
          {datePlan && <p role="status" className={datePlan.ok ? 'text-violet-100' : 'text-amber-200'}>
            {datePlan.ok ? `预计推演 ${datePlan.months} 个月，抵达${dateLabel(datePlan.target)}。` :
              datePlan.reason==='out_of_range' && controls.campaignAvailable ? `目标超出 ${max} 个月的长局范围。` : dateError[datePlan.reason]}
          </p>}
        </fieldset>
        {stopOptions && controls.campaignAvailable && <CampaignStopPicker options={stopOptions} value={selectedStop} disabled={!mayChoose}
          onChange={value=>{serial.current++;setPreflight(undefined);setStopDraft({scope:dateScope,value});}} />}
        {pendingCampaign && datePlan?.ok && (datePlan.months>FAST_FORWARD_MAX_TICKS||stop) &&
          <p className="text-amber-200">先续跑或丢弃现有的本地长局候选，再开启另一个。</p>}
        <button type="button" className={action} disabled={!mayPreview || validPreflight?.phase==='measuring'}
          onClick={() => void measure()}>预检文件与快照</button>
        <button type="submit" className={action} disabled={!mayStart}>开始独立快进</button>
        </div>
        {validPreflight?.phase==='measuring' && <p role="status">正在本机读取当前世界的存档大小，尚未开始推演。</p>}
        {validPreflight?.phase==='unavailable' && <p role="status" className="text-amber-200">本次未能测出当前存档大小；可以重新预检，未开始推演。</p>}
        {validPreflight?.phase==='measured' && <div aria-label="本次快进容量预检" className="space-y-1 rounded border border-slate-800 p-2">
          <p>预检来源：当前分支 Tick #{validPreflight.binding.head.tick}，拟推演 {validPreflight.binding.count} 个月
            {validPreflight.binding.target && `，目标${dateLabel(validPreflight.binding.target)}`}。</p>
          <p>单个世界 JSON 导出：{validPreflight.report.bytes} 字节（UTF-8）。文件上限 {validPreflight.report.limit} 字节（8 MiB）。</p>
          <p>当前时间线：{validPreflight.report.branches} 条分支合计 {validPreflight.report.snapshots} 个快照引用（{validPreflight.report.uniqueSnapshots} 份不同快照），当前分支 {validPreflight.report.branchSnapshots} 份。</p>
          <FastForwardCapacityNotice campaign={campaignPlan} currentBytes={validPreflight.report.bytes} ordinaryLimit={validPreflight.report.limit}/>
        </div>}
      </form>}
      {phase !== 'idle' && <p role="status" className="font-medium text-violet-200">{phaseLabel[phase]}{controls.notice && ` · ${controls.notice}`}</p>}
      {phase === 'idle' && controls.notice && <p role="status" className="text-violet-200">{controls.notice}</p>}
      {progress && <div className="min-w-0 space-y-1 rounded border border-slate-800 p-2">
        <p>已完成 {progress.completedTicks} / {progress.requestedTicks} 个月 · Tick #{progress.startTick} → #{progress.currentTick}</p>
        {progressDate && progressTarget && <p>副本已到{dateLabel(progressDate)} · 本批目标{dateLabel(progressTarget)}。</p>}
        <progress className="h-2 w-full accent-violet-400" aria-label="已经完成的独立推演月份" max={progress.requestedTicks} value={progress.completedTicks} />
        <p>当前副本：在世 {progress.living} 人 · 全部角色记录 {progress.totalActors} 人</p>
      </div>}
      {campaignState && <div className="min-w-0 space-y-1 rounded border border-slate-800 p-2">
        <p>候选已推进到{dateLabel(campaignState.currentDate)} · {campaignState.completedTicks}/{campaignState.requestedTicks} 月。</p>
        <p>已核验并落档：{dateLabel(campaignState.durableDate)} · {campaignState.durableTicks} 月。关页后从此处续跑。</p>
        <CampaignStopProgress chosen={controls.campaignSelectedStop} outcome={campaignState.stopReceipt?
          {status:'stopped',receipt:campaignState.stopReceipt}:
          campaignState.phase==='ready'&&controls.campaignSelectedStop?{status:'reached_target'}:undefined} />
        <progress className="h-2 w-full accent-violet-400" aria-label="长局候选已持久保存的月份"
          max={campaignState.requestedTicks} value={campaignState.durableTicks} />
      </div>}
      {isActive && <div className="flex flex-wrap gap-1.5">
        {phase === 'running' && <button type="button" className={action} onClick={controls.onPause}>暂停快进</button>}
        {phase === 'paused' && <>
          <button type="button" className={action} onClick={controls.onResume}>继续快进</button>
          {!campaignState && <button type="button" className={action} disabled={!progress?.completedTicks || blocked} onClick={controls.onStage}>核验已完成的检查点</button>}
        </>}
        {phase === 'ready' && !approved && <button type="button" className={action} disabled={!mayApply} onClick={() => setApproval(proof)}>准备应用到新分支</button>}
        <button type="button" className={action} disabled={controls.campaignPreparing&&!!campaignState}
          onClick={() => { setApproval(undefined); controls.onCancel(); }}>
          {controls.campaignPreparing&&!campaignState?'取消本次核验':'取消并丢弃快进结果'}</button>
      </div>}
      {approved && <section aria-label="确认应用独立检查点" className="space-y-1.5 rounded border border-amber-500/60 bg-amber-950/50 p-2 text-amber-100">
        <p>以已核验的 {'currentTick' in approval ? `Tick #${approval.currentTick}` : dateLabel(approval.durableDate)} 创建并进入新分支？应用前会再次校验，原分支保持不变。</p>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={action} onClick={() => { if (approved) { setApproval(undefined); controls.onApply(); } }}>确认创建并进入新分支</button>
          <button type="button" className={action} onClick={() => setApproval(undefined)}>返回核对</button>
        </div>
      </section>}
    </div>
  </details>;
}
