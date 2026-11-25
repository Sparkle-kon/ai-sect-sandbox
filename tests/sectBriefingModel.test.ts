import {afterEach,describe,expect,it,vi} from 'vitest';
import {requestSectBriefing,type SectBriefingSlot} from '../src/engine/sectBriefingModel';
import {llmScheduler} from '../src/engine/llmScheduler';

const slots:readonly SectBriefingSlot[]=[{id:'fictional-a',name:'柳二狗',job:'下山采药',site:'松灯坊市',
  quirks:['路痴'],realm:'练气',tier:'windfall',facts:['柳二狗在松灯坊市拣回三株星辉花。','灵草收入：星辉花 +3 株。']}];
const config={enabled:false,apiBaseUrl:'https://fixture.invalid/v1',apiKey:'local-test-secret',model:'briefing-fixture'};
const modelResult=(reports:unknown)=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({reports})}}]}));
afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});
describe('briefing model writes no facts of its own',()=>{
  it('defaults on when a model is configured; assembles a real report from stable fact markers and a model quote',async()=>{
    llmScheduler.resetTickBudget();
    const mock=vi.fn(async(_url:unknown,init?:RequestInit)=>{
      const body=JSON.parse(String(init?.body));
      expect(JSON.stringify(body)).toContain('松灯坊市');
      expect(JSON.stringify(body)).not.toContain(config.apiKey);
      return modelResult([{id:'fictional-a',report:'且说这一月，{F1}至于账上，{F2}',quote:'掌门，路引以后请画在药篓上。'}]);
    });
    vi.stubGlobal('fetch',mock);
    const copy=await requestSectBriefing(slots,2,config);
    expect(mock).toHaveBeenCalledOnce();
    expect(copy?.get('fictional-a')).toEqual({
      report:'且说这一月，柳二狗在松灯坊市拣回三株星辉花。至于账上，灵草收入：星辉花 +3 株。',
      quote:'掌门，路引以后请画在药篓上。',
    });
    expect(await requestSectBriefing(slots,3,{...config,sectReportsEnabled:false})).toBeUndefined();
    expect(mock).toHaveBeenCalledOnce();
  });

  it.each(['{F1}在假城捡了七株。{F2}','{F1}{F1}','{F1}{F3}','{F1}','{F1}{F2}另加二十灵石'])(
    'rejects incomplete, duplicate, out-of-range or invented copy %s',async report=>{
      llmScheduler.resetTickBudget();
      vi.stubGlobal('fetch',vi.fn(async()=>modelResult([{id:'fictional-a',report,quote:'这趟的路记住了。'}])));
      expect(await requestSectBriefing(slots,3,config)).toBeUndefined();
    },
  );
});
