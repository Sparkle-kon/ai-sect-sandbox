import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UpperPassagePanel, type UpperPassageControls } from '../src/components/UpperPassagePanel';
import { UpperPassageScroll } from '../src/components/UpperPassageScroll';
import type { UpperPassageScrollView } from '../src/engine/upperPassageScroll';

const scope='private-branch-view';
const sourceId='private-executed-move';
const walking=(kind:UpperPassageScrollView['kind'],nodeId:UpperPassageScrollView['nodeId']):UpperPassageScrollView=>
  ({kind,nodeId,tick:5,sourceId});

describe('physical upper passage scroll',()=>{
  it('keeps a still eligible preview and pending entry honest, without an arrival',()=>{
    const controls:UpperPassageControls={scopeKey:scope,revisionKey:{},pending:'enter',choices:[],onQueue:()=>false};
    const view={nodeId:'loc-vein-north' as const,options:[]};
    const html=renderToStaticMarkup(<UpperPassagePanel view={view} controls={controls}
      scroll={{kind:'eligible',tick:4,nodeId:view.nodeId}} scrollScopeKey={scope} animateScroll/>);
    expect(html).toContain('data-upper-passage-scroll="eligible"');
    expect(html).toContain('脚下仍是下界');
    expect(html).toContain('尚未过界、读阵或付款');
    expect(html).not.toMatch(/upperPassageInkSettle|过了界隙|回到寒玉井边|private-/u);
    expect(html).not.toContain('<button');
    expect(html.indexOf('<details')).toBeLessThan(html.indexOf('<figure'));
  });

  it('shows completed threshold, arrival, walking, and inward turns without exposing a next stop',()=>{
    const cases=[
      [walking('threshold','realm-passage-lower-step'),'所在：下界门槛'],
      [walking('threshold','realm-passage-upper-step'),'所在：界隙石阶'],
      [walking('arrived','realm-upper-gate'),'脚已落在上界'],
      [walking('walking','realm-upper-array'),'所在：上界观阵庭'],
      [walking('turning','realm-passage-upper-step'),'脚步已转回原路，还没有回到井边'],
    ] as const;
    for(const [view,text] of cases){
      const still=renderToStaticMarkup(<UpperPassageScroll view={view}/>);
      expect(still).toContain(text);
      expect(still).not.toContain('upperPassageInkSettle');
      const live=renderToStaticMarkup(<UpperPassageScroll view={view} animate/>);
      expect(live).toContain('prefers-reduced-motion: no-preference');
      expect(live).toContain('motion-safe:animate-[upperPassageInkSettle_760ms_ease-out_1_both]');
      expect(live).toMatch(/<svg[^>]+aria-hidden="true"[^>]+focusable="false"/u);
      expect(live).not.toMatch(/private-|上界议事廊|<button|clipPath/u);
    }
  });

  it('shows a fresh return above the still-closed local fold and rejects a mismatched current node',()=>{
    const returned=walking('returned','loc-vein-north');
    const view={nodeId:'loc-vein-north' as const,options:[]};
    const html=renderToStaticMarkup(<UpperPassagePanel view={view} scroll={returned} scrollScopeKey={scope}/>);
    expect(html.indexOf('data-upper-passage-scroll="returned"')).toBeLessThan(html.indexOf('<details'));
    expect(html).toContain('来路已经走完');
    expect(html).not.toMatch(/<details[^>]+open|<button|upperPassageInkSettle/u);
    const nonmatching=renderToStaticMarkup(<UpperPassagePanel view={view}
      scroll={walking('arrived','realm-upper-gate')} animateScroll/>);
    expect(nonmatching).not.toContain('data-upper-passage-scroll');
    expect(nonmatching).not.toContain('过了界隙');
    const unstamped=renderToStaticMarkup(<UpperPassageScroll view={{...returned,sourceId:undefined}} animate/>);
    expect(unstamped).not.toContain('upperPassageInkSettle');
  });
});
