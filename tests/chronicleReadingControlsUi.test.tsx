import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChronicleReadingMarkButton, ChronicleReadingResumeButton } from '../src/components/ChronicleReadingControls';

const onClick = () => { throw new Error('static controls must not act on render'); };

describe('public chronicle reading controls', () => {
  it('uses separate native, focus-visible actions with clear text and mobile target heights', () => {
    const mark = renderToStaticMarkup(<ChronicleReadingMarkButton onClick={onClick} />);
    const resume = renderToStaticMarkup(<ChronicleReadingResumeButton onClick={onClick} />);
    expect(mark).toMatch(/^<button type="button"[^>]+>记住此场<\/button>$/);
    expect(resume).toMatch(/^<button type="button"[^>]+>回到记住的场景<\/button>$/);
    for (const html of [mark, resume]) {
      expect(html).toContain('min-h-11');
      expect(html).toContain('focus-visible:outline-2');
      expect(html).not.toMatch(/autofocus|role="tab"|aria-live=|tabindex=/i);
    }
  });

  it('keeps keyboard focus on the controls while checking a scene', () => {
    for (const Button of [ChronicleReadingMarkButton, ChronicleReadingResumeButton]) {
      const html = renderToStaticMarkup(<Button disabled onClick={onClick} />);
      expect(html).toMatch(/^<button type="button" aria-disabled="true"/);
      expect(html).not.toMatch(/\sdisabled=|tabindex="-1"/);
    }
  });
});
