import {createAuthoredEraWorkerController} from './authoredEraBuildEngine';
import type {AuthoredEraWorkerRequest,AuthoredEraWorkerResponse} from './authoredEraBuildEngine';

declare const __SECT_UTILITY_RULE_VERSION__:string;
const scope=globalThis as unknown as {
  postMessage(response:AuthoredEraWorkerResponse):void;
  addEventListener(event:'message',onMessage:(message:MessageEvent<AuthoredEraWorkerRequest>)=>void):void;
};
const ruleVersion=typeof __SECT_UTILITY_RULE_VERSION__==='string'?__SECT_UTILITY_RULE_VERSION__:undefined;
const receive=createAuthoredEraWorkerController({ruleVersion,post:response=>scope.postMessage(response),
  schedule:callback=>setTimeout(callback,0),cancelSchedule:handle=>clearTimeout(handle as ReturnType<typeof setTimeout>)});
scope.addEventListener('message',({data})=>receive(data));
