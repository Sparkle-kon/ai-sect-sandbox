type Validator = (value:unknown,path:string)=>void;
type Optional = {optional:Validator};
interface Builders {
  optional:(rule:Validator)=>Optional;
  structure:(rules:Record<string,Validator|Optional>)=>Validator;
  arr:(max:number,rule:Validator)=>Validator;
  id:Validator;
  tick:Validator;
}

/** Use the standard strict save primitives without putting another large scene descriptor in the save loader. */
export function apprenticeshipReunionSchema({optional,structure,arr,id,tick}:Builders,max:number){
  return structure({cases:arr(max,structure({
    id,studentId:id,mentorId:id,askTick:tick,askSiteId:id,refusedTick:optional(tick),
    departure:optional(structure({tick,actorId:id,toSiteId:id})),
    reunion:optional(structure({tick,actorId:id,siteId:id})),
    quiet:optional(structure({tick,eventId:id})),
    teaching:optional(structure({tick,tuitionId:id,acceptedTick:optional(tick)})),
    sparring:optional(structure({tick,actorId:id,sparringId:id,acceptedTick:optional(tick),completedTick:optional(tick),eventId:optional(id)})),
    farewell:optional(structure({tick,actorId:id})),
  }))});
}
