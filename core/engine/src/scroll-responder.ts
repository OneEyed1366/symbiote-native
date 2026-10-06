// The slot the two ScrollView ref methods that need Keyboard, Dimensions and Platform delegate to
// (`ScrollView.js:995-1076`). The node reaches none of them without a cycle, so `core/components`
// fills the slot when it registers the scroll-view behavior
import type { ISymbioteNode } from './node-types';

export type IZoomRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  animated?: boolean;
};

export type IScrollResponderImpl = {
  zoomTo(node: ISymbioteNode, rect: IZoomRect, animated?: boolean): void;
  scrollToKeyboard(
    node: ISymbioteNode,
    target: ISymbioteNode | number,
    additionalOffset: number,
    preventNegativeScrollOffset: boolean,
  ): void;
};

let impl: IScrollResponderImpl | undefined = undefined;

export function setScrollResponderImpl(next: IScrollResponderImpl): void {
  impl = next;
}

export function scrollResponderImpl(): IScrollResponderImpl | undefined {
  return impl;
}
