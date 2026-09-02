// Compile-time lowering of <View>/<Text> to the intrinsic tags the renderer maps to Fabric.
//
// WHY. Solid charges a props PROXY per component: `<View>` compiles to `createComponent(View, …)`,
// and the component body then runs splitProps + withStableKeys + mergeProps + spread. Measured
// 2026-08-23 on a 4 000-row create: keys/get/getOwnPropertyDescriptor traps 16.2% of the whole
// create, splitProps another 6.1%. Lowered, the same element compiles to `createElement(tag)` plus
// one `setProp` per attribute — no Proxy, no bag object, no spread render effect. Headless A/B with
// both arms compiled for real and createNode asserted equal at 36 002: -24.3% min / -30.0% median.
//
// The Vue twin is the nodeTransform in adapters/vue/metro-vue-transformer.cjs, and the two share
// their central rule: lower ONLY a tag this file imported from us, never a bare name match, or an
// app's own <View> gets rewritten.
//
// THE SECOND RULE IS THE ONE THAT KEEPS IT HONEST: lower only when the WHOLE attribute set is
// visible. The wrapper components do real work besides forwarding — resolveAccessibilityProps
// folds aria-*/role into the composite accessibilityState/accessibilityValue, and `id` is RN's
// W3C alias for `nativeID`. Deleting the wrapper without carrying those over breaks accessibility
// silently. `id` is a pure rename and is done below FROM THE SHARED SPEC; the aria fold is a BAG
// operation, so an
// element carrying aria-*/role — or a spread whose keys cannot be read — is left as a component.
// A folded-at-compile-time aria bag is a possible follow-up (the bag exists statically, so it
// would cost nothing at runtime); refusing is what makes shipping this safe without it.
//
// .cjs because Babel require()s it and this package is "type": "module".

// The tag map and the per-tag folds come from the SHARED spec, not from a copy here. Four
// transforms carried their own before it existed and they had already disagreed on `id` (see that
// file's `aliases` comment). Data only — every line of AST work below stays this adapter's, and so
// does the whole refusal mechanism; only the SPECIFICATION is shared.
const {
  HOST_PRIMITIVES,
  REFUSAL_CATEGORIES,
} = require('@symbiote-native/components/host-primitives');

const SOURCE = '@symbiote-native/solid';

// name -> a projection of the shared spec. Built once at plugin load, so the per-element path stays
// two Map lookups.
//
// This is a WHITELIST, and it fails silently in one direction: a field the shared spec grows and
// this list does not copy simply never reaches the detections, which then behave as if it were
// absent. Cost measured 2026-08-31 — `intrinsicWhen` was implemented end to end and every
// multiline case still lowered to the single-line tag, because the field was dropped here. Add a
// field to the spec, add it here.
const LOWERABLE = new Map(
  Object.entries(HOST_PRIMITIVES).map(([name, spec]) => [
    name,
    {
      intrinsic: spec.intrinsic,
      aliases: new Map(Object.entries(spec.aliases)),
      // Every primitive refuses on the bag fold and on anything unreadable. A primitive whose
      // STATE the template can observe refuses on more, and only the spec knows which those are —
      // `observesState` is set for a tag the shared spec marks that way, so a transform that has
      // not implemented the extra detections simply never sees such a tag in its map.
      observesState: spec.observesState === true,
      // The two-intrinsic selector (`{ prop, intrinsic }`), absent for a primitive with one tag.
      intrinsicWhen: spec.intrinsicWhen,
    },
  ]),
);

function attributeName(attribute) {
  const { name } = attribute;
  if (name.type === 'JSXIdentifier') return name.name;
  // JSXNamespacedName — `aria-label` parses as an identifier, but `xml:lang` style names land here.
  return `${name.namespace.name}:${name.name.name}`;
}

// Every local name bound to a lowerable export of @symbiote-native/solid in THIS file, honouring
// `import { View as Box }`. A file that imports nothing from us yields an empty map and is skipped
// whole.
function lowerableLocalNames(programPath) {
  const names = new Map();
  programPath.node.body.forEach(statement => {
    if (
      statement.type !== 'ImportDeclaration' ||
      statement.source.value !== SOURCE
    )
      return;
    statement.specifiers.forEach(specifier => {
      if (specifier.type !== 'ImportSpecifier') return;
      const imported =
        specifier.imported.type === 'Identifier'
          ? specifier.imported.name
          : specifier.imported.value;
      const spec = LOWERABLE.get(imported);
      if (spec !== undefined) names.set(specifier.local.name, spec);
    });
  });
  return names;
}

