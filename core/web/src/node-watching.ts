// Which nodes the layout watcher holds. A node is watched while it listens for layout and sits in
// the page; a removal lets go of its subtree, and a move puts it back at the end of the same batch

import { isHtmlElement } from './dom-guards';
import type { IDomNode } from './dom-node';
import {
  createLayoutWatcher,
  type ILayout,
  type IObserverClass,
} from './layout-watcher';

export type IWatchingOptions = {
  // What measures elements, a browser without one reports no layout at all
  observer?: IObserverClass;
  // Told the frame of a node that listens for layout, each time its size changes
  onLayout?: (handle: object, layout: ILayout) => void;
};

export type INodeWatching = {
  // Brings the watch of a node in line with its props, after its element took them
  sync: (node: IDomNode, bag: Readonly<Record<string, unknown>>) => void;
  // The node left the page along with everything under it
  suspend: (node: IDomNode) => void;
  // Marks the suspended nodes that are back in the page, so the next sync watches them again
  settle: (dirty: Set<IDomNode>) => void;
};

export function createNodeWatching({
  observer,
  onLayout,
}: IWatchingOptions): INodeWatching {
  const watcher = createLayoutWatcher(observer, (handle, layout) =>
    onLayout?.(handle, layout),
  );
  const suspended = new Set<IDomNode>();

  const release = (node: IDomNode): void => {
    if (node.watched === undefined) return;
    watcher.unwatch(node.watched);
    node.watched = undefined;
    suspended.add(node);
  };

  const suspend = (node: IDomNode): void => {
    release(node);
    for (const child of node.children) suspend(child);
  };

  return {
    sync(node, bag) {
      const wanted =
        bag.onLayout === true && isHtmlElement(node.dom) ? node.dom : undefined;
      if (node.watched === wanted) return;
      if (node.watched !== undefined) watcher.unwatch(node.watched);
      if (wanted !== undefined) watcher.watch(wanted, node.handle);
      node.watched = wanted;
    },
    suspend,
    settle(dirty) {
      for (const node of suspended) {
        if (node.dom?.isConnected === true) dirty.add(node);
      }
      suspended.clear();
    },
  };
}
