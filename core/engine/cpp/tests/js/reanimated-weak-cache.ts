// The worklets mock keeps `serializableMappingCache` in a `Map`, the native module in a `WeakMap`
// A heap guard needs the native one, else every animated ref ever made stays alive

import { serializableMappingCache } from 'react-native-worklets';

const entries = new WeakMap<object, unknown>();

Object.assign(serializableMappingCache, {
  set: (key: object, value: unknown): void => {
    entries.set(key, value);
  },
  get: (key: object): unknown => entries.get(key),
  has: (key: object): boolean => entries.has(key),
});
