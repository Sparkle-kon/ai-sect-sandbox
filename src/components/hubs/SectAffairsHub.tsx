import {lazy,Suspense} from 'react';
import type {Cultivator} from '../../types/world';
import {FocusedSectSummary} from '../FocusedSectSummary';
import {InstitutionHubPanel} from './InstitutionHubPanel';
import {buildSectAffairsControls,type SectAffairsSimulation} from './sectAffairsControls';

const AgentInspector=lazy(async()=>({default:(await import('../AgentInspector')).AgentInspector}));
const BoundaryReliefPanel=lazy(async()=>({default:(await import('../BoundaryReliefPanel')).BoundaryReliefPanel}));
const CeasefirePanel=lazy(async()=>({default:(await import('../CeasefirePanel')).CeasefirePanel}));
const FurnaceReservationPanel=lazy(async()=>({default:(await import('../FurnaceReservationPanel')).FurnaceReservationPanel}));
const OathContractsPanel=lazy(async()=>({default:(await import('../OathContractsPanel')).OathContractsPanel}));
const SanctuaryPanel=lazy(async()=>({default:(await import('../SanctuaryPanel')).SanctuaryPanel}));
const SectCreditPanel=lazy(async()=>({default:(await import('../SectCreditPanel')).SectCreditPanel}));
const SectDoctrinePanel=lazy(async()=>({default:(await import('../SectDoctrinePanel')).SectDoctrinePanel}));
const SectRelocationPanel=lazy(async()=>({default:(await import('../SectRelocationPanel')).SectRelocationPanel}));
const SectResearchPanel=lazy(async()=>({default:(await import('../SectResearchPanel')).SectResearchPanel}));
const WorkshopPanel=lazy(async()=>({default:(await import('../WorkshopPanel')).WorkshopPanel}));

const groups=[
  {id:'hall',label:'大殿治理',sectionIds:['governance','doctrine','council']},
  {id:'workbench',label:'阵炉研修',sectionIds:['research']},
  {id:'diplomacy',label:'外交防务',sectionIds:['oaths','ceasefire','sanctuary']},
  {id:'estate',label:'山门库账',sectionIds:['relocation','credit']},
];

export interface SectAffairsHubProps {
  simulation:SectAffairsSimulation;
  active:boolean;
  selectedCultivator?:Cultivator;
  onSelectCultivator:(id:string)=>void;
  focusSect?:{name:string;alignment:string};
  initialOpen?:string;
  rememberedOpen?:string|null;
  onOpenChange?:(id:string|null)=>void;
  onCouncil:()=>void;
}

export function SectAffairsHub({simulation,active,selectedCultivator,onSelectCultivator,focusSect,
  initialOpen='governance',rememberedOpen,onOpenChange,onCouncil}:SectAffairsHubProps){
  const {visibleWorld,preview,isStepping}=simulation;
  const controls=buildSectAffairsControls(simulation,active&&!focusSect,selectedCultivator);
  return <InstitutionHubPanel label="宗门事务" initialOpen={initialOpen} rememberedOpen={rememberedOpen}
    onOpenChange={onOpenChange} forcedOpen={focusSect?'governance':undefined} groups={groups} sections={[
      {id:'governance',label:'宗门地位、库账与外交',content:focusSect
        ? <FocusedSectSummary name={focusSect.name} alignment={focusSect.alignment}/>
        : <div className="space-y-2.5">
          <Suspense fallback={<p role="status">载入修士档案…</p>}>
            <AgentInspector world={visibleWorld} cultivator={selectedCultivator} onSelectCultivator={onSelectCultivator} workspaceSection="sect"
              medicineControls={controls.medicineControls} seasonReviewControls={controls.seasonReviewControls}/>
          </Suspense>
          {selectedCultivator&&visibleWorld.boundaryReliefs.cases.length>0&&
            <Suspense fallback={null}><BoundaryReliefPanel world={visibleWorld} cultivator={selectedCultivator}/></Suspense>}
        </div>},
      {id:'oaths',label:'天道契书与宗门仲裁',content:<Suspense fallback={<p role="status">载入契书记录…</p>}>
        <OathContractsPanel world={visibleWorld} cultivator={selectedCultivator}/>
      </Suspense>},
      {id:'doctrine',label:'道统与分合',content:<Suspense fallback={<p role="status">载入道统记录…</p>}>
        <SectDoctrinePanel world={visibleWorld} cultivator={selectedCultivator}
          foundingControls={controls.foundingControls} maturityControls={controls.maturityControls}/>
      </Suspense>},
      {id:'relocation',label:'山门迁移与旧址',content:<Suspense fallback={<p role="status">载入迁移记录…</p>}>
        <SectRelocationPanel world={visibleWorld} cultivator={selectedCultivator}/>
      </Suspense>},
      {id:'ceasefire',label:'停战与重建',content:<Suspense fallback={<p role="status">载入停战记录…</p>}>
        <CeasefirePanel world={visibleWorld} cultivator={selectedCultivator}/>
      </Suspense>},
      {id:'research',label:'论道会与共研创法',content:<div className="min-w-0 space-y-2.5">
        <Suspense fallback={<p role="status">载入论道记录…</p>}>
          <SectResearchPanel world={visibleWorld} cultivator={selectedCultivator}/>
        </Suspense>
        {selectedCultivator&&<Suspense fallback={<p role="status">载入阵炉与工坊…</p>}>
          <FurnaceReservationPanel world={visibleWorld} cultivator={selectedCultivator}/>
          <WorkshopPanel world={visibleWorld} cultivator={selectedCultivator} releaseControls={controls.workshopReleaseControls}
            estateControls={controls.workshopEstateControls} trainingControls={controls.craftTrainingControls}/>
        </Suspense>}
      </div>},
      {id:'sanctuary',label:'避难所与通行敕令',content:<Suspense fallback={<p role="status">载入避难所记录…</p>}>
        <SanctuaryPanel world={visibleWorld} cultivator={selectedCultivator}/>
      </Suspense>},
      {id:'credit',label:'宗门信贷与清算',content:<Suspense fallback={<p role="status">载入宗门信贷记录…</p>}>
        <SectCreditPanel world={visibleWorld} cultivator={selectedCultivator}/>
      </Suspense>},
      ...(preview?[]:[{id:'council',label:'长老议事厅',content:<button type="button" disabled={isStepping}
        onClick={onCouncil} className="inline-flex min-h-11 items-center justify-center rounded-md bg-violet-900/60 px-3 text-xs font-semibold text-violet-100 hover:bg-violet-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-40">
        打开长老议事厅
      </button>}]),
    ]}/>;
}
