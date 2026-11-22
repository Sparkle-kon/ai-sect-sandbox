import {describe,expect,it} from 'vitest';
import {mapLabelRectsOverlap,planMapLabels,type MapLabelCandidate,type MapLabelObstacle} from '../src/components/mapLabelLayout';

const viewport={width:360,height:214};
function label(id:string,x:number,y:number,kind:MapLabelCandidate['kind']='site',priority=0):MapLabelCandidate {
  return {id,kind,anchor:{x,y},width:78,height:17,priority,gap:13};
}
describe('shared Canvas atlas label spacing',()=>{
  it('keeps neighboring site labels before priority actor names and resolves different corners',()=>{
    const candidates=[label('npc-focus',149,94,'actor',9999),label('npc-other',282,147,'actor',4),label('b-site',169,98),label('a-site',147,96)];
    const occupied:MapLabelObstacle[]=[{rect:{x:136,y:85,width:22,height:22},ownerId:'a-site'},
      {rect:{x:159,y:88,width:20,height:20},ownerId:'b-site'}];
    const placements=planMapLabels(viewport,candidates,occupied);
    expect(placements.slice(0,2).map(row=>[row.id,row.side])).toEqual([['a-site','N'],['b-site','SE']]);
    expect(placements.map(row=>row.id)).toEqual(['a-site','b-site','npc-other']);
    for(const [i,mark] of placements.entries()){
      expect(occupied.every(({rect})=>!mapLabelRectsOverlap(rect,mark.rect))).toBe(true);
      expect(placements.slice(i+1).every(({rect})=>!mapLabelRectsOverlap(rect,mark.rect))).toBe(true);
    }
    expect(planMapLabels(viewport,[...candidates].reverse(),occupied)).toEqual(placements);
  });
  it('keeps rectangles in the viewport and never clamps a label onto another marker',()=>{
    const candidates=[label('corner',4,4),label('left',4,144),label('right',359,106),label('bottom',200,213)];
    const plan=planMapLabels(viewport,candidates);
    expect(plan).toHaveLength(4);
    for(const {rect} of plan){
      expect(rect.x).toBeGreaterThanOrEqual(2);expect(rect.y).toBeGreaterThanOrEqual(2);
      expect(rect.x+rect.width).toBeLessThanOrEqual(viewport.width-2);
      expect(rect.y+rect.height).toBeLessThanOrEqual(viewport.height-2);
    }
    const covered=planMapLabels(viewport,candidates,[{rect:{x:-5,y:-5,width:400,height:250}}]);
    expect(covered).toEqual([]);
  });
  it('drops ambiguous or malformed labels and does not silently move their hit anchors',()=>{
    const doomed=label('dupe',50,160),selected=label('actor-selected',175,130,'actor',1);
    const results=planMapLabels(viewport,[doomed,{...doomed,anchor:{x:200,y:40}},selected,
      {...label('bad',70,72),width:Number.NaN},label('out',-1,42)]);
    expect(results.map(row=>row.id)).toEqual([selected.id]);
    expect(results[0].anchor).toBe(selected.anchor);
  });
  it('has bounded alternatives for 1200 dense visible candidates and prioritizes the selected actor',()=>{
    const candidates=Array.from({length:1200},(_,i)=>label(`actor-${i}`,180,101,'actor'));
    const selected=label('selected',180,101,'actor',1);
    const plan=planMapLabels(viewport,[...candidates,selected]);
    expect(plan.length).toBeLessThanOrEqual(8);
    expect(plan[0].id).toBe(selected.id);
    expect(plan[0].side).toBe('S');
  });
});
