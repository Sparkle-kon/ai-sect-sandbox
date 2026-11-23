import { describe, expect, it } from 'vitest';
import { drawSceneStage } from '../src/components/sceneStageRenderer';
import type { SceneStageActor, SceneStageFrame } from '../src/components/sceneStageModel';
import { drawStageCast } from '../src/components/sceneStageSprites';

function capture(draw: (ctx: CanvasRenderingContext2D) => void) {
  const strokes: unknown[][] = [];
  const colorStops = (kind: string, ...params: number[]) => {
    strokes.push([kind, ...params]);
    return { addColorStop: (...args: [number, string]) => strokes.push(['stop', ...args]) };
  };
  const raw = new Proxy({
    createLinearGradient: (...args: number[]) => colorStops('linear', ...args),
    createRadialGradient: (...args: number[]) => colorStops('radial', ...args),
  }, {
    get: (target, key) => Reflect.get(target, key) ?? ((...args: unknown[]) => { strokes.push([key, ...args]); }),
    set: (_target, key, value: unknown) => { strokes.push([key, value]); return true; },
  });
  draw(raw as unknown as CanvasRenderingContext2D);
  return strokes;
}

const sample: SceneStageActor = {
  id: 'sample', name: '画面测试', realm: '筑基', pose: 'idle',
  appearance: {
    face: { jaw: 1, eyes: 1, hair: 3, ornament: 2, skin: '#e2b99a', ink: '#38282d' },
    attire: 'layered', ageBand: 'seasoned', brow: 'level',
    palette: { fabric: '#3d5663', trim: '#c4a77a', spirit: '#f0d08a', background: '#101828' },
  },
};

describe('scene stage original painted artwork', () => {
  it('paints six distinct settings and has a reproducible static frame', () => {
    const settings: SceneStageFrame['theme'][] = ['sword_peak', 'pill_valley', 'market', 'blood_abyss', 'north_vein', 'countryside'];
    const render = (theme: SceneStageFrame['theme'], t = 0) => capture(ctx => drawSceneStage(ctx, {
      theme, cast: [sample], historical: false, season: 'spring',
    }, 360, 202.5, t));
    expect(new Set(settings.map(theme => JSON.stringify(render(theme)))).size).toBe(settings.length);
    expect(JSON.stringify(render('sword_peak'))).toBe(JSON.stringify(render('sword_peak', Number.NaN)));
    expect(JSON.stringify(render('sword_peak'))).not.toBe(JSON.stringify(render('sword_peak', 1600)));
  });

  it('paints exactly the supplied finite cast and authors different poses', () => {
    const poses: SceneStageActor['pose'][] = ['idle', 'labor', 'cultivate', 'fight', 'talk'];
    expect(capture(ctx => drawStageCast(ctx, [], 0))).toEqual([]);
    const palette = (strokes: unknown[][]) => strokes.filter(row => row[0] === 'fillStyle' && row[1] === 'rgba(15,24,34,.46)');
    const actors = poses.map((pose, i) => ({ ...sample, id: String(i), pose }));
    expect(new Set(actors.map(actor => JSON.stringify(capture(ctx => drawStageCast(ctx, [actor], 0))))).size).toBe(5);
    expect(palette(capture(ctx => drawStageCast(ctx, actors, 0)))).toHaveLength(actors.length);
  });
});
