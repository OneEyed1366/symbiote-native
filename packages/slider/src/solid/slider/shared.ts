// Slider, the Solid lifecycle half. The logic (value/limit/disabled folds, the step-option layout)
// and the native render live in @symbiote-native/slider core, shared verbatim with React, Vue,
// Svelte and Angular; Solid supplies only the reactivity — a signal for the value native last
// reported (to mark the active step), a signal for the measured width — plus the descriptor bridge.
// The native RNCSlider carries no symbiote metadata: the engine derives its events and color/image
// processors from the library's ViewConfig, registered by ../register (the package barrel pulls it,
// NOT this module, so the tests stay free of the third-party spec). Like every other adapter here,
// this NEVER imports the library's React Slider component — it calls hooks off the React dispatcher
// and would crash under a non-React adapter.
//
// NOTHING here destructures `props`. Solid props are getters and a component body runs ONCE, so a
// destructure would freeze the slider at its mount-time values; every read sits inside an accessor.
//
// WHY THE TREE IS ASSEMBLED BY HAND INSTEAD OF THROUGH renderSlider(). Solid has no reconciler
// between what this file returns and the host nodes, so a tree whose SHAPE changes has to be
// rebuilt, and rebuilding the native slider would throw away the node identity its own thumb grip
// and every imperative command key on. renderSlider's Descriptor carries the step overlay as a
// child, i.e. its child count flips with `renderStepNumber` — which descriptorToSolid refuses
// (.claude/rules/solid-descriptor-bridge.md §2). So the wrapper is built once here, the native leaf
// is bridged once via renderSliderNative (the split core exposes for exactly this: React takes it
// too on its custom-marker path), and only the OVERLAY sits behind a rebuild boundary. The result
// is a stable native node across every overlay change — where React remounts it, since the wrapper's
// unkeyed children shift by one.
//
// The hand-written createElement / spread / insert calls below are what compiled JSX emits; this
// package cannot use JSX at all, because its tsconfig is shared with the React/Vue/Angular entries
// and TypeScript has one `jsx` setting per program. descriptor-to-solid.ts drives the renderer the
// same way for the same reason.

