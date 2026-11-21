import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WorldStoragePanel } from '../src/components/WorldStoragePanel';
import { createInitialWorld } from '../src/data/initialWorld';

describe('random seed actions remain inside explicit world creation', () => {
  it('renders only native draft/copy actions before the independent staging submit and never replaces during render', () => {
    const world = createInitialWorld(0,'spirit-bloom');
    const onRestore = vi.fn(() => false);
    const onNewWorld = vi.fn(() => false);
    const html = renderToStaticMarkup(<WorldStoragePanel world={world} busy={false} onRestore={onRestore} onNewWorld={onNewWorld} />);
    const form = html.match(/<form\b[^>]*>[\s\S]*?<\/form>/)?.[0] ?? '';
    expect(form).toMatch(/<input type="text" inputMode="numeric"[^>]*value="0"/);
    expect(form).toMatch(/<option value="spirit-bloom" selected="">/);
    expect(form).toMatch(/<button type="button" class="[^"]*min-h-11[^"]*">随机抽种<\/button>/);
    expect(form).toMatch(/<button type="button" class="[^"]*min-h-11[^"]*">复制种子<\/button>/);
    expect(form).toMatch(/<button type="submit"[^>]*>按种子创建世界<\/button>/);
    expect(form.indexOf('随机抽种')).toBeLessThan(form.indexOf('按种子创建世界'));
    expect(html).not.toContain('确认存档操作');
    expect(onRestore).not.toHaveBeenCalled();
    expect(onNewWorld).not.toHaveBeenCalled();
  });

  it('places the new controls under the same native fieldset guard in read-only mode', () => {
    const world = createInitialWorld();
    const html = renderToStaticMarkup(<WorldStoragePanel world={world} busy={false} readOnly onRestore={() => false} onNewWorld={() => false} />);
    const group = html.match(/<fieldset disabled=""[^>]*><legend[^>]*>建立新世界<\/legend>[\s\S]*?<\/fieldset>/)?.[0] ?? '';
    expect(group).toContain('随机抽种');
    expect(group).toContain('复制种子');
    expect(group).toContain('按种子创建世界');
  });
});
