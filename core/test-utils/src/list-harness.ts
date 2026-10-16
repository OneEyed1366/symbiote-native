// Drives a windowed list over the recording host: layout and scroll events aimed at its scroll
// and content views, and a reading of the cells and spacers it currently renders

import type { ILiveNode, ILiveTree } from './live-tree';
import type { IAuthoredNode, IRecordingHost } from './recording-host';

export type IBox = { width: number; height: number };

export type IListHarness = {
  scrollView: () => IAuthoredNode;
  contentView: () => ILiveNode;
  // The cell wrappers in order, spacers left out
  cells: () => ILiveNode[];
  // Top to bottom: a cell is its text, anything else a spacer by height (`[150]`)
  shape: () => string;
  simulateLayout: (args: { viewport: IBox; content: IBox }) => void;
  simulateContentLayout: (box: IBox) => void;
  simulateScroll: (y: number) => void;
};

function textOf(node: ILiveNode): string | undefined {
  if (typeof node.payload.text === 'string') return node.payload.text;
  for (const child of node.children) {
    const found = textOf(child);
    if (found !== undefined) return found;
  }
  return undefined;
}

function handleOf(node: { instanceHandle: unknown }): object {
  const { instanceHandle } = node;
  if (typeof instanceHandle !== 'object' || instanceHandle === null) {
    throw new Error('the node has no instance handle to aim an event at');
  }
  return instanceHandle;
}

export function createListHarness(
  fabric: IRecordingHost,
  live: ILiveTree,
): IListHarness {
  let viewport: IBox = { width: 0, height: 0 };
  let content: IBox = { width: 0, height: 0 };

  const scrollView = (): IAuthoredNode => {
    const node = fabric.find(one => one.viewName === 'RCTScrollView');
    if (node === undefined) throw new Error('no scroll view was created');
    return node;
  };
  const contentView = (): ILiveNode => {
    const container = live.findLive(
      scrollView().handle,
      one => one.viewName === 'RCTScrollContentView',
    );
    if (container === undefined) throw new Error('no scroll content view');
    return container;
  };
  const cells = (): ILiveNode[] =>
    contentView().children.filter(child => textOf(child) !== undefined);
  const simulateContentLayout = (box: IBox): void => {
    content = box;
    fabric.fireEvent(handleOf(contentView()), 'topLayout', {
      layout: { x: 0, y: 0, ...box },
    });
  };

  return {
    scrollView,
    contentView,
    cells,
    shape: () =>
      contentView()
        .children.map(
          child => textOf(child) ?? `[${String(child.payload.height ?? 0)}]`,
        )
        .join(' '),
    simulateLayout: args => {
      viewport = args.viewport;
      fabric.fireEvent(handleOf(scrollView()), 'topLayout', {
        layout: { x: 0, y: 0, ...viewport },
      });
      simulateContentLayout(args.content);
    },
    simulateContentLayout,
    simulateScroll: y => {
      fabric.fireEvent(handleOf(scrollView()), 'topScroll', {
        contentOffset: { x: 0, y },
        contentSize: content,
        layoutMeasurement: viewport,
      });
    },
  };
}
