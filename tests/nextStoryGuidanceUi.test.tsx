import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {StoryFirstHome} from '../src/components/StoryFirstHome';

describe('one unobtrusive opening hint',()=>{
  const actions={onContinue:()=>{},onMore:()=>{}};
  const fixed=(html:string)=>{
    expect(html.match(/<button\b/g)).toHaveLength(2);
    expect(html).toMatch(/>看下个月<\/button>/);
    expect(html).toMatch(/>\s*走进故事\s*<\/button>/);
  };
  it('leaves the ordinary opening alone in the absence of a native hint',()=>{
    const html=renderToStaticMarkup(<StoryFirstHome {...actions}/>);
    fixed(html);
    expect(html).not.toMatch(/宗门大比|秘境报名|心魔抉择/);
  });
  it('renders native context inside the story as text rather than adding a third fixed action',()=>{
    const line='到了论剑台，才可依在场资格入场。';
    const html=renderToStaticMarkup(<StoryFirstHome {...actions} nextGuide={{kind:'tournament',title:'宗门大比',line}}/>);
    fixed(html);
    expect(html.match(/宗门大比/g)).toHaveLength(1);
    expect(html).toContain(line);
    expect(html).not.toContain('<a ');
  });
});
