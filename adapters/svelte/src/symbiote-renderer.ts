// Рендерер для `svelte/renderer`: узлы Svelte это узлы engine, дерево лежит в C++
// JS держит только `HostFragment` (шаблон до вставки) и место узла, которое engine не хранит

import { createRenderer } from 'svelte/renderer';
import {
  appendChild,
  childrenOf,
  createAnchor,
  createElement,
  createRawText,
  firstChildOf,
  insertBefore,
  isAnchor,
  isRawTextNode,
  isRecord,
  isTextContainer,
  nextSiblingOf,
  parentOf,
  removeChild,
  setText,
  textOf,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { descriptorFor } from '@symbiote-native/components';
import { commitLiveSurfaces } from './active-surface';
import {
  addHostListener,
  getHostAttribute,
  hostPropBagOf,
  removeHostAttribute,
  removeHostListener,
  setHostAttribute,
  setHostPropBag,
  writeHostStyle,
} from './element-props';
import { isWhitespaceOnly } from './formatting-whitespace';
import { HostFragment } from './host-fragment';
import { discoverStyleCacheKey } from './style-cache';

type IParent = ISymbioteNode | HostFragment;

// Имя атрибута, под которым примитивы передают весь набор свойств одним объектом
const PROP_BAG_ATTRIBUTE = 'p';

// Сюда svelte кладёт `style` строкой, а настоящее значение идёт через `writeHostStyle`
const STYLE_ATTRIBUTE = 'style';

// Где узел лежит по версии Svelte, выставляется вставкой и снимается удалением
// Ссылка на предка в JS замыкает петлю через корень `attachedHandle`, и экран не соберётся
// `IN_TREE`: родитель тот же, что у engine, `IN_SLOT`: ребёнок составного владельца
const IN_TREE = 'tree';
const IN_SLOT = 'slot';

// Фрагмент и обёрнутый владелец стоят не выше узла, их ссылка петли не замыкает
type IWrapped = { readonly owner: ISymbioteNode };
type IPlace = typeof IN_TREE | typeof IN_SLOT | HostFragment | IWrapped;

const places = new WeakMap<ISymbioteNode, IPlace>();

// Родитель по версии Svelte, а у engine спрашивается только то, что JS помнить нельзя
function parentInSvelte(node: ISymbioteNode): IParent | undefined {
  const place = places.get(node);
  if (place instanceof HostFragment) return place;
  if (typeof place === 'object') return place.owner;
  const holder = parentOf(node);
  if (place !== IN_SLOT || holder === undefined) return holder;
  const above = parentOf(holder);
  return above?.childHost === holder ? above : holder;
}

function placeOf(parent: ISymbioteNode, node: ISymbioteNode): IPlace {
  if (parent.wrapper === node) return { owner: parent };
  return parent.childHost === undefined ? IN_TREE : IN_SLOT;
}

// `set_style` отдаёт рендереру `String(value)`, оригинал svelte пишет в приватный `Symbol('style')`
// Аксессор на прототипе узла перехватывает запись и кладёт объект в набор свойств
let isStyleSeamInstalled = false;

function installStyleSeam(sample: ISymbioteNode): void {
  if (isStyleSeamInstalled) return;
  isStyleSeamInstalled = true;
  Object.defineProperty(
    Object.getPrototypeOf(sample),
    discoverStyleCacheKey(),
    {
      configurable: true,
      get(this: ISymbioteNode): unknown {
        return hostPropBagOf(this).style;
      },
      set(this: ISymbioteNode, value: unknown): void {
        writeHostStyle(this, value);
      },
    },
  );
}

// Обёртка в engine предок владельца, ссылка на неё из его списка замкнула бы петлю
// Поэтому в списке стоит метка, а узел отдаёт сам владелец
const WRAPPER_SLOT = Symbol('wrapper');
type IListed = ISymbioteNode | typeof WRAPPER_SLOT;

function listed(parent: IParent, node: ISymbioteNode): IListed {
  return !(parent instanceof HostFragment) && parent.wrapper === node
    ? WRAPPER_SLOT
    : node;
}

function unlisted(
  parent: IParent,
  entry: IListed | undefined,
): ISymbioteNode | null {
  if (entry !== WRAPPER_SLOT) return entry ?? null;
  return parent instanceof HostFragment ? null : (parent.wrapper ?? null);
}

// Поиск с конца, т.к. якорь each-блока и добавляемые строки стоят у хвоста списка
// Поиск с начала делает каждую вставку O(n), а весь each-блок O(n^2)
function positionIn(
  list: IListed[],
  parent: IParent,
  node: ISymbioteNode,
): number {
  return list.lastIndexOf(listed(parent, node));
}

function dropFrom(list: IListed[], parent: IParent, node: ISymbioteNode): void {
  const index = positionIn(list, parent, node);
  if (index >= 0) list.splice(index, 1);
}

// Составной владелец (`scroll-view`, `image-background`) раскладывает детей по своим слотам
// Порядок, в котором их вставил Svelte, engine не хранит, поэтому он лежит здесь
const authoredKids = new WeakMap<ISymbioteNode, IListed[]>();

function childListOf(parent: IParent): IListed[] | undefined {
  if (parent instanceof HostFragment) return parent.children;
  if (parent.childHost === undefined) return undefined;
  const known = authoredKids.get(parent);
  if (known !== undefined) return known;
  const created: ISymbioteNode[] = [];
  authoredKids.set(parent, created);
  return created;
}

// Старый родитель теряет узел из своего списка
// Узел, ушедший под фрагмент, выходит и из дерева engine, иначе поддерево красится
function leavePlace(node: ISymbioteNode, parent: IParent): void {
  const place = places.get(node);
  const isPlainMove = place === IN_TREE && !(parent instanceof HostFragment);
  if (place === undefined || isPlainMove) return;
  const previous = parentInSvelte(node);
  if (previous === undefined) return;
  const previousList = childListOf(previous);
  if (previousList !== undefined) dropFrom(previousList, previous, node);
  if (previous instanceof HostFragment || !(parent instanceof HostFragment))
    return;
  removeChild(previous, node);
  commitLiveSurfaces();
}

// Новый родитель получает узел перед `anchor`
function recordPlacement(
  node: ISymbioteNode,
  parent: IParent,
  anchor: ISymbioteNode | null,
): void {
  leavePlace(node, parent);
  const list = childListOf(parent);
  const index =
    list === undefined || anchor === null
      ? -1
      : positionIn(list, parent, anchor);
  list?.splice(index < 0 ? list.length : index, 0, node);
}

function insertNode(
  parent: IParent,
  node: ISymbioteNode | HostFragment,
  anchor: ISymbioteNode | null,
): void {
  if (node instanceof HostFragment) {
    for (const child of node.children.splice(0)) {
      places.delete(child);
      insertNode(parent, child, anchor);
    }
    return;
  }
  recordPlacement(node, parent, anchor);
  if (parent instanceof HostFragment) {
    places.set(node, parent);
    return;
  }
  // Пробел между двумя тегами не текст: под родителем без текста он гаснет в пустую строку
  // Пустой `RCTRawText` C++ выбрасывает из обхода сам, а `setText` с `''` обратно возвращает его
  if (
    isRawTextNode(node) &&
    !isTextContainer(parent) &&
    isWhitespaceOnly(textOf(node) ?? '')
  ) {
    setText(node, '');
  }
  if (anchor === null) appendChild(parent, node);
  else insertBefore(parent, node, anchor);
  places.set(node, placeOf(parent, node));
  if (parent.wrapper === node) markWrapper(parent, node);
  commitLiveSurfaces();
}

// `appendChild` решает, что узел обёртка, поэтому в списке метка встаёт на его место после вставки
function markWrapper(owner: ISymbioteNode, wrapper: ISymbioteNode): void {
  const list = childListOf(owner);
  const index = list?.lastIndexOf(wrapper) ?? -1;
  if (list !== undefined && index >= 0) list[index] = WRAPPER_SLOT;
}

function siblingAfter(node: ISymbioteNode): ISymbioteNode | null {
  const place = places.get(node);
  if (place !== undefined && place !== IN_TREE) {
    const parent = parentInSvelte(node);
    const list = parent === undefined ? undefined : childListOf(parent);
    if (parent !== undefined && list !== undefined) {
      return unlisted(parent, list[positionIn(list, parent, node) + 1]);
    }
  }
  return nextSiblingOf(node) ?? null;
}

export default createRenderer<{
  fragment: HostFragment;
  element: ISymbioteNode;
  text: ISymbioteNode;
  comment: ISymbioteNode;
}>({
  createFragment: () => new HostFragment(),
  createElement(name: string) {
    const descriptor = descriptorFor(name);
    // Тег третьим аргументом: по нему ищется поведение хоста, заданное на тег
    const node = createElement(descriptor.component, descriptor.isText, name);
    installStyleSeam(node);
    return node;
  },
  createText: (data: string) => createRawText(data),
  createComment: () => createAnchor(),

  getNodeType(node) {
    if (node instanceof HostFragment) return 'fragment';
    if (isRawTextNode(node)) return 'text';
    return isAnchor(node) ? 'comment' : 'element';
  },
  getText: node => textOf(node) ?? '',

  getAttribute(element, name) {
    const value = getHostAttribute(element, name);
    return value === null ? null : String(value);
  },
  setAttribute(element, key, value) {
    if (key === PROP_BAG_ATTRIBUTE) {
      setHostPropBag(element, isRecord(value) ? value : undefined);
      return;
    }
    if (key === STYLE_ATTRIBUTE) return;
    setHostAttribute(element, key, value);
  },
  removeAttribute(element, name) {
    if (name === STYLE_ATTRIBUTE) return;
    removeHostAttribute(element, name);
  },
  hasAttribute: (element, name) => getHostAttribute(element, name) !== null,
  setText(node, text) {
    setText(node, text);
    commitLiveSurfaces();
  },

  getFirstChild(parent) {
    if (parent instanceof HostFragment) return parent.children[0] ?? null;
    const list = childListOf(parent);
    if (list !== undefined) return unlisted(parent, list[0]);
    return firstChildOf(parent) ?? null;
  },
  getLastChild(parent) {
    if (parent instanceof HostFragment) return parent.children.at(-1) ?? null;
    const list = childListOf(parent);
    if (list !== undefined) return unlisted(parent, list.at(-1));
    return childrenOf(parent).at(-1) ?? null;
  },
  getNextSibling: siblingAfter,
  getParent: node => parentInSvelte(node) ?? null,

  insert: insertNode,
  remove(node) {
    const parent = parentInSvelte(node);
    if (parent === undefined) return;
    places.delete(node);
    const list = childListOf(parent);
    if (list !== undefined) dropFrom(list, parent, node);
    if (parent instanceof HostFragment) return;
    removeChild(parent, node);
    commitLiveSurfaces();
  },

  addEventListener: addHostListener,
  removeEventListener: removeHostListener,
});
