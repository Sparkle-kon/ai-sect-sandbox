import type { MapPoint } from './world';

export const FLIGHT_ROUNDS = 3;
export const FLIGHT_HISTORY = 16;
export const FLIGHT_MAX_POINTS = 9;
export const FLIGHT_OUTCOMES = ['moved','reached','held','camped','aided','retreated'] as const;
export const FLIGHT_REASONS = ['guide_lost','withdrawn','destination_lost','journey_ended','leader_lost','time_elapsed'] as const;
export type FlightOutcome = typeof FLIGHT_OUTCOMES[number];
export type FlightReason = typeof FLIGHT_REASONS[number];
export interface ProtagonistFlightRound {
  tick:number;
  round:1|2|3;
  outcome:FlightOutcome;
  reason?:FlightReason;
  locationId?:string;
  sourceEventId?:string;
  points:MapPoint[];
}
export interface ProtagonistFlight {
  id:string;
  arcId:string;
  actorId:string;
  guideId:string;
  pursuerId:string;
  bountyId:string;
  journeyId:string;
  contactEventId:string;
  originId:string;
  destinationId:string;
  openedTick:number;
  rounds:ProtagonistFlightRound[];
}
