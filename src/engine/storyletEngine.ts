/** Declarative, synchronous storylet admission and nominal effect resolution.
 * A domain owns the facts, actual costs, event receipts and any mutation.
 */
export interface StoryletDescriptor {readonly kind:string}

export interface StoryletSchema {
  readonly Id:string;
  readonly Context:unknown;
  readonly Actor:unknown;
  readonly Role:string;
  readonly Scene:unknown;
  readonly Choice:string;
  readonly ChoiceMeta:unknown;
  readonly Condition:StoryletDescriptor;
  readonly Binder:StoryletDescriptor;
  readonly Effect:StoryletDescriptor;
  readonly EffectContext:unknown;
  readonly Result:unknown;
}

export interface StoryletChoice<S extends StoryletSchema> {
  readonly id:S['Choice'];
  readonly meta:S['ChoiceMeta'];
  readonly effect:S['Effect'];
}

export interface StoryletDefinition<S extends StoryletSchema> {
  readonly id:S['Id'];
  readonly conditions:readonly S['Condition'][];
  readonly roles:readonly {readonly id:S['Role'];readonly binder:S['Binder']}[];
  readonly scene:S['Scene'];
  readonly choices:readonly StoryletChoice<S>[];
}

type HandlerTable<D extends StoryletDescriptor,C,R>={
  readonly [K in D['kind']]:(instruction:D & {readonly kind:K},context:C)=>R;
};

export interface StoryletHandlers<S extends StoryletSchema> {
  readonly conditions:HandlerTable<S['Condition'],S['Context'],boolean>;
  readonly roles:HandlerTable<S['Binder'],S['Context'],readonly S['Actor'][]>;
  /** Domain handlers produce a nominal plan, not a world mutation. */
  readonly effects:HandlerTable<S['Effect'],S['EffectContext'],S['Result']>;
}

export interface StoryletAdmission<S extends StoryletSchema> {
  readonly definition:StoryletDefinition<S>;
  /** Domain actor references are never cloned or frozen by this registry. */
  readonly roles:Readonly<Partial<Record<S['Role'],S['Actor']>>>;
}

export interface StoryletResolution<S extends StoryletSchema> extends StoryletAdmission<S> {
  readonly choice:StoryletChoice<S>;
  readonly result:S['Result'];
}

export interface StoryletRegistry<S extends StoryletSchema> {
  readonly definitions:readonly StoryletDefinition<S>[];
  definition(id:S['Id']):StoryletDefinition<S>|undefined;
  /** The first valid entry wins; definition order is significant. */
  select(context:S['Context']):StoryletAdmission<S>|undefined;
  admit(id:S['Id'],context:S['Context']):StoryletAdmission<S>|undefined;
  resolve(id:S['Id'],choiceId:S['Choice'],context:S['Context'],effectContext:S['EffectContext']):StoryletResolution<S>|undefined;
  /** Nominal arithmetic only, intentionally independent of live admission (e.g. save validation). */
  previewEffect(id:S['Id'],choiceId:S['Choice'],effectContext:S['EffectContext']):S['Result']|undefined;
}

function validId(value:unknown):value is string{
  return typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/u.test(value);
}

/** Return an independent frozen snapshot: no functions, cycles, accessors or custom instances in authored data. */
function snapshot<T>(source:T):T{
  const visiting=new Set<object>();
  const copy=(value:unknown):unknown=>{
    if(value===null||value===undefined||typeof value==='string'||typeof value==='boolean')return value;
    if(typeof value==='number'&&Number.isFinite(value))return value;
    if(typeof value!=='object'||visiting.has(value))throw new TypeError('Storylet definitions require acyclic plain data');
    const array=Array.isArray(value);
    const proto=Object.getPrototypeOf(value);
    if(array?proto!==Array.prototype:proto!==Object.prototype&&proto!==null)
      throw new TypeError('Storylet definitions require plain objects and arrays');
    visiting.add(value);
    try {
      const result:Record<string,unknown>|unknown[]=array?[]:Object.create(proto) as Record<string,unknown>;
      for(const key of Reflect.ownKeys(value)){
        if(array&&key==='length')continue;
        const field=Object.getOwnPropertyDescriptor(value,key);
        if(typeof key!=='string'||!field?.enumerable||!Object.hasOwn(field,'value')||
          (array&&(!/^(0|[1-9][0-9]*)$/u.test(key)||Number(key)>=(value as unknown[]).length)))
          throw new TypeError('Storylet definitions must contain enumerable data properties');
        Object.defineProperty(result,key,{value:copy(field.value),enumerable:true});
      }
      if(array&&((result as unknown[]).length!==(value as unknown[]).length||
        Object.keys(result).length!==(value as unknown[]).length))
        throw new TypeError('Storylet definitions require dense ordered arrays');
      return Object.freeze(result);
    }finally{
      visiting.delete(value);
    }
  };
  return copy(source) as T;
}

