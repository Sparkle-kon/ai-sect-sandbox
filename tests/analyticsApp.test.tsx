import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';

describe('analytics on the game dashboard', () => {
  it('mounts an explicit analytics entry alongside real simulation and snapshot controls', () => {
    const view = renderToStaticMarkup(<App />);
    expect(view).toContain('天道观测');
    expect(view).toContain('单步推演');
    expect(view).toContain('原始时间线');
    expect(view).not.toContain('aria-modal="true"');
  });
});
