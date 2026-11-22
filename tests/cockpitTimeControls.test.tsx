import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {CockpitTimeControls,type CockpitTimeControlsProps} from '../src/components/CockpitTimeControls';

const noop=()=>{};
const render=(props:Partial<CockpitTimeControlsProps>={})=>renderToStaticMarkup(<CockpitTimeControls
  date={{year:1001,month:8}} historical={false} running={false} busy={false}
  onStep={noop} onToggleAutoplay={noop} onReturnLive={noop} onOpenTimeline={noop} {...props}/>);
const button=(markup:string,label:string)=>{
  const match=Array.from(markup.matchAll(/<button[^>]*>.*?<\/button>/gu),row=>row[0]).find(row=>row.includes(label));
  expect(match,`Expected semantic control: ${label}`).toBeDefined();
  return match!;
};

describe('panoramic cockpit quick clock controls',()=>{
  it('makes the working month and one-month progression visible without hiding the existing timeline link',()=>{
    const html=render();
    expect(html).toContain('aria-label="天道推演"');
    expect(html).toContain('仙历 1001年8月');
    expect(html).toContain('当前月');
    expect(html).not.toContain('回到当前');
    for(const label of ['推演一月','自动推演','时间线与快进']){
      const control=button(html,label);
      expect(control).not.toContain('disabled=""');
      expect(control).toContain('min-h-11');
      expect(control).toContain('type="button"');
    }
    expect(button(html,'推演一月')).toContain('bg-cyan-200');
    expect(button(html,'自动推演')).toContain('aria-pressed="false"');
  });

  it('makes an actual historical month read-only while preserving navigation back and to the timeline',()=>{
    const html=render({historical:true,running:true,date:{year:997,month:11}});
    expect(html).toContain('仙历 997年11月');
    expect(html).toContain('历史回看 · 只读');
    expect(html).not.toMatch(/推演一月|自动推演|暂停推演/u);
    expect(button(html,'回到当前')).not.toContain('disabled=""');
    expect(button(html,'时间线与快进')).not.toContain('disabled=""');
    const blocked=render({historical:true,busy:true});
    for(const label of ['回到当前','时间线与快进'])expect(button(blocked,label)).toContain('disabled=""');
  });

  it('blocks competing commands during a busy monthly commit but still lets an active autoplay stop',()=>{
    const busy=render({busy:true});
    expect(busy).toContain('处理中');
    for(const label of ['推演一月','自动推演','时间线与快进'])expect(button(busy,label)).toContain('disabled=""');
    const running=render({running:true,busy:true});
    expect(button(running,'推演一月')).toContain('disabled=""');
    expect(button(running,'暂停推演')).not.toContain('disabled=""');
    expect(button(running,'暂停推演')).toContain('aria-pressed="true"');
    expect(button(running,'时间线与快进')).toContain('disabled=""');
  });
});
