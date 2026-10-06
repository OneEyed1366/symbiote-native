// The children of the content node: header, the keyed rows (or the empty slot), footer

import { For, Show, type Accessor } from 'solid-js';
import type { IStyleProp, IViewStyle } from '@symbiote-native/engine';
import type { JSX } from '../../jsx-runtime';

export type IListBodyDeps = {
  // Each slot is read once by the caller, a JSX prop is a getter that builds the element on read
  header: JSX.Element;
  footer: JSX.Element;
  empty: JSX.Element;
  // Wrapper styles read in a prop getter, they carry the counter-flip of an inverted list
  headerStyle: () => IStyleProp<IViewStyle> | undefined;
  footerStyle: () => IStyleProp<IViewStyle> | undefined;
  emptyStyle: () => IStyleProp<IViewStyle> | undefined;
  isEmpty: () => boolean;
  rowKeys: Accessor<string[]>;
  renderRow: (rowKey: string) => JSX.Element;
};

// Every reactive read sits inside a `<Show>` or `<For>` prop getter, so this function has no
// dependencies and the content view's `insert` effect runs exactly once, a condition moved into a
// plain helper called from here would rebuild the whole list on the next scroll
export function listBody(deps: IListBodyDeps): JSX.Element {
  return [
    <Show when={deps.header !== undefined}>
      <view style={deps.headerStyle()}>{deps.header}</view>
    </Show>,
    <Show
      when={deps.isEmpty()}
      fallback={<For each={deps.rowKeys()}>{deps.renderRow}</For>}
    >
      <Show when={deps.empty !== undefined}>
        <view style={deps.emptyStyle()}>{deps.empty}</view>
      </Show>
    </Show>,
    <Show when={deps.footer !== undefined}>
      <view style={deps.footerStyle()}>{deps.footer}</view>
    </Show>,
  ];
}
