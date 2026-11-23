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
export function lastRosterSchema({optional,structure,arr,one,id,tick}:Builders,limit:number){
  return structure({entries:arr(limit,structure({
    id,foundingId:id,mergeEventId:id,closedTick:tick,closedSectId:id,closedLeaderId:id,siteId:id,
    receivingSectId:id,newGateSiteId:id,people:arr(limit,structure({
      actorId:id,
      home:optional(structure({settlementId:id,siteId:id,recruitmentId:id})),
      resolution:optional(structure({move:one('new_gate','home','stay'),tick,eventId:id,destinationId:optional(id)})),
    })),
  }))});
}
