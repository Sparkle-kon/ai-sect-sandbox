import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { BeastDuelProtectionCard,type BeastDuelProtectionCardView } from '../src/components/BeastDuelProtectionCard';

const view:BeastDuelProtectionCardView={ownerName:'闻笛',beastName:'青曜',siteName:'剑峰',
  options:[{choice:'guard'},{choice:'withdraw',refugeName:'万仙坊市'}]};

describe('one co-present beast and one duel',()=>{
  it('offers only the supplied exact touch choices, with withdrawal costs but no outcome forecast',()=>{
    const choose=vi.fn(()=>true);
    const html=renderToStaticMarkup(<BeastDuelProtectionCard view={view} onChoose={choose}/>);
    expect(html.match(/<button\b/g)).toHaveLength(2);
    expect(html.match(/min-h-11/g)).toHaveLength(2);
    for(const text of ['请灵兽护我','让灵兽先退','万仙坊市','解开与你的契约','仍要看这场交手','这一场还没有结果'])
      expect(html).toContain(text);
    expect(html).not.toMatch(/死亡|气血受创|平安撤离/u);
    expect(choose).not.toHaveBeenCalled();
  });

  it('keeps notice of queued intent separate from executing the real next month',()=>{
    const html=renderToStaticMarkup(<BeastDuelProtectionCard view={{...view,queued:'withdraw'}} busy
      onChoose={()=>true} onAdvance={()=>true}/>);
    expect(html.match(/<button\b/g)).toHaveLength(1);
    expect(html).toContain('disabled=""');
    expect(html).toContain('尚未交手');
    expect(html).toContain('推进一月');
    expect(html).not.toContain('解开与你的契约');
  });

  it('prints only the supplied realized outcome and no replay choices',()=>{
    const receipt={title:'灵兽护身',description:'青曜挨下一击，闻笛仍在战场。'};
    const html=renderToStaticMarkup(<BeastDuelProtectionCard view={view} receipt={receipt}
      onChoose={()=>true} onAdvance={()=>true} onContinue={()=>undefined}/>);
    expect(html).toContain('此战实录');
    expect(html).toContain(receipt.description);
    expect(html).not.toMatch(/先退|推进一月|尚未|保证/u);
    expect(html.match(/<button\b/g)).toHaveLength(1);
  });
});
