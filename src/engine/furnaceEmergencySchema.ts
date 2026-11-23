type Validator = (value:unknown,path:string)=>void;
type Optional = {optional:Validator};
interface Builders {
  optional:(rule:Validator)=>Optional;
  structure:(rules:Record<string,Validator|Optional>)=>Validator;
  arr:(max:number,rule:Validator)=>Validator;
  num:(min:number,max:number,integral?:boolean)=>Validator;
  one:(...values:(string|number)[])=>Validator;
  id:Validator;
  tick:Validator;
}

export function furnaceEmergencySchema({optional,structure,arr,num,one,id,tick}:Builders,max:number) {
  return structure({cases:arr(max,structure({
    id,safetyId:id,siteId:id,studentId:id,mentorId:id,tuitionId:id,usedTick:tick,damagedTick:tick,
    hazardId:id,injuryEventId:id,injuryHp:num(1,Number.MAX_SAFE_INTEGER,true),
    decision:optional(structure({move:one('brace','retreat','request_rescue'),tick,refugeId:optional(id),
      appliedTick:optional(tick),preventedHp:optional(num(1,12,true)),storedRoot:optional(one(1)),returnedTick:optional(tick),
      acceptedTick:optional(tick),crossedTick:optional(tick)})),
  }))});
}
