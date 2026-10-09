// Жизненный цикл листа `AnimatedProps` для каждого Animated.* враппера: собрать лист из props,
// вписать в граф значений, привязать к закоммиченному узлу и по запросу уйти в native
// Адаптер решает КОГДА звать reconcile и КАК найти host node, остальное общее для всех

import {
  areCompositeKeysEqual,
  createCompositeKeyForProps,
  type ICompositeKey,
} from './composite-key';
import { AnimatedProps } from './props';
import { dlog } from '../debug';
import type { ISymbioteNode } from '../node';

// Сквозной номер reconcile для лога, по нему различаются вызовы разных Animated.*
let globalReconcileSeq = 0;

// Только для лога: `style` тут сырой проп, поэтому читаем поле без допущений о форме
function readTransform(style: unknown): unknown {
  if (typeof style !== 'object' || style === null) return undefined;
  return Reflect.get(style, 'transform');
}

// Только для лога: описание `transform` без JSON, т.к. живой узел в графе циклический
function describeTransform(value: unknown): string {
  if (!Array.isArray(value)) return String(value);
  const entries = value.map(entry => {
    if (typeof entry !== 'object' || entry === null) return String(entry);
    const [key] = Object.keys(entry);
    const inner = key === undefined ? undefined : Reflect.get(entry, key);
    const innerDesc =
      typeof inner === 'number' || typeof inner === 'string'
        ? String(inner)
        : `<${inner !== null && typeof inner === 'object' ? inner.constructor.name : typeof inner}>`;
    return `${key}:${innerDesc}`;
  });
  return `[${entries.join(',')}]`;
}

// Нативная половина reconcile идёт в момент, который выбирает вызывающий, и отдаёт отмену
// Angular передаёт `bind => whenCommitted(node, bind)`, т.к. тег вью есть только после коммита
// Откладывается лишь нативная половина, сборка листа и граф значений идут синхронно
export type IScheduleNativeBind = (bind: () => void) => (() => void) | void;

export type IAnimatedLeafLifecycle = {
  // Пересобирает лист из `props`, вписывает новый в граф раньше старого и привязывает к `node`
  // (null пока у хоста нет узла), при `wantsNative` уходит в native. Звать на каждое обновление
  reconcile(
    props: Record<string, unknown>,
    node: ISymbioteNode | null,
    wantsNative: boolean,
    scheduleNativeBind?: IScheduleNativeBind,
  ): void;
  // Отцепляет последний лист, звать один раз при unmount
  teardown(): void;
};

export function createAnimatedLeafLifecycle(
  label: string,
): IAnimatedLeafLifecycle {
  let attached: AnimatedProps | null = null;
  // Только для лога: прошлый узел и признак повторного входа в reconcile из его же стека
  let lastNode: ISymbioteNode | null = null;
  let isInReconcile = false;
  // Прошлый ключ props и флаг native для пропуска ниже
  let lastKey: ICompositeKey | null = null;
  let hasLastKey = false;
  let lastWantsNative = false;
  // Отмена нативной привязки, которую вызывающий отложил и которая ещё не прошла
  let cancelPendingBind: (() => void) | undefined;

  return {
    reconcile(props, node, wantsNative, scheduleNativeBind): void {
      const seq = ++globalReconcileSeq;
      const isReentrant = isInReconcile;
      const hasNodeChanged = node !== lastNode;
      const hasWantsNativeChanged = wantsNative !== lastWantsNative;
      const compositeKey = createCompositeKeyForProps(props);
      const havePropsChanged =
        !hasLastKey || !areCompositeKeysEqual(lastKey, compositeKey);
      lastNode = node;
      lastWantsNative = wantsNative;
      // Храним ключ, а не props: Svelte отдаёт один объект и меняет его на месте
      lastKey = compositeKey;
      hasLastKey = true;
      // Thunk: reconcile идёт на каждое обновление, а `describeTransform` аллоцирует
      dlog(
        () =>
          `AnimatedProps[${label}] reconcile#${seq} reentrant=${isReentrant} wantsNative=${wantsNative} ` +
          `hasNode=${node !== null} nodeChanged=${hasNodeChanged} propsChanged=${havePropsChanged} ` +
          `transform=${describeTransform(readTransform(props.style))}`,
      );
      if (isReentrant) {
        dlog(
          `AnimatedProps[${label}] reconcile#${seq} *** RE-ENTRANT CALL DETECTED - see reconcile above ***`,
        );
      }
      // Пропуск только для уже нативного листа: до первой нативной привязки reconcile идёт
      // каждый раз, иначе пересобранная интерполяция не попадёт в детей общего значения
      const isUnchanged =
        !hasNodeChanged && !hasWantsNativeChanged && !havePropsChanged;
      if (attached !== null && attached.__isNative() && isUnchanged) {
        dlog(
          `AnimatedProps[${label}] reconcile#${seq} skipped (no-op: already native, props/node unchanged)`,
        );
        attached.refreshStatics(props);
        return;
      }
      isInReconcile = true;
      try {
        // Новый лист вписываем ДО отцепления старого: у общего значения без детей нативный узел
        // сам отцепляется, и бегущая анимация гибнет
        const newLeaf = new AnimatedProps(props);
        newLeaf.__attach();
        if (attached !== null && attached !== newLeaf) attached.__detach();
        attached = newLeaf;

        // События `Animated.event` тут не привязываем: они идут вниз в `routeProp` с props
        // и привязываются там, двойная привязка вешала один маппинг дважды
        const bindNative = (): void => {
          if (node !== null) newLeaf.setNativeView(node);
          if (wantsNative) newLeaf.__makeNative();
        };

        cancelPendingBind?.();
        cancelPendingBind = undefined;
        if (scheduleNativeBind === undefined || node === null) {
          bindNative();
          return;
        }
        cancelPendingBind = scheduleNativeBind(bindNative) ?? undefined;
      } finally {
        isInReconcile = false;
      }
    },
    teardown(): void {
      cancelPendingBind?.();
      cancelPendingBind = undefined;
      if (attached !== null) {
        attached.__detach();
        attached = null;
      }
    },
  };
}
