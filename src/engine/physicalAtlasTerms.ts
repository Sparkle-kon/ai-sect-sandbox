import type {SimulationRegionId} from '../types/world';

/** This compatibility chart is not the E3 regional simulation opt-in. */
export const PHYSICAL_ATLAS_CHART_ID='lower-base' as const;
export const PHYSICAL_ATLAS_REGION_IDS=['west','center','east'] as const satisfies readonly SimulationRegionId[];
export type PhysicalAtlasRegionId=typeof PHYSICAL_ATLAS_REGION_IDS[number];
export const PHYSICAL_ATLAS_REGION_NAMES:Readonly<Record<PhysicalAtlasRegionId,string>>={west:'西境',center:'中州',east:'东境'};

export interface PhysicalAtlasAddress {
  chartId:typeof PHYSICAL_ATLAS_CHART_ID;
  tileId:string;
}
export interface PhysicalAtlasPoint {
  address:PhysicalAtlasAddress;
  regionId:PhysicalAtlasRegionId;
  col:number;
  row:number;
}
export interface PhysicalAtlasBorder {
  from:PhysicalAtlasPoint;
  to:PhysicalAtlasPoint;
}
export interface PhysicalAtlasOwnership {
  /** Ownership of a particular tile or named site, never of the entire region. */
  tileOwnerSectId?:string;
  locationOwnerSectId?:string;
}
export interface PhysicalAtlasLocal extends PhysicalAtlasOwnership {
  point:PhysicalAtlasPoint;
  locationId?:string;
}
export type PhysicalAtlasRouteKind='road'|'village_supply';
export type PhysicalAtlasRouteStatus='established'|'traversed'|'closed';
export interface PhysicalAtlasRouteView {
  kind:PhysicalAtlasRouteKind;
  id:string;
  status:PhysicalAtlasRouteStatus;
  /** Only the visible portion, in native route order. */
  borders:PhysicalAtlasBorder[];
  /** Physically reached borders in the source's own direction. */
  traversedBorders:PhysicalAtlasBorder[];
}
export interface PhysicalAtlasView {
  home?:PhysicalAtlasLocal;
  regions:PhysicalAtlasRegionId[];
  borders:PhysicalAtlasBorder[];
  routes:PhysicalAtlasRouteView[];
}
