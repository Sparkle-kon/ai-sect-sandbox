import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {GrandSiegeTheatreCard,resolveSelectedSiegeWitnessRound,selectSiegeWitnessRound,SiegeWitnessRoundReading,
  type GrandSiegeRead} from '../src/components/GrandSiegeTheatreCard';
import {createInitialWorld} from '../src/data/initialWorld';
import type {SiegeWitnessRound,SiegeWitnessView} from '../src/engine/grandSiegeWitnessView';

const world=createInitialWorld(54);
world.tick=8;
const [scout,keeper]=world.cultivators;
const siegeId='opaque-current-siege';
const frame={world,tick:8,scope:'branch-vigil',actorId:scout.id,siegeId};
const first:SiegeWitnessRound={sourceId:'opaque-first-source',round:1,tick:7,year:1001,month:7,
  side:'attacker',wallBefore:150,wallAfter:110,wallMax:150,selfDamage:11};
const earlier:SiegeWitnessView={actorId:scout.id,siegeId,rounds:[first]};
const guard:SiegeWitnessRound={sourceId:'opaque-later-source',round:2,tick:8,year:1001,month:8,
  side:'defender',wallBefore:110,wallAfter:96,wallMax:150,selfGuard:{move:'leader-last-stand',paidQi:18,paidHp:12,wallSaved:22}};
const later:SiegeWitnessView={actorId:keeper.id,siegeId,rounds:[guard]};
const base:GrandSiegeRead={siegeId,siteId:'opaque-current-site',attackerName:'青山',defenderName:'白岭',status:'sieging',
  options:[],round:{round:2,tick:8,sourceEventId:'opaque-latest-public',wallBefore:110,wallAfter:96,wallMax:150,
    attackers:[],defenders:[]}};
const print=(view:GrandSiegeRead)=>renderToStaticMarkup(
  <GrandSiegeTheatreCard world={world} view={view} siteName="白岭山门" witnessScopeKey="branch-vigil"/>);

describe('same battle but strictly different witnessed rounds',()=>{
  it('keeps the newer public round separate and collapses personal facts until a real round is chosen',()=>{
    const html=print({...base,witness:earlier});
    expect(html).toContain('公开战况');
    expect(html).toContain('本月护山阵');
    expect(html).toContain('110 → 96');
    expect(html.match(/<button\b/g)).toHaveLength(1);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('亲历战报');
    expect(html).toContain('min-h-11');
    expect(html).not.toMatch(/<select|选一轮亲历|实损|opaque-|branch-vigil/u);
    expect(print(base)).not.toContain('亲历战报');
    expect(print({...base,witness:{...earlier,siegeId:'sibling'}})).not.toContain('亲历战报');
  });

  it('rejects stale round, actor, same-object sibling branch, changed world and conflicting original',()=>{
    const selection=selectSiegeWitnessRound(frame,first);
    expect(resolveSelectedSiegeWitnessRound(undefined,frame,earlier)).toBeUndefined();
    expect(resolveSelectedSiegeWitnessRound(selectSiegeWitnessRound(frame),frame,earlier)).toBeUndefined();
    expect(resolveSelectedSiegeWitnessRound(selection,frame,earlier)).toBe(first);
    expect(resolveSelectedSiegeWitnessRound(selection,{...frame,actorId:keeper.id},later)).toBeUndefined();
    expect(resolveSelectedSiegeWitnessRound(selection,{...frame,scope:'branch-sibling'},earlier)).toBeUndefined();
    expect(resolveSelectedSiegeWitnessRound(selection,{...frame,world:structuredClone(world)},earlier)).toBeUndefined();
    expect(resolveSelectedSiegeWitnessRound(selection,{...frame,tick:9},earlier)).toBeUndefined();
    expect(resolveSelectedSiegeWitnessRound(selection,frame,{...earlier,rounds:[first,first]})).toBeUndefined();
    expect(resolveSelectedSiegeWitnessRound(selection,frame,{...earlier,rounds:[{...first,selfDamage:77}]})).toBeUndefined();
    expect(resolveSelectedSiegeWitnessRound(selection,frame,{...earlier,rounds:[]})).toBeUndefined();
  });

  it('shows only the chosen round and own documented damage or guard payment',()=>{
    const sideOne=renderToStaticMarkup(<SiegeWitnessRoundReading round={first}/>);
    expect(sideOne).toContain('你身在阵外');
    expect(sideOne).toContain('150 → 110');
    expect(sideOne).toContain('你实损 11 点气血');
    expect(sideOne).not.toMatch(/亲自援阵|opaque-|110 → 96/u);
    const sideTwo=renderToStaticMarkup(<SiegeWitnessRoundReading round={guard}/>);
    expect(sideTwo).toContain('你身在阵内');
    expect(sideTwo).toContain('110 → 96');
    expect(sideTwo).toContain('实付 18 点灵气、12 点气血');
    expect(sideTwo).toContain('挡下 22 点阵损');
    expect(sideTwo).not.toMatch(/你实损|opaque-|150 → 110/u);
  });
});
