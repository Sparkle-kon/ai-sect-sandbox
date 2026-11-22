export const DUNGEON_MOVES=['enter','gather','break_array','strike','claim','retreat'] as const;
export type DungeonMove=typeof DUNGEON_MOVES[number];
export type DungeonRoom='garden'|'hall'|'sanctum';
export type DungeonExit='retreated'|'escaped'|'collapse'|'rescued'|'lost';
export type DungeonOutcome='claimed'|'retreated'|'collapsed'|'lost';
export interface DungeonMember {
  actorId:string;
  enteredTick:number;
  leftTick?:number;
  exit?:DungeonExit;
  hpLost?:number;
}
type DungeonBase={tick:number;actorId:string;eventId:string};
export type DungeonStep=DungeonBase&(
  |{move:'enter'|'retreat'}
  |{move:'gather';jadeLeaf:1}
  |{move:'break_array';qiPaid:18}
  |{move:'strike';bossBefore:number;bossAfter:number;hpLost:number}
  |{move:'claim';stones:80;artifactId:string}
);
export interface ExpeditionDungeon {
  openedTick:number;
  room:DungeonRoom;
  bossHp:number;
  members:DungeonMember[];
  steps:DungeonStep[];
  closedTick?:number;
  outcome?:DungeonOutcome;
}
