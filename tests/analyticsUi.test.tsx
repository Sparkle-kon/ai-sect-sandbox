import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AnalyticsModal } from '../src/components/AnalyticsModal';
import { createInitialWorld } from '../src/data/initialWorld';

const noClose = () => undefined;

function fixture() {
  const early = createInitialWorld(7);
  early.tick = 3;
  early.month = 3;
  early.cultivators[0].alive = false;
  early.cultivators[0].hp = 0;
  early.sects[0].spiritStones = 1111;
  const viewing = structuredClone(early);
  viewing.tick = 5;
  viewing.month = 5;
  viewing.sects[0].spiritStones = 1444;
  const [, known, unknown] = viewing.cultivators;
  known.alive = false;
  known.hp = 0;
  unknown.alive = false;
  unknown.hp = 0;
  viewing.events.unshift({
    id: 'evt-known-oldage', tick: 4, year: viewing.year, month: 4, title: '寿元尽', description: '观察到寿终。',
    category: 'death', actorIds: [known.id],
  }, {
    id: 'evt-private-tribulation-failure', tick: 4, year: viewing.year, month: 4, title: '私密标记',
    description: '不供公开归因', category: 'death', actorIds: [unknown.id], witnessScope: 'participants',
  });
  const future = structuredClone(viewing);
  future.tick = 6;
  future.sects[0].spiritStones = 987654;
  const history = [early, viewing, future].map((world) => ({ tick: world.tick, world }));
  return { early, viewing, history };
}

describe('analytics presentation', () => {
  it('draws responsive charts with text equivalents, using only real history through the visible tick', () => {
    const { viewing, history } = fixture();
    expect(renderToStaticMarkup(<AnalyticsModal world={viewing} history={history} open={false} onClose={noClose} />)).toBe('');
    const html = renderToStaticMarkup(<AnalyticsModal world={viewing} history={history} open onClose={noClose} />);
    expect(html).toContain('aria-label="关闭天机数据大屏"');
    expect(html).toContain('当前视图 Tick #5 · 有效快照 2 帧 · 缺失 1 刻');
    expect(html).toContain('按境界对比人数，在世向左、陨落向右');
    expect(html).toContain('查看人数表');
    expect(html).toContain('按实际历史快照堆叠各境界在世人数');
    expect(html).toContain('查看各刻实际人数（在世／陨落）');
    const treasury = html.split('aria-label="宗门公库变化"')[1]?.split('</section>')[0] ?? '';
    expect(treasury).toContain('宗门公库灵石余额折线，Tick #3 至 #5');
    expect(treasury).toContain('1,111');
    expect(treasury).toContain('1,444');
    expect(treasury).not.toContain('987,654');
    expect(treasury).not.toContain('<line');
  });

  it('reports cause unknown separately from pre-window deaths and excludes participant-only evidence', () => {
    const { viewing, history } = fixture();
    const html = renderToStaticMarkup(<AnalyticsModal world={viewing} history={history} open onClose={noClose} />);
    expect(html).toContain('Tick #3–#5 · 已观察 2 人 · 窗口前已陨落 1 人（不计入图中）');
    expect(html).toContain('按死亡原因所占比例的圆环图');
    expect(html).toContain('寿元耗尽 1');
    expect(html).toContain('原因未知 1');
    expect(html).toContain('渡劫 0');
    expect(html).not.toContain('私密标记');
    expect(html).not.toContain('不供公开归因');
    expect(html).toContain('封神榜 · 在世');
    expect(html).toContain('陨落榜 · 已陨');
  });

  it('renders an empty observation window without a fabricated pie or cause', () => {
    const { early } = fixture();
    const html = renderToStaticMarkup(<AnalyticsModal world={early} open onClose={noClose} />);
    expect(html).toContain('已观察 0 人 · 窗口前已陨落 1 人');
    expect(html).toContain('此窗口未观察到死亡转变');
    expect(html).not.toContain('按死亡原因所占比例的圆环图');
  });
});
