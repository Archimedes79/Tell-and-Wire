// The wire between a product and the page it serves, for the way to the other product: who this is, and a switch to the other.
//
// Rows both products' tables hold (`NOTEBOOK_API`, `EDITOR_API`), answered by `productRoutes` (`product.ts`). Types only, so a page may import it.

import { local, route } from '../deployment/host/api.ts';
import type { Product } from './product.ts';

export const PRODUCT_API = {
  /** Who answers, and whether the other product can be reached from here: found running, or started from this install. */
  product: route<void, { product: Product; can_switch: boolean }>('GET', '/api/product'),

  /** Where to send the person to have the project at *path* open in the other product, starting it where it does not run. */
  switchProduct: local(route<{ path: string }, { url: string; started: boolean }>('POST', '/api/switch')),
} as const;
