// The tag rule is `foldInputAccessoryViewProps` in C++, this adds the SafeAreaView RN renders
// inside it: flex 1, window wide, holding the app's children (`InputAccessoryView.js:97-99`)

// NOTE: RN renders nothing for zero children, we still mount an empty zero-sized accessory
// (see symbiote-rn-behavior-parity, InputAccessoryView)

// Android resolves to `VOID_COMPONENT`, which drops the subtree, so no structure is built there
import {
  appendChild,
  createElement,
  Dimensions,
  Platform,
  registerHostBehavior,
  routeProp,
  type IEventSubscription,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { descriptorFor } from '../component-names';

export const INPUT_ACCESSORY_VIEW_TAG = 'input-accessory-view';

const SAFE_AREA_VIEW_TAG = 'safe-area-view';

const windowSubscriptions = new WeakMap<ISymbioteNode, IEventSubscription>();

const isOnIos = (): boolean => Platform.OS === 'ios';

function contentStyle(width: number): { flex: number; width: number } {
  return { flex: 1, width };
}

function buildContent(node: ISymbioteNode): ISymbioteNode | undefined {
  if (!isOnIos()) return undefined;
  const content = createElement(
    descriptorFor(SAFE_AREA_VIEW_TAG).component,
    false,
    SAFE_AREA_VIEW_TAG,
  );
  routeProp(content, 'style', contentStyle(Dimensions.get('window').width));
  appendChild(node, content);
  return content;
}

// Off iOS RN warns and renders nothing (`InputAccessoryView.js:110-113`)
// RN warns per render, once per node is the nearest beat a tag has
function attach(node: ISymbioteNode): void {
  if (!isOnIos()) {
    console.warn('<InputAccessoryView> is only supported on iOS.');
    return;
  }
  windowSubscriptions.set(
    node,
    Dimensions.addEventListener('change', ({ window }) => {
      if (node.childHost !== undefined) {
        routeProp(node.childHost, 'style', contentStyle(window.width));
      }
    }),
  );
}

function detach(node: ISymbioteNode): void {
  windowSubscriptions.get(node)?.remove();
  windowSubscriptions.delete(node);
}

export function registerInputAccessoryViewBehavior(): void {
  registerHostBehavior(INPUT_ACCESSORY_VIEW_TAG, {
    buildStructure: buildContent,
    attach,
    detach,
  });
}
