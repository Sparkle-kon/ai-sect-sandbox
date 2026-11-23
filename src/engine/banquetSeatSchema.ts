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
export function banquetSeatSchema({optional,structure,arr,one,id,tick}:Builders,limit:number){
  return structure({tables:arr(limit,structure({
    id,occasionId:id,siteId:id,invitationEventId:id,crownEventId:id,invitedTick:tick,seatTick:tick,finalistIds:arr(2,id),
    choices:arr(4,structure({actorId:id,move:one('attend','decline','late'),tick,eventId:id,fromSiteId:optional(id)})),
    summary:optional(structure({tick,eventId:id,presentIds:arr(2,id)})),
  }))});
}
