import type {RegionalComparisonReading} from './RegionalSimulationPanel';

/** Reproduced by tests/regionalSimulation.test.ts; this is a dated comparison, not a live forecast. */
export const REGIONAL_BENCHMARK:RegionalComparisonReading={
  seed:2031,profileLabel:'万象初开 · 含北脉采矿 · 关注太虚剑峰',months:24,
  metrics:[
    {label:'在世修士',monthly:22,regional:22,unit:' 人'},
    {label:'村镇人口',monthly:204,regional:205,unit:' 人'},
    {label:'宗门及人物持有的灵石',monthly:37052,regional:37235,unit:' 枚'},
    {label:'地点与人物持有的玉叶草',monthly:50,regional:55,unit:' 份'},
    {label:'收录的纪元事件凭证',monthly:3,regional:2,unit:' 条'},
  ],
};
