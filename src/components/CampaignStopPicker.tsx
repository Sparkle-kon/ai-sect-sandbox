import { useId } from 'react';
import type { CampaignStopCondition, CampaignStopReceipt } from '../engine/campaignStopCondition';

type Kind = CampaignStopCondition['kind'];
export interface CampaignStopOption { condition: CampaignStopCondition; label: string }
export interface CampaignStopDraft { kind: Kind; targetId?: string }
export type CampaignStopOutcome = { status: 'stopped'; receipt: CampaignStopReceipt } |
  { status: 'reached_target' | 'condition_unavailable' };

const LABEL: Record<Kind, string> = {
  sect_leader_changed: '宗门更换掌门',
  actor_died: '修士陨落',
  site_owner_changed: '地点易主',
};
const KINDS = Object.keys(LABEL) as Kind[];
const action = 'min-h-11 min-w-0 w-full rounded border border-violet-500/35 bg-slate-950 px-2 text-base text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300 disabled:opacity-55';

export function campaignStopTargetId(value: CampaignStopCondition | CampaignStopReceipt): string {
  return value.kind === 'sect_leader_changed' ? value.sectId : value.kind === 'actor_died' ? value.actorId : value.siteId;
}

export function findCampaignStopOption(options: readonly CampaignStopOption[], draft?: CampaignStopDraft): CampaignStopOption | undefined {
  if (!draft?.targetId) return undefined;
  const matches = options.filter(({ condition }) => condition.kind === draft.kind && campaignStopTargetId(condition) === draft.targetId);
  return matches.length === 1 ? matches[0] : undefined;
}

export function CampaignStopPicker({ options, value, disabled = false, onChange }: {
  options: readonly CampaignStopOption[];
  value?: CampaignStopDraft;
  disabled?: boolean;
  onChange: (value: CampaignStopDraft | undefined) => void;
}) {
  const helpId = useId();
  if (!options.length && !value) return null;
  const visible = value ? options.filter(({ condition }) => condition.kind === value.kind) : [];
  const selected = findCampaignStopOption(visible, value);
  const selectedOrdinal = selected ? visible.indexOf(selected) : -1;
  return (
    <details className="min-w-0 rounded border border-violet-400/25">
      <summary className="min-h-11 cursor-pointer px-2 py-2.5 text-xs font-semibold text-violet-100 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300">
        遇见变化就停（可选）
      </summary>
      <div className="space-y-1.5 px-2 pb-2 text-xs leading-relaxed text-slate-300">
        <p id={helpId}>最多指定一件事；只在本次目标日期之前或当月生效。</p>
        <div className="grid min-w-0 gap-1.5 sm:grid-cols-2">
          <label className="grid min-w-0 gap-1">停止条件
            <select className={action} aria-describedby={helpId} value={value?.kind ?? ''} disabled={disabled}
              onChange={(event) => {
                const next = KINDS.find((kind) => kind === event.currentTarget.value);
                if (!next || options.some(({ condition }) => condition.kind === next)) onChange(next ? { kind: next } : undefined);
              }}>
              <option value="">不设停止条件</option>
              {KINDS.map((kind) => <option key={kind} value={kind}
                disabled={!options.some(({ condition }) => condition.kind === kind)}>{LABEL[kind]}</option>)}
            </select>
          </label>
          {value && <label className="grid min-w-0 gap-1">关注对象
            <select className={action} value={selectedOrdinal >= 0 ? String(selectedOrdinal) : ''} disabled={disabled || !visible.length}
              onChange={(event) => {
                const raw = event.currentTarget.value;
                const next = raw === '' ? undefined : visible.find((_, ordinal) => String(ordinal) === raw);
                onChange({ kind: value.kind, targetId: next ? campaignStopTargetId(next.condition) : undefined });
              }}>
              <option value="">请选择</option>
              {visible.map((item, ordinal) => <option key={campaignStopTargetId(item.condition)} value={ordinal}>{item.label}</option>)}
            </select>
          </label>}
        </div>
        {value && !selected && <p className="text-amber-200">请选本分支中可用的关注对象后再预检。</p>}
      </div>
    </details>
  );
}

export function CampaignStopProgress({ chosen, outcome }: {
  chosen?: { condition: CampaignStopCondition; label?: string };
  outcome?: CampaignStopOutcome;
}) {
  if (!chosen) return null;
  const receipt = outcome?.status === 'stopped' && outcome.receipt.kind === chosen.condition.kind &&
    campaignStopTargetId(outcome.receipt) === campaignStopTargetId(chosen.condition) ? outcome.receipt : undefined;
  return (
    <div aria-label="本次关注的停止条件" className="space-y-0.5 text-xs leading-relaxed text-slate-300 [overflow-wrap:anywhere]">
      <p>关注：{LABEL[chosen.condition.kind]}{chosen.label ? ` · ${chosen.label}` : ''}</p>
      {receipt && <>
        <p className="text-violet-100">仙历 {receipt.year} 年 {receipt.month} 月确证{LABEL[receipt.kind]}，已在该月停止。</p>
        <p>{receipt.eventId ? '该月有对应的公开实录。' : '已核对世界状态的变化，没有附带具体公开实录。'}</p>
      </>}
      {outcome?.status === 'reached_target' && <p>已到目标日期；本次未触发所选停止条件。</p>}
      {(outcome?.status === 'condition_unavailable' || outcome?.status === 'stopped' && !receipt) &&
        <p className="text-amber-200">本次无法核对所选条件的停止凭证。</p>}
    </div>
  );
}
