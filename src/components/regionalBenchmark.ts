import type {RegionalComparisonReading} from './RegionalSimulationPanel';

/** Measured from the same strict T6 start by scripts/regionalCommitmentOverlap.ts. Not a forecast. */
export const REGIONAL_BENCHMARK:RegionalComparisonReading={
  seed:70,profileLabel:'灵潮丰年 · T6 北井已付观测 · 关注太虚剑峰',months:12,
  metrics:[
    {label:'在世修士',monthly:21,regional:22,unit:' 人'},
    {label:'村镇人口',monthly:206,regional:206,unit:' 人'},
    {label:'各宗库灵石',monthly:24775,regional:24417,unit:' 枚'},
    {label:'地点留存的玉叶草',monthly:34,regional:39,unit:' 份'},
    {label:'实际延后行动',monthly:0,regional:46,unit:' 人月'},
  ],
};
