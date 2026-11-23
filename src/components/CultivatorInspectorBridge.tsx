import {lazy,Suspense,type ComponentProps} from 'react';
import type {AgentInspector as OriginalInspector} from './AgentInspector';
import type {CultivatorInspectorPanels} from './useCultivatorGuidancePanels';

const AgentInspector=lazy(async()=>({default:(await import('./AgentInspector')).AgentInspector}));

type InspectorProps=ComponentProps<typeof OriginalInspector>;
type Section=Extract<NonNullable<InspectorProps['workspaceSection']>,'profile'|'cultivation'|'mind'>;
export function CultivatorInspectorBridge({panels,section,...view}:Pick<InspectorProps,'world'|'cultivator'|'onSelectCultivator'|'historical'>&{
  panels:CultivatorInspectorPanels;section:Section;
}){
  return <Suspense fallback={<p role="status">载入修士档案…</p>}>
    <AgentInspector {...view} {...panels} workspaceSection={section}
      publicBonds={section==='profile'?panels.publicBonds:undefined}
      personalBonds={section==='profile'?panels.personalBonds:undefined}/>
  </Suspense>;
}
