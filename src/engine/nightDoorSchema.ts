type Validator=(value:unknown,path:string)=>void;
type Optional={optional:Validator};
type Builders={
  optional:(rule:Validator)=>Optional;
  structure:(rules:Record<string,Validator|Optional>)=>Validator;
  arr:(limit:number,rule:Validator)=>Validator;
  one:(...values:(string|number)[])=>Validator;
  id:Validator;
  tick:Validator;
};
export function nightDoorSchema({optional,structure,arr,one,id,tick}:Builders,limit:number){
  return structure({
    blocks:arr(limit,structure({
      forkId:id,actorId:id,destinationId:id,tick,pathIndex:tick,hazardId:id,hazardTileId:id,hazardCreatedTick:tick,hazardExpiresTick:tick,
    })),
    encounters:arr(limit,structure({
      id,forkId:id,guestId:id,hostId:id,hostHouseholdId:id,villageId:id,siteId:id,shelterProjectId:id,arrivalTick:tick,arrivalEventId:id,
      acquaintanceId:optional(id),acquaintanceEventId:optional(id),identifiedTick:optional(tick),closedTick:optional(tick),
      offer:optional(structure({move:one('shelter','escort'),tick,refugeId:optional(id),acceptedTick:optional(tick),expiresTick:optional(tick),
        crossed:optional(arr(2,structure({actorId:id,tick})))})),
    })),
  });
}
