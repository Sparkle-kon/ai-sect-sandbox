import React from 'react';
import { WorldState } from '../types/world';

interface RelationshipGraphProps {
  world: WorldState;
  selectedCultivatorId: string | null;
  onSelectCultivator: (id: string) => void;
}

export const RelationshipGraph: React.FC<RelationshipGraphProps> = ({
  world,
  selectedCultivatorId,
  onSelectCultivator,
}) => {
  const cultivators = world.cultivators;
  const cx = 200;
  const cy = 150;
  const radius = 105;

  const nodePositions = new Map<string, { x: number; y: number }>();
  cultivators.forEach((c, idx) => {
    const angle = (idx / cultivators.length) * Math.PI * 2 - Math.PI / 2;
    nodePositions.set(c.id, {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    });
  });

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
          因果恩怨拓扑图 (Social & Grudge Graph)
        </h3>
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <span className="text-emerald-400">● 师徒/挚友</span>
          <span className="text-rose-400">● 血仇/死敌</span>
          <span className="text-amber-400">● 算计/竞争</span>
        </div>
      </div>

      <svg viewBox="0 0 400 300" className="w-full h-60 bg-slate-950/60 rounded-lg">
        {/* Edges */}
        {world.relationships.map((edge, idx) => {
          const from = nodePositions.get(edge.fromId);
          const to = nodePositions.get(edge.toId);
          if (!from || !to) return null;

          let strokeColor = '#fbbf24';
          if (edge.affinity >= 40) strokeColor = '#34d399';
          if (edge.affinity <= -40) strokeColor = '#f43f5e';

          const midX = (from.x + to.x) / 2;
          const midY = (from.y + to.y) / 2;

          return (
            <g key={`${edge.fromId}-${edge.toId}-${idx}`}>
              <line
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={strokeColor}
                strokeOpacity={0.65}
                strokeWidth={Math.max(1.5, Math.abs(edge.affinity) / 35)}
              />
              <text
                x={midX}
                y={midY - 3}
                textAnchor="middle"
                fill={strokeColor}
                fontSize="9"
              >
                {edge.type}({edge.affinity})
              </text>
            </g>
          );
        })}

        {/* Nodes */}
        {cultivators.map((c) => {
          const pos = nodePositions.get(c.id);
          if (!pos) return null;
          const sect = world.sects.find((s) => s.id === c.sectId);
          const isSelected = c.id === selectedCultivatorId;

          return (
            <g
              key={c.id}
              onClick={() => onSelectCultivator(c.id)}
              className="cursor-pointer"
            >
              {isSelected && (
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={18}
                  fill="none"
                  stroke="#facc15"
                  strokeWidth={2.5}
                />
              )}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={13}
                fill={c.alive ? (sect?.color ?? '#38bdf8') : '#475569'}
                stroke="#0f172a"
                strokeWidth={2}
              />
              <text
                x={pos.x}
                y={pos.y + 24}
                textAnchor="middle"
                fill={c.alive ? '#f1f5f9' : '#64748b'}
                fontSize="10"
                fontWeight="bold"
              >
                {c.name}
                {!c.alive ? '(陨)' : ''}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
