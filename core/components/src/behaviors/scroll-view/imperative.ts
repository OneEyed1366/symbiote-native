// The ScrollView ref methods that need Keyboard, Dimensions and Platform (`ScrollView.js:995`),
// handed to the node through the engine's slot
import {
  Dimensions,
  Keyboard,
  Platform,
  dispatchViewCommand,
  dlog,
  setScrollResponderImpl,
  type IScrollResponderImpl,
  type ISymbioteNode,
} from '@symbiote-native/engine';

const ZOOM_TO_RECT_COMMAND = 'zoomToRect';
const ZOOM_PLATFORM: typeof Platform.OS = 'ios';

// Only the second argument decides `animated`, `rect.animated` is dropped (`:1007-1020`)
const zoomTo: IScrollResponderImpl['zoomTo'] = (node, rect, animated) => {
  if (Platform.OS !== ZOOM_PLATFORM) {
    throw new Error('zoomToRect is not implemented');
  }
  const { x, y, width, height } = rect;
  dispatchViewCommand(node, ZOOM_TO_RECT_COMMAND, [
    { x, y, width, height },
    animated !== false,
  ]);
};

// `_inputMeasureAndScrollToKeyboard` (`:1037-1076`): without keyboard metrics yet it waits one
// macrotask, as native may still be about to report them
const scrollToKeyboard: IScrollResponderImpl['scrollToKeyboard'] = (
  node: ISymbioteNode,
  target,
  additionalOffset,
  preventNegativeScrollOffset,
) => {
  const inner = node.childHost;
  if (inner === undefined) return;
  if (typeof target === 'number') {
    dlog('scrollToKeyboard: numeric handles are not supported');
    return;
  }

  const scrollIntoVisibleRect = (top: number, height: number): void => {
    const keyboardScreenY =
      Keyboard.metrics()?.screenY ?? Dimensions.get('window').height;
    const offset = top - keyboardScreenY + height + additionalOffset;
    const y = preventNegativeScrollOffset ? Math.max(0, offset) : offset;
    node.scrollTo({ x: 0, y, animated: true });
  };

  target.measureLayout(
    inner,
    (_left, top, _width, height) => {
      if (Keyboard.metrics() === undefined) {
        setTimeout(() => scrollIntoVisibleRect(top, height), 0);
      } else {
        scrollIntoVisibleRect(top, height);
      }
    },
    () => console.warn('Error measuring text field.'),
  );
};

export function installScrollResponder(): void {
  setScrollResponderImpl({ zoomTo, scrollToKeyboard });
}
