import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {quoteSectPlayerChatOptions,type SectPlayerChatPrepared} from '../engine/sectPlayerChat';
import {isSectPlayerChatText,SECT_PLAYER_CHAT_IDENTITIES,SECT_PLAYER_CHAT_IDENTITY_LABELS,SECT_PLAYER_CHAT_TEXT_LIMIT,
  type SectPlayerChatDraft,type SectPlayerChatIdentity,type SectPlayerChatPreset,type SectPlayerChatRoom} from '../types/sectPlayerChat';
import type {WorldState} from '../types/world';

export interface SectPlayerChatControls {
  readonly prepare:(expected:WorldState,draft:SectPlayerChatDraft,useModel?:boolean)=>Promise<SectPlayerChatPrepared|undefined>;
  readonly send:(expected:WorldState,preview:SectPlayerChatPrepared)=>Promise<boolean>;
}

const presets=[
  ['hype','替弟子出头'],
  ['beg','哭穷'],
  ['provoke','放狠话'],
  ['debunk','辟谣'],
  ['recruit_ad','打广告招新'],
] as const satisfies readonly (readonly [SectPlayerChatPreset,string])[];
const control='min-h-11 min-w-0 rounded-md border border-stone-600 bg-stone-950 px-2 py-1.5 text-sm text-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-45';
const sectionControl='flex min-h-11 w-full items-center justify-between gap-2 rounded px-1 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300';

