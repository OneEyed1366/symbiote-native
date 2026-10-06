import { isSymbioteNode } from '@symbiote-native/engine';
import type { ISymbioteNode } from '@symbiote-native/engine';
import type { IDescriptor } from './descriptor';

/** What a package builds for a native view: its handle and the descriptor it renders */
export type INativeViewController<THandle> = {
  handle: THandle;
  /** `null` means the view cannot render here and the caller paints nothing */
  render(props: object): IDescriptor | null;
  /** Called once when the view unmounts, for what the view holds besides its native node */
  dispose?(): void;
};

/** `getNode` answers the host node of the view once it exists */
export type ICreateNativeViewController<THandle> = (
  getNode: () => ISymbioteNode | null,
) => INativeViewController<THandle>;

export type IHostNodeHolder = {
  /** The host node the captured descriptor painted, `null` until it mounts */
  getNode(): ISymbioteNode | null;
  /** The descriptor with a `ref` that catches its host node, for React, Vue and Solid */
  capture(descriptor: IDescriptor): IDescriptor;
};

/** Reaches the host node of a descriptor, which a component needs to call a native view function */
export function createHostNodeHolder(): IHostNodeHolder {
  let node: ISymbioteNode | null = null;
  // One function for every capture, a changed `ref` would look like a changed prop
  const hold = (host: unknown): void => {
    node = isSymbioteNode(host) ? host : null;
  };
  return {
    getNode: () => node,
    capture: descriptor => ({
      ...descriptor,
      props: { ...descriptor.props, ref: hold },
    }),
  };
}
