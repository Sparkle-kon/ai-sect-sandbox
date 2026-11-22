import {describe,expect,it} from 'vitest';
import {canCommitHighDramaOpening} from '../src/components/useHighDramaOpening';
import {createInitialWorld} from '../src/data/initialWorld';

describe('native preset choice freshness',()=>{
  it('accepts only exact world, branch revision and available session after opening construction',()=>{
    const world=createInitialWorld(1,'spirit-bloom'),history={};
    const source={world,history,revision:2,blocked:false};
    expect(canCommitHighDramaOpening(source,{...source})).toBe(true);
    const abort=new AbortController();abort.abort();
    expect(canCommitHighDramaOpening(source,{...source},abort.signal)).toBe(false);
    for(const actual of [
      {...source,world:createInitialWorld(1,'spirit-bloom')},
      {...source,history:{}},
      {...source,revision:3},
      {...source,blocked:true},
    ])expect(canCommitHighDramaOpening(source,actual)).toBe(false);
  });
});
