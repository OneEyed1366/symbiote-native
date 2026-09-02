// The RUNTIME half of `HOST_PRIMITIVES.intrinsicWhen` — choosing WHICH native view a primitive
// commits, from the props it was created with.
//
// Why this has to exist at runtime at all. `intrinsicWhen` lets one primitive map to two native
// views (`TextInput` -> `RCTSinglelineTextInputView` / `RCTMultilineTextInputView`), and until now
// only the lowering transforms read it — so the choice was made at COMPILE time, from the source
// text. That is why `dynamicIntrinsicChoice` had to be a refusal category: a transform seeing
// `multiline={isLong}` cannot know the value, so it refused to lower the element at all.
//
// A public primitive TAG has no transform in front of it on three of the five adapters, so the
// choice has to be made where the value is actually known — here, at element creation. That is a
// capability the compiler never had, and it is why the refusal category disappears WITH the
// transform rather than migrating into it.
//
// WHAT THIS DELIBERATELY DOES NOT DO: react to the prop CHANGING later. A node's native view is
// fixed at `createNode` and no prop write moves a node between view types, so flipping `multiline`
// on a mounted input needs the node re-created — exactly as a browser re-initialises on an
// `<input type>` change. Re-creation is the renderer's business, not this function's; until a
// renderer implements it, a runtime flip keeps the view it was created with.
import { HOST_PRIMITIVES, type IHostPrimitive } from '../host-primitives.cjs';

// Keyed by the BASE intrinsic only. A tag that is already the alternative (`symbiote-text-input-
// multiline`) must resolve to itself: it arrives that way from a transform that already made the
// choice, and re-resolving it against a `multiline` prop it may not carry would send it back to the
// single-line view.
interface IChoice {
  readonly prop: string;
  readonly alternate: string;
}

const CHOICE_BY_BASE_TAG: ReadonlyMap<string, IChoice> = new Map(
  Object.values(HOST_PRIMITIVES).flatMap(
    (primitive: IHostPrimitive): Array<[string, IChoice]> =>
      primitive.intrinsicWhen === undefined
        ? []
        : [
            [
              primitive.intrinsic,
              {
                prop: primitive.intrinsicWhen.prop,
                alternate: primitive.intrinsicWhen.intrinsic,
              },
            ],
          ],
  ),
);

/**
 * Resolve a primitive tag to the intrinsic it should actually commit, given its creation props.
 *
 * A tag with no `intrinsicWhen` — every primitive but `TextInput` today — passes through by
 * identity, so a renderer may call this unconditionally without paying a lookup per prop.
 */
export function resolveIntrinsicTag(
  tag: string,
  props: Readonly<Record<string, unknown>> | undefined,
): string {
  const choice = CHOICE_BY_BASE_TAG.get(tag);
  if (choice === undefined || props === undefined) return tag;
  // Explicit rather than truthy, and the string form is not decoration: a template-driven adapter
  // can deliver `multiline="true"` as an ATTRIBUTE STRING (Angular's `multiline="true"` vs
  // `[multiline]="true"`), and plain truthiness would then read `multiline="false"` — also a
  // non-empty string — as multiline. An absent prop keeps the base tag.
  return props[choice.prop] === true || props[choice.prop] === 'true'
    ? choice.alternate
    : tag;
}
