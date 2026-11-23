import { describe, expect, it } from 'vitest';
import report from '../docs/trigger-audit.md?raw';
import { storyTriggerAuditPhase19_20 } from '../scripts/storyTriggerAuditPhase19_20';
import { storyTriggerAuditPhase21_22 } from '../scripts/storyTriggerAuditPhase21_22';

describe('G0-2 原基线与处置矩阵', () => {
  const probes = [...storyTriggerAuditPhase19_20, ...storyTriggerAuditPhase21_22];
  const baseline = [...report.matchAll(/^\| (P\d+-\d+) [^|]+ \| ([^|]+) \| (\d+|不适用) \| [^|]+ \|$/gmu)];
  const dispositions = [...report.matchAll(/^\| (P\d+-\d+) \| (\d+) \| (交给导演促成|并入奇遇引擎|冻结) \| ([^|]+) \|$/gmu)];
  const evidence = new Map(baseline.map(([, id, , count]) => [id, count]));

  it('原 40 个探针各留一个实测行；界面与设备不被记为零', () => {
    expect(baseline.map(([, id]) => id)).toEqual(probes.map(({ id }) => id));
    expect(baseline.filter(([, , , count]) => count === '不适用').map(([, id]) => id))
      .toEqual(probes.filter(({ mode }) => mode === 'interface').map(({ id }) => id));
    expect([...evidence.values()].filter(count => count !== '不适用' && Number(count) >= 1)).toHaveLength(7);
    expect(report).toContain('fnv1a32-afe8265f');
    expect(report).toContain('148,547');
  });

  it('每个低于 2 次的玩法只分一次，且不抬高零次基线', () => {
    expect(dispositions.map(([, id, count]) => [id, count])).toEqual(
      baseline.flatMap(([, id, , count]) => Number(count) < 2 ? [[id, count]] : []),
    );
    expect(dispositions).toHaveLength(27);
    expect(dispositions.filter(([, , , choice]) => choice === '交给导演促成').map(([, id]) => id))
      .toEqual(['P20-8', 'P21-3', 'P21-7', 'P22-2']);
    expect(dispositions.filter(([, , , choice]) => choice === '并入奇遇引擎').map(([, id]) => id))
      .toEqual(['P20-3', 'P21-4', 'P22-7']);
    expect(dispositions.filter(([, , , choice]) => choice === '冻结')).toHaveLength(20);
    expect(dispositions.find(([, id]) => id === 'P19-6')?.slice(2, 4)).toEqual(['1', '冻结']);
    expect(report).not.toContain('## 不应强行补齐的前因');
  });
});
