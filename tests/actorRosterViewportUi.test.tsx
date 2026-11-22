import {renderToStaticMarkup} from 'react-dom/server';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {ACTOR_PAGE_SIZE,ActorRoster} from '../src/components/ActorRoster';
import {createInitialWorld} from '../src/data/initialWorld';

const screen=vi.hoisted(()=>({wide:false,minWidth:0}));
vi.mock('../src/components/useViewportAtLeast',()=>({useViewportAtLeast:(width:number)=>{
  screen.minWidth=width;
  return screen.wide;
}}));

const isOpen=(html:string)=>/<details open=""[^>]*aria-label="修士名册"/.test(html);
const portraits=(html:string)=>html.match(/data-cultivator-portrait/g)?.length??0;
beforeEach(()=>{screen.wide=false;screen.minWidth=0;});

describe('responsive roster',()=>{
  it('opens by default from the desktop breakpoint and adds portraits only for a bounded actual page',()=>{
    const world=createInitialWorld(4);
    const original=world.cultivators[0];
    for(let i=0;i<1200;i++)world.cultivators.push({...original,id:`fixture-${i}`,name:`新修士 ${i}`});
    screen.wide=true;
    const html=renderToStaticMarkup(<ActorRoster world={world} selected={world.cultivators[0]} focalId={world.cultivators[1].id}
      dismissOnSelect onSelect={vi.fn()}/>);
    expect(screen.minWidth).toBe(768);
    expect(isOpen(html)).toBe(true);
    expect(html).toContain('主角');
    expect(html).toContain('已选人物');
    expect(portraits(html)).toBeGreaterThan(0);
    expect(portraits(html)).toBeLessThanOrEqual(ACTOR_PAGE_SIZE+2);
    expect(html).toContain('h-8 w-7');
  });
  it('does not reopen a persisted desktop collapse and does not apply desktop preference to mobile',()=>{
    const world=createInitialWorld(4),onDesktopOpenChange=vi.fn();
    screen.wide=true;
    const props={world,onSelect:vi.fn(),onDesktopOpenChange,dismissOnSelect:true};
    const closed=renderToStaticMarkup(<ActorRoster {...props} desktopOpen={false}/>);
    expect(isOpen(closed)).toBe(false);
    expect(portraits(closed)).toBe(0);
    expect(isOpen(renderToStaticMarkup(<ActorRoster {...props} desktopOpen/>))).toBe(true);
    screen.wide=false;
    const narrow=renderToStaticMarkup(<ActorRoster {...props} desktopOpen/>);
    expect(isOpen(narrow)).toBe(false);
    expect(portraits(narrow)).toBe(0);
    expect(onDesktopOpenChange).not.toHaveBeenCalled();
  });
});
