type Validator=(value:unknown,path:string)=>void;
type Optional={optional:Validator};
type Builders={
  optional:(rule:Validator)=>Optional;
  structure:(rules:Record<string,Validator|Optional>)=>Validator;
  arr:(limit:number,rule:Validator)=>Validator;
  id:Validator;
  tick:Validator;
};

export function reliefHomecomingSchema({optional,structure,arr,id,tick}:Builders,limit:number){
  return structure({
    departures:arr(limit,structure({actorId:id,villageId:id,siteId:id,tick})),
    scenes:arr(limit,structure({
      id,villageId:id,siteId:id,travelerId:id,helperId:id,departureTick:tick,disasterRecordId:id,
      hazardId:id,hazardExpiresTick:tick,reliefRecordId:id,deedId:id,reliefTick:tick,aidWitnessIds:arr(limit,id),
      return:optional(structure({tick,witnessIds:arr(limit,id)})),
    })),
  });
}
