import { describe, expect, it } from 'vitest';
import {
  commitFairModelTurn, createFairModelTurnState, longestModelWait, planFairModelTurn,
} from '../src/engine/fairModelTurnEngine';
import type { FairModelTurnState } from '../src/engine/fairModelTurnEngine';

const completed = (state: FairModelTurnState, eligible: readonly string[], planned: readonly string[], started = planned,
  living = eligible) => commitFairModelTurn(state, {
  eligibleActorIds: eligible, livingActorIds: living, plannedActorIds: planned, startedActorIds: started,
});

describe('fair model slot turns', () => {
  it('visits all 526 candidates before any repeat in two complete cycles with only three mocked opportunities each round', () => {
    const all = Array.from({ length:526 }, (_,i) => `npc-${i + 1}`);
    const asc = [...all].sort();
    const visited: string[] = [];
    let state = createFairModelTurnState();
    let maxObserved = 0;
    for (let round = 0; round < Math.ceil(all.length * 2 / 3); round++) {
      // The world can deliver actor identities in either order. Sorting and age come from the planner.
      const eligible = round % 2 ? all : [...all].reverse();
      const planned = planFairModelTurn(state,eligible,3);
      expect(planned).toHaveLength(3);
      visited.push(...planned);
      state = completed(state,eligible,planned);
      maxObserved = Math.max(maxObserved,longestModelWait(state,all));
    }
    expect(visited.slice(0,526)).toEqual(asc);
    expect(visited.slice(526,1052)).toEqual(asc);
    expect(new Set(visited.slice(0,526)).size).toBe(526);
    expect(maxObserved).toBe(175);
  });

  it('keeps a blocked or queued actor waiting until a request actually starts', () => {
    const eligible = ['a','b','c','d'];
    const first = createFairModelTurnState();
    const planned = planFairModelTurn(first,eligible,2);
    expect(planned).toEqual(['a','b']);
    const firstDone = completed(first,eligible,planned,['b']);
    expect(firstDone.lastStartedActorId).toBe('b');
    expect(firstDone.waitByActor.get('a')).toBe(1);
    expect(firstDone.waitByActor.has('b')).toBe(false);
    expect(planFairModelTurn(firstDone,eligible,3)).toEqual(['c','d','a']);
    const noService = completed(firstDone,eligible,['c','d'],[]);
    expect(noService.lastStartedActorId).toBe('b');
    expect(noService.waitByActor.get('a')).toBe(2);
    expect(noService.waitByActor.get('c')).toBe(2);
    expect(noService.waitByActor.get('b')).toBe(1);
    expect(longestModelWait(noService,['b'])).toBe(1);
  });

  it('does not age temporary blocks, prunes removed identities, and gives existing accumulated wait priority on return', () => {
    const ids = ['a','b','c','d'];
    const initial = completed(createFairModelTurnState(),ids,[],[]);
    const next = completed(initial,ids,[],[]);
    const oneTurn = completed(next,['b','c'],['b','c'],['b','c'],['b','c','d']);
    expect(oneTurn.waitByActor.has('a')).toBe(false);
    expect(oneTurn.waitByActor.get('d')).toBe(2);
    expect(longestModelWait(oneTurn,['b','c'])).toBe(0);
    expect(longestModelWait(oneTurn)).toBe(2);
    expect(planFairModelTurn(oneTurn,['b','c','d','newcomer'],1)).toEqual(['d']);
    // Planning multiple times and creating a fresh branch remain side-effect free.
    expect(planFairModelTurn(next,ids,4)).toEqual(ids);
    expect(longestModelWait(createFairModelTurnState())).toBe(0);
  });

  it('uses actual start ordering and only legitimate eligible planned IDs to move the ASCII ring', () => {
    const eligible = ['z','Z','b','A','a','c','__proto__','constructor'];
    const initial = createFairModelTurnState();
    const planned = planFairModelTurn(initial,eligible,99);
    expect(planned).toEqual(['A','Z','__proto__','a','b','c','constructor','z']);
    const state = completed(initial,eligible,planned,['b','c','hidden','b','A']);
    expect(state.lastStartedActorId).toBe('A');
    expect(state.waitByActor.has('hidden')).toBe(false);
    expect(planFairModelTurn(state,eligible,3)).toEqual(['Z','__proto__','a']);
    expect(planFairModelTurn({ ...state,lastStartedActorId:'a' },['z','b','A'],3)).toEqual(['z','b','A']);
    const actorLostAtSettlement = completed(initial,['a','b','c'],['b'],['b'],['a','c']);
    expect(actorLostAtSettlement.lastStartedActorId).toBe('b');
    expect(actorLostAtSettlement.waitByActor.has('b')).toBe(false);
    expect(planFairModelTurn(actorLostAtSettlement,['c','a'],2)).toEqual(['c','a']);
  });

  it('returns no slots under zero/invalid budget and never multiplies wait with duplicate identities', () => {
    const initial = createFairModelTurnState();
    const invalid = [0,-1,Number.NaN,Infinity,.9];
    for (const budget of invalid) expect(planFairModelTurn(initial,['a','b'],budget)).toEqual([]);
    const state = completed(initial,['a','a','b',''],['b'],['a','b','b'],['a','a','b']);
    expect([...state.waitByActor]).toEqual([['a',1]]);
    expect(planFairModelTurn(state,['a','b','a',''],1.9)).toEqual(['a']);
  });
});
