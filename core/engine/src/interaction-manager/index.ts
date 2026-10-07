// InteractionManager как в RN 0.86: заглушка без очереди, задачи идут на ближайший `setImmediate`
// Дескрипторы ничего не блокируют, события не приходят, очередь RN убрал

import { hostCall } from '../host-call';
import { invariant } from '../invariant';

export const Events = {
  interactionStart: 'interactionStart',
  interactionComplete: 'interactionComplete',
} as const;

export type IInteractionEvent = (typeof Events)[keyof typeof Events];

export type ISimpleTask = {
  name: string;
  run: () => void;
};
export type IPromiseTask = {
  name: string;
  gen: () => Promise<unknown>;
};
export type ITask = ISimpleTask | IPromiseTask | (() => void);

export type IHandle = number;

// Результат `runAfterInteractions`: промис-подобный объект с отменой
export type ICancellable = {
  then: Promise<void>['then'];
  cancel: () => void;
};

// У заглушки RN дескриптор всегда один и тот же
const STUB_HANDLE = -1;

// Заглушка RN не отклоняет промис, ошибка уходит наружу асинхронно
function reject(error: Error): void {
  setTimeout(() => {
    throw error;
  }, 0);
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function hasMethod(task: object, name: string): boolean {
  return typeof Reflect.get(task, name) === 'function';
}

function callMethod(task: object, name: string): unknown {
  return Reflect.apply(Reflect.get(task, name), task, []);
}

function runSync(call: () => void, resolve: () => void): void {
  try {
    call();
    resolve();
  } catch (error: unknown) {
    reject(toError(error));
  }
}

// Запускает задачу любого вида и сообщает о завершении через `resolve`
function runTask(task: unknown, resolve: () => void): void {
  if (typeof task === 'function') {
    runSync(() => task(), resolve);
    return;
  }
  if (typeof task !== 'object' || task === null) {
    reject(new TypeError(`Invalid task of type: ${typeof task}`));
    return;
  }
  if (hasMethod(task, 'gen')) {
    Promise.resolve(callMethod(task, 'gen')).then(resolve, reject);
    return;
  }
  if (hasMethod(task, 'run')) {
    runSync(() => callMethod(task, 'run'), resolve);
    return;
  }
  const name = String(Reflect.get(task, 'name'));
  reject(new TypeError(`Task "${name}" missing gen or run.`));
}

export const InteractionManager = {
  Events,

  runAfterInteractions(task?: ITask | null): ICancellable {
    let immediateId: unknown;
    const promise = new Promise<void>(resolve => {
      immediateId = hostCall('setImmediate', [
        () => {
          runTask(task, resolve);
        },
      ]);
    });
    return {
      then: promise.then.bind(promise),
      cancel(): void {
        hostCall('clearImmediate', [immediateId]);
      },
    };
  },

  createInteractionHandle(): IHandle {
    return STUB_HANDLE;
  },

  clearInteractionHandle(handle: IHandle): void {
    invariant(!!handle, 'InteractionManager: Must provide a handle to clear.');
  },

  addListener(
    _eventType: IInteractionEvent,
    _listener: (...args: unknown[]) => void,
  ): { remove: () => void } {
    return { remove(): void {} };
  },

  setDeadline(_deadline: number): void {},
};