// REFUSAL_CATEGORIES.renderPropChild — a child function that TAKES the state.
//
// ARITY, not `typeof`, and that distinction is the whole rule. A zero-argument arrow is an ordinary
// Solid child (`JSX.Element` covers `() => Element`), exactly as `<For>`'s map fn is; only a
// function that accepts the state argument is a render prop. Measured over `examples/solid`: 12 of
// the 19 `<Pressable>` sites pass a function child and TEN of those are zero-arity, so refusing on
// `typeof` alone would throw away ten lowerable sites — including `ActionButton`, whose one
// definition is instantiated 146 times.
function isRenderPropChild(child) {
  if (child.type !== 'JSXExpressionContainer') return false;
  const { expression } = child;
  return (
    (expression.type === 'ArrowFunctionExpression' ||
      expression.type === 'FunctionExpression') &&
    expression.params.length >= 1
  );
}

// A JSX element is lowerable only if every attribute is a plain, named one we can account for —
// plus, for a state-observing primitive, only if nothing in it reads that state.
function canLower(element, spec, types) {
  const { openingElement } = element;
  // Named attributes only — a spread cannot be enumerated
  // (REFUSAL_CATEGORIES.unreadableAttributeSet).
  //
  // The category's STATED reason — that a transform cannot fold `id` -> `nativeID` inside a bag — is
  // DEAD here, measured 2026-08-31: this adapter also folds at runtime (`renderer.ts`,
  // `foldAliasKey`), which sees every key whatever shape it arrived in, and a lowered
  // `<symbiote-view {...bag} />` commits a payload byte-identical to the wrapper's
  // (`src/spread-fold-parity.test.tsx`). The refusal stands on two OTHER grounds it never named,
  // both measured by lifting it and compiling:
  //
  //   <TextInput {...bag} />   ->  symbiote-text-input, whatever `bag.multiline` holds. The
  //                                single-line tag is a different NATIVE VIEW and no later prop
  //                                write repairs it (REFUSAL_CATEGORIES.dynamicIntrinsicChoice).
  //   <Pressable {...bag} />   ->  no `activeStyle` emitted. The same functional style written
  //                                directly emits it; inside a bag the expansion never runs, so a
  //                                pressed style silently stops existing.
  //
  // So: a refuted rationale is not a refuted verdict. Do not lift this because the alias half is
  // covered — check what ELSE reads the attribute list first.
  //
  // `role` / `aria-*` used to refuse here too, on the
  // grounds that their fold needs to see sibling keys and a per-key element path cannot reproduce
  // it. That was true of the ELEMENT path and is no longer true of anything: the fold moved into
  // the engine (`core/engine/src/accessibility-props.ts`, called from `fabricProps` — the one place
  // the whole bag is visible on both commit paths), so a lowered element gets it exactly as a
  // wrapped one does. Proven on the committed payload, both arms, in `src/aria-fold-parity.test.tsx`.
  const attributesAreReadable = openingElement.attributes.every(
    attribute => attribute.type === 'JSXAttribute',
  );
  if (!attributesAreReadable) return false;
  if (!selectsIntrinsicStatically(openingElement, spec)) return false;
  // BEFORE the `observesState` early-return, not after. It rode below it while the only ref-refusing
  // primitive was Pressable, which observes state — a coincidence, and TextInput broke it: it
  // observes nothing, so the early-return fired first and a `<TextInput ref>` lowered anyway. The
  // two questions are independent, so the checks are ordered by what they ask, not by what happened
  // to work.
  if (refWouldChangeSurface(spec) && openingElement.attributes.some(isInstanceBinding))
    return false;
  // Everything below is about a primitive whose STATE the template can observe.
  if (!spec.observesState) return true;
  // A functional `style` NEVER refuses, and since 2026-09-01 it is not rewritten either: the
  // expression rides through unchanged and `routeProp` resolves it at both values of `pressed`
  // (`isStyleCallback`, `core/engine/src/node.ts`). The build-time split that used to live here was
  // removed after measuring it — `src/state-style-cost.bench.test.ts` — because it emitted TWO
  // writes per node where the callback emits one, so it cost run time rather than saving it.
  return !element.children.some(isRenderPropChild);
}

