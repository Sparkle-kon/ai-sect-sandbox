export interface TournamentArenaBout {
  firstId:string;
  secondId?:string;
  winnerId:string;
  firstDamage:number;
  secondDamage?:number;
}
export interface TournamentArenaRound {
  round:number;
  tick:number;
  eventId:string;
  absentIds:string[];
  bouts:TournamentArenaBout[];
}
export interface TournamentArenaPrize {
  tick:number;
  actorId:string;
  artifactId:string;
  title:'百年论剑魁首';
}
export interface TournamentArenaTerminal {
  tick:number;
  status:'completed'|'cancelled';
  eventId:string;
}
export interface TournamentArena {
  openedTick:number;
  seededIds:string[];
  rounds:TournamentArenaRound[];
  prize?:TournamentArenaPrize;
  terminal?:TournamentArenaTerminal;
}
