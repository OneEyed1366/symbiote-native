// Форма `stickyHeaderIndices`: помеченный ребёнок переезжает в синтезированный `sticky-header`,
// дальше всё делает форма-ребёнок (порядок, cross-talk, throttle, пин, teardown)
// Обёртка появляется на коммит позже: только `afterCommit` видит полный `childHost.children`

import {
  appendChild,
  childrenOf,
  createElement,
  dlog,
  insertBefore,
  isAnchor,
  parentOf,
  propOf,
  removeChild,
  requestCommitFor,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { descriptorFor } from '../../component-names';
import { isStickyHeader, STICKY_HEADER_TAG } from './sticky';

// Узлы, созданные здесь: по ним обход отличает свою обёртку от ребёнка приложения
const indexWrappers = new WeakSet<ISymbioteNode>();
// Владельцы с хотя бы одной обёрткой, иначе ScrollView без пропа платит один промах WeakSet
const ownersWithIndexWrappers = new WeakSet<ISymbioteNode>();

type IIndexWalk = {
  slot: ISymbioteNode;
  wanted: ReadonlySet<number> | undefined;
  paintIndex: number;
  wrapped: number;
  hasChanged: boolean;
};

function indexSetOf(value: unknown): Set<number> | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = new Set<number>();
  for (const entry of value) if (typeof entry === 'number') out.add(entry);
  return out.size === 0 ? undefined : out;
}

function wrapChild(slot: ISymbioteNode, child: ISymbioteNode): void {
  const descriptor = descriptorFor(STICKY_HEADER_TAG);
  const wrapper = createElement(
    descriptor.component,
    descriptor.isText,
    STICKY_HEADER_TAG,
  );
  indexWrappers.add(wrapper);
  // Сначала слот, потом ребёнок в него: `appendChild` отцепляет от старого родителя
  insertBefore(slot, wrapper, child);
  appendChild(wrapper, child);
  // После обоих, иначе якорь выше разрешился бы в саму обёртку
  child.wrapper = wrapper;
}

function unwrapChild(slot: ISymbioteNode, wrapper: ISymbioteNode): void {
  const child = childrenOf(wrapper)[0];
  if (child !== undefined) {
    // До переноса, иначе `insertBefore` вернёт обёртку на место ребёнка
    child.wrapper = undefined;
    insertBefore(slot, child, wrapper);
  }
  removeChild(slot, wrapper);
}

// Фреймворк убирает ребёнка из СЛОТА, где его добавил, а движок вычёркивает только `parent`:
// остаётся закоммиченная обёртка вокруг ничьего узла, и видит это только обход
function dropOrphanWrapper(
  slot: ISymbioteNode,
  wrapper: ISymbioteNode,
): boolean {
  const held = childrenOf(wrapper)[0];
  if (held !== undefined && parentOf(held) === wrapper) return false;
  removeChild(slot, wrapper);
  return true;
}

function reconcileChild(child: ISymbioteNode, walk: IIndexWalk): void {
  const { slot } = walk;
  const wrapper = indexWrappers.has(child) ? child : undefined;
  if (wrapper !== undefined && dropOrphanWrapper(slot, wrapper)) {
    walk.hasChanged = true;
    return;
  }
  // Якорь ничего не рисует, RN его не считал: иначе индексы ниже якоря указывают не туда
  if (wrapper === undefined && isAnchor(child)) return;
  const index = walk.paintIndex;
  walk.paintIndex += 1;
  // Свой `<sticky-header>` приложения считается ребёнком, но второй обёртки не получает
  if (wrapper === undefined && isStickyHeader(child)) return;
  const shouldWrap = walk.wanted?.has(index) === true;
  if (wrapper === undefined) {
    if (!shouldWrap) return;
    wrapChild(slot, child);
    walk.hasChanged = true;
    walk.wrapped += 1;
    return;
  }
  if (shouldWrap) {
    walk.wrapped += 1;
    return;
  }
  unwrapChild(slot, wrapper);
  walk.hasChanged = true;
}

// Приводит обёртки в соответствие с `stickyHeaderIndices`, вызывается из `afterCommit`
// Цена O(детей слота) за коммит, не за мутацию
export function reconcileStickyIndices(owner: ISymbioteNode): void {
  const slot = owner.childHost;
  if (slot === undefined) return;
  const wanted = indexSetOf(propOf(owner, 'stickyHeaderIndices'));
  if (wanted === undefined && !ownersWithIndexWrappers.has(owner)) return;

  const walk: IIndexWalk = {
    slot,
    wanted,
    paintIndex: 0,
    wrapped: 0,
    hasChanged: false,
  };
  // Обёртка и снятие правят список, по которому идём, а `childrenOf` отдаёт свежий массив
  for (const child of childrenOf(slot)) reconcileChild(child, walk);

  if (walk.wrapped > 0) ownersWithIndexWrappers.add(owner);
  else ownersWithIndexWrappers.delete(owner);
  if (walk.hasChanged) {
    dlog(`sticky indices reconciled (${walk.wrapped} wrapped)`);
    requestCommitFor(owner);
  }
}

export function forgetStickyIndexOwner(owner: ISymbioteNode): void {
  ownersWithIndexWrappers.delete(owner);
}
