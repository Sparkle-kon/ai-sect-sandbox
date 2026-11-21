import { DANXIA_MEDICINE_LEAVES } from '../engine/danxiaMedicineTerms';
import type { DanxiaMedicineView } from '../engine/danxiaMedicineEngine';

const ROLE: Record<DanxiaMedicineView['role'], string> = { disciple:'丹霞备药弟子',patient:'原定求药人',escort:'本单护送人' };
const STATUS: Record<DanxiaMedicineView['status'],string> = {
  observed:'只旁观，未拨药', retained:'已封存留炉，未开炉', offered:'护送邀约待同意',
  in_transit:'护送在途', arrived:'封药已到，等待本人签收', returning:'封药返程中，尚未退回本人',
  recoverable:'原批待原主领回，尚未实退', brewed:'实际开炉并成丹', brew_failed:'实际开炉，炼制未成',
  received:'原定求药人已实际签收', recovered:'原主已实际领回', lost:'原批药叶已实际遗失',
};
const DISPOSITION: Record<NonNullable<DanxiaMedicineView['disposition']>['reason'],string> = {
  offer_expired:'留药或邀约期限已过', escort_declined:'护送人未应允', recipient_declined:'原定求药人谢绝',
  recipient_missed:'未能取得原定求药人的及时签收', title_lost:'原址不再满足备药条件',
  disciple_lost:'原出资修士已不能继续这项事务', route_lost:'原路线已不可用', escort_lost:'护送人已不具备继续护送的条件',
};

export function DanxiaMedicineReceipts({rows}: {rows: readonly DanxiaMedicineView[]}) {
  if (!rows.length) return null;
  return (
    <section aria-label="同批药材的备药回执" className="space-y-1.5 border-t border-slate-800 pt-2">
      <h5 className="text-xs font-semibold text-teal-100">同批药材的备药回执</h5>
      <ul className="max-h-56 space-y-1.5 overflow-y-auto text-xs leading-relaxed text-slate-300">
        {rows.map((row)=>{
          const acceptedNotDeparted=row.status==='in_transit'&&row.departedTick===undefined;
          const transferred=row.status==='received'||row.status==='recovered';
          return <li key={row.id} className="min-w-0 space-y-0.5 rounded border border-slate-800 p-2 [overflow-wrap:anywhere]">
            <p className="font-semibold text-slate-100">本人是{ROLE[row.role]} · {acceptedNotDeparted?'已同意护送，尚未启程':STATUS[row.status]}</p>
            <p>发起第 {row.startedTick} 轮{row.reservedTick!==undefined&&` · 第 ${row.reservedTick} 轮实际封存翡翠灵叶 ${DANXIA_MEDICINE_LEAVES} 株`}。</p>
            {row.acceptedTick!==undefined&&<p>应允第 {row.acceptedTick} 轮{row.departedTick!==undefined&&` · 实际启程第 ${row.departedTick} 轮`}。</p>}
            {row.arrivedTick!==undefined&&<p>原村实到第 {row.arrivedTick} 轮
              {row.status==='arrived'&&row.receiveUntilTick!==undefined&&` · 需在第 ${row.receiveUntilTick} 轮之前实际签收`}。</p>}
            {row.returnStartedTick!==undefined&&<p>开始原路返程第 {row.returnStartedTick} 轮。</p>}
            {row.returnedTick!==undefined&&<p>实际折返第 {row.returnedTick} 轮，不等于原主已领回。</p>}
            {row.disposition&&<p>第 {row.disposition.tick} 轮：{DISPOSITION[row.disposition.reason]}。</p>}
            {row.settledTick!==undefined&&<p>实际结记第 {row.settledTick} 轮
              {transferred&&` · 同批翡翠灵叶 ${DANXIA_MEDICINE_LEAVES} 株已入本单应收人的药囊`}
              {row.status==='brew_failed'&&' · 此批药叶已耗用，未成丹，不计作退回'}。</p>}
          </li>;
        })}
      </ul>
      <p className="text-slate-400">同意、启程、到达和签收各有各的实录；没有一项等同于已经服药或完成复诊。</p>
    </section>
  );
}
