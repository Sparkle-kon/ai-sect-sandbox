import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DoctrineFoundingConfirmation, DoctrineFoundingControls, type DoctrineFoundingChoice } from '../src/components/DoctrineFoundingControls';

const propose = { option: { action: 'DOCTRINE_FOUNDING', doctrineFoundingMove: 'propose',
  targetDoctrineSchoolId: 'private-school', targetRelocationId: 'internal-relocation' }, label: '太虚旧坛' } satisfies DoctrineFoundingChoice;
const signature = { option: { action: 'DOCTRINE_FOUNDING', doctrineFoundingMove: 'authorize',
  targetDoctrineFoundingId: 'internal-founding' } } satisfies DoctrineFoundingChoice;

describe('only exact native and unexecuted doctrine decisions', () => {
  it('omits all choices without actual capability and exposes scoped ordinals only', () => {
    const queue = vi.fn(() => false);
    expect(renderToStaticMarkup(<DoctrineFoundingControls scopeKey="private-scope" choices={[]} onQueue={queue} />)).toBe('');
    expect(renderToStaticMarkup(<DoctrineFoundingControls scopeKey="private-scope" choices={[propose]} />)).toBe('');
    expect(renderToStaticMarkup(<DoctrineFoundingControls scopeKey="private-scope" choices={[propose, propose]} onQueue={queue} />)).toBe('');
    const html = renderToStaticMarkup(<DoctrineFoundingControls scopeKey="private-scope" revisionKey={{}} choices={[propose, signature]} onQueue={queue} />);
    expect(html).toContain('value="" selected="">请选择');
    expect(html).toContain('value="0">提议另立宗门 · 太虚旧坛');
    expect(html).toContain('value="1">以原宗掌门身份允议');
    expect(html).not.toMatch(/private-|internal-|确认排入|签字已生效/);
    expect(queue).not.toHaveBeenCalled();
  });

  it('distinguishes exact local assent from queueing with a disclosed current essence cost', () => {
    const html = renderToStaticMarkup(<DoctrineFoundingConfirmation choice={signature} onConfirm={() => undefined} onCancel={() => undefined} />);
    expect(html).toContain('确认排入：以原宗掌门身份允议');
    expect(html).toContain('亲自在原宗迁后的山门');
    expect(html).toContain('成功排入消耗 5 神识，不推进月份');
    expect(html).toContain('签字与另立须届时亲自办成');
    expect(html).not.toContain('internal-founding');
  });
});
