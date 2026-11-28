/**
 * Counts what the JS side asks of Fabric per mutation method, plus the prop payload sizes
 * Imports nothing, so one byte-identical copy serves `examples/bare-rn` and every canary
 * Wrapping costs a JS call per JSI crossing, so install it on every arm or on none
 */

const CREATE_NODE = 'createNode';

// Tree mutations are cached at renderer load, so they are counted, lazy reads are not
const COUNTED_METHODS = [
  CREATE_NODE,
  'cloneNode',
  'cloneNodeWithNewChildren',
  'cloneNodeWithNewProps',
  'cloneNodeWithNewChildrenAndProps',
  'createChildSet',
  'appendChild',
  'appendChildToSet',
  'completeRoot',
] as const;

type ICountedMethod = (typeof COUNTED_METHODS)[number];

// Index of the props argument per method: `createNode` takes it fourth, the clone variants second
const PROPS_ARG_INDEX: Partial<Record<ICountedMethod, number>> = {
  [CREATE_NODE]: 3,
  cloneNodeWithNewProps: 1,
  cloneNodeWithNewChildrenAndProps: 1,
};

// `createNode(tag, viewName, rootTag, props, handle)` names the view second
// The per-name tally shows which node is missing once two arms' totals disagree
const VIEW_NAME_ARG_INDEX = 1;

export type IFabricCallProfile = {
  calls: Record<string, number>;
  /** Total own enumerable keys across every props payload sent, by method */
  propKeys: Record<string, number>;
  /** `createNode` calls broken down by the view name asked for */
  createsByView: Record<string, number>;
  totalCalls: number;
  totalPropKeys: number;
};

const calls: Record<string, number> = {};
const propKeys: Record<string, number> = {};
const createsByView: Record<string, number> = {};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Read and reset, like `readCommitProfile()`, so a benchmark step can bracket one operation */
export function readFabricCallProfile(): IFabricCallProfile {
  let totalCalls = 0;
  let totalPropKeys = 0;
  const callsSnapshot: Record<string, number> = {};
  const propKeysSnapshot: Record<string, number> = {};
  for (const method of COUNTED_METHODS) {
    const count = calls[method] ?? 0;
    const keys = propKeys[method] ?? 0;
    if (count > 0) callsSnapshot[method] = count;
    if (keys > 0) propKeysSnapshot[method] = keys;
    totalCalls += count;
    totalPropKeys += keys;
    calls[method] = 0;
    propKeys[method] = 0;
  }
  const createsByViewSnapshot: Record<string, number> = {};
  for (const viewName of Object.keys(createsByView)) {
    createsByViewSnapshot[viewName] = createsByView[viewName] ?? 0;
    delete createsByView[viewName];
  }
  return {
    calls: callsSnapshot,
    propKeys: propKeysSnapshot,
    createsByView: createsByViewSnapshot,
    totalCalls,
    totalPropKeys,
  };
}

function counting(original: unknown, method: ICountedMethod): unknown {
  if (typeof original !== 'function') return original;
  const propsIndex = PROPS_ARG_INDEX[method];
  const wrapped = (...args: unknown[]): unknown => {
    calls[method] = (calls[method] ?? 0) + 1;
    if (method === CREATE_NODE) {
      const viewName = args[VIEW_NAME_ARG_INDEX];
      if (typeof viewName === 'string') {
        createsByView[viewName] = (createsByView[viewName] ?? 0) + 1;
      }
    }
    if (propsIndex !== undefined) {
      const payload = args[propsIndex];
      if (isRecord(payload)) {
        propKeys[method] =
          (propKeys[method] ?? 0) + Object.keys(payload).length;
      }
    }
    return Reflect.apply(original, original, args);
  };
  // A rest parameter reports `length === 0`, and the engine feature-detects the batched clone
  // bindings by arity (`core/engine/src/fabric.ts`), so copy the host's own length or every
  // adapter silently takes the per-child `appendChild` path
  Object.defineProperty(wrapped, 'length', { value: original.length });
  return wrapped;
}

let isInstalled = false;

/**
 * Hands the renderer a counting view of the binding, then puts the global back
 * C++ casts the global back to its HostObject on every commit, so the swap lasts only this call
 * `bindRenderer` must force the renderer to read it once, as both renderers cache the binding
 * @returns true if the counting object was in place while `bindRenderer` ran
 */
export function installFabricCallCounter(bindRenderer: () => void): boolean {
  if (isInstalled) return true;
  const original: unknown = Reflect.get(globalThis, 'nativeFabricUIManager');
  if (!isRecord(original)) return false;

  // Inherits from the binding so uncounted methods still resolve, as RN's own proxy helper does
  const view: Record<string, unknown> = Object.create(original);
  for (const method of COUNTED_METHODS) {
    view[method] = counting(Reflect.get(original, method), method);
  }

  try {
    Reflect.set(globalThis, 'nativeFabricUIManager', view);
    bindRenderer();
  } finally {
    Reflect.set(globalThis, 'nativeFabricUIManager', original);
  }

  isInstalled = true;
  return true;
}
