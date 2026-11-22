import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {RingAudiencePanel,type RingAudiencePanelProps} from '../src/components/RingAudiencePanel';
import type {RingAudienceSession} from '../src/types/ringAudience';

const props:RingAudiencePanelProps={role:'ring',target:{id:'actual-actor',name:'云袖'},aims:['leave_sect'],busy:false,exchangeCost:3,
  onOpen:vi.fn(),onExchange:vi.fn(()=>true),onSeal:vi.fn(),onClose:vi.fn()};
const session:RingAudienceSession={id:'secret-session',targetId:'actual-actor',role:'ring',aim:'leave_sect',openedTick:1,
  openingSectId:'sect',personalityAtOpening:'苟道',initialWavering:35,wavering:65,stance:'wavering',status:'open',
  turns:[{index:1,tick:1,message:'有话留在戒中',reply:'容我思量。',source:'utility',tone:'quiet',before:35,after:65,stance:'wavering',cost:3}]};

describe('RingAudiencePanel',()=>{
  it('keeps its compact entry private and only offers native aims',()=>{
    const html=renderToStaticMarkup(<RingAudiencePanel {...props}/>);
    expect(html).toContain('戒中密谈 · 云袖');
    expect(html).toContain('劝其离开宗门');
    expect(html).not.toContain('定下约定');
    expect(html).not.toContain('问及禁篇');
  });
  it('never regurgitates another actor or role private session',()=>{
    for(const changed of [{...session,role:'heaven' as const},{...session,targetId:'another-actor'}]){
      const html=renderToStaticMarkup(<RingAudiencePanel {...props} session={changed}/>);
      expect(html).not.toContain('有话留在戒中');
      expect(html).not.toContain('secret-session');
    }
  });
  it('distinguishes speaking fees from consent, sealing and actual follow-through',()=>{
    const speaking=renderToStaticMarkup(<RingAudiencePanel {...props} session={session} modelReady/>);
    expect(speaking).toContain('说出此话（3 神识）');
    expect(speaking).toContain('发送给已配置的模型');
    expect(speaking).toContain('修士心念动摇');
    const accepted=renderToStaticMarkup(<RingAudiencePanel {...props} session={{...session,stance:'accepts'}}/>);
    expect(accepted).toContain('口头应允');
    expect(accepted).toContain('定下约定');
    expect(accepted).not.toContain('<textarea');
    expect(accepted).not.toContain('已离开原宗门');
    const sealed=renderToStaticMarkup(<RingAudiencePanel {...props} session={{...session,stance:'accepts',status:'sealed'}}/>);
    expect(sealed).toContain('尚未践行');
    expect(sealed).toContain('收回约定');
    expect(sealed).not.toContain('已离开原宗门');
    const executed=renderToStaticMarkup(<RingAudiencePanel {...props} session={{...session,status:'executed',
      execution:{tick:2,effect:'left',eventId:'private-event'}}}/>);
    expect(executed).toContain('此人已离开原宗门');
    expect(executed).not.toContain('private-event');
  });
});
