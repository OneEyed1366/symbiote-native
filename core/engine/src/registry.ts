// Runtime metadata for native Fabric views, derived by default. Any RN library ships its own
// ViewConfig via codegen, carrying everything the shared engine can't infer — which events a view
// emits, how to process its props. Nothing is transcribed; read from the config on first use.

// shared must stay react-native-free (the headless harness runs in plain Node), so the ViewConfig
// lookup is injected, exactly like the color processor: the adapter wires
// setNativeViewConfigSource(ReactNativeViewConfigRegistry.get) on a real host.

// The only explicit list is our own built-in primitives (BUILTIN_COMPONENTS): a finite set we own,
// which keep their hand-tuned tables and are never read from the source, so they can't drift. It
// grows only when we add a core primitive of our own, never for a community package.

import { isRecord } from './type-guards';
// Type-only, so this does not close an import cycle at runtime: `host-behavior` owns the fold
// contract and reaches this module for nothing.
import type { IPayloadFold } from './host-behavior';

export type IPropProcessor = (value: unknown) => unknown;

// A native event the component emits. raw is the Fabric topLevelType; listener is what our nodes
// register the handler under, from the onX-prop split. direct: true marks a non-bubbling event.
export interface INativeEventBinding {
  raw: string;
  listener: string;
  direct?: boolean;
}

// Manual override, an ESCAPE HATCH only, for a view with no codegen ViewConfig
// (an old-arch lib), or to patch a derived one. The common path needs none of this:
// a view's config is derived from the injected source automatically.
export interface IComponentRegistration {
  events?: readonly INativeEventBinding[];
  processors?: Readonly<Record<string, IPropProcessor>>;
}

// The slice of RN's ViewConfig we read. Structural and minimal: we never import
// react-native here, the adapter hands us whatever ReactNativeViewConfigRegistry
// returns and we touch only these fields.
interface IPhasedRegistrationNames {
  bubbled?: string;
}
interface IBubblingEventType {
  phasedRegistrationNames?: IPhasedRegistrationNames;
}
interface IDirectEventType {
  registrationName?: string;
}
export interface INativeViewConfig {
  bubblingEventTypes?: Record<string, IBubblingEventType | null | undefined>;
  directEventTypes?: Record<string, IDirectEventType | null | undefined>;
  validAttributes?: Record<string, unknown>;
}
export type INativeViewConfigSource = (
  name: string,
) => INativeViewConfig | undefined;

interface IResolved {
  listeners: Set<string>;
  byRaw: Map<string, INativeEventBinding>;
  processors: Map<string, IPropProcessor>;
}

const EMPTY: IResolved = {
  listeners: new Set(),
  byRaw: new Map(),
  processors: new Map(),
};

// Our own primitives — see the module header for why the source is never consulted for these.
const BUILTIN_COMPONENTS = new Set([
  'RCTView',
  'RCTText',
  'RCTRawText',
  'RCTVirtualText',
  'RCTImageView',
  'RCTScrollView',
  'RCTScrollContentView',
  'RCTSinglelineTextInputView',
  'RCTMultilineTextInputView',
  'Switch',
  'ActivityIndicatorView',
  'SafeAreaView',
  'ModalHostView',
  'PullToRefreshView',
  'RCTInputAccessoryView',
]) satisfies ReadonlySet<string>;

// Manual overrides per component (usually none): the escape hatch.
const overrides = new Map<string, IComponentRegistration[]>();
const resolvedCache = new Map<string, IResolved>();
// `configPayloadFold`'s answer, boxed so a component with no processors caches its `undefined`
// instead of re-resolving on every `createElement`.
const foldCache = new Map<string, { fold: IPayloadFold | undefined }>();
// Same boxing, for the key set `configProcessedKeys` answers.
const keysCache = new Map<string, { keys: ReadonlySet<string> | undefined }>();

let viewConfigSource: INativeViewConfigSource | undefined;

// Wired once by the adapter on a real host: `name => ReactNativeViewConfigRegistry.get(name)`.
export function setNativeViewConfigSource(
  source: INativeViewConfigSource,
): void {
  viewConfigSource = source;
  resolvedCache.clear();
  foldCache.clear();
}

// Escape hatch: override a derived config, or supply one for a view with no codegen
// ViewConfig. NOT needed on the common path; views derive from the source.
export function registerComponent(
  name: string,
  registration: IComponentRegistration = {},
): void {
  const list = overrides.get(name);
  if (list === undefined) overrides.set(name, [registration]);
  else list.push(registration);
  resolvedCache.delete(name);
  foldCache.delete(name);
}

// onChange -> change (mirrors node.ts listenerName; the split of the handler prop).
function splitListener(handlerProp: string): string {
  return handlerProp.charAt(2).toLowerCase() + handlerProp.slice(3);
}

function addEvent(into: IResolved, binding: INativeEventBinding): void {
  into.listeners.add(binding.listener);
  into.byRaw.set(binding.raw, binding);
}

