export type ApprenticeshipReunionMove='ask'|'refuse'|'teach'|'accept_teaching'|'public_spar'|'accept_spar'|'part';
export type ApprenticeshipReunionOption={action:'APPRENTICESHIP_REUNION'}&(
  {apprenticeshipReunionMove:'ask';targetCultivatorId:string;targetApprenticeshipReunionId?:never}|
  {apprenticeshipReunionMove:Exclude<ApprenticeshipReunionMove,'ask'>;targetApprenticeshipReunionId:string;targetCultivatorId?:never});
export interface ApprenticeshipReunionCase {
  id:string;studentId:string;mentorId:string;askTick:number;askSiteId:string;refusedTick?:number;
  departure?:{tick:number;actorId:string;toSiteId:string};
  reunion?:{tick:number;actorId:string;siteId:string};
  quiet?:{tick:number;eventId:string};
  teaching?:{tick:number;tuitionId:string;acceptedTick?:number};
  sparring?:{tick:number;actorId:string;sparringId:string;acceptedTick?:number;completedTick?:number;eventId?:string};
  farewell?:{tick:number;actorId:string};
}
export interface ApprenticeshipReunionState {cases:ApprenticeshipReunionCase[]}
export interface ApprenticeshipReunionView {siteName:string;siteId?:string;options:readonly ApprenticeshipReunionOption[];receipt?:{title:string;description:string};past?:{title:string;description:string}}
