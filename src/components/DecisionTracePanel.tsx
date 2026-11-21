import { useId, useState } from 'react';
import type { DecisionReplayComparison, DecisionReplayResult } from '../engine/decisionTraceEngine';
import { knownMapLocations } from '../engine/terrainEngine';
import type { ActionType, Cultivator, DecisionTraceCandidate, DecisionTraceRecord, WorldState } from '../types/world';

const ACTION_LABELS: Record<ActionType, string> = {
  CULTIVATE: '修炼', BREAKTHROUGH: '突破', EXPLORE: '探索', SOCIALIZE: '交谈', DUEL: '比斗',
  SCHEMING: '筹谋', PURSUE_SCHEME: '执行密谋', AUTHOR_TECHNIQUE: '著录功法', STUDY_TECHNIQUE: '参悟功法',
  TEACH: '传法授业', ACCEPT_TUITION: '接受传法', DECLINE_TUITION: '婉拒传法', OFFER_OATH: '提出契约',
  ACCEPT_OATH: '接受契约', DECLINE_OATH: '拒绝契约', FULFILL_OATH: '履约', APPEAL_OATH: '契约申诉',
  PLACE_MARKET_BUY: '坊市求购', PLACE_MARKET_SELL: '坊市出售', CANCEL_MARKET_ORDER: '撤回挂单',
  VILLAGE_CENSUS: '坊籍核点', ROAD: '驿路修缮', PROBATION: '赎责见习', RELIC_EXHIBIT: '古器陈列', WORKSHOP: '工坊委制', TERRAIN_RECOVERY: '地脉修复', SHARED_COMMONS: '灵地公域', SECT_SERVICE: '本人退居或恢复公职资格', SEALED_COURIER: '封信委托或本人回应', VILLAGE_WORKS: '实付资材助建村镇', HOUSEHOLD_GUARDIAN: '提议、同意或结束自愿监护', TERRITORIAL_LEASE: '议地契、承租或交回采集许可', FORMATION_NETWORK: '联阵、调拨、取用或修复', INFIRMARY: '排队求治、同意、拒绝或值守', HABITAT: '复育栖地、放归或记录复见', CHRONICLE_ERRATA: '编录异闻或核对公开史料', PILGRIMAGE: '邀约、同行或就地援护', SECT_CREDIT: '商议宗门借还或偿付', SANCTUARY: '设立避难、领票或修缮', RESEARCH: '提议、参与或退出共研', CEASEFIRE: '议定停战或提出毁约', ESCORT: '商路请镖、护送或报险', RANK_SEASON: '报名或退出赛季', SCRIPTURE: '批注、校勘或研习版本', RELIC: '采回碎片或重铸古器', RECOLLECT: '审视或搁置残响', RELOCATE: '议决或护送迁宗', DOCTRINE: '参与道统事务', RECRUIT_SETTLER: '招募自愿者', DELIVER_RELIEF: '赈济村镇', FILE_WITNESS_CLAIM: '提出指证',
  ATTEST_WITNESS: '提交亲历证词', CHALLENGE_WITNESS: '质疑指证', NAME_HEIR: '指定继承人',
  CLAIM_ESTATE: '申领遗产', HOLD_MEMORIAL: '主持祭礼', GATHER_HERBS: '采集灵草', BREW_PILL: '炼丹',
  USE_PILL: '服丹', FORGE_ARTIFACT: '铸器', BIND_ARTIFACT: '绑定法器', REPAIR_ARTIFACT: '修补法器',
  AWAKEN_ARTIFACT: '唤醒器灵', FACE_TRIBULATION: '迎战天劫', AMBUSH_TRIBULATION: '干扰渡劫',
  CHALLENGE_LEADERSHIP: '挑战掌门', PLOT_COUP: '争夺掌门之位', BUILD_FACILITY: '营建宗门设施',
  DISPATCH_GUARD: '派遣守卫', GUARD_DUTY: '履行守卫职责', OFFER_ALLIANCE: '提议结盟', DECLARE_WAR: '宣战',
  DEMAND_TRIBUTE: '索取贡礼', LAUNCH_SIEGE: '发起围攻', JOIN_OCCASION: '参加盛会', PURSUE_BOUNTY: '追查悬赏',
  TAME_BEAST: '驯养灵兽', TRADE: '交易', DUAL_CULTIVATE: '共同修炼', SECT_DIPLOMACY: '宗门交涉', REST: '调息',
};

const REASONS: Record<DecisionTraceCandidate['reason'], string> = {
  recover: '恢复体力', cultivate: '积累修为', ready: '满足突破条件', social: '就近交流',
  travel: '考察已知地点', tribulation: '应对当前天劫',
};
const SOURCES: Record<DecisionTraceRecord['source'], string> = { utility: '本地规则', model: '模型选项', avatar: '附身指令' };
const STANCES = { guard: '守御', focus: '凝神', defy: '逆劫' };
const field = 'min-w-0 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 disabled:opacity-50';

