import React from 'react';
import { ScrollText } from 'lucide-react';
import { WorldEvent } from '../types/world';
import { DialogueTranscript } from './DialogueTranscript';

interface ChronicleFeedProps {
  events: WorldEvent[];
}

const CATEGORY_BADGE: Record<
  WorldEvent['category'],
  { label: string; className: string }
> = {
  breakthrough: {
    label: '破境机缘',
    className: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  },
  combat: {
    label: '惊天斗法',
    className: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
  },
  intrigue: {
    label: '暗流算计',
    className: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  },
  heavenly: {
    label: '天道异象',
    className: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  },
  death: {
    label: '道消陨落',
    className: 'bg-red-600/30 text-red-200 border-red-500/50',
  },
  diplomacy: {
    label: '论道交游',
    className: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  },
};

export const ChronicleFeed: React.FC<ChronicleFeedProps> = ({ events }) => {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 flex flex-col h-[340px]">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-amber-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
            修仙界天机编年史 (World Chronicle)
          </h3>
        </div>
        <span className="text-[11px] text-slate-400">
          共记录 {events.length} 条因果
        </span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {events.map((evt) => {
          const badge = CATEGORY_BADGE[evt.category];
          return (
            <div
              key={evt.id}
              className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 space-y-1"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-1.5 py-0.5 text-[10px] font-medium rounded border ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                  <span className="text-xs font-semibold text-slate-100">
                    {evt.title}
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 whitespace-nowrap">
                  仙历 {evt.year}年{evt.month}月
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {evt.description}
              </p>
              {evt.dialogue && <DialogueTranscript dialogue={evt.dialogue} />}
            </div>
          );
        })}
      </div>
    </div>
  );
};
