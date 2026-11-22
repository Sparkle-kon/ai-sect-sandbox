import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {BattlefieldRevisitScene} from '../src/components/BattlefieldRevisitScene';
import type {BattlefieldRevisitOption} from '../src/engine/battlefieldRevisit';

const repair:BattlefieldRevisitOption={action:'BATTLEFIELD_REVISIT',battlefieldRevisitMove:'repair',targetBattlefieldSiegeId:'opaque-siege'};
const seek:BattlefieldRevisitOption={...repair,battlefieldRevisitMove:'seek',targetCultivatorId:'opaque-old-witness'};

describe('a survivor’s own return to a damaged array',()=>{
  it('only gives the two exact current authorized options, tells the cost, and does not imply anyone has been found',()=>{
    const onChoose=vi.fn(),seekName=vi.fn(()=> '薛照雪');
    const view=renderToStaticMarkup(<BattlefieldRevisitScene label="山门" options={[repair,seek]} onChoose={onChoose} seekName={seekName}/>);
    expect(view).toContain('重到旧阵前');
    expect(view).toContain('真正修阵才实耗 8 真气');
    expect(view).toContain('寻薛照雪');
    expect(view.match(/<button\b/g)).toHaveLength(2);
    expect(view.match(/min-h-11/g)).toHaveLength(2);
    expect(view).not.toMatch(/opaque-|已经找到|已经修好/u);
    expect(seekName).toHaveBeenCalledWith(seek);
    expect(onChoose).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(<BattlefieldRevisitScene label="山门" options={[]} onChoose={onChoose}/>)).toBe('');
  });

  it('shows the exact completed result without leaving another actionable choice',()=>{
    const receipt={title:'同伴仍在',description:'在原山门遇见亲历那一战的薛照雪。'};
    const html=renderToStaticMarkup(<BattlefieldRevisitScene label="山门" options={[seek]} receipt={receipt} onChoose={vi.fn()}/>);
    expect(html).toContain(receipt.title);
    expect(html).toContain(receipt.description);
    expect(html).not.toMatch(/<button| opaque-/u);
  });
});
