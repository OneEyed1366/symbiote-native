// Fantom's `getRenderedOutput().toJSX()`, as plain data: the views the platform holds

import { mounted, type IMountedView } from './harness';

export type IRendered = {
  type: string;
  props: Record<string, string>;
  children: IRendered[];
};

// A view of the expected output; `rn-view` in Fantom's JSX
export function rnView(
  props: Record<string, string>,
  ...children: IRendered[]
): IRendered {
  return { type: 'View', props, children };
}

const FRAME_KEY = 'layoutMetrics-frame';

function frameOf(node: IMountedView): string {
  const { x, y, width, height } = node.layout;
  return `{x:${x},y:${y},width:${width},height:${height}}`;
}

function renderedOf(node: IMountedView, keys: readonly string[]): IRendered {
  const props: Record<string, string> = {};
  for (const key of keys) {
    const value = key === FRAME_KEY ? frameOf(node) : node.props[key];
    if (value !== undefined) props[key] = value;
  }
  return {
    type: node.viewName,
    props,
    children: node.children.map(child => renderedOf(child, keys)),
  };
}

// The children of the root, carrying only `keys`, like `getRenderedOutput({props})`
export function rendered(keys: readonly string[] = ['nativeID']): IRendered[] {
  return mounted().children.map(child => renderedOf(child, keys));
}
