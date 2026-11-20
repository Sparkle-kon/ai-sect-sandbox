export type CameraPoint = { x: number; y: number };
export type MapCamera = { zoom: number; x: number; y: number };

export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = 600;
export const DEFAULT_CAMERA: MapCamera = { zoom: 1, x: 0, y: 0 };
export const MAX_ZOOM = 4;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function mapToScreen(camera: MapCamera, point: CameraPoint): CameraPoint {
  return { x: point.x * camera.zoom + camera.x, y: point.y * camera.zoom + camera.y };
}

export function screenToMap(camera: MapCamera, point: CameraPoint): CameraPoint {
  return { x: (point.x - camera.x) / camera.zoom, y: (point.y - camera.y) / camera.zoom };
}

export function panCamera(camera: MapCamera, delta: CameraPoint): MapCamera {
  return {
    zoom: camera.zoom,
    x: clamp(camera.x + delta.x, MAP_WIDTH * (1 - camera.zoom), 0),
    y: clamp(camera.y + delta.y, MAP_HEIGHT * (1 - camera.zoom), 0),
  };
}

export function zoomCamera(camera: MapCamera, zoom: number, anchor: CameraPoint): MapCamera {
  const next = { zoom: clamp(zoom, 1, MAX_ZOOM), x: 0, y: 0 };
  const pinned = mapToScreen(next, screenToMap(camera, anchor));
  return panCamera(next, { x: anchor.x - pinned.x, y: anchor.y - pinned.y });
}

export function centerCamera(camera: MapCamera, point: CameraPoint): MapCamera {
  return panCamera({ ...camera, x: 0, y: 0 }, {
    x: MAP_WIDTH / 2 - point.x * camera.zoom, y: MAP_HEIGHT / 2 - point.y * camera.zoom,
  });
}

export function clientToMapViewport(rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>, point: CameraPoint): CameraPoint | undefined {
  if (!rect.width || !rect.height) return undefined;
  return { x: (point.x - rect.left) * MAP_WIDTH / rect.width, y: (point.y - rect.top) * MAP_HEIGHT / rect.height };
}