export function SectPlayerChatComposer({world,room,roomLabel,busy,modelReady,posting}:{
  world:WorldState;room:SectPlayerChatRoom;roomLabel:string;busy:boolean;modelReady:boolean;posting:SectPlayerChatControls;
}){
  const contentId=useId(),previewHeading=useId();
  const [open,setOpen]=useState(false);
  const [identity,setIdentity]=useState<SectPlayerChatIdentity>('leader');
  const [tab,setTab]=useState<'quick'|'free'>('quick');
  const [preset,setPreset]=useState<SectPlayerChatPreset>();
  const [optionId,setOptionId]=useState<string>();
  const [text,setText]=useState('');
  const [pending,setPending]=useState<'prepare'|'send'>();
  const [preview,setPreview]=useState<{world:WorldState;card:SectPlayerChatPrepared}>();
  const [notice,setNotice]=useState('');
  const operation=useRef<{kind:'prepare'|'send'}>();
  const liveWorld=useRef(world);
  const previewTitle=useRef<HTMLHeadingElement>(null);
  liveWorld.current=world;
  useEffect(()=>()=>{operation.current=undefined;},[]);
  const options=useMemo(()=>open?quoteSectPlayerChatOptions(world,room,identity):[],[open,world,room,identity]);
  const choices=preset?options.filter(row=>row.preset===preset):[];
  const chosen=choices.find(row=>row.id===optionId)??(choices.length===1?choices[0]:undefined);
  const card=preview?.world===world?preview.card:undefined;
  useEffect(()=>{if(open&&card)previewTitle.current?.focus();},[card,open]);
  const frozen=busy||pending!==undefined;
  const readyText=isSectPlayerChatText(text.trim());
  const exposure=identity==='leader'?undefined:world.sectManagement?.playerChat?.aliases[identity]?.exposure;

  const clearPreview=()=>{setPreview(undefined);setNotice('');};
  const prepare=async(draft:SectPlayerChatDraft,useModel=false)=>{
    if(frozen||operation.current)return;
    const token={kind:'prepare'} as const;
    operation.current=token;
    setPending('prepare');clearPreview();
    try{
      const prepared=await posting.prepare(world,draft,useModel);
      if(operation.current!==token)return;
      if(liveWorld.current!==world||!prepared){setNotice('这一笺还没写好，请再试一次。');return;}
      setPreview({world,card:prepared});
    }catch{
      if(operation.current===token)setNotice('这一笺还没写好，请再试一次。');
    }finally{
      if(operation.current===token){operation.current=undefined;setPending(undefined);}
    }
  };
  const send=async()=>{
    if(frozen||operation.current||!card)return;
    const token={kind:'send'} as const;
    operation.current=token;
    setPending('send');setNotice('');
    try{
      const sent=await posting.send(world,card);
      if(operation.current!==token)return;
      if(sent){setPreview(undefined);setText('');setPreset(undefined);setOptionId(undefined);}
      setNotice(sent?'已发出。':'这一笺没能送出，请再看一遍再发。');
      if(!sent)setPreview(undefined);
    }catch{
      if(operation.current===token){setPreview(undefined);setNotice('这一笺没能送出，请再看一遍再发。');}
    }finally{
      if(operation.current===token){operation.current=undefined;setPending(undefined);}
    }
  };

  function chooseIdentity(value:string){
    const picked=SECT_PLAYER_CHAT_IDENTITIES.find(id=>id===value);
    if(!picked||room!=='jiuzhou')return;
    setIdentity(picked);setPreset(undefined);setOptionId(undefined);clearPreview();
  }

  return <section aria-label="掌门发言" className="border-t border-stone-700 pt-1">
    <button type="button" aria-expanded={open} aria-controls={contentId} disabled={pending!==undefined}
      className={`${sectionControl} text-amber-100`} onClick={()=>setOpen(value=>!value)}>
      <span className="font-serif font-semibold">掌门发言</span><span className="text-xs text-stone-300">{open?'收起':'展开'}</span>
    </button>
    <div id={contentId} hidden={!open}>
      {open&&<fieldset disabled={frozen} className="min-w-0 space-y-2 rounded-md bg-stone-900/80 p-2">
        <legend className="sr-only">备一条群聊发言</legend>
        {room==='jiuzhou'&&<>
          <label className="grid gap-1 text-xs text-stone-200">发言身份
            <select value={identity} className={control} onChange={event=>chooseIdentity(event.currentTarget.value)}>
              {SECT_PLAYER_CHAT_IDENTITIES.map(id=><option key={id} value={id}>{SECT_PLAYER_CHAT_IDENTITY_LABELS[id]}</option>)}
            </select>
          </label>
          {identity!=='leader'&&<p className="text-xs leading-5 text-amber-200">{exposure&&exposure.tick<=world.tick?'此马甲已被识破。':'马甲可能被识破，露馅会损伤宗门名望。'}</p>}
          <div role="group" aria-label="发言方式" className="grid grid-cols-2 gap-1">
            <button type="button" aria-pressed={tab==='quick'} className={`${control} aria-pressed:border-amber-300`} onClick={()=>{setTab('quick');clearPreview();}}>快捷回复</button>
            <button type="button" aria-pressed={tab==='free'} className={`${control} aria-pressed:border-amber-300`} onClick={()=>{setTab('free');clearPreview();}}>自由发言</button>
          </div>
        </>}
        {tab==='quick'?<>
          <div role="group" aria-label="快捷回复" className="grid min-w-0 grid-cols-2 gap-1">
            {presets.map(([id,label])=>{
              const available=options.some(row=>row.preset===id);
              return <button type="button" key={id} disabled={!available} aria-pressed={preset===id}
                className={`${control} aria-pressed:border-amber-300 aria-pressed:bg-amber-950/55`}
                onClick={()=>{setPreset(id);setOptionId(undefined);clearPreview();}}>{label}</button>;
            })}
          </div>
          {options.length===0&&<p className="text-xs text-stone-300">眼下没有合适的回话。不妨另写一句。</p>}
          {choices.length>1&&<label className="grid gap-1 text-xs text-stone-200">这句话说给
            <select value={optionId??''} className={control} onChange={event=>{setOptionId(event.currentTarget.value);clearPreview();}}>
              <option value="">请选择</option>
              {choices.map(choice=><option key={choice.id} value={choice.id}>{choice.targetLabel??choice.label}</option>)}
            </select>
          </label>}
          {chosen?.targetLabel&&choices.length===1&&<p className="text-xs text-amber-200">说给：{chosen.targetLabel}</p>}
          {preset&&chosen&&!card&&<button type="button" className={`${control} w-full`}
            onClick={()=>void prepare({roomId:room,identity,body:{kind:'quick',preset,optionId:chosen.id}})}>
            预览发言
          </button>}
        </>:<>
          <label className="grid gap-1 text-xs text-stone-200">说些什么
            <textarea value={text} maxLength={SECT_PLAYER_CHAT_TEXT_LIMIT*2} rows={2} className={`${control} resize-y`}
              onChange={event=>{setText(event.currentTarget.value);clearPreview();}}/>
          </label>
          {text.trim()&&!readyText&&<p className="text-xs text-amber-200">请写一行，不放链接，最多 {SECT_PLAYER_CHAT_TEXT_LIMIT} 字。</p>}
          {modelReady&&<p className="text-xs leading-5 text-stone-300">用模型辨意会把这句话送到你填写的服务，可能收费。传进群聊之前，还要你亲自点头。</p>}
          {!card&&<div className={modelReady?'grid grid-cols-2 gap-1':''}>
            <button type="button" className={`${control} w-full`} disabled={!readyText}
              onClick={()=>void prepare({roomId:room,identity,body:{kind:'free',text:text.trim()}})}>预览原话</button>
            {modelReady&&<button type="button" className={control} disabled={!readyText}
              onClick={()=>void prepare({roomId:room,identity,body:{kind:'free',text:text.trim()}},true)}>用模型辨意</button>}
          </div>}
        </>}
        {card&&<section aria-labelledby={previewHeading} className="min-w-0 space-y-1 rounded-md border border-amber-300/30 bg-amber-950/30 p-2 [overflow-wrap:anywhere]">
          <h4 ref={previewTitle} id={previewHeading} tabIndex={-1} className="text-sm font-semibold text-amber-100">发往{roomLabel} · {SECT_PLAYER_CHAT_IDENTITY_LABELS[card.identity]}</h4>
          <p className="whitespace-pre-wrap text-sm leading-6 text-stone-50">{card.text}</p>
          <p className="text-xs leading-5 text-stone-300">{card.effect}</p>
          <div className="grid grid-cols-2 gap-1">
            <button type="button" className={control} onClick={clearPreview}>返回修改</button>
            <button type="button" className={`${control} border-amber-300/55 font-semibold text-amber-100`} onClick={()=>void send()}>确认发出</button>
          </div>
        </section>}
        <p role="status" className="min-h-4 text-xs text-amber-200">
          {pending==='prepare'?'正在备好这句话…':pending==='send'?'正在发出…':notice}
        </p>
      </fieldset>}
    </div>
  </section>;
}
