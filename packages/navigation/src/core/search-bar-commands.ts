// The imperative API react-native-screens' own SearchBarProps exposes via its `ref` field
// (SearchBarCommands): each method dispatches a native view command on the RNSSearchBar node
// (SearchBarNativeComponent's supportedCommands: blur/focus/clearText/toggleCancelButton/
// setText/cancelSearch). Framework-agnostic — mirrors @symbiote-native/components'
// buildScrollViewHandle exactly (same lazy-getter shape); the adapter supplies the node getter
// and its own framework-specific ref field (see react/screen.ts's IReactSearchBarOptions — the
// ref itself is per-adapter, same split as IPressableProps).
import { dispatchViewCommand, dlog, type ISymbioteNode } from '@symbiote-native/engine';

export interface ISearchBarCommands {
  focus(): void;
  blur(): void;
  clearText(): void;
  setText(text: string): void;
  cancelSearch(): void;
  toggleCancelButton(show: boolean): void;
}

// dispatchViewCommand itself dlogs a "node not committed" skip; this null case (the ref never
// attached to a live RNSSearchBar at all — e.g. the header's search bar isn't mounted, or a
// stale handle outlived its screen) was the one unlogged gap, silently indistinguishable from
// "the command fired but did nothing". Investigation instrumentation (HeaderOptionsScreen
// unresponsive-buttons bug); kept behind DEBUG per <keep_logs_gate_behind_DEBUG>, never removed.
function warnIfDetached(command: string, node: ISymbioteNode | null): node is ISymbioteNode {
  if (node !== null) return true;
  dlog(
    `SearchBarCommands.${command}: skipped, node is null (ref never attached) at t=${Date.now()}`,
  );
  return false;
}

// `getNode` is a LAZY getter, read on every call — see buildScrollViewHandle's comment for why
// an eager capture would freeze `null`.
export function buildSearchBarHandle(getNode: () => ISymbioteNode | null): ISearchBarCommands {
  return {
    focus: (): void => {
      const node = getNode();
      if (!warnIfDetached('focus', node)) return;
      dispatchViewCommand(node, 'focus', []);
    },
    blur: (): void => {
      const node = getNode();
      if (!warnIfDetached('blur', node)) return;
      dispatchViewCommand(node, 'blur', []);
    },
    clearText: (): void => {
      const node = getNode();
      if (!warnIfDetached('clearText', node)) return;
      dispatchViewCommand(node, 'clearText', []);
    },
    setText: (text): void => {
      const node = getNode();
      if (!warnIfDetached('setText', node)) return;
      dispatchViewCommand(node, 'setText', [text]);
    },
    cancelSearch: (): void => {
      const node = getNode();
      if (!warnIfDetached('cancelSearch', node)) return;
      dispatchViewCommand(node, 'cancelSearch', []);
    },
    toggleCancelButton: (show): void => {
      const node = getNode();
      if (!warnIfDetached('toggleCancelButton', node)) return;
      dispatchViewCommand(node, 'toggleCancelButton', [show]);
    },
  };
}
