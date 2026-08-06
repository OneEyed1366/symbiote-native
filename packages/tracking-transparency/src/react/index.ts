// @symbiote-native/tracking-transparency/react: the React entry over the framework-agnostic
// core. Only the permission surface gets a lifecycle hook (there is per-instance state to seed
// and refresh); getAdvertisingId/isAvailable are stateless, re-exported verbatim — mirrors the
// lifecycle-bucket naming convention of adapters/react/src/hooks.

export { usePermissions } from './hooks/use-permissions';
export * from '../core';