type Replay = DecisionReplayResult;
export interface DecisionTracePanelProps {
  world: WorldState;
  cultivator: Cultivator | undefined;
  onReplay?: (traceId: string, candidateId: string) => Replay | Promise<Replay>;
  busy?: boolean;
  historical?: boolean;
}

export function DecisionTracePanel({ world, cultivator, onReplay, busy = false, historical = false }: DecisionTracePanelProps) {
  const viewer = world.cultivators.find(({ id }) => id === cultivator?.id);
  const records = (world.decisionTrace?.records ?? []).filter(({ actorId, tick }) => viewer && actorId === viewer.id && tick <= world.tick)
    .sort((a, b) => b.tick - a.tick || a.id.localeCompare(b.id)).slice(0, 12);
  const group = useId();
  const [choice, setChoice] = useState<{ actorId: string; traceId: string; candidateId: string }>();
  const [reading, setReading] = useState<{ world: WorldState; traceId: string; candidateId: string; result?: Replay }>();
  const trace = records.find(({ id, actorId }) => id === choice?.traceId && actorId === choice.actorId) ?? records[0];
  // Applied private/unsupported actions have no replayable public baseline.
  const alt = trace?.applied && trace.source !== 'avatar' && trace.chosenCandidateId ? trace.candidates.filter(({ id }) => id !== trace.chosenCandidateId) : [];
  const selected = trace?.id === choice?.traceId ? alt.find(({ id }) => id === choice?.candidateId) : undefined;
  const current = reading?.world === world && reading.traceId === trace?.id && reading.candidateId === selected?.id ? reading : undefined;
  const locations = new Map(viewer ? knownMapLocations(world, viewer).map(({ id, name }) => [id, name]) : []);
  const localActors = new Map(viewer ? world.cultivators.filter(({ locationId }) => locationId === viewer.locationId)
    .map(({ id, name }) => [id, name]) : []);
  const candidateCaption = (candidate: DecisionTraceCandidate) => {
    const details = [ACTION_LABELS[candidate.action], candidate.targetLocationId ? locations.get(candidate.targetLocationId) ?? '地点未公开' : undefined,
      candidate.targetCultivatorId ? localActors.get(candidate.targetCultivatorId) ?? '对象未公开' : undefined,
      candidate.tribulationStance ? STANCES[candidate.tribulationStance] : undefined];
    return details.filter(Boolean).join(' · ');
  };
  const blocked = busy || Boolean(current && !current.result);

  return (
    <section className="min-w-0 space-y-2 rounded-xl border border-violet-400/25 bg-slate-900/70 p-3 text-slate-100 sm:p-4" aria-label="天机溯因与假设复盘">
      <header className="space-y-1">
        <h3 className="text-sm font-semibold text-violet-100">天机溯因与假设复盘</h3>
        <p className="break-words text-xs text-slate-300">{viewer ? `${viewer.name}最近 ${records.length} 条已提交决策` : '选中修士后查看已提交决策。'}</p>
        <p className="text-xs text-slate-400">评分是本地规则对当时合法选项的估值，并非模型评分或私人思绪。未公开的决策不展示内容。</p>
      </header>
      {!trace ? <p className="text-xs text-slate-400">暂无可阅轨迹。</p> : (
        <>
          <label className="block text-xs text-slate-300" htmlFor={`${group}-trace`}>提交记录</label>
          <select id={`${group}-trace`} className={field} value={trace.id} onChange={(event) => {
            const record = records.find(({ id }) => id === event.target.value);
            if (record) setChoice({ actorId: record.actorId, traceId: record.id, candidateId: '' });
          }}>
            {records.map((record) => <option value={record.id} key={record.id}>Tick #{record.tick} · {SOURCES[record.source]} · {record.chosenAction === 'redacted' ? '未公开行动' : ACTION_LABELS[record.chosenAction]}</option>)}
          </select>
          <p className="text-xs text-slate-300">来源：{SOURCES[trace.source]} · {trace.applied ? '动作已应用' : '动作未应用'}</p>
          <div className="space-y-1 border-t border-slate-800 pt-2">
            <h4 className="text-xs font-semibold text-violet-100">当时合法候选与公开理由</h4>
            {trace.candidates.length === 0 ? <p className="text-xs text-slate-400">无可公开候选。</p> : (
              <ul className="max-h-44 space-y-1 overflow-y-auto text-xs text-slate-300">
                {trace.candidates.map((candidate) => <li key={candidate.id} className="break-words rounded bg-slate-950/60 p-1.5">
                  <span>{candidateCaption(candidate)} · 效用 {candidate.score.toFixed(2)} · {REASONS[candidate.reason]}</span>
                  {candidate.id === trace.chosenCandidateId && <span className="font-semibold text-violet-200"> · 当时所选</span>}
                </li>)}
              </ul>
            )}
          </div>
          <div className="space-y-2 border-t border-slate-800 pt-2">
            <h4 className="text-xs font-semibold text-violet-100">单回合对照</h4>
            <p className="text-xs text-slate-400">{historical ? '当前是只读历史。' : ''}假设复盘在隔离副本上运行，不保存分支，不改写原时间线。仅会话中留有复盘底稿的回合可用。</p>
            {!alt.length || !onReplay ? <p className="text-xs text-slate-400">{alt.length ? '此处没有可用的回放入口。' : '此记录没有可复盘的公开替代动作。'}</p> : (
              <>
                <label className="block text-xs text-slate-300" htmlFor={`${group}-alternate`}>合法替代动作</label>
                <select id={`${group}-alternate`} className={field} value={selected ? String(alt.indexOf(selected)) : ''} disabled={blocked} onChange={(event) => {
                  setChoice({ actorId: trace.actorId, traceId: trace.id, candidateId: event.target.value === '' ? '' : alt[Number(event.target.value)]?.id ?? '' });
                }}>
                  <option value="">请明确选择一项</option>
                  {alt.map((candidate, index) => <option key={candidate.id} value={index}>候选 {index + 1} · {candidateCaption(candidate)}</option>)}
                </select>
                <button type="button" disabled={!selected || blocked} className="rounded border border-violet-500/40 bg-violet-950/50 px-2 py-1.5 text-xs text-violet-100 disabled:opacity-40"
                  onClick={async () => {
                    if (!selected || blocked) return;
                    const pending = { world, traceId: trace.id, candidateId: selected.id };
                    setReading(pending);
                    try {
                      const result = await onReplay(trace.id, selected.id);
                      setReading((saved) => saved === pending ? { ...pending, result } : saved);
                    } catch {
                      setReading((saved) => saved === pending ? { ...pending, result: { ok: false, reason: '无法完成隔离复盘。' } } : saved);
                    }
                  }}>
                  {current && !current.result ? '复盘进行中…' : '运行单回合复盘'}
                </button>
                <div aria-live="polite">
                  {current?.result && (current.result.ok ? <DecisionComparisonView comparison={current.result.comparison} />
                    : <p className="break-words text-xs text-amber-200">{current.result.reason}</p>)}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}

const scoreText = (value: number): string => Number.isInteger(value) ? String(value) : value.toFixed(2);

export function DecisionComparisonView({ comparison }: { comparison: DecisionReplayComparison }) {
  const a = comparison.baseline;
  const b = comparison.alternate;
  const realm = (value: typeof a) => `${value.realm}${value.realmStage} 层`;
  const delta = (first: number, second: number, unit = '') => {
    const difference = second - first;
    return Math.abs(difference) < 0.005 ? '无变化' : `${difference > 0 ? '+' : ''}${scoreText(difference)}${unit}`;
  };
  const change = (first: string, second: string) => first === second ? '无变化' : '有变化';
  const life = (alive: boolean) => alive ? '在世' : '陨落';
  const rows = [
    ['修士状态', life(a.alive), life(b.alive), change(life(a.alive), life(b.alive))],
    ['体力', scoreText(a.hp), scoreText(b.hp), delta(a.hp, b.hp)],
    ['修为进度', `${scoreText(a.qiProgress)}%`, `${scoreText(b.qiProgress)}%`, delta(a.qiProgress, b.qiProgress, ' 个百分点')],
    ['境界', realm(a), realm(b), change(realm(a), realm(b))],
    ['在世修士', String(a.livingCount), String(b.livingCount), delta(a.livingCount, b.livingCount)],
    ['公开事件', String(a.publicEventCount), String(b.publicEventCount), delta(a.publicEventCount, b.publicEventCount)],
  ];
  return (
    <div className="mt-2 overflow-x-auto rounded border border-violet-500/25 bg-slate-950 p-2">
      <table className="w-full text-left text-xs text-slate-200">
        <caption className="mb-1 text-left font-semibold text-violet-100">Tick #{comparison.tick} 单回合结果（未保存）</caption>
        <thead><tr className="border-b border-slate-800 text-slate-400">
          <th scope="col" className="pr-2">观察项</th><th scope="col" className="pr-2">原行动</th>
          <th scope="col" className="pr-2">替代行动</th><th scope="col">差异</th>
        </tr></thead>
        <tbody>{rows.map(([metric, baseline, alternate, difference]) => (
          <tr key={metric} className="border-b border-slate-900">
            <th scope="row" className="py-1 pr-2 font-medium">{metric}</th><td className="pr-2">{baseline}</td>
            <td className="pr-2">{alternate}</td><td>{difference}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
