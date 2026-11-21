import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChronicleLibraryPanel } from '../src/components/ChronicleLibraryPanel';
import { PossessionPanel } from '../src/components/PossessionPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { possessAvatar, queueAvatarOrder, resolveAvatarInteraction } from '../src/engine/avatarEngine';

const unexpected = () => { throw new Error('Rendering must not trigger a world mutation or provider request.'); };

function fixture() {
  const world = createInitialWorld();
  const [host, contact, closed] = world.cultivators;
  closed.alive = false;
  const markup = (selectedCultivatorId: string | null, modelReady = false, busy = false, notice?: string) =>
    renderToStaticMarkup(<PossessionPanel world={world} selectedCultivatorId={selectedCultivatorId}
      modelReady={modelReady} busy={busy} notice={notice} onPossess={unexpected} onOrder={unexpected} onSpeak={unexpected} />);
  return { world, host, contact, closed, markup };
}

describe('possession and private conversation UI', () => {
  it('offers only legal contacts and ring intents with explicit send and offline boundaries', () => {
    const { contact, closed, markup } = fixture();
    const html = markup(contact.id);
    expect(html).toContain('aria-label="玩家化身与古戒"');
    expect(html).toContain('神识余力 100');
    expect(html).toContain('古戒私语');
    expect(html).toContain('夺舍接触');
    expect(html).toContain(`value="${contact.id}" selected=""`);
    expect(html).toContain('value="guide"');
    expect(html).not.toContain('value="recruit"');
    expect(html).not.toContain(`value="${closed.id}"`);
    expect(html).toContain('maxLength="220"');
    expect(html).toContain('不发送模型请求');
    expect(html).toMatch(/<button type="submit"[^>]*disabled=""/);
  });

  it('presents a live host and explicit next-tick actions without acting automatically', () => {
    const { world, host, contact, markup } = fixture();
    expect(possessAvatar(world, host.id)).toBe(true);
    expect(queueAvatarOrder(world, 'REST')).toBe(true);
    const html = markup(contact.id, true, true, '当前会话状态已变，请重新发送。');
    expect(html).toContain(`当前宿主：${host.name}`);
    expect(html).toContain('安排下月调息');
    expect(html).toContain('安排下月修炼');
    expect(html).toContain(`已排定：${host.name}于 Tick #${world.tick + 1}调息。`);
    expect(html).toContain('离开宿主');
    expect(html).toContain('点击发送时，可能将本次消息与公开情境发送给已配置的模型服务');
    expect(html).toContain('不附带以往私谈或秘密目标');
    expect(html).toContain('当前会话状态已变，请重新发送。');
    expect(html).toContain('处理中…');
  });

  it('renders committed replies and rule effects in the private record, never in the public book', () => {
    const { world, contact, markup } = fixture();
    const result = resolveAvatarInteraction(world, { mode: 'ring', intent: 'guide', targetCultivatorId: contact.id,
      message: '<私密>这是一句专用记录' }, () => 0);
    expect(result?.outcome).toBe('agreed');
    const html = markup(contact.id);
    expect(html).toContain('此视角的私密交谈记录 · 1 条');
    expect(html).toContain('&lt;私密&gt;这是一句专用记录');
    expect(html).toContain('规则脑回复');
    expect(html).toContain('气机推进');
    expect(html).toContain('当前无可用对象');
    const publicBook = renderToStaticMarkup(<ChronicleLibraryPanel world={world} />);
    expect(publicBook).not.toContain('专用记录');
    expect(publicBook).not.toContain(result?.reply);
  });
});
