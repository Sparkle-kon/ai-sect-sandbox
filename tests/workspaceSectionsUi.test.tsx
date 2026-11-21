import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { resolveWorkspaceOpen, WorkspaceSections } from '../src/components/SandboxWorkspace';

const sections = [
  { id: 'profile', label: '人物概况', content: <p>主要内容</p> },
  { id: 'career', label: '长期任职', content: <p>过往工作</p> },
  { id: 'archive', label: '个人记述', content: <p>只在开启时实际挂载</p> },
];

describe('mobile section attention and durable fold intent', () => {
  it('keeps a valid forced section and accepts intentional null; malformed values gracefully fall back', () => {
    expect(resolveWorkspaceOpen(sections, 'profile')).toBe('profile');
    expect(resolveWorkspaceOpen(sections, 'profile', 'career')).toBe('career');
    expect(resolveWorkspaceOpen(sections, 'profile', 'wrong-branch-former-section')).toBe('profile');
    expect(resolveWorkspaceOpen(sections, 'profile', null)).toBeNull();
    expect(resolveWorkspaceOpen(sections, 'profile', null, 'archive')).toBe('archive');
    expect(resolveWorkspaceOpen(sections, 'profile', 'career', 'missing')).toBe('career');
    expect(resolveWorkspaceOpen(sections, undefined, 'constructor')).toBeNull();
  });

  it('keeps one actual primary before the single collapsed shelves disclosure; every shelf can be selected', () => {
    const callback = vi.fn();
    const html = renderToStaticMarkup(<WorkspaceSections label="人物资料" sections={sections} initialOpen="profile"
      rememberedOpen="career" onOpenChange={callback} />);
    expect(html).toMatch(/<h2 tabindex="-1"[^>]*>人物资料/);
    expect(html).toMatch(/aria-expanded="true"[^>]*>长期任职/);
    expect(html).toMatch(/<details class="[^"]+"><summary class="[^"]+">更多内容/);
    expect(html.match(/aria-expanded="true"/g)).toHaveLength(1);
    expect(html.indexOf('长期任职')).toBeLessThan(html.indexOf('更多内容'));
    expect(html.indexOf('更多内容')).toBeLessThan(html.indexOf('过往工作'));
    expect(html).toMatch(/aria-expanded="false"[^>]*>人物概况/);
    expect(html).toMatch(/aria-expanded="false"[^>]*>个人记述/);
    expect(html).not.toMatch(/主要内容|只在开启时实际挂载/);
    expect(callback).not.toHaveBeenCalled();
  });

  it('can place the secondary interaction below the People content without adding another control', () => {
    const html = renderToStaticMarkup(<WorkspaceSections label="人物资料" sections={sections} initialOpen="profile" moreAfterContent />);
    expect(html.indexOf('人物概况')).toBeLessThan(html.indexOf('主要内容'));
    expect(html.indexOf('主要内容')).toBeLessThan(html.indexOf('更多内容'));
    expect(html.match(/更多内容/g)).toHaveLength(1);
  });

  it('does not mutate a saved collapse when highlighting a programmatic section', () => {
    const callback = vi.fn();
    const markup = (forcedOpen?: string) => renderToStaticMarkup(
      <WorkspaceSections label="历史资料" sections={sections} initialOpen="profile" rememberedOpen={null} forcedOpen={forcedOpen} onOpenChange={callback} />,
    );
    expect(markup()).not.toContain('aria-expanded="true"');
    expect(markup()).toContain('更多内容');
    expect(markup('archive')).toMatch(/aria-expanded="true"[^>]*aria-disabled="true"[^>]*>个人记述/);
    expect(markup('archive')).toContain('只在开启时实际挂载');
    expect(markup('archive')).not.toContain('更多内容');
    expect(markup('archive')).not.toContain('人物概况');
    expect(callback).not.toHaveBeenCalled();
  });
});
