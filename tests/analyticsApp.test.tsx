import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';

describe('analytics on the game dashboard', () => {
  it('keeps the real analytics and timeline entry points in their intended workspaces', () => {
    const world = renderToStaticMarkup(<App initialWorkspace="world" initialSection="analytics" />);
    expect(world).toContain('打开天道观测');
    expect(world).toContain('单步推演');
    expect(world).not.toContain('aria-modal="true"');
    const history = renderToStaticMarkup(<App initialWorkspace="chronicle" initialSection="timeline" />);
    expect(history).toContain('原始时间线');
    expect(history).toContain('单步推演');
    expect(history).not.toContain('打开天道观测');
  });
});
