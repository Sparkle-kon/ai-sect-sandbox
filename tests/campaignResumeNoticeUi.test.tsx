import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CampaignResumeNotice, type CampaignResumeNoticeProps } from '../src/components/CampaignResumeNotice';

const noAction = () => { throw new Error('rendering must not resume, restore or discard'); };
const props = {
  receipt: { source: { year: 1001, month: 12 }, target: { year: 1051, month: 1 }, verified: { year: 1021, month: 12 },
    completedMonths: 240, requestedMonths: 589 },
  scope: 'same_source', onResume: noAction, onReviewRestore: noAction, onConfirmRestore: noAction,
  onCancelRestore: noAction, onDiscard: noAction,
} satisfies CampaignResumeNoticeProps;

describe('pending multi-batch campaign notice', () => {
  it('shows captured source, future target and separately persisted verified progress', () => {
    const html = renderToStaticMarkup(<CampaignResumeNotice {...props} />);
    expect(html).toContain('源线日期</dt><dd>仙历 1001 年 12 月');
    expect(html).toContain('目标日期</dt><dd>仙历 1051 年 1 月');
    expect(html).toContain('最近已核验并保存</dt><dd>仙历 1021 年 12 月');
    expect(html).toContain('240 / 589 个月');
    expect(html).toMatch(/<progress[^>]*value="240" max="589"/);
    expect(html).toContain('从已保存进度继续推演');
    expect(html).toContain('不改当前运行世界或普通存档');
    expect(html).not.toMatch(/将被替换|确认恢复源线|<details|role="tab"/);
  });

  it('requires a separate confirmation before resuming in a different active world', () => {
    const render = (confirmingRestore: boolean) => renderToStaticMarkup(<CampaignResumeNotice {...props}
      scope="different_context" confirmingRestore={confirmingRestore} />);
    expect(render(false)).toContain('当前世界不是这次推演的源线');
    expect(render(false)).not.toMatch(/确认恢复源线|从已保存进度继续推演/);
    const reviewed = render(true);
    expect(reviewed).toContain('当前未保存的世界进度将被替换');
    expect(reviewed).toContain('确认恢复源线和完整原分支');
    expect(reviewed).toContain('不恢复，返回核对');
    expect(reviewed).not.toContain('丢弃待续推演');
  });

  it('does not report an unverified live candidate as a durable checkpoint', () => {
    const html = renderToStaticMarkup(<CampaignResumeNotice {...props} disabled
      receipt={{...props.receipt, verified: undefined, completedMonths: 0}} />);
    expect(html).toContain('尚无已保存检查点');
    expect(html).not.toContain('仙历 1021 年 12 月');
    expect(html.match(/<button type="button"[^>]*disabled=""/g)).toHaveLength(2);
  });
});
