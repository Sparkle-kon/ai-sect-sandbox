import { lazy, Suspense, useMemo } from 'react';
import { activeAvatar } from '../engine/avatarEngine';
import { projectTournamentBanquet } from '../engine/tournamentBanquet';
import type { WorldState } from '../types/world';

const TournamentBanquetCard=lazy(async()=>({default:(await import('./TournamentBanquetCard')).TournamentBanquetCard}));

/** The existing story slot is quiet again after the event month. The World fold can still read the retained hall. */
export function useTournamentBanquetScene(world:WorldState,scopeKey:string,active:boolean,historical:boolean){
  const owner=active&&!historical?activeAvatar(world):undefined;
  const view=useMemo(()=>active?projectTournamentBanquet(world,owner):undefined,[active,world,owner]);
  const card=view?<Suspense fallback={null}><TournamentBanquetCard view={view} revision={world}
    scopeKey={`${scopeKey}:${owner?.id??''}`}/></Suspense>:undefined;
  return {card,story:view&&(view.hall.tick===world.tick||view.after?.tick===world.tick)?card:undefined};
}
