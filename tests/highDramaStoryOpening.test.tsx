import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {PlayerStoryEntry} from '../src/components/PlayerStoryEntry';
import {StoryFirstHome} from '../src/components/StoryFirstHome';
import {enterStoryOpening,projectStoryPlayerRole} from '../src/components/storyPlayerController';
import {createInitialWorld} from '../src/data/initialWorld';
import {AVATAR_POSSESSION_COST} from '../src/engine/avatarEngine';
import {buildHighDramaPreset} from '../src/engine/highDramaPresetEngine';
import {highDramaPreset} from '../src/engine/highDramaPresetTerms';

describe('opening context is distinct from earned protagonists',()=>{
  it('offers the actual newly enrolled resident without automatically entering or naming a protagonist',()=>{
    const prepared=buildHighDramaPreset('cold-jade-disciple')!;
    const role=projectStoryPlayerRole(prepared.world);
    expect(role).toMatchObject({kind:'observer',opening:true,canEnter:true});
    expect(prepared.world.playerAvatar.possessedId).toBeUndefined();
    const noop=()=>undefined;
    const html=renderToStaticMarkup(<PlayerStoryEntry role={role} revision={prepared.world} onBack={noop} onTools={noop} onEnter={()=>true}/>);
    expect(html).toContain('开局可选人物');
    expect(html).not.toContain('主角：');
    const started=enterStoryOpening(prepared.world);
    expect(started.tick).toBe(prepared.world.tick);
    expect(started.playerAvatar.possessedId).toBe(prepared.focusActorId);
    expect(started.playerAvatar.essence).toBe(prepared.world.playerAvatar.essence-AVATAR_POSSESSION_COST);
    const ordinary=createInitialWorld(1,'spirit-bloom');
    expect(enterStoryOpening(ordinary)).toBe(ordinary);
    expect(renderToStaticMarkup(<StoryFirstHome opening={highDramaPreset('cold-jade-disciple')} onContinue={noop} onMore={noop}/>))
      .toContain('主角未定');
  });
});
