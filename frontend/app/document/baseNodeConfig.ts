import type { NodeConfig } from '../graph';
import { defaultNodeConfig } from '../../../graph/graph.ts';

/**
 * Every setting's one default, as the editor's typed `NodeConfig`: the table
 * itself is `defaultNodeConfig` in `graph/graph.ts`, which the project folder's
 * writer uses too -- so what a save leaves out is the same whoever saves.
 * `savedConfig.test.ts` and `graphStore.test.ts` hold it to every runner.
 */
export function baseNodeConfig(): NodeConfig {
  return defaultNodeConfig() as NodeConfig;
}
