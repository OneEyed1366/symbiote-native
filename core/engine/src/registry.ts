// Runtime metadata for native Fabric views, DERIVED BY DEFAULT. Any RN library
// already ships its own ViewConfig: codegen registers it into RN's
// ReactNativeViewConfigRegistry the moment the library's native-component module is
// imported. That config carries everything the shared engine can't infer: which
// events the view emits (bubblingEventTypes / directEventTypes) and how to process
// its props (validAttributes[*].process, e.g. processColor). So we DON'T transcribe
// any of it, and we don't mark anything "third-party": there is no
// per-package registration to maintain. The engine reads the config for ANY
// component on first use. Install a community view library, render it, done.
//
// shared must stay react-native-free (the headless harness runs in plain Node), so
// the ViewConfig lookup is INJECTED, exactly like the color processor: the adapter
// wires `setNativeViewConfigSource(ReactNativeViewConfigRegistry.get)` on a real
// host, where that one source covers BOTH RN core and every library.
//
// The ONLY explicit list is OUR OWN built-in primitives (BUILTIN_COMPONENTS): a
// finite set we own, which keep their hand-tuned tables (view-config events, commit
// COLOR_PROPS) and are never read from the source, so they can't drift. Everything
// NOT in that set derives. The list never grows with the community; it grows only
// when we add a core primitive of our own.

import { isRecord } from './type-guards';
// Type-only, so this does not close an import cycle at runtime: `host-behavior` owns the fold
// contract and reaches this module for nothing.
import type { IPayloadFold } from './host-behavior';

export type IPropProcessor = (value: unknown) => unknown;

// A native event the component emits. `raw` is the Fabric topLevelType
// (`topRNCSliderSlidingComplete`); `listener` is the name our nodes register the
// handler under, from the `onX`-prop split (`onRNCSliderSlidingComplete` ->
// `rNCSliderSlidingComplete`). `direct: true` marks a non-bubbling event.
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

// OUR own primitives: the finite set shared hand-tunes (view-config events,
// commit COLOR_PROPS). The source is never consulted for these, so they can't
// drift. Everything else derives. This list grows only when WE add a core
// primitive, never for a community package.
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

/**
 * A component's ViewConfig processors, as a payload fold — or undefined when it has none.
 *
 * WHY A FOLD AND NOT A LOOKUP AT PAYLOAD-BUILD TIME. The payload is built in C++ on a device
 * (`core/engine/cpp/SymbioteFabricProps.cpp`) and only in JS headless, and this registry cannot
 * cross that boundary: it is populated lazily from an INJECTED `ReactNativeViewConfigRegistry`
 * lookup, holding JS closures. `payloadFold` is the one seam that already runs in JS on both paths
 * — the C++ probes it once per node and calls back — so putting the processors there is what makes
 * a third-party view behave the same on a device as it does in a test.
 *
 * The alternative was a list of prop NAMES in C++, and that is what this replaces. It cost a day:
 * `@symbiote-native/slider` declares `minimumTrackTintColor` / `maximumTrackTintColor` in its own
 * ViewConfig, neither name was in the C++ list, both reached Fabric as CSS strings, and iOS answers
 * a string colour with `clearColor()`. The slider dragged and reported values correctly with no
 * track drawn at all. Any list of names is a list somebody has to extend for a component we have
 * never seen — which would have meant editing C++ to add a native view, and that is exactly the
 * coupling `<native_core_is_untouched>` exists to prevent.
 *
 * Resolved ONCE per component and cached, because `createElement` asks per node. A built-in
 * short-circuits inside `resolve` before any of this.
 */
/**
 * The prop names a component's OWN ViewConfig claims a processor for — i.e. exactly the keys
 * `configPayloadFold` has already converted by the time the payload builder's own passes run.
 *
 * It exists so "a colour is converted exactly once" can be a stated rule rather than a lucky one.
 * The overlap is real: `thumbTintColor` is claimed by @symbiote-native/slider's config AND by the
 * engine's built-in COLOR_PROPS, and for a while nothing broke only because a processed colour came
 * back as a NUMBER and the engine skipped numbers. That guard died when a numeric colour became
 * processable in its own right — an author writing `color: 0xff0000ff` means rrggbbaa and owes the
 * same rotation a string owes — and the second conversion then turned an already-correct int into
 * a different colour.
 */
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
