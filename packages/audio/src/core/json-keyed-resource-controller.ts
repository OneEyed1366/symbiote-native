import {
  createResourceController,
  type IResourceController,
} from '@symbiote-native/engine';

// Shared shape behind the player/playlist/recorder controllers, keyed by JSON.stringify
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
