import { describe, expect, it } from 'vitest';
import { buildSerializedChapterPacing, type PacedChronicleScene } from '../src/engine/serializedChapterPacing';

function passage(id:string,tick:number,paragraph:string):PacedChronicleScene {
  return {anchor:{id,tick,year:1001,month:1,actorIds:[],title:'本地旧事',description:paragraph,category:'diplomacy'},
    section:{title:'本地旧事',paragraph}};
}

describe('source attribution is captured while prose is composed',()=>{
  it('assigns A + B to their merged paragraph and C to its own paragraph of the same transition beat',()=>{
    const a='甲地篇幅'.repeat(12)+'。',b='乙地篇幅'.repeat(12)+'。',c='丙地篇幅'.repeat(17)+'。';
    const lines=[passage('opening',1,'山间有旧事。'),passage('A',2,a),passage('B',3,b),passage('C',4,c),
      passage('closing',5,'篇末记一件小事。')];
    const transition=buildSerializedChapterPacing(lines).find(beat=>beat.kind==='transition');
    expect(transition?.eventIds).toEqual(['A','B','C']);
    expect(transition?.paragraphs).toEqual([a+b,c]);
    expect(transition?.paragraphEventIds).toEqual([['A','B'],['C']]);
  });
});
