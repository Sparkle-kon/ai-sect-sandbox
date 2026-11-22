import type {ComponentProps,ReactElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {ChronicleArchiveHub,type ChronicleArchiveHubProps} from '../src/components/hubs/ChronicleArchiveHub';
import {useWorldSimulationController} from '../src/controllers/useWorldSimulationController';
import type {ChronicleFeedReturn} from '../src/components/ChronicleFeed';

type Route=Pick<ChronicleArchiveHubProps,'initialOpen'|'rememberedOpen'|'forcedOpen'>;
function Harness({active=true,route,returnPosition,personal=false,onOpenChange,onReturnHandled}:{
  active?:boolean;route?:Route;returnPosition?:ChronicleFeedReturn;personal?:boolean;
  onOpenChange?:ChronicleArchiveHubProps['onOpenChange'];onReturnHandled?:ComponentProps<typeof ChronicleArchiveHub>['feed']['onReturnHandled'];
}){
  const simulation=useWorldSimulationController({playbackEnabled:false,inspectCampaign:false,
    onPreviewContextChange:()=>{},onHistoricalPreview:()=>{},onActivate:()=>{}});
  return <ChronicleArchiveHub simulation={simulation} selectedCultivator={simulation.world.cultivators[0]}
    active={active} {...route} onOpenChange={onOpenChange}
    feed={{events:simulation.world.events,returnPosition,onReturnHandled}}
    personal={personal?{available:true,active:false,onToggle:()=>{}}:undefined}
    scopedSupplyLinks={[]} writeAnnotation={async()=> 'saved'} writeWatchlist={async()=> 'saved'} campaignStopOptions={[]}/>;
}

async function renderReady(element:ReactElement):Promise<string>{
  const {renderToReadableStream}=await vi.importActual<typeof import('react-dom/server')>('react-dom/server.browser');
  const stream=await renderToReadableStream(element);
  await stream.allReady;
  return new Response(stream).text();
}

describe('chronicle archive hub, native route compatibility',()=>{
  it('uses the same opening scene and mounts no unrelated work while active or hidden',async()=>{
    const html=await renderReady(<Harness personal/>);
    expect(html).toContain('纪事与历史');
    expect(html).toContain('陨仙墟异动');
    expect(html).not.toContain('载入时间线…');
    expect(html).not.toContain('载入藏书阁…');
    expect(renderToStaticMarkup(<Harness active={false}/>)).toBe('');
  });

  it('uses the seven existing leaf IDs and preserves explicitly collapsed mobile preference',()=>{
    const leaves=[
      ['library','载入藏书阁…'],['notebook','载入分支记录…'],['rank-season','载入赛季榜…'],
      ['timeline','载入时间线…'],['witness','载入证词记录…'],['estate','载入遗产账簿…'],
    ];
    for(const [id,label] of leaves){
      const markup=renderToStaticMarkup(<Harness route={{rememberedOpen:id}}/>);
      expect(markup).toContain(label);
      expect(markup).not.toContain('陨仙墟异动');
      expect(leafPaths(markup)).toEqual([label]);
    }
    const collapsed=renderToStaticMarkup(<Harness route={{initialOpen:'feed',rememberedOpen:null}}/>);
    expect(collapsed).toContain('更多内容');
    expect(collapsed).not.toContain('陨仙墟异动');
    expect(leafPaths(collapsed)).toEqual([]);
  });

  it('hands a temporary return to the original feed without rewriting the selected leaf',async()=>{
    const onOpenChange=vi.fn(), onReturnHandled=vi.fn();
    const returnPosition:ChronicleFeedReturn={request:{eventId:'evt-init-1',kind:'site',targetId:'loc-ruins'},
      listScrollTop:24,pageScrollY:88,token:5,protagonistArchiveOpen:true};
    const route={rememberedOpen:'notebook'};
    const before=renderToStaticMarkup(<Harness route={route} personal/>);
    const returned=await renderReady(<Harness route={route} personal returnPosition={returnPosition}
      onOpenChange={onOpenChange} onReturnHandled={onReturnHandled}/>);
    expect(before).toContain('载入分支记录…');
    expect(returned).not.toContain('载入分支记录…');
    expect(returned).not.toContain('更多内容');
    expect(returned).toContain('陨仙墟异动');
    expect(returned).not.toContain('亲历视角');
    expect(onOpenChange).not.toHaveBeenCalled();
    // The existing DOM layout restoration, not server render, owns acknowledgement.
    expect(onReturnHandled).not.toHaveBeenCalled();
  });
});

const leafPaths=(markup:string)=>[...markup.matchAll(/载入(?:藏书阁|分支记录|赛季榜|时间线|证词记录|遗产账簿)…/g)].map(match=>match[0]);
