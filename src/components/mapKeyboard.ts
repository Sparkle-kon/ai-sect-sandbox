import { centerCamera, DEFAULT_CAMERA, MAP_HEIGHT, MAP_WIDTH, panCamera, zoomCamera } from './mapCamera';
import type { CameraPoint, MapCamera } from './mapCamera';

export type MapCameraCommand = 'left' | 'right' | 'up' | 'down' | 'in' | 'out' | 'home' | 'selected';
const bindings: Record<string, MapCameraCommand> = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', '+': 'in', '=': 'in', '-': 'out', '−': 'out', Home: 'home', f: 'selected', F: 'selected',
};
const mapCenter = { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };

export function mapKeyboardCommand(event: Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey'>): MapCameraCommand | undefined {
  if (event.altKey || event.ctrlKey || event.metaKey || !Object.hasOwn(bindings, event.key)) return undefined;
  return bindings[event.key];
}

export function focusMapPoint(camera: MapCamera, point: CameraPoint): MapCamera {
  return centerCamera({ ...camera, zoom: Math.max(2, camera.zoom) }, point);
}

export function mapCameraCommand(camera: MapCamera, command: MapCameraCommand, selected?: CameraPoint): MapCamera {
  switch (command) {
    case 'left': return panCamera(camera, { x: 125, y: 0 });
    case 'right': return panCamera(camera, { x: -125, y: 0 });
    case 'up': return panCamera(camera, { x: 0, y: 90 });
    case 'down': return panCamera(camera, { x: 0, y: -90 });
    case 'in': return zoomCamera(camera, camera.zoom * 1.25, mapCenter);
    case 'out': return zoomCamera(camera, camera.zoom / 1.25, mapCenter);
    case 'home': return DEFAULT_CAMERA;
    case 'selected': return selected ? focusMapPoint(camera, selected) : camera;
  }
}

export function shouldAnimateMap(prefersReducedMotion: boolean | undefined, visible: boolean): boolean {
  return prefersReducedMotion === false && visible;
}
