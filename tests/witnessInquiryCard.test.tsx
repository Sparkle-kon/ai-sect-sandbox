import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {WitnessInquiryCard} from '../src/components/WitnessInquiryCard';
import type {WitnessInquiryOption,WitnessInquiryView} from '../src/engine/witnessInquiry';

const inspect:WitnessInquiryOption={action:'WITNESS_INQUIRY',witnessInquiryMove:'inspect',targetWitnessClaimId:'case-fixture'};
const ask:WitnessInquiryOption={action:'WITNESS_INQUIRY',witnessInquiryMove:'ask',
  targetWitnessClaimId:'case-fixture',targetCultivatorId:'witness-fixture'};
const base:WitnessInquiryView={venueName:'雨巷坊',claim:{text:'有人称段氏那场斗法落了下风。'},options:[inspect]};
const witness={name:'方檐',canAsk:true};
const onChoose=()=>{};

describe('same-dispute independent clues',()=>{
  it('labels the local posting as an unconfirmed allegation, never displays a witness before inspection',()=>{
    const html=renderToStaticMarkup(<WitnessInquiryCard view={{...base,witness}} onChoose={onChoose}/>);
    expect(html).toContain('未经证实');
    expect(html).toContain('有人称段氏那场斗法落了下风');
    expect(html).toContain('上前细看告示');
    expect(html).not.toMatch(/方檐|原场所见|上前问|case-fixture|witness-fixture/);
  });
  it('only renders the exact native current witness option, while busy or read-only mode cannot activate it',()=>{
    const view={...base,witness,options:[ask]};
    const html=renderToStaticMarkup(<WitnessInquiryCard view={view} busy onChoose={onChoose}/>);
    expect(html).toContain('方檐亲历其场');
    expect(html).toContain('上前问其亲眼所见');
    expect(html).toContain('disabled=""');
    expect(html).not.toMatch(/上前细看|case-fixture|witness-fixture/);
    expect(renderToStaticMarkup(<WitnessInquiryCard view={view}/>)).not.toContain('<button');
    expect(renderToStaticMarkup(<WitnessInquiryCard view={{...base,witness:{...witness,canAsk:false},options:[]}} onChoose={onChoose}/>))
      .not.toMatch(/方檐|原场所见|<button/);
  });
  it('keeps an actual reply explicitly separate from judgment, with no repeated ask',()=>{
    const view={...base,witness:{...witness,canAsk:false,reply:{text:'方檐只看见段氏占了上风。'}},options:[]};
    const html=renderToStaticMarkup(<WitnessInquiryCard view={view} onChoose={onChoose}/>);
    expect(html).toContain('方檐只看见段氏占了上风');
    expect(html).toContain('只记交手所见，不判谁有过');
    expect(html).not.toContain('<button');
  });
});
