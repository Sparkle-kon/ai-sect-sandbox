import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DanxiaMedicineConfirmation, DanxiaMedicineControls } from '../src/components/DanxiaMedicineControls';
import { DanxiaMedicineReceipts } from '../src/components/DanxiaMedicineReceipts';
import type { DanxiaMedicineView } from '../src/engine/danxiaMedicineEngine';

const retain={option:{action:'DANXIA_MEDICINE',danxiaMedicineMove:'retain',targetDanxiaShortageId:'private-short'} } as const;
const escort={option:{action:'DANXIA_MEDICINE',danxiaMedicineMove:'offer_ship',targetDanxiaShortageId:'private-short',
  targetCultivatorId:'private-carrier'},label:'林岚'} as const;
const unprovedEscort={...escort,option:{...escort.option,targetCultivatorId:'private-unproven'},label:''};
const observe={option:{action:'DANXIA_MEDICINE',danxiaMedicineMove:'observe',targetDanxiaShortageId:'private-short'}} as const;
const common={id:'private-checkpoint',shortageId:'private-short',status:'offered',role:'patient',choice:'offer_ship',startedTick:20,reservedTick:20} as const;

describe('scoped 丹荒 medicine choices and receipts',()=>{
  it('keeps observe local and displays only named exact legal actions to a live command controller, with ordinal DOM values',()=>{
    const onQueue=vi.fn(()=>false);
    const html=renderToStaticMarkup(<DanxiaMedicineControls choices={[retain,escort,unprovedEscort,observe]} scopeKey="private-scope" onQueue={onQueue}/>);
    expect(html).toContain('>旁观</button>');
    expect(html).toContain('value="0">留下开炉</option>');
    expect(html).toContain('value="1">请护送 · 林岚</option>');
    expect(html.match(/<option value="/g)).toHaveLength(3);
    expect(html).not.toMatch(/确认排入|private-/);
    expect(onQueue).not.toHaveBeenCalled();
    const readOnly=renderToStaticMarkup(<DanxiaMedicineControls choices={[retain,escort]} scopeKey="other-scope"/>);
    expect(readOnly).toContain('>旁观</button>');
    expect(readOnly).not.toMatch(/留下开炉|请护送|核对选择/);
  });
  it('separates real next-turn jade escrow consent from immediate avatar ordering cost or dispatch',()=>{
    const read=(choice:typeof retain|typeof escort)=>renderToStaticMarkup(<DanxiaMedicineConfirmation choice={choice} onConfirm={()=>undefined} onCancel={()=>undefined}/>);
    expect(read(retain)).toContain('封存翡翠灵叶 2 株，留待另行开炉');
    expect(read(retain)).toContain('确认排入：留下开炉');
    const ship=read(escort);
    expect(ship).toContain('确认排入：请护送');
    expect(ship).toContain('须对方另行同意，此步不算启程或交货');
    expect(ship).toContain('成功排入指令即扣 5 神识，不移动药叶、不推进回合');
    expect(ship).not.toContain('private-');
  });
  it('renders acceptance, actual arrival, failed brew, return and stock receipt independently without displaying any raw provenance',()=>{
    const rows:DanxiaMedicineView[]=[
      {...common,status:'in_transit',acceptedTick:21},
      {...common,id:'arrival',status:'arrived',acceptedTick:21,departedTick:22,arrivedTick:23,receiveUntilTick:26},
      {...common,id:'expiry',status:'recoverable',disposition:{tick:26,reason:'offer_expired'}},
      {...common,id:'bad-pot',status:'brew_failed',settledTick:21},
      {...common,id:'receipt',status:'received',settledTick:24},
    ];
    const html=renderToStaticMarkup(<DanxiaMedicineReceipts rows={rows}/>);
    expect(html).toContain('已同意护送，尚未启程');
    expect(html).toContain('封药已到，等待本人签收');
    expect(html).toContain('原村实到第 23 轮');
    expect(html).toContain('尚未实退');
    expect(html).toContain('留药或邀约期限已过');
    expect(html).toContain('此批药叶已耗用，未成丹，不计作退回');
    expect(html).toContain('原定求药人已实际签收');
    expect(html).toContain('没有一项等同于已经服药或完成复诊');
    expect(html).not.toMatch(/private-|<button|<details/);
    expect(renderToStaticMarkup(<DanxiaMedicineReceipts rows={[]}/>)).toBe('');
  });
});
