import { createResourceController } from './resource-controller';
import type { IResourceController } from './resource-controller';

// A resource whose key is plain data, equal keys are the same resource whatever their identity
export function createJsonKeyedResourceController<TKey, TResource>(
  create: (key: TKey) => TResource,
  dispose: (resource: TResource) => void,
): IResourceController<TKey, TResource> {
  return createResourceController<TKey, TResource>(
    create,
    dispose,
    (a, b) => JSON.stringify(a) === JSON.stringify(b),
  );
}
