import { renderToStaticMarkup } from 'react-dom/server';
import { describe,expect,it } from 'vitest';
import { WorldMapCanvas } from '../src/components/WorldMapCanvas';
import { createInitialWorld } from '../src/data/initialWorld';

const noop=()=>undefined;
function fixture() {
  const world=createInitialWorld(731);
  const viewer=world.cultivators[0];
  const props={world,selectedCultivatorId:viewer.id,onSelectCultivator:noop,onBrushStroke:noop};
  return { props,viewer };
}
const toolTag=(markup:string)=>markup.match(/<details[^>]*aria-label="地图工具"[^>]*>/)?.[0];

describe('map-first native tools disclosure',()=>{
  it('puts the primary map and selected cultivator before one closed compact tools route',()=>{
    const {props,viewer}=fixture();
    const markup=renderToStaticMarkup(<WorldMapCanvas compact {...props} />);
    expect(toolTag(markup)).toBeDefined();
    expect(toolTag(markup)).not.toMatch(/\bopen=/);
    expect(markup).toMatch(/<canvas[^>]*tabindex="0"[^>]*aria-describedby=/);
    expect(markup).toContain('touch-action:pan-y');
    expect(markup.indexOf('<canvas')).toBeLessThan(markup.indexOf('aria-label="地图当前选择"'));
    expect(markup.indexOf('aria-label="地图当前选择"')).toBeLessThan(markup.indexOf('aria-label="地图工具"'));
    expect(markup).toContain(viewer.name);
    expect(markup).not.toContain('地图快捷控制');
    expect(markup).not.toContain('地图选项');
    expect(markup.match(/aria-label="放大地图"/g)).toHaveLength(1);
    expect(markup.match(/aria-label="缩小地图"/g)).toHaveLength(1);
    expect(markup).not.toContain('逐格查看地形与灵气');
    expect(markup).not.toContain('聚合修士列表');
    expect(markup).toMatch(/<select disabled=""[^>]*><option value="browse" selected=""/);
  });

  it('honors the restored disclosure setting and nests optional actions and auxiliary records under that one route',()=>{
    const {props}=fixture();
    const markup=renderToStaticMarkup(<WorldMapCanvas compact {...props} toolsOpen onToolsOpenChange={noop}
      additionalTools={<button type="button">自动推演测试入口</button>} />);
    expect(toolTag(markup)).toMatch(/\bopen=""/);
    const afterTools=markup.slice(markup.indexOf('aria-label="地图工具"'));
    expect(afterTools).toContain('自动推演测试入口');
    expect(afterTools).toContain('山河索引');
    expect(afterTools).toContain('逐格查看地形与灵气');
    expect(afterTools).toContain('查看各地点灵脉属性');
    expect(afterTools).toMatch(/aria-label="缩小地图"[^>]*min-h-11 min-w-11/);
    expect(afterTools).toMatch(/<select class="min-h-11[^"]*"><option value="browse" selected=""/);
    expect(markup.match(/aria-label="地图工具"/g)).toHaveLength(1);
  });

  it('keeps desktop controls, minimap, keyboard help and the old camera-reset names without duplicates',()=>{
    const {props}=fixture();
    const markup=renderToStaticMarkup(<WorldMapCanvas {...props} />);
    expect(toolTag(markup)).toMatch(/\bopen=""/);
    expect(markup).toContain('touch-action:none');
    expect(markup).toContain('小地图：点击定位');
    expect(markup).toContain('方向键平移');
    expect(markup).toContain('F 定位所选修士');
    expect(markup).toContain('灵气热力');
    expect(markup).toContain('绘制灵脉');
    expect(markup).toContain('查看各地点灵脉属性');
    expect(markup.match(/aria-label="重置地图视角"/g)).toHaveLength(1);
    expect(markup).not.toContain('地图当前选择');
  });
});
