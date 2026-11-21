import { createFastForwardWorkerController } from './fastForwardEngine';
import type { FastForwardWorkerRequest, FastForwardWorkerResponse } from './fastForwardEngine';

const scope = globalThis as unknown as {
  postMessage(message: FastForwardWorkerResponse): void;
  addEventListener(event: 'message', listener: (message: MessageEvent<FastForwardWorkerRequest>) => void): void;
};
const receive = createFastForwardWorkerController({
  post: (message) => scope.postMessage(message),
  schedule: (callback) => setTimeout(callback, 0),
  cancelSchedule: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
});
scope.addEventListener('message', ({ data }) => receive(data));