// REFUSAL_CATEGORIES.dynamicIntrinsicChoice.
//
// A primitive whose `intrinsicWhen` is set picks between TWO Fabric views by a prop —
// `symbiote-text-input` vs `symbiote-text-input-multiline`, which are different native views rather
// than one view with a flag (`core/components/src/view/render-text-input.ts`). The transform prints
// a STATIC tag name, so it can only make that choice when the value is a compile-time literal.
//
// The refusal is stricter than the neighbouring ones and the difference is worth keeping in view:
// an unreadable ATTRIBUTE VALUE means a prop arrives wrong, and a later write can still correct it.
// Here the wrong NATIVE VIEW is committed, and no subsequent prop write repairs that — the node
// would have to be destroyed and recreated. So a value this cannot read statically keeps the
// component, which resolves the choice at runtime where the value is known.
//
// IDENTITY, not truthiness. The render fn is `view.multiline ? MULTILINE : SINGLE`, so truthiness
// is what the RUNTIME does, and describing the compile-time check that way makes `multiline={1}`
// look like something this should resolve. It must not: only three shapes are accepted — a bare
// attribute is `true`, a boolean LITERAL is itself, an absent prop is `false` — and everything else
// refuses, a truthy non-boolean literal included. A check justified by truthiness would let `{1}`
// through at the next edit, which is exactly the silently-wrong native view the refusal exists to
// prevent. Recorded as identity in the shared spec for the same reason.
function staticTruthOf(openingElement, propName) {
  const attribute = openingElement.attributes.find(
    candidate =>
      candidate.type === 'JSXAttribute' &&
      attributeName(candidate) === propName,
  );
  if (attribute === undefined) return false;
  if (attribute.value === null) return true;
  if (attribute.value.type !== 'JSXExpressionContainer') return undefined;
  const { expression } = attribute.value;
  return expression.type === 'BooleanLiteral' ? expression.value : undefined;
}

function selectsIntrinsicStatically(openingElement, spec) {
  return (
    spec.intrinsicWhen === undefined ||
    staticTruthOf(openingElement, spec.intrinsicWhen.prop) !== undefined
  );
}

function intrinsicFor(openingElement, spec) {
  if (spec.intrinsicWhen === undefined) return spec.intrinsic;
  return staticTruthOf(openingElement, spec.intrinsicWhen.prop) === true
    ? spec.intrinsicWhen.intrinsic
    : spec.intrinsic;
}

// REFUSAL_CATEGORIES.instanceBoundDirective. The criterion is NOT "does the component expose a
// ref" — that was a proxy, and it held only while two primitives existed. The rule is: would
// lowering hand the app something DIFFERENT from what the component hands it? A lowering transform
// is an optimisation, and an optimisation that moves the observable surface in EITHER direction is
// a bug. Three shapes, one rule, all readable from the components' own props types:
//
//   View, Text   ref?: Ref<IHostInstance>      lowered yields the same node    -> lower
//   Pressable    no ref declared               lowering would ADD a handle     -> refuse
//   TextInput    ref?: Ref<ITextInputHandle>   lowering would SWAP the handle  -> refuse
//
// TextInput is the case that exposed the proxy: it declares a ref, so the old criterion said
// "lower", and a lowered `<TextInput ref>` silently dropped `clear`, `isFocused` and
// `setSelection` — the component's handle replaced by a bare public instance. Costing an app three
// methods is exactly as wrong as granting it one it never had.
//
// PER-ADAPTER by construction, which is why this is a list here and not a field on the shared
// spec: what a ref yields is a fact about THIS adapter's props types, and a correct adapter can
// answer differently — Vue refuses on every primitive, because a Vue template ref yields the
// component instance rather than the host node whatever the component declares.
//
// Kept honest by `ref-refusal-matches-components.test.ts`, which re-derives the answer from each
// component source: a hand-written list of adapter members is what went stale three times this
// month.
// INVERTED 2026-09-01, and the inversion is the point rather than the contents. This was a
// denylist of intrinsics that refuse a `ref`, so every primitive added to the spec defaulted to
// LOWERING one — and the newest member falls out of a hand-written list every time, which is the
// failure mode this repo has now recorded four times. As a denylist that default is a correctness
// bug (a lowered element hands back an object the component never did); as an allowlist the same
// omission costs only coverage, which is the direction a default should fail in.
//
// A name earns its place here by the criterion in `ref-refusal-matches-components.test.ts`: the
// component hands a `ref` the ENGINE NODE, either by declaring `ref?: Ref<IHostInstance>` or by
// rendering through `descriptorToSolid`, whose `spread` calls a bag ref with the node it built. Any
// other answer — a different handle, or no ref at all — means lowering would move the surface.
const INTRINSICS_YIELDING_HOST_REF = new Set([
  'symbiote-view',
  'symbiote-text',
  'symbiote-image',
]);


