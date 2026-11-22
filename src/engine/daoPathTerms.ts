import type {DaoIntentActivation,DaoPathId,DaoPathMove,DaoPathRank,DaoPathPractice} from '../types/daoPath';

export const DAO_INTENT_QI=12;
export const DAO_INTENT_READY_TICKS=4;
export const DAO_INTENT_HISTORY=24;
export const DAO_PATH_RANK_COUNTS=[2,4,6] as const;
export const DAO_PATH_MAX_PRACTICES=DAO_PATH_RANK_COUNTS[2];
interface DaoPathRule {
  readonly name:string;
  readonly intent:string;
  readonly color:string;
  readonly description:string;
  readonly qi:number;
  readonly herb?:DaoPathPractice['herbPaid'];
  readonly stones?:number;
  readonly hp?:number;
  readonly power:readonly [number,number,number];
  readonly incoming:readonly [number,number,number];
}
export const DAO_PATHS:Readonly<Record<DaoPathId,DaoPathRule>>={
  sword:{name:'剑道',intent:'万剑归宗',color:'#a5edff',description:'温养自己已绑定的真器，养成剑意后以锋势破敌。',
    qi:6,herb:'earth_root',power:[1.12,1.20,1.30],incoming:[1,1,1]},
  alchemy:{name:'丹道',intent:'丹火回元',color:'#ffd276',description:'在实炉前炼化灵叶；临战以内息守住经脉。',
    qi:8,herb:'jade_leaf',power:[1.03,1.06,1.09],incoming:[.88,.82,.76]},
  formation:{name:'阵道',intent:'阵罡护身',color:'#b2acff',description:'在宗门实阵前缴料校阵；护法重在卸力。',
    qi:8,stones:6,power:[1.04,1.08,1.12],incoming:[.83,.75,.68]},
  shadow:{name:'魔道',intent:'幽刃裂空',color:'#ed72bf',description:'耗幽影苔习魔意；换更凌厉的出手，也更易受创。',
    qi:10,herb:'shadow_moss',power:[1.18,1.27,1.36],incoming:[1.06,1.08,1.10]},
  body:{name:'体修',intent:'金身镇岳',color:'#ddaa86',description:'以真实气血锻体，临阵兼顾抗击与回手。',
    qi:12,hp:4,power:[1.08,1.12,1.16],incoming:[.88,.80,.72]},
};
export const daoPathRank=(count:number):0|DaoPathRank=>count>=6?3:count>=4?2:count>=2?1:0;
export const daoPathEventId=(actorId:string,tick:number,move:DaoPathMove)=>`evt-${tick}-${actorId}-dao-${move}`;
export function daoIntentModifiers(intent:Pick<DaoIntentActivation,'pathId'|'rank'>){
  const rule=DAO_PATHS[intent.pathId],i=intent.rank-1;
  return {power:rule.power[i],incoming:rule.incoming[i]};
}
