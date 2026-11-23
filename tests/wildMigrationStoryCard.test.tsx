import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {WildMigrationStoryCard} from '../src/components/WildMigrationStoryCard';
import type {WildMigrationOption,WildMigrationView} from '../src/engine/wildMigration';

const base={action:'WILD_MIGRATION',targetWildMigrationId:'private-migration'} as const;
const track:WildMigrationOption={...base,wildMigrationMove:'track'};
const drive:WildMigrationOption={...base,wildMigrationMove:'drive',targetLocationId:'private-next-tile'};
const view:WildMigrationView={side:'origin',siteName:'松影坡',weather:{season:'秋',kind:'灵潮',intensity:.64},options:[track]};

describe('wild seasonal crossing as actually observed',()=>{
  it('does not reveal a migrant before native local admission, and only shows exact available actions',()=>{
    const onChoose=vi.fn();
    const html=renderToStaticMarkup(<WildMigrationStoryCard view={view} onChoose={onChoose}/>);
    expect(html).toContain('松影坡 · 秋 · 灵潮');
    expect(html).toContain('此地尚未亲见');
    expect(html).toContain('察迹');
    expect(html).not.toMatch(/妖兽|凶兽|瑞兽|驱离|让行|private-/);
    expect(html.match(/<button\b/g)).toHaveLength(1);
    expect(onChoose).not.toHaveBeenCalled();
  });
  it('shows actual local kind but does not forecast where the beast will go',()=>{
    const html=renderToStaticMarkup(<WildMigrationStoryCard view={{...view,side:'destination',localKind:'妖兽',options:[drive]}} busy onChoose={()=>{}}/>);
    expect(html).toContain('眼前见得妖兽');
    expect(html).toContain('不预断它会退往何处');
    expect(html).toContain('disabled=""');
    expect(html).not.toMatch(/<svg|private-|已被赶走/);
  });
  it('omits unrelated scopes and distinguishes a native stopped receipt from a new option',()=>{
    expect(renderToStaticMarkup(<WildMigrationStoryCard view={{...view,options:[]}}/>)).toBe('');
    const html=renderToStaticMarkup(<WildMigrationStoryCard view={{...view,options:[],
      receipt:{title:'未见它越界',description:'眼前这一步没有走成。'}}}/>);
    expect(html).toContain('眼前这一步没有走成');
    expect(html).not.toMatch(/<button|迁徙完成|已跨两境/);
  });
});
