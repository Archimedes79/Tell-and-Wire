// A run that asks no model: the services as they are, and a model that says so when it is asked.

import type { Runtime } from '../../../graph/nodes/Runtime.ts';

/** *runtime*, with a model that fails with *message* whenever something asks it. */
export function withoutModel(runtime: Runtime, message: string): Runtime {
  return {
    ...runtime,
    ai: {
      complete: async () => {
        throw new Error(message);
      },
    },
  };
}