// createComponent comes from solid-js, not the renderer's re-export: the renderer's is typed to
// return its own host-node union, which cannot hold what a component returns (an Image is
// JSX.Element). Same function either way.
import {
  createComponent,
  createEffect,
  createMemo,
  createSignal,
  untrack,
} from 'solid-js';
import type { Accessor, Ref } from 'solid-js';
import {
  descriptorToSolid,
  Image,
  type IHostInstance,
} from '@symbiote-native/solid';
import {
  createElement,
  createTextNode,
  insert,
  insertNode,
  setProp,
  spread,
} from '@symbiote-native/solid/renderer';
import type { JSX } from '@symbiote-native/solid/jsx-runtime';
import { resolveAccessibilityProps } from '@symbiote-native/components';
import type { IImageSourceProp } from '@symbiote-native/components';
import {
  dlog,
  isSymbioteNode,
  type IClassNameValue,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import {
  sanitizeSliderValue,
  resolveSliderDisabled,
  resolveSliderAccessibilityState,
  resolveSliderLowerLimit,
  resolveSliderUpperLimit,
  valueFromSliderEvent,
  shouldRenderStepsIndicator,
  resolveThumbTintColor,
  shouldPassNativeThumbImage,
  isInvalidLimitConfig,
  computeStepOptions,
  orderStepOptions,
  stepNumberFontSize,
  renderSliderNative,
  resolveSliderWrapperStyle,
  resolveStepsContainerStyle,
  renderStepsIndicator,
  STEP_INDICATOR_ELEMENT_STYLE,
  TRACK_MARK_CONTAINER_STYLE,
  THUMB_IMAGE_CONTAINER_STYLE,
  THUMB_IMAGE_STYLE,
  STEP_NUMBER_CONTAINER_STYLE,
  SLIDER_DEFAULT_MINIMUM_VALUE,
  SLIDER_DEFAULT_MAXIMUM_VALUE,
  SLIDER_DEFAULT_STEP,
  SLIDER_ON_CHANGE,
  SLIDER_ON_VALUE_CHANGE,
  SLIDER_ON_SLIDING_START,
  SLIDER_ON_SLIDING_COMPLETE,
  SLIDER_ON_ACCESSIBILITY_ACTION,
  type ISliderPlatform,
  type ISliderProps as ISliderBaseProps,
  type ISliderViewProps,
  type IStepMarkerProps,
} from '../../core';

// The custom step marker, in Solid's own spelling: its props arrive as an ACCESSOR and the function
// is called ONCE per cell, untracked. React's is `FC<IStepMarkerProps>`, Vue's a `#stepMarker`
// scoped slot, Svelte's a `Snippet<[IStepMarkerProps]>` — each framework already spells this field
// its own way, which is what <prop_types_split_agnostic_vs_per_adapter> calls a per-adapter field.
//
// The accessor is NOT cosmetic. A snapshot would have to be read inside the `insert` render effect
// that owns the cell's children, putting the value signal in that effect's dependency set — so every
// value report would tear the marker subtree down and build a fresh one, mid-drag
// (.claude/rules/solid-descriptor-bridge.md §4). Only the leaf that reads `marker()` re-runs here.
export type ISliderStepMarker = (
  marker: Accessor<IStepMarkerProps>,
) => JSX.Element;

// Solid's flavored prop type: the agnostic base plus the two per-adapter fields. Declared here, not
// imported from another adapter — React's `StepMarker` returns a React element and Vue's is a slot,
// neither of which can cross an adapter boundary.
export type ISliderProps = ISliderBaseProps & {
  // Solid's idiom for a registered class name, matching View / Text / Switch (React's is
  // `className`). Targets the OUTER wrapper view like `style`, never the native leaf.
  class?: IClassNameValue;
  StepMarker?: ISliderStepMarker;
  // Reaches the native RNCSlider leaf, the same node React's forwardRef hands back.
  ref?: Ref<IHostInstance>;
};

// Read by the component itself; everything else (the track tints and images, thumbSize, tapToSeek,
// vertical, testID, the accessibility surface, a caller's `ref`) forwards onto the native leaf. The
// four JS callbacks MUST be stripped — a function prop reaching Fabric crashes Android's
// folly::dynamic serializer — and are re-supplied as the native event handlers in `passthrough`.
const HANDLED_PROPS = [
  'value',
  'minimumValue',
  'maximumValue',
  'step',
  'lowerLimit',
  'upperLimit',
  'disabled',
  'inverted',
  'thumbTintColor',
  'thumbImage',
  'accessibilityState',
  'renderStepNumber',
  'style',
  'class',
  'StepMarker',
  'onValueChange',
  'onSlidingStart',
  'onSlidingComplete',
  'onAccessibilityAction',
];

function forwardProps(resolved: ISliderProps): Record<string, unknown> {
  const forwarded: Record<string, unknown> = { ...resolved };
  for (const key of HANDLED_PROPS) delete forwarded[key];
  return forwarded;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Narrowing, not defensive: the renderer's createElement is typed over its IHostNode union (which
// includes the surface), while everything below needs a real host node. Same guard descriptorToSolid
// opens with.
function hostElement(tag: string): ISymbioteNode {
  const node = createElement(tag);
  if (!isSymbioteNode(node)) {
    throw new Error(`Slider: ${tag} did not create a host node`);
  }
  return node;
}

// Solid core's own render-prop shape, line for line with `<Show>`: untrack + accessor, with an arity
// guard because `typeof fn === 'function'` cannot separate a render prop from the bare zero-argument
// accessor JSX.Element also permits. A 0-arity marker is handed back unread so `insert` wraps it in
// its own render effect; calling it here would freeze it at its first value.
function callStepMarker(
  marker: ISliderStepMarker,
  props: Accessor<IStepMarkerProps>,
): JSX.Element {
  if (marker.length === 0) return () => marker(props);
  return untrack(() => marker(props));
}

export function createSlider(
  platform: ISliderPlatform,
): (props: ISliderProps) => JSX.Element {
  return function Slider(props: ISliderProps): JSX.Element {
    // What native last reported, kept only to mark the active step. NOT the controlled value — the
    // slider is uncontrolled during a drag, native owns the thumb and reports up.
    const [reportedValue, setReportedValue] = createSignal<number | undefined>(
      undefined,
    );
    // The measured wrapper width the step indicator lays out against; 0 until the first layout.
    const [width, setWidth] = createSignal(0);

    const handleValueChange = (event: ISymbioteEvent): void => {
      const next = valueFromSliderEvent(event);
      if (next === undefined) return;
      setReportedValue(next);
      props.onValueChange?.(next);
    };
    const handleSlidingStart = (event: ISymbioteEvent): void => {
      const next = valueFromSliderEvent(event);
      if (next !== undefined) props.onSlidingStart?.(next);
    };
    const handleSlidingComplete = (event: ISymbioteEvent): void => {
      const next = valueFromSliderEvent(event);
      if (next !== undefined) props.onSlidingComplete?.(next);
    };
    const handleAccessibilityAction = (event: ISymbioteEvent): void => {
      props.onAccessibilityAction?.(event);
    };
    const handleLayout = (event: ISymbioteEvent): void => {
      const layout = event.nativeEvent.layout;
      if (isRecord(layout) && typeof layout.width === 'number') {
        setWidth(layout.width);
      }
    };

    const minimumValue = (): number =>
      props.minimumValue ?? SLIDER_DEFAULT_MINIMUM_VALUE;
    const maximumValue = (): number =>
      props.maximumValue ?? SLIDER_DEFAULT_MAXIMUM_VALUE;
    const step = (): number => props.step ?? SLIDER_DEFAULT_STEP;
    const lowerLimit = (): number => resolveSliderLowerLimit(props.lowerLimit);
    const upperLimit = (): number => resolveSliderUpperLimit(props.upperLimit);

    createEffect(() => {
      if (isInvalidLimitConfig(lowerLimit(), upperLimit())) {
        dlog('Slider: lowerLimit must be smaller than upperLimit');
      }
    });

    const hasStepMarker = (): boolean => props.StepMarker !== undefined;
    const hasThumbImage = (): boolean => props.thumbImage !== undefined;
    const showSteps = (): boolean =>
      shouldRenderStepsIndicator(hasStepMarker(), props.renderStepNumber);

    const view = (): ISliderViewProps => {
      // Folded BEFORE the handled props are read, exactly as React folds rawProps before it
      // destructures: `aria-disabled` lands in accessibilityState, and reading the raw prop instead
      // would hand the fold below an undefined and blank the a11y state the alias just set.
      const resolved = resolveAccessibilityProps(props);
      return {
        value: sanitizeSliderValue(props.value),
        minimumValue: minimumValue(),
        maximumValue: maximumValue(),
        step: step(),
        lowerLimit: lowerLimit(),
        upperLimit: upperLimit(),
        disabled: resolveSliderDisabled(
          props.disabled,
          resolved.accessibilityState,
        ),
        inverted: props.inverted ?? false,
        thumbTintColor: resolveThumbTintColor(
          props.thumbTintColor,
          hasStepMarker(),
          hasThumbImage(),
        ),
        // Passed to native raw — the engine runs the image processor derived from RNCSlider's
        // ViewConfig — and only when no custom marker draws its own thumb (matches the library).
        thumbImage: shouldPassNativeThumbImage(hasStepMarker(), hasThumbImage())
          ? props.thumbImage
          : undefined,
        accessibilityState: resolveSliderAccessibilityState(
          props.disabled,
          resolved.accessibilityState,
        ),
        width: width(),
        style: props.style,
        passthrough: {
          ...forwardProps(resolved),
          [SLIDER_ON_CHANGE]: handleValueChange,
          [SLIDER_ON_VALUE_CHANGE]: handleValueChange,
          [SLIDER_ON_SLIDING_START]: handleSlidingStart,
          [SLIDER_ON_SLIDING_COMPLETE]: handleSlidingComplete,
          [SLIDER_ON_ACCESSIBILITY_ACTION]: handleAccessibilityAction,
        },
      };
    };

    const options = createMemo(() =>
      computeStepOptions(
        minimumValue(),
        maximumValue(),
        step(),
        platform.stepResolution,
      ),
    );
    const currentValue = createMemo(
      () =>
        reportedValue() ?? sanitizeSliderValue(props.value) ?? minimumValue(),
    );

    // THE REBUILD BOUNDARY (.claude/rules/solid-descriptor-bridge.md §5). Everything read TRACKED
    // here changes the overlay's SHAPE — which overlay kind, how many cells, whether each cell
    // carries a number — and the build itself is untracked so it does not also subscribe to every
    // value/width read inside it. Drop the untrack and one drag rebuilds the whole indicator.
    const overlay = createMemo(() => {
      if (!showSteps()) return null;
      const marker = props.StepMarker;
      const cells = options();
      const withNumbers = props.renderStepNumber === true;
      const inverted = props.inverted ?? false;
      const thumbImage = props.thumbImage;
      // Read for its dependency, not its value: the DEFAULT overlay hands the thumb image to
      // whichever cell matches the current value, so the cell's child count moves with that value —
      // a shape change descriptorToSolid refuses. With no thumb image the shape is fixed and the
      // bridge just re-props the same nodes.
      if (marker === undefined && thumbImage !== undefined) currentValue();
      return untrack(() =>
        marker === undefined
          ? descriptorToSolid(() =>
              renderStepsIndicator({
                options: cells,
                currentValue: currentValue(),
                width: width(),
                renderStepNumber: withNumbers,
                thumbImage,
                inverted,
                platform,
              }),
            )
          : buildCustomOverlay({
              cells,
              marker,
              withNumbers,
              inverted,
              currentValue,
              width,
              thumbImage: () => props.thumbImage,
              platform,
            }),
      );
    });

    // Built ONCE and kept by identity: descriptorToSolid wires every prop through a render effect on
    // this same node, so a value/tint/limit change re-commits the existing native slider instead of
    // replacing it — which would drop the thumb the user is dragging.
    const leaf = descriptorToSolid(() => renderSliderNative(view(), platform));

    const wrapper = hostElement('symbiote-view');
    // A statically-present key set (all three are always emitted), so this needs no withStableKeys
    // widening — `spread` alone has no removal pass for a key that vanishes.
    spread(
      wrapper,
      () => ({
        style: resolveSliderWrapperStyle(props.style, platform),
        class: props.class,
        onLayout: handleLayout,
      }),
      true,
    );
    insertNode(wrapper, leaf);
    // The overlay goes BEFORE the leaf, matching the z-order renderSlider composes; `leaf` is the
    // marker `insert` positions against, which is also what keeps it from clearing the wrapper.
    insert(wrapper, overlay, leaf);
    return wrapper;
  };
}

type ICustomOverlayParams = {
  cells: readonly number[];
  marker: ISliderStepMarker;
  withNumbers: boolean;
  inverted: boolean;
  currentValue: Accessor<number>;
  width: Accessor<number>;
  thumbImage: Accessor<IImageSourceProp | undefined>;
  platform: ISliderPlatform;
};

// The custom-marker overlay: the same flex row the agnostic default paints, but each mark hosts the
// caller's own marker element, mirroring the library's SliderTrackMark composition. Built by hand
// rather than as a Descriptor because a Descriptor holds only VALUES, and a marker is a live Solid
// subtree — the same boundary View and Pressable sit on.
function buildCustomOverlay(params: ICustomOverlayParams): ISymbioteNode {
  const fontSize = stepNumberFontSize(params.cells.length);
  const ordered = orderStepOptions(params.cells, params.inverted);
  const min = params.cells[0];
  const max = params.cells[params.cells.length - 1];

  const container = hostElement('symbiote-view');
  // pointerEvents none so the overlay never eats the drag. `style` tracks the measured width, hence
  // an accessor rather than a one-shot setProp.
  spread(
    container,
    () => ({
      pointerEvents: 'none',
      testID: 'StepsIndicator-Container',
      style: resolveStepsContainerStyle(params.width(), params.platform),
    }),
    true,
  );

  ordered.forEach((value, index) => {
    insertNode(
      container,
      buildStepCell({ value, index, min, max, fontSize, params }),
    );
  });
  return container;
}

type IStepCellParams = {
  value: number;
  index: number;
  min: number;
  max: number;
  fontSize: number;
  params: ICustomOverlayParams;
};

function buildStepCell(cell: IStepCellParams): ISymbioteNode {
  const { params } = cell;
  const element = hostElement('symbiote-view');
  setProp(element, 'style', STEP_INDICATOR_ELEMENT_STYLE);

  const track = hostElement('symbiote-view');
  setProp(track, 'style', TRACK_MARK_CONTAINER_STYLE);
  insertNode(element, track);

  // A memo, not a bare accessor: several leaves inside one marker must see the same object, and an
  // unchanged value must not hand out a fresh one.
  const markerProps = createMemo((): IStepMarkerProps => ({
    stepMarked: cell.value === params.currentValue(),
    currentValue: params.currentValue(),
    index: cell.index,
    min: cell.min,
    max: cell.max,
  }));
  const markerElement = callStepMarker(params.marker, markerProps);

  // One `insert` owns the track's children: the marker (stable identity, reconciled in place) and
  // the thumb image, which only the cell matching the current value carries.
  insert(track, () => [markerElement, buildThumbImage(cell)]);

  if (params.withNumbers) {
    const numberBox = hostElement('symbiote-view');
    setProp(numberBox, 'style', STEP_NUMBER_CONTAINER_STYLE);
    const label = hostElement('symbiote-text');
    setProp(label, 'testID', `${cell.index}th-step`);
    setProp(label, 'style', { fontSize: cell.fontSize });
    insertNode(label, createTextNode(String(cell.value)));
    insertNode(numberBox, label);
    insertNode(element, numberBox);
  }
  return element;
}

function buildThumbImage(cell: IStepCellParams): ISymbioteNode | null {
  const source = cell.params.thumbImage();
  if (source === undefined || cell.value !== cell.params.currentValue()) {
    return null;
  }
  const container = hostElement('symbiote-view');
  setProp(container, 'style', THUMB_IMAGE_CONTAINER_STYLE);
  setProp(container, 'testID', 'sliderTrackMark-thumbImage');
  // The Image COMPONENT, not a raw symbiote-image: it resolves an asset id through RN's own
  // resolveAssetSource, exactly as React's and Vue's custom overlays do.
  insert(
    container,
    createComponent(Image, { source, style: THUMB_IMAGE_STYLE }),
  );
  return container;
}
