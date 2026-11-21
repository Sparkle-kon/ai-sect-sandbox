import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { AgentInspector } from '../src/components/AgentInspector';
import { RecollectionPanel } from '../src/components/RecollectionPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { REINCARNATION_CHANCE } from '../src/engine/reincarnationEngine';
import type { RecollectionEcho } from '../src/types/world';

function fixture() {
  const world = createInitialWorld();
  world.tick = 25;
  const [actor, outsider] = world.cultivators;
  const privateContext = {
    previousActorId: 'old-incarnation-secret-id', previousActorName: '前尘之人不应显示',
    birthplace: '旧乡不应显示', recordedDeath: '死因不应显示',
  };
  const echo: RecollectionEcho = { actorId: actor.id, theme: 'cultivation', confidence: 'faint', receivedTick: 22, status: 'unconsidered' };
  Object.assign(echo, privateContext); // Defense in depth: accepted UI fields are a fixed allowlist.
  world.reincarnation.echoes.push(echo);
  const markup = (id = actor.id) => renderToStaticMarkup(<RecollectionPanel world={world} actorId={id} />);
  return { world, actor, outsider, echo, markup };
}

describe('uncertain recollections in the character’s mind pane', () => {
  it('shows a closed, read-only fictional fragment with the rare candidate rule, but no private lineage', () => {
    const { markup } = fixture();
    const output = markup();
    expect(output).toMatch(/<details(?![^>]*\bopen)[^>]*><summary[^>]*>未证实的轮回残响/);
    expect(output).toContain('修习时，偶有难以解释的熟悉感');
    expect(output).toContain('微弱 · 尚未审视');
    expect(output).toContain('最初感知 Tick #22');
    expect(output).toContain(`${REINCARNATION_CHANCE * 100}%`);
    expect(output).toContain('并不保证后续重生');
    expect(output).toContain('不证明身份、地点');
    expect(output).toContain('不继承财物、职位或前世知识');
    expect(output).not.toContain('<button');
    for (const hidden of ['old-incarnation-secret-id', '前尘之人不应显示', '旧乡不应显示', '死因不应显示']) expect(output).not.toContain(hidden);
  });

  it('only reads the selected actor and does not show an echo before its recorded receipt', () => {
    const { world, actor, outsider, echo, markup } = fixture();
    expect(markup(outsider.id)).toBe('');
    const historical = structuredClone(world);
    historical.tick = 20;
    expect(renderToStaticMarkup(<RecollectionPanel world={historical} actorId={actor.id} />)).toBe('');
    echo.status = 'dismissed';
    echo.resolvedTick = 25;
    expect(markup()).toContain('已搁置');
  });

  it('leaves the mobile home, person overview and unaffiliated actor panes free of empty scaffolding', () => {
    const { world, actor, outsider } = fixture();
    const inspect = (cultivator: typeof actor, workspaceSection: 'profile' | 'mind') => renderToStaticMarkup(
      <AgentInspector world={world} cultivator={cultivator} onSelectCultivator={() => undefined} workspaceSection={workspaceSection} />);
    expect(renderToStaticMarkup(<App />)).not.toContain('轮回残响');
    expect(inspect(actor, 'profile')).not.toContain('轮回残响');
    expect(inspect(actor, 'mind')).toContain('轮回残响');
    expect(inspect(outsider, 'mind')).not.toContain('轮回残响');
  });
});
