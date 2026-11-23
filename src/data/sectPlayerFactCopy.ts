/**
 * Readable wording for rule-authored notes inherited from older chronicles.
 * This is a presentation projection, not a change to recorded facts. Never
 * pass player posts, model dialogue, or internal proof identifiers here.
 */
const terms:readonly (readonly [RegExp,string])[]=[
  [/未实付/g,'尚未支付'],[/实付/g,'实际支付'],
  [/入托管/g,'交存代管'],[/托管/g,'代管'],
  [/凭据/g,'凭证'],[/原生/g,'原有'],
  [/不替换/g,'不会换掉'],[/不替/g,'不代'],
  [/不补发/g,'不再发放'],[/不补/g,'不另补'],
];

export function sectPlayerFactCopy(text:string):string{
  return terms.reduce((copy,[pattern,replacement])=>copy.replace(pattern,replacement),text);
}