function deriveFromConfig(config: INativeViewConfig, into: IResolved): void {
  const { bubblingEventTypes, directEventTypes, validAttributes } = config;
  if (bubblingEventTypes) {
    for (const raw in bubblingEventTypes) {
      const bubbled = bubblingEventTypes[raw]?.phasedRegistrationNames?.bubbled;
      if (typeof bubbled === 'string')
        addEvent(into, { raw, listener: splitListener(bubbled) });
    }
  }
  if (directEventTypes) {
    for (const raw in directEventTypes) {
      const registrationName = directEventTypes[raw]?.registrationName;
      if (typeof registrationName === 'string') {
        addEvent(into, {
          raw,
          listener: splitListener(registrationName),
          direct: true,
        });
      }
    }
  }
  if (validAttributes) {
    for (const key in validAttributes) {
      const attribute = validAttributes[key];
      if (isRecord(attribute)) {
        const process = attribute.process;
        // The codegen config already carries the right processor (processColor, ...);
        // wrap it so the typed Function becomes a PropProcessor without a cast.
        if (typeof process === 'function')
          into.processors.set(key, value => process(value));
      }
    }
  }
}

function applyRegistration(
  registration: IComponentRegistration,
  into: IResolved,
): void {
  if (registration.events)
    for (const binding of registration.events) addEvent(into, binding);
  if (registration.processors) {
    for (const key of Object.keys(registration.processors)) {
      into.processors.set(key, registration.processors[key]);
    }
  }
}

// Resolve a component's metadata. OUR built-ins short-circuit to EMPTY so the
// source is never read for them (their hand-tuned tables stand). Everything else
// derives from the injected source, then any manual override wins on top.
function resolve(name: string): IResolved {
  if (BUILTIN_COMPONENTS.has(name)) return EMPTY;
  let resolved = resolvedCache.get(name);
  if (resolved !== undefined) return resolved;
  resolved = { listeners: new Set(), byRaw: new Map(), processors: new Map() };
  const config = viewConfigSource?.(name);
  if (config) deriveFromConfig(config, resolved);
  const registrations = overrides.get(name);
  if (registrations)
    for (const registration of registrations)
      applyRegistration(registration, resolved);
  resolvedCache.set(name, resolved);
  return resolved;
}

// True when `listener` is an event the (third-party) component emits.
export function isRegisteredEvent(
  component: string,
  listener: string,
): boolean {
  return resolve(component).listeners.has(listener);
}

// The binding for a raw Fabric event on this component, for incoming dispatch.
export function registeredNativeEvent(
  component: string,
  raw: string,
): INativeEventBinding | undefined {
  return resolve(component).byRaw.get(raw);
}

// The processor for a prop of this component (e.g. processColor for a tint), or
// undefined to leave the value untouched.
export function registeredProcessor(
  component: string,
  key: string,
): IPropProcessor | undefined {
  return resolve(component).processors.get(key);
}

// A component's ViewConfig processors, as a payload fold — or undefined when it has none. Not a
// lookup at payload-build time: the payload is built in C++ on a device and this registry can't
// cross that boundary (it's populated lazily from an injected JS-closure-holding lookup).

// payloadFold is the one seam that already runs in JS on both paths, so putting the processors
// there is what makes a third-party view behave the same on device as in a test. The alternative,
// a list of prop names hardcoded in C++, needs editing native code for every new component we see.

// Resolved once per component and cached, since createElement asks per node. A built-in
// short-circuits inside resolve before any of this.

// The prop names a component's own ViewConfig claims a processor for — exactly the keys
// configPayloadFold has already converted by the time the payload builder's own passes run.

// Exists so "a colour is converted exactly once" is a stated rule, not a lucky one: an overlap
// between a third-party config and the engine's own COLOR_PROPS would otherwise double-convert.
export function configProcessedKeys(
  component: string,
): ReadonlySet<string> | undefined {
  const cached = keysCache.get(component);
  if (cached !== undefined) return cached.keys;
  const { processors } = resolve(component);
  const keys = processors.size === 0 ? undefined : new Set(processors.keys());
  keysCache.set(component, { keys });
  return keys;
}

export function configPayloadFold(component: string): IPayloadFold | undefined {
  const cached = foldCache.get(component);
  if (cached !== undefined) return cached.fold;
  const { processors } = resolve(component);
  const fold: IPayloadFold | undefined =
    processors.size === 0
      ? undefined
      : props => {
          // Copied only when a processor actually claims a key present in the bag: the fold
          // contract forbids mutating `node.props`, and a component whose config declares
          // processors for props this node never sets must still hand its input back by identity.
          let out: Record<string, unknown> | undefined;
          for (const [key, process] of processors) {
            if (!(key in props)) continue;
            const claimed = out ?? { ...props };
            claimed[key] = process(props[key]);
            out = claimed;
          }
          return out ?? props;
        };
  foldCache.set(component, { fold });
  return fold;
}