function refWouldChangeSurface(spec) {
  return !INTRINSICS_YIELDING_HOST_REF.has(spec.intrinsic);
}

function isInstanceBinding(attribute) {
  return (
    attribute.type === 'JSXAttribute' && attributeName(attribute) === 'ref'
  );
}

// Per TAG, not global: the spec gives each primitive its own alias map, and reading it per tag is
// what keeps this honest if they ever stop agreeing.
function renameAliasedAttributes(openingElement, aliases, types) {
  openingElement.attributes.forEach(attribute => {
    // A spread has no name, and the author's own spread refuses in `canLower`, so nothing this
    // loop sees is one. It used to be reachable: the state-style pass emitted a spread for an
    // opaque style, and that pass is gone.
    if (attribute.type !== 'JSXAttribute') return;
    const renamed = aliases.get(attributeName(attribute));
    if (renamed !== undefined) attribute.name = types.jsxIdentifier(renamed);
  });
}

module.exports = function lowerHostPrimitives({ types }) {
  return {
    name: 'symbiote-solid-lower-host-primitives',
    visitor: {
      Program(programPath) {
        const names = lowerableLocalNames(programPath);
        if (names.size === 0) return;
        programPath.traverse({
          JSXElement(elementPath) {
            const { openingElement, closingElement } = elementPath.node;
            const tag = openingElement.name;
            if (tag.type !== 'JSXIdentifier') return;
            const spec = names.get(tag.name);
            if (spec === undefined) return;
            // A shadowing local binding (a parameter or a `const View = …` in scope) is NOT our
            // import, even though the name matches. Only rewrite when the binding at this use site
            // is still the module-level import.
            const binding = elementPath.scope.getBinding(tag.name);
            if (binding === undefined || binding.kind !== 'module') return;
            if (!canLower(elementPath.node, spec, types)) return;
            // Read BEFORE the passes below rewrite attributes — `renameAliasedAttributes` could
            // in principle rename the selector out from under the choice.
            const intrinsic = intrinsicFor(openingElement, spec);
            renameAliasedAttributes(openingElement, spec.aliases, types);
            openingElement.name = types.jsxIdentifier(intrinsic);
            if (closingElement)
              closingElement.name = types.jsxIdentifier(intrinsic);
          },
        });
      },
    },
  };
};

// Attached AFTER the plugin assignment on purpose: `module.exports = fn` replaces the object, so a
// named export written above it is silently discarded. Exists only so the test below can compare
// this list against the component sources.
module.exports.INTRINSICS_YIELDING_HOST_REF = INTRINSICS_YIELDING_HOST_REF;

// The spec fields this transform reads, named so `spec-projection-covers-fields.test.ts` can check
// the whitelist above against what `HOST_PRIMITIVES` actually carries. `defaults` is deliberately
// absent: prop defaults are seeded at RUNTIME by the renderer (`seedTextDefaults`), where a patch
// that clears a prop can restore them — a compile-time copy would cover only the initial render.
module.exports.SPEC_FIELDS_READ = [
  'intrinsic',
  'aliases',
  'observesState',
  'intrinsicWhen',
];
module.exports.SPEC_FIELDS_IGNORED = ['defaults'];
