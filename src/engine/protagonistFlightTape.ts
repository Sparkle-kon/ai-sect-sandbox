import type { MapPoint, WorldEvent, WorldState } from '../types/world';

export interface FlightPursuit {
  hunterId:string;
  targetId:string;
  bountyId:string;
  siteId:string;
  event:WorldEvent;
}
export interface FlightStride {
  journeyId:string;
  event:WorldEvent;
  points:MapPoint[];
}
interface FlightTape { pursuits:FlightPursuit[]; strides:FlightStride[] }
const liveTapes=new WeakMap<WorldState,FlightTape>();
/** Durable receipts are written only by the real monthly reconciler, never by a preview or direct probe. */
export function trackFlightTurn(world:WorldState):void {
  const lead=world.protagonistSuccession.arcs.at(-1);
  if((lead&&lead.endedTick===undefined)||world.protagonistFlights?.length) liveTapes.set(world,{pursuits:[],strides:[]});
}
export function recordFlightPursuit(world:WorldState,proof:FlightPursuit):void{
  liveTapes.get(world)?.pursuits.push(proof);
}
export function recordFlightStride(world:WorldState,journeyId:string,event:WorldEvent,points:MapPoint[]):void{
  if(world.protagonistFlights?.some(row=>row.journeyId===journeyId&&row.rounds.length<3))
    liveTapes.get(world)?.strides.push({journeyId,event,points});
}
export function finishFlightTape(world:WorldState):FlightTape|undefined{
  const result=liveTapes.get(world);
  liveTapes.delete(world);
  return result;
}
