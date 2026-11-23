type Validator=(value:unknown,path:string)=>void;
type Optional={optional:Validator};
type Builders={
  optional:(rule:Validator)=>Optional;
  structure:(rules:Record<string,Validator|Optional>)=>Validator;
  arr:(limit:number,rule:Validator)=>Validator;
  id:Validator;
  tick:Validator;
  bool:Validator;
};

export function abandonedQuarterSchema({optional,structure,arr,id,tick,bool}:Builders,limit:number){
  return structure({visits:arr(limit,structure({
    id,actorId:id,settlementId:id,siteId:id,enteredTick:tick,fromSiteId:id,migrationId:id,
    formerRecruitmentId:optional(id),supersededTick:optional(tick),inspectedTick:optional(tick),stayedTick:optional(tick),
    left:optional(structure({tick,destinationId:id,byChoice:bool})),
  }))});
}
