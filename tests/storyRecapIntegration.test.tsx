import { renderToStaticMarkup } from 'react-dom/server';
import { describe,expect,it } from 'vitest';
import { ChronicleLibraryPanel } from '../src/components/ChronicleLibraryPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceWorldTick } from '../src/engine/worldEngine';

describe('chapter archive connects the real reader to a scoped transient recap',()=>{
  it('renders the same current chapter with a small launcher, never the hidden dialog or draft prose',()=>{
    const original=createInitialWorld(1);
    expect(renderToStaticMarkup(<ChronicleLibraryPanel world={original} scopeKey="main"/>)).not.toContain('本卷小回顾');
    let world=original;
    while(world.tick<25)world=advanceWorldTick(world);
    const before=JSON.stringify(world);
    const output=renderToStaticMarkup(<ChronicleLibraryPanel world={world} scopeKey="main" cultivator={world.cultivators[0]}/>);
    expect(output).toContain('本卷小回顾');
    expect(output).toContain('data-chronicle-paragraph-text');
    expect(output).not.toContain('<dialog');
    expect(JSON.stringify(world)).toBe(before);
    const wrong={...world.cultivators[0]};
    expect(renderToStaticMarkup(<ChronicleLibraryPanel world={world} scopeKey="other" cultivator={wrong}/>)).not.toContain('本卷小回顾');
  });
});
