// The subset of this adapter a third-party native-view package needs, at runtime and in its tests
// It sits outside the main barrel, whose `.svelte` re-exports plain vitest cannot parse

// `mount` and `unmount` bootstrap a surface in such a package's own tests
// `mountDescriptorChildren` mounts a Descriptor whose raw Fabric name cannot be a template tag
// `captureHost` replaces `bind:this` on an element, which does not compile under `customRenderer`
export { mount, unmount } from './render';
export {
  mountDescriptorChildren,
  createDescriptorChildrenSync,
} from './descriptor-to-svelte';
export type { IDescriptorChildrenMount } from './descriptor-to-svelte';
export type { IHostInstance } from './host-instance';
export { hostProps } from './host-props';
export { hostInstance } from './host-instance';
export { captureHost } from './runes/attachments';
