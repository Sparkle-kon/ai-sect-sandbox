import { useEffect, useRef, useState } from 'react';
import type { AvatarInteractionRequest, WorldState } from '../types/world';
import {
  activeAvatar, availableAvatarHosts, availableAvatarInteractions, avatarInteractionCost,
  AVATAR_MESSAGE_LIMIT, AVATAR_ORDER_COST, AVATAR_POSSESSION_COST,
} from '../engine/avatarEngine';

type Mode = AvatarInteractionRequest['mode'];
type Intent = AvatarInteractionRequest['intent'];
type PrivateRecord = WorldState['playerAvatar']['transcript'][number];
type Order = 'REST' | 'CULTIVATE';

const MODE_LABELS: Record<Mode, string> = { avatar: '夺舍接触', ring: '古戒私语' };
const INTENT_LABELS: Record<Intent, string> = { guide: '指引', persuade: '劝服', deceive: '欺骗', interrogate: '审问', recruit: '招募' };
const OUTCOME_LABELS: Record<PrivateRecord['outcome'], string> = { agreed: '同意', resisted: '抗拒', revealed: '吐露', recruited: '接受招募' };
const ORDER_LABELS: Record<Order, string> = { REST: '调息', CULTIVATE: '修炼' };
const controlClass = 'rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 disabled:opacity-40';
const buttonClass = 'rounded border border-violet-500/50 bg-violet-900/40 px-2 py-1.5 text-xs text-violet-100 disabled:opacity-40';
const cleanDraft = (message: string) => message.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();

export interface PossessionPanelProps {
  world: WorldState;
  selectedCultivatorId: string | null;
  busy: boolean;
  modelReady: boolean;
  onPossess: (actorId: string | null) => void;
  onOrder: (action: Order) => void;
  onSpeak: (request: AvatarInteractionRequest) => void;
  notice?: string | null;
}

