import {lazy,Suspense} from 'react';
import type {ComponentProps} from 'react';

const GrandSiegeMapScene=lazy(async()=>({default:(await import('./GrandSiegeMapScene')).GrandSiegeMapScene}));

/** Don't load the theatre card or delay the map before an actual theatre needs presenting. */
export function DeferredGrandSiegeMapScene(props:ComponentProps<typeof GrandSiegeMapScene>){
  const {world,viewer,visible}=props;
  if(!visible||!viewer||!world.cultivators.includes(viewer)||!world.sieges.some(siege=>siege.theatre))return null;
  return <Suspense fallback={null}><GrandSiegeMapScene {...props}/></Suspense>;
}
