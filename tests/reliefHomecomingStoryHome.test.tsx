// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {StoryFirstHome} from '../src/components/StoryFirstHome';
import type {ReliefHomecomingView} from '../src/engine/reliefHomecoming';

const returnBeat={kind:'return',tick:9,title:'路上故人归来',line:'今夜亲眼见他走到村里。'} as const;
const reliefBeat={kind:'relief',tick:8,title:'村人领到赈济',line:'赈粮确已送到，分粮时曾少一人在场。'} as const;
const delayed:ReliefHomecomingView={siteId:'raw-town-token',siteName:'矮山村',beats:[returnBeat]};
const full:ReliefHomecomingView={...delayed,beats:[reliefBeat,returnBeat]};
const previous={title:'一章旧事',paragraph:'这不是此刻乡村所见。'};

it.each([360,390])('opens one witnessed prose scene at simulated %ipx',async width=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  vi.stubGlobal('innerWidth',width);
  const host=document.createElement('main');
  document.body.append(host);
  const root=createRoot(host),onContinue=vi.fn(),onMore=vi.fn();
  const base={scene:previous,branchScene:<section>另开一场不该同屏的事。</section>,onContinue,onMore};
  try {
    await act(async()=>root.render(<StoryFirstHome {...base} reliefHomecoming={delayed}/>));
    const article=host.querySelector('article')!;
    expect(host.querySelectorAll('article')).toHaveLength(1);
    expect(article.getAttribute('aria-label')).toBe('当前故事');
    expect(article.textContent).toContain('村灯照见今朝');
    expect(article.textContent).toContain(returnBeat.line);
    expect(host.textContent).not.toMatch(/赈粮确已送到|一章旧事|另开一场|raw-town-token/);
    expect([...host.querySelectorAll('button')].map(row=>row.textContent?.trim())).toEqual(['走进故事','看下个月']);
    await act(async()=>root.render(<StoryFirstHome {...base} reliefHomecoming={full} reliefHomecomingFocus="阮知秋"/>));
    expect(host.querySelectorAll('article')).toHaveLength(1);
    expect(host.textContent).toContain('随阮知秋所见');
    expect(host.textContent).not.toContain('主角：阮知秋');
    expect(host.querySelectorAll('[data-chronicle-paragraph-text]')).toHaveLength(1);
    expect(host.querySelector('[data-chronicle-paragraph-text]')?.textContent).toBe(reliefBeat.line+returnBeat.line);
    await act(async()=>root.render(<StoryFirstHome {...base} branchScene={undefined}/>));
    expect(host.textContent).toContain(previous.paragraph);
    expect(host.textContent).not.toContain(returnBeat.line);
  }finally{
    await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();
  }
});
