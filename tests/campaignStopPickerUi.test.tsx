import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CampaignStopPicker, CampaignStopProgress, findCampaignStopOption, type CampaignStopOption } from '../src/components/CampaignStopPicker';
import type { CampaignStopReceipt } from '../src/engine/campaignStopCondition';

const sect = { condition: { kind: 'sect_leader_changed', sectId: 'internal-sect', initialLeaderId: 'internal-incumbent' },
  label: '丹霞宗' } satisfies CampaignStopOption;
const actor = { condition: { kind: 'actor_died', actorId: 'internal-actor' },
  label: '顾行舟（青云门）' } satisfies CampaignStopOption;
const separateActor = { condition: { kind: 'actor_died', actorId: 'same-name-actor' },
  label: '顾行舟（散修）' } satisfies CampaignStopOption;
const options = [sect, actor, separateActor];
const onChange = () => { throw Error('the optional picker must not change a selection during render'); };

describe('optional campaign stop area', () => {
  it('renders a single closed native fold without implicitly selecting any condition or target', () => {
    const html = renderToStaticMarkup(<CampaignStopPicker options={options} onChange={onChange} />);
    expect(html.match(/<details\b/g)).toHaveLength(1);
    expect(html).not.toMatch(/<details[^>]*\bopen(?:\s|=|>)/);
    expect(html).toContain('遇见变化就停（可选）');
    expect(html).toContain('value="" selected="">不设停止条件');
    expect(html).not.toMatch(/关注对象|<button|internal-|顾行舟/);
  });

  it('keeps a selected kind without a target incomplete and matches same-name people by real identity', () => {
    const draft = { kind: 'actor_died' } as const;
    const html = renderToStaticMarkup(<CampaignStopPicker options={options} value={draft} onChange={onChange} />);
    expect(html).toContain('请选择');
    expect(html).toContain('请选本分支中可用的关注对象后再预检');
    expect(html).toContain('顾行舟（青云门）');
    expect(html).toContain('顾行舟（散修）');
    expect(html).not.toMatch(/丹霞宗|internal-|same-name-actor/);
    expect(findCampaignStopOption(options, draft)).toBeUndefined();
    expect(findCampaignStopOption(options, { ...draft, targetId: 'same-name-actor' })).toBe(separateActor);
    expect(findCampaignStopOption([...options, separateActor], { ...draft, targetId: 'same-name-actor' })).toBeUndefined();
    expect(findCampaignStopOption(options, { kind: 'sect_leader_changed', targetId: 'internal-sect' })?.condition).toBe(sect.condition);
  });

  it('shows a verified actual stop separately from reaching the target with no hit or a mismatched receipt', () => {
    const receipt = { kind: 'actor_died', actorId: 'internal-actor', tick: 1202, year: 1101, month: 2,
      eventId: 'internal-public-event' } satisfies CampaignStopReceipt;
    const hit = renderToStaticMarkup(<CampaignStopProgress chosen={actor} outcome={{ status: 'stopped', receipt }} />);
    expect(hit).toContain('仙历 1101 年 2 月确证修士陨落，已在该月停止');
    expect(hit).toContain('该月有对应的公开实录');
    expect(hit).not.toContain('internal-');
    const neutral = renderToStaticMarkup(<CampaignStopProgress chosen={{ condition: actor.condition }}
      outcome={{ status: 'stopped', receipt }} />);
    expect(neutral).toContain('关注：修士陨落');
    expect(neutral).not.toMatch(/顾行舟|internal-/);
    const noHit = renderToStaticMarkup(<CampaignStopProgress chosen={actor} outcome={{ status: 'reached_target' }} />);
    expect(noHit).toContain('本次未触发所选停止条件');
    expect(noHit).not.toContain('确证');
    const mismatch = renderToStaticMarkup(<CampaignStopProgress chosen={separateActor} outcome={{ status: 'stopped', receipt }} />);
    expect(mismatch).toContain('无法核对所选条件的停止凭证');
    expect(mismatch).not.toContain('确证');
  });
});
