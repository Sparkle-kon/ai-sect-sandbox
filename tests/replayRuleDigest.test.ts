import { describe,expect,it } from 'vitest';

declare const __SECT_UTILITY_RULE_VERSION__:string;

describe('the current build identifies its utility rule input bytes',()=>{
  it('injects a complete SHA-256 fingerprint rather than a generic package version',()=>{
    expect(__SECT_UTILITY_RULE_VERSION__).toMatch(/^[a-f0-9]{64}$/);
  });
});