function invoke<D extends StoryletDescriptor,C,R,K extends D['kind']>(
  table:HandlerTable<D,C,R>,instruction:D&{readonly kind:K},context:C,
):R{
  const kind:K=instruction.kind;
  return table[kind](instruction,context);
}

function known(table:object,descriptor:StoryletDescriptor):boolean{
  if(!descriptor||!validId(descriptor.kind))return false;
  return typeof Object.getOwnPropertyDescriptor(table,descriptor.kind)?.value==='function';
}

function uniqueIds(rows:readonly {readonly id:string}[],label:string){
  const ids=new Set<string>();
  for(const {id} of rows){
    if(!validId(id)||ids.has(id))throw new TypeError(`Invalid or duplicate ${label}: ${id}`);
    ids.add(id);
  }
}

export function createStoryletRegistry<S extends StoryletSchema>(
  authored:readonly StoryletDefinition<S>[],approved:StoryletHandlers<S>,
):StoryletRegistry<S>{
  type Definition=StoryletDefinition<S>;
  type Admission=StoryletAdmission<S>;
  type Answer=StoryletResolution<S>;
  const definitions=snapshot(authored);
  const handlers:StoryletHandlers<S>=Object.freeze({
    conditions:Object.freeze({...approved.conditions}),
    roles:Object.freeze({...approved.roles}),
    effects:Object.freeze({...approved.effects}),
  });
  uniqueIds(definitions,'storylet');
  const byId=new Map<S['Id'],Definition>();
  for(const entry of definitions){
    if(!Object.hasOwn(entry,'scene')||!Array.isArray(entry.conditions)||!Array.isArray(entry.roles)||
      !Array.isArray(entry.choices)||!entry.choices.length)
      throw new TypeError(`Incomplete storylet definition: ${entry.id}`);
    uniqueIds(entry.roles,'storylet role');
    uniqueIds(entry.choices,'storylet choice');
    for(const condition of entry.conditions){
      if(!known(handlers.conditions,condition))throw new TypeError(`Unknown storylet condition: ${entry.id}`);
    }
    for(const {binder} of entry.roles){
      if(!known(handlers.roles,binder))throw new TypeError(`Unknown storylet role binder: ${entry.id}`);
    }
    for(const choice of entry.choices){
      if(!Object.hasOwn(choice,'meta')||!known(handlers.effects,choice.effect))
        throw new TypeError(`Incomplete choice or unknown storylet effect: ${entry.id}`);
    }
    byId.set(entry.id,entry);
  }
  const definition=(id:S['Id'])=>byId.get(id);
  const check=(entry:Definition,context:S['Context']):Admission|undefined=>{
    if(entry.conditions.some(condition=>!invoke(handlers.conditions,condition,context)))return;
    const roles=Object.create(null) as Partial<Record<S['Role'],S['Actor']>>;
    const actors=new Set<S['Actor']>();
    for(const role of entry.roles){
      const candidates=invoke(handlers.roles,role.binder,context);
      if(!Array.isArray(candidates)||candidates.length!==1||candidates[0]==null||actors.has(candidates[0]))return;
      const actor=candidates[0];
      actors.add(actor);
      roles[role.id]=actor;
    }
    return Object.freeze({definition:entry,roles:Object.freeze(roles)});
  };
  const choose=(entry:Definition|undefined,choiceId:S['Choice'])=>entry?.choices.find(choice=>choice.id===choiceId);
  const effect=(choice:StoryletChoice<S>,context:S['EffectContext']):S['Result']=>
    snapshot(invoke(handlers.effects,choice.effect,context));
  return Object.freeze({
    definitions,
    definition,
    select(context:S['Context']):Admission|undefined{
      for(const entry of definitions){
        const admitted=check(entry,context);
        if(admitted)return admitted;
      }
    },
    admit(id:S['Id'],context:S['Context']):Admission|undefined{
      const entry=definition(id);
      return entry?check(entry,context):undefined;
    },
    resolve(id:S['Id'],choiceId:S['Choice'],context:S['Context'],effectContext:S['EffectContext']):Answer|undefined{
      const entry=definition(id);
      const choice=choose(entry,choiceId);
      if(!entry||!choice)return;
      const admitted=check(entry,context);
      if(!admitted)return;
      return Object.freeze({...admitted,choice,result:effect(choice,effectContext)});
    },
    previewEffect(id:S['Id'],choiceId:S['Choice'],effectContext:S['EffectContext']):S['Result']|undefined{
      const choice=choose(definition(id),choiceId);
      return choice?effect(choice,effectContext):undefined;
    },
  });
}
