import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MortalVillagesPanel } from '../src/components/MortalVillagesPanel';
import { VillageMemorialPanel } from '../src/components/VillageMemorialPanel';
import type { WorldState } from '../src/types/world';
import {
  civicActor as actor, civicChoice as choice, civicMemorialFixture,
  civicMove as move, civicTurn as turn,
} from './fixtures/civicMemorialFixture';

const panel = (world: WorldState, viewerId: string, villageId: string) =>
  renderToStaticMarkup(<VillageMemorialPanel world={world} cultivator={actor(world, viewerId)} villageId={villageId} />);

describe('local civic memorials in the existing village disclosure', () => {
  it('shows only actual authorized proposals and their unpaid status before an independent visit', () => {
    const { world, deedId, proposer, witness, outsider, siteId, settlementId } = civicMemorialFixture();
    expect(panel(world, proposer, settlementId)).toBe('');
    const opened = turn(world, {
      [proposer]: move('propose', deedId), [outsider]: choice('EXPLORE', { targetLocationId: siteId }),
    });
    const row = opened.civicMemorials.memorials[0];
    const proposed = panel(opened, proposer, settlementId);
    expect(proposed).toContain('本人提议：纪同山');
    expect(proposed).toContain('尚未立册，未为立册耗用物资');
    expect(proposed).not.toContain('乡祠册上，记下了');
    expect(proposed).not.toContain('<button');
    expect(panel(opened, outsider, settlementId)).toBe('');
    const available = turn(opened);
    expect(panel(available, witness, settlementId)).toContain('可作独立见证：纪同山');
    expect(panel(available, outsider, settlementId)).toBe('');
    const expired = structuredClone(available);
    expired.tick = row.expiresTick;
    expect(panel(expired, proposer, settlementId)).toBe('');
  });

  it('places the verified local scene first, preserves the frozen life status, and hides identity bindings', () => {
    const { world, deedId, subjectId, sameNameId, proposer, witness, outsider, siteId, settlementId } = civicMemorialFixture();
    const proposal = turn(world, {
      [proposer]: move('propose', deedId), [outsider]: choice('EXPLORE', { targetLocationId: siteId }),
    });
    const id = proposal.civicMemorials.memorials[0].id;
    const verified = turn(proposal, { [witness]: move('verify', id) });
    const html = panel(verified, outsider, settlementId);
    expect(html).toContain('乡祠册上，记下了纪同山赈济故里的事。');
    expect(html).toContain('已离原坊籍、入宗 · 立册时仍在世');
    expect(html).toContain('不能仅凭姓名认定是同一人');
    expect(html).toMatch(/<details class="[^"]+"><summary class="[^"]+">凭据与异闻/);
    expect(html).toContain('于第 ' + verified.tick + ' 轮立册');
    expect(html).not.toContain('待核验');
    for (const secret of [id, deedId, subjectId, sameNameId, witness, verified.civicMemorials.deeds[0].householdId]) {
      expect(html).not.toContain(secret);
    }
    expect(renderToStaticMarkup(<MortalVillagesPanel world={verified} cultivator={actor(verified, outsider)} />))
      .toContain('纪同山赈济故里');
    expect(panel(verified, outsider, 'not-the-original-village')).toBe('');
    const later = structuredClone(verified);
    later.month = 12;
    actor(later, subjectId).age = actor(later, subjectId).lifespan - 1;
    const laterClosed = turn(later);
    expect(actor(laterClosed, subjectId).alive).toBe(false);
    expect(panel(laterClosed, outsider, settlementId)).toContain('立册时仍在世');
    actor(laterClosed, outsider).locationId = 'loc-market-east';
    expect(panel(laterClosed, outsider, settlementId)).toBe('');
  });

  it('does not conflate a deceased same-name subject, conflicting reading, or independent correction', () => {
    const { world, deedId, sourceEventId, subjectId, sameNameId, proposer, witness, other, editor, settlementId } = civicMemorialFixture();
    world.month = 12;
    actor(world, subjectId).age = actor(world, subjectId).lifespan - 1;
    const retell = (chronicleReliefReading: 'full_supplies' | 'unfunded') => choice('CHRONICLE_ERRATA', {
      chronicleErrataMove: 'retell', targetChronicleSourceId: sourceEventId, chronicleReliefReading,
    });
    const claims = turn(world, {
      [proposer]: move('propose', deedId), [witness]: retell('full_supplies'), [other]: retell('unfunded'),
    });
    const verified = turn(claims, {
      [witness]: move('verify', claims.civicMemorials.memorials[0].id),
      [editor]: choice('CHRONICLE_ERRATA', {
        chronicleErrataMove: 'correct', targetChronicleSourceId: sourceEventId,
      }),
    });
    expect(actor(verified, sameNameId).alive).toBe(true);
    const html = panel(verified, proposer, settlementId);
    expect(html).toContain('立册时已故');
    expect(html).toContain('匿名异闻（未证） · 说法称：赈济物资未实际拨付');
    expect(html).toContain('核验勘误：赈济物资确已实付。原异闻仍存，不作实录');
    expect(html).not.toContain('身故日期');
    expect(html).not.toContain(editor);
    expect(html).not.toContain(sourceEventId);
  });
});
