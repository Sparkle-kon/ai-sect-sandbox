import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {ApprenticeshipReunionStoryCard} from '../src/components/ApprenticeshipReunionStoryCard';
import type {ApprenticeshipReunionOption,ApprenticeshipReunionView} from '../src/engine/apprenticeshipReunion';

const action='APPRENTICESHIP_REUNION' as const;
const ask:ApprenticeshipReunionOption={action,apprenticeshipReunionMove:'ask',targetCultivatorId:'private-mentor'};
const base={action,targetApprenticeshipReunionId:'private-reunion'} as const;
const teach:ApprenticeshipReunionOption={...base,apprenticeshipReunionMove:'teach'};
const spar:ApprenticeshipReunionOption={...base,apprenticeshipReunionMove:'public_spar'};
const accept:ApprenticeshipReunionOption={...base,apprenticeshipReunionMove:'accept_spar'};
const view:ApprenticeshipReunionView={siteName:'试剑山下',options:[ask]};

describe('meeting in person to ask and answer',()=>{
  it('does not invent a prior refusal or commitment in the first scene',()=>{
    const choose=vi.fn();
    const html=renderToStaticMarkup(<ApprenticeshipReunionStoryCard view={view} onChoose={choose}/>);
    expect(html).toContain('叩门请教');
    expect(html).toContain('未得答复');
    expect(html.match(/min-h-\[44px\]/g)).toHaveLength(1);
    expect(html).not.toMatch(/旧拒|当年|师徒既成|切磋|private-/);
    expect(choose).not.toHaveBeenCalled();
  });
  it('keeps teaching, invitation, and independent assent distinct without fabricating a round',()=>{
    const invite=renderToStaticMarkup(<ApprenticeshipReunionStoryCard view={{...view,options:[teach,spar]}} onChoose={()=>{}}/>);
    expect(invite).toContain('对方须另作答复');
    expect(invite).toContain('只作邀约');
    expect(invite).not.toMatch(/应下切磋之邀|已交手|private-/);
    const answer=renderToStaticMarkup(<ApprenticeshipReunionStoryCard view={{...view,options:[accept]}} busy onChoose={()=>{}}/>);
    expect(answer).toContain('应下切磋之邀');
    expect(answer).toContain('两人都备妥并真正交手');
    expect(answer).toContain('disabled=""');
  });
  it('omits an empty scope and reads actual settled words without fresh controls',()=>{
    expect(renderToStaticMarkup(<ApprenticeshipReunionStoryCard view={{...view,options:[]}}/>)).toBe('');
    const html=renderToStaticMarkup(<ApprenticeshipReunionStoryCard view={{...view,options:[],
      receipt:{title:'婉拒',description:'此番未订师徒之约。'}}}/>);
    expect(html).toContain('此番未订师徒之约');
    expect(html).not.toMatch(/<button|私下指点|private-/);
  });
  it('can keep the earlier personal refusal and the new own response in the same quiet reading',()=>{
    const html=renderToStaticMarkup(<ApprenticeshipReunionStoryCard view={{...view,options:[],
      past:{title:'那年亲口谢绝',description:'当时双方都在场；不是从别人口中补出的旧事。'},
      receipt:{title:'今日重新开口',description:'指点仍需当事人另行应下。'}}}/>);
    expect(html).toContain('那年亲口谢绝');
    expect(html).toContain('今日重新开口');
    expect(html).not.toMatch(/<button|已经交手/);
  });
});
