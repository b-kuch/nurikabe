import { generate, type GenerateOptions } from '../core/generator';

self.onmessage = (e: MessageEvent<GenerateOptions & { id: number }>) => {
  const { id, ...opts } = e.data;
  const puzzle = generate(opts);
  self.postMessage({ id, puzzle });
};
