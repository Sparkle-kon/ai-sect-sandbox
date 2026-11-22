import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {HighDramaPresetPicker,HighDramaPresetPreview} from '../src/components/HighDramaPresetPicker';
import {HIGH_DRAMA_PRESETS} from '../src/engine/highDramaPresetTerms';

describe('high-drama opening picker',()=>{
  it('starts compact and does not display a confirm action or reset warning before a pick',()=>{
    const onStart=vi.fn(async()=>true);
    const html=renderToStaticMarkup(<HighDramaPresetPicker scopeKey="branch-scope" onStart={onStart}/>);
    expect(html).toContain('另选开局剧本');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('确认开始新局');
    expect(html).not.toContain('替换当前局');
    expect(html).not.toContain('branch-scope');
    expect(onStart).not.toHaveBeenCalled();
  });

  it('blocks access while historical or busy',()=>{
    const html=renderToStaticMarkup(<HighDramaPresetPicker scopeKey="historical-scope"
      onStart={vi.fn(async()=>true)} disabled/>);
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('三卷新篇');
  });

  it('renders exact previews and restricts confirmation while starting',()=>{
    expect(HIGH_DRAMA_PRESETS).toHaveLength(3);
    for(const preset of HIGH_DRAMA_PRESETS){
      const html=renderToStaticMarkup(<HighDramaPresetPreview preset={preset} id="opening" starting
        onConfirm={vi.fn()} onReturn={vi.fn()}/>);
      expect(html).toContain(preset.title);
      expect(html).toContain(preset.description);
      expect(html).toContain(preset.intent);
      expect(html).toContain('替换当前局和分支');
      expect(html).toContain('先导出存档');
      expect(html).toContain('正在打开新局');
      expect(html.match(/disabled=""/g)).toHaveLength(2);
      expect(html).toContain('返回剧本列表');
    }
  });
});
