type Validator=(value:unknown,path:string)=>void;
type Optional={optional:Validator};
type Builders={
  optional:(rule:Validator)=>Optional;
  structure:(rules:Record<string,Validator|Optional>)=>Validator;
  arr:(limit:number,rule:Validator)=>Validator;
  one:(...values:(string|number)[])=>Validator;
  num:(min:number,max:number,integral?:boolean)=>Validator;
  id:Validator;
  tick:Validator;
};

export function boundaryGapSchema({optional,structure,arr,one,num,id,tick}:Builders,limit:number){
  return structure({responses:arr(limit,structure({
    reliefId:id,postSiteId:id,actorId:id,gapTick:tick,tick,move:one('cover','refuse','stay'),
    targetCultivatorId:optional(id),
    applied:optional(structure({tick,hazardId:id,preventedHp:num(1,12,true)})),
  }))});
}