export function PossessionPanel({ world, selectedCultivatorId, busy, modelReady, onPossess, onOrder, onSpeak, notice }: PossessionPanelProps) {
  const [mode, setMode] = useState<Mode>('ring');
  const [targetSelection, setTargetSelection] = useState<Partial<Record<Mode, string>>>({});
  const [chosenIntent, setChosenIntent] = useState<Intent>();
  const [draft, setDraft] = useState('');
  const pending = useRef<{ request: AvatarInteractionRequest; existingIds: Set<string> }>();
  const avatar = activeAvatar(world);
  const current = world.playerAvatar;
  const queued = current.pendingOrder;
  const canOrder = Boolean(avatar && !queued && current.essence >= AVATAR_ORDER_COST &&
    (current.possessionUntilTick ?? 0) > world.tick + 1);
  const selectedHost = availableAvatarHosts(world).find(({ id }) => id === selectedCultivatorId);
  const selectedActor = world.cultivators.find(({ id }) => id === selectedCultivatorId);
  const options = availableAvatarInteractions(world, mode);
  const targets = [...new Set(options.map(({ targetCultivatorId }) => targetCultivatorId))];
  const requestedTarget = targetSelection[mode];
  const targetId = requestedTarget ?? (targets.includes(selectedCultivatorId ?? '') ? selectedCultivatorId ?? '' : targets[0] ?? '');
  const validTarget = targets.includes(targetId);
  const intents = options.filter((option) => option.targetCultivatorId === targetId).map((option) => option.intent);
  const intent = chosenIntent === undefined ? intents[0] : intents.find((candidate) => candidate === chosenIntent);
  const names = new Map(world.cultivators.map(({ id, name }) => [id, name]));
  const name = (id: string) => names.get(id) ?? '修士未详';
  const history = current.transcript.filter((record) => record.mode === mode && (!targetId || targetId === record.targetCultivatorId));
  const message = cleanDraft(draft);
  const canSend = validTarget && intent !== undefined && message.length > 0 && message.length <= AVATAR_MESSAGE_LIMIT && !busy;

  useEffect(() => {
    const waiting = pending.current;
    if (!waiting) return;
    const receipt = current.transcript.find((entry) => !waiting.existingIds.has(entry.id) &&
      entry.targetCultivatorId === waiting.request.targetCultivatorId && entry.mode === waiting.request.mode &&
      entry.intent === waiting.request.intent && entry.message === waiting.request.message);
    if (receipt) {
      pending.current = undefined;
      setDraft((value) => cleanDraft(value) === waiting.request.message ? '' : value);
    }
  }, [current.transcript]);

  return (
    <section className="min-w-0 space-y-3 rounded-xl border border-violet-500/30 bg-slate-900/70 p-3 text-slate-100 sm:p-4" aria-label="玩家化身与古戒">
      <header>
        <h3 className="text-sm font-semibold text-violet-100">玩家化身与古戒</h3>
        <p className="text-xs text-slate-400">夺舍后可安排一个月的行动，或通过古戒与修士私谈。</p>
      </header>
      <div className="space-y-2 rounded border border-slate-800 bg-slate-950/60 p-2">
        <p className="break-words text-xs text-slate-300">
          当前宿主：{avatar?.name ?? '未附身'} · 神识余力 {current.essence}
          {avatar && current.possessionUntilTick !== undefined ? ` · 至 Tick #${current.possessionUntilTick}` : ''}
          {current.switchAvailableTick > world.tick ? ` · 换身冷却至 Tick #${current.switchAvailableTick}` : ''}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={buttonClass} disabled={busy || !selectedHost || selectedHost.id === avatar?.id}
            onClick={() => { if (selectedHost) onPossess(selectedHost.id); }}>
            {selectedActor ? `附身：${selectedActor.name}（${AVATAR_POSSESSION_COST} 神识）` : '选中修士后可附身'}
          </button>
          {avatar && (
            <>
              <button type="button" className={controlClass} disabled={busy} onClick={() => onPossess(null)}>离开宿主</button>
              {(['REST', 'CULTIVATE'] as const).map((action) => (
                <button key={action} type="button" className={controlClass} disabled={busy || !canOrder}
                  onClick={() => onOrder(action)}>安排下月{ORDER_LABELS[action]}（{AVATAR_ORDER_COST} 神识）</button>
              ))}
            </>
          )}
        </div>
        {queued && <p className="text-xs text-violet-200">已排定：{name(queued.actorId)}于 Tick #{queued.queuedTick + 1}{queued.action==='FRONTIER' ? '复核此身实际可走的山关一步' : queued.action==='FRONTIER_PRODUCTION' ? '复核此处实际作业' : queued.action==='FRONTIER_TRADE' ? '复核当面落笔或在地实装' : queued.action==='FRONTIER_PORT' ? '复核此处港务与实际泊船条件' : queued.action==='FRONTIER_PORT_TRADE' ? '复核海陆货约与当事人实际在场' : queued.action==='FRONTIER_DRYLAND' ? '复核眼下水、牧与阵材' : queued.action==='FRONTIER_DRYLAND_TRADE' ? '复核当事人和双边原货' : queued.action==='SCRIBE_COMMISSION' ? '复核本人稿约与现地原卷' : queued.action==='DISASTER_SHELTER' ? '核对原户代表与实路避灾' : queued.action==='CRAFT_TRAINING' ? '核对本人工序与合练原料' : queued.action==='WAYPOST_MEAL' ? '核对原同行人与山驿分茶' : queued.action==='WORKSHOP_ESTATE' ? '复核原工坊承接与同一首坯' : queued.action==='WORKSHOP_RELEASE' ? '核办本人原签的停作余件' : queued.action === 'NORTH_GATE_RENEWAL' ? '核验并执行本人排定的重开选择' : queued.action==='UPPER_ARRAY_FIELD' ? '复核阵原相邻实址与本人资格' : queued.action==='UPPER_ARRAY_FIELD_LOCAL' ? '复核已到阵位的实际耗材' : queued.action==='UPPER_ARRAY_FIELD_TRADE' ? '复核井与阵原之间的原货约' : queued.action === 'UPPER_PASSAGE' ? '核验并执行本人排定的界路选择' : queued.action === 'NORTH_WELL_REVIEW' ? '核验并执行本人排定的旧井复核' : queued.action === 'NORTH_MINING_CHARTER' ? '核验并执行本人排定的采契选择' : queued.action === 'WATER_VEIN' ? '核验并执行排定的北脉水线选择' : queued.action === 'SALVAGE_ARTIFACT' ? '复核已登记的破器拆解' : queued.action==='DANXIA_MEDICINE' ? '复核实际留药与护送选择' : queued.action==='DANXIA_REVIEW' ? '复核原药约的次季选择' : queued.action==='DOCTRINE_FOUNDING' ? '复核另立宗门的合法选择' : queued.action==='DOCTRINE_MATURITY' ? '复核道统并宗的合法选择' : ORDER_LABELS[queued.action]}。</p>}
      </div>
      <div role="group" aria-label="交谈方式" className="flex flex-wrap gap-1.5">
        {(['ring', 'avatar'] as const).map((kind) => (
          <button key={kind} type="button" aria-pressed={mode === kind} disabled={busy}
            onClick={() => { setMode(kind); setChosenIntent(undefined); }} className={mode === kind ? buttonClass : controlClass}>
            {MODE_LABELS[kind]}
          </button>
        ))}
      </div>
      <form className="space-y-2" aria-label="私密交谈" aria-busy={busy} onSubmit={(event) => {
        event.preventDefault();
        if (!canSend || !intent) return;
        const request: AvatarInteractionRequest = { mode, intent, targetCultivatorId: targetId, message };
        setTargetSelection((selection) => ({ ...selection, [mode]: targetId }));
        pending.current = { request, existingIds: new Set(current.transcript.map(({ id }) => id)) };
        onSpeak(request);
      }}>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid min-w-0 gap-1 text-xs text-slate-300">对话对象
            <select className={controlClass} value={validTarget ? targetId : ''} disabled={busy || targets.length === 0}
              onChange={(event) => { setTargetSelection({ ...targetSelection, [mode]: event.currentTarget.value }); setChosenIntent(undefined); }}>
              {!validTarget && <option value="">当前无可用对象或需重新选择</option>}
              {targets.map((id) => <option key={id} value={id}>{name(id)}</option>)}
            </select>
          </label>
          <label className="grid min-w-0 gap-1 text-xs text-slate-300">交谈意图
            <select className={controlClass} value={intent ?? ''} disabled={busy || intents.length === 0}
              onChange={(event) => setChosenIntent(intents.find((kind) => kind === event.currentTarget.value))}>
              {!intent && <option value="">请选择可用意图</option>}
              {intents.map((kind) => <option key={kind} value={kind}>{INTENT_LABELS[kind]}（{avatarInteractionCost(mode, kind)} 神识）</option>)}
            </select>
          </label>
        </div>
        <label className="grid gap-1 text-xs text-slate-300">
          要说的话（{draft.length}/{AVATAR_MESSAGE_LIMIT} 字符）
          <textarea rows={3} maxLength={AVATAR_MESSAGE_LIMIT} value={draft} readOnly={busy}
            onChange={(event) => setDraft(event.currentTarget.value)} className={`${controlClass} w-full resize-y`} />
        </label>
        <p className="text-xs leading-relaxed text-slate-400">
          交谈原文不进入公开编年史或藏书阁。{modelReady
            ? '点击发送时，可能将本次消息与公开情境发送给已配置的模型服务，不附带以往私谈或秘密目标。'
            : '当前使用本地规则脑，不发送模型请求。'}
        </p>
        <button type="submit" className={buttonClass} disabled={!canSend}>
          {busy ? '处理中…' : validTarget ? `发送给${name(targetId)}` : '发送私密消息'}
        </button>
        {notice && <p role="status" className="break-words text-xs text-amber-200">{notice}</p>}
      </form>
      <details className="rounded border border-slate-800 bg-slate-950/60 px-2 py-1.5">
        <summary className="cursor-pointer text-xs font-semibold text-violet-100">此视角的私密交谈记录 · {history.length} 条</summary>
        {history.length === 0 ? <p className="mt-1 text-xs text-slate-400">还没有已结算的私谈。</p> : (
          <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto">
            {history.slice().sort((a, b) => b.tick - a.tick).map((entry) => (
              <li key={entry.id} className="space-y-1 rounded bg-slate-900/90 p-2 text-xs leading-relaxed text-slate-200">
                <p className="text-slate-400">Tick #{entry.tick} · {entry.actorId ? `${name(entry.actorId)} → ` : ''}
                  {name(entry.targetCultivatorId)} · {INTENT_LABELS[entry.intent]} · {OUTCOME_LABELS[entry.outcome]}
                </p>
                <p className="break-words whitespace-pre-wrap"><span className="text-violet-200">所言：</span>{entry.message}</p>
                <p className="break-words whitespace-pre-wrap"><span className="text-violet-200">回复：</span>{entry.reply}</p>
                <p className="break-words text-slate-400">{entry.source === 'llm' ? '模型润色回复' : '规则脑回复'} · {entry.effect}</p>
              </li>
            ))}
          </ul>
        )}
      </details>
    </section>
  );
}
