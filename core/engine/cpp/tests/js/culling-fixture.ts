// Строительные блоки для портов Fantom-тестов: дерево на React-адаптере, логи монтирования, скролл

import {
  createElement,
  startTransition,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

import { mount, unmount } from '@symbiote-native/react';
import type { SymbioteSurface } from '@symbiote-native/engine';

import {
  flushTimers,
  mountingLogs,
  mounted,
  runWorkLoop,
  scrollTo,
  setModalSize,
  setViewport,
  type IMountedView,
} from './harness';

const ROOT_TAG = 1;

type IStyle = Record<string, unknown>;

type IViewProps = {
  nativeID?: string;
  style?: IStyle;
  key?: string;
  collapsable?: boolean;
  collapsableChildren?: boolean;
};

// `<View nativeID style key>` из RN
export function view(
  props: IViewProps,
  ...children: ReactNode[]
): ReactElement {
  return createElement('view', props, ...children);
}

// `<ScrollView style contentOffset>` из RN
export function scrollView(
  props: { style?: IStyle; contentOffset?: { x: number; y: number } },
  ...children: ReactNode[]
): ReactElement {
  return createElement('scroll-view', props, ...children);
}

// `<ScrollView horizontal>` из RN: отдельный тег, на Android отдельный ViewManager
export function horizontalScrollView(
  props: { style?: IStyle; contentOffset?: { x: number; y: number } },
  ...children: ReactNode[]
): ReactElement {
  return createElement('horizontal-scroll-view', props, ...children);
}

let surface: SymbioteSurface | undefined;
let setElement: ((element: ReactElement) => void) | undefined;

function Root(props: { initial: ReactElement }): ReactElement {
  const [element, setCurrent] = useState(props.initial);
  setElement = setCurrent;
  return element;
}

// `root.render` из Fantom: первый вызов монтирует, следующие обновляют то же дерево
export function render(element: ReactElement): void {
  const current =
    surface !== undefined && setElement !== undefined
      ? (setElement(element), surface)
      : mount(ROOT_TAG, createElement(Root, { initial: element }));
  surface = current;
  settle(current);
}

// `startTransition(() => root.render(...))`: a render that may suspend and keep the stale tree
export function renderInTransition(element: ReactElement): void {
  if (surface === undefined || setElement === undefined) {
    throw new Error('render the first tree before a transition');
  }
  const update = setElement;
  startTransition(() => update(element));
  settle(surface);
}

// `Fantom.runTask` for a state change made outside `render`
export function runTask(change: () => void): void {
  change();
  if (surface !== undefined) settle(surface);
}

function settle(target: SymbioteSurface): void {
  flushTimers();
  target.commit();
  runWorkLoop();
  flushTimers();
}

// Каждый кейс начинает с пустого корня, как `Fantom.createRoot`
export function createRoot(
  viewportWidth: number,
  viewportHeight: number,
): void {
  unmount(ROOT_TAG);
  surface = undefined;
  setElement = undefined;
  setViewport(0, 0);
  mounted();
  mountingLogs();
  // Left undrained: the first render's logs open with the root resize, as in a fresh Fantom root
  setViewport(viewportWidth, viewportHeight);
}

// `root.destroy()` из Fantom: размонтирует дерево как задачу
export function destroyRoot(): void {
  unmount(ROOT_TAG);
  surface = undefined;
  setElement = undefined;
  flushTimers();
  runWorkLoop();
}

// `root.takeMountingManagerLogs()` из Fantom
export function takeLogs(): string[] {
  mounted();
  return mountingLogs();
}

export function findByViewName(
  node: IMountedView,
  viewName: string,
): IMountedView | undefined {
  if (node.viewName === viewName) return node;
  for (const child of node.children) {
    const found = findByViewName(child, viewName);
    if (found !== undefined) return found;
  }
  return undefined;
}

// `Fantom.scrollTo` для единственного ScrollView на экране, возвращает логи после скролла
export function scrollToY(y: number): string[] {
  const target = findByViewName(mounted(), 'ScrollView');
  if (target === undefined) throw new Error('no ScrollView mounted');
  mountingLogs();
  scrollTo(target.tag, 0, y);
  return takeLogs();
}

// Смонтированное дерево без тегов: два корня с одним деревом дают равные значения
export function mountedShape(): string {
  const shapeOf = (node: IMountedView): unknown => ({
    viewName: node.viewName,
    props: node.props,
    layout: node.layout,
    children: node.children.map(shapeOf),
  });
  return JSON.stringify(shapeOf(mounted()));
}

// `Fantom.enqueueModalSizeUpdate` для единственного Modal на экране
export function modalSizeUpdate(width: number, height: number): void {
  const target = findByViewName(mounted(), 'ModalHostView');
  if (target === undefined) throw new Error('no Modal mounted');
  setModalSize(target.tag, width, height);
}

// Логи первого монтирования ScrollView без детей в контенте
export const SCROLL_VIEW_MOUNTED = [
  'Update {type: "RootView", nativeID: (root)}',
  'Create {type: "ScrollView", nativeID: (N/A)}',
  'Create {type: "View", nativeID: (N/A)}',
];

export const SCROLL_VIEW_INSERTED =
  'Insert {type: "ScrollView", parentNativeID: (root), index: 0, nativeID: (N/A)}';

export const CONTENT_INSERTED =
  'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: (N/A)}';
