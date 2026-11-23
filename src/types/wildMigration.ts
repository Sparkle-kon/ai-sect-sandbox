import type {QiWeatherKind,QiWeatherSeason} from '../engine/weatherEngine';
import type {SpiritBeast} from './world';

export type WildMigrationMove='let_pass'|'track'|'drive';
export type WildMigrationSide='origin'|'destination';
export interface WildMigrationWeather {season:QiWeatherSeason;kind:QiWeatherKind;intensity:number}
export interface WildMigrationRecord {
  id:string;beastId:string;kind:SpiritBeast['kind'];tick:number;sourceEventId:string;
  from:{siteId:string;sectId:string;witnessIds:string[]};to:{siteId:string;sectId:string;witnessIds:string[]};
  fromWeather:WildMigrationWeather;toWeather:WildMigrationWeather;
  responses:{side:WildMigrationSide;actorId:string;tick:number;move:WildMigrationMove;destinationId?:string;paidQi:0|8}[];
}
export interface WildMigrationState {records:WildMigrationRecord[]}
export type WildMigrationOption={action:'WILD_MIGRATION';targetWildMigrationId:string}&(
  {wildMigrationMove:'let_pass'|'track';targetLocationId?:never}|{wildMigrationMove:'drive';targetLocationId:string});
export interface WildMigrationView {
  side:WildMigrationSide;siteName:string;weather:WildMigrationWeather;localKind?:SpiritBeast['kind'];
  options:readonly WildMigrationOption[];receipt?:{title:string;description:string};
}
