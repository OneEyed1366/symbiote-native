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

// name -> { intrinsic, aliases }. Built once at plugin load, so the per-element path stays two Map
// lookups.
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
    },
  ]),
);

// REFUSAL_CATEGORIES.bagFold: an attribute whose fold needs to see its siblings.
// resolveAccessibilityProps folds role/aria-* into the COMPOSITE accessibilityState /
// accessibilityValue, which a per-key element path cannot reproduce. Refusing keeps today's
// behaviour; guessing would break accessibility silently, on device only.
function needsBagFold(name) {
  return name === 'role' || name.startsWith('aria-');
}

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

// REFUSAL_CATEGORIES.stateInTemplate — a `style` given as a FUNCTION. Its argument is the press
// state, so the template reads state the lowered tag resolves below the framework, and no amount of
// `:active` recovers it: closing this properly would mean splitting the returned object literal
// into state-dependent and state-independent keys and EMITTING CSS for the first half, i.e. a
// JS-to-CSS compiler in every transform. The real call sites migrate by hand instead — they already
// carry a class, so the pressed half moves into `.x:active` and `style` becomes a plain object.
function isFunctionStyle(attribute) {
  if (attributeName(attribute) !== 'style') return false;
  const value = attribute.value;
  if (value === null || value.type !== 'JSXExpressionContainer') return false;
  const { expression } = value;
  return (
    expression.type === 'ArrowFunctionExpression' ||
    expression.type === 'FunctionExpression'
  );
}

// REFUSAL_CATEGORIES.renderPropChild — a child function that TAKES the state.
//
// ARITY, not `typeof`, and that distinction is the whole rule. A zero-argument arrow is an ordinary
// Solid child (`JSX.Element` covers `() => Element`), exactly as `<For>`'s map fn is; only a
// function that accepts the state argument is a render prop. Measured over `examples/solid`: 12 of
// the 19 `<Pressable>` sites pass a function child and TEN of those are zero-arity, so refusing on
// `typeof` alone would throw away ten lowerable sites — including `ActionButton`, whose one
// definition is instantiated 146 times.
// Specialising a functional `style` is what lets a call site keep the idiom AND lower. SHARED, for
// the same reason `HOST_PRIMITIVES` is: which bodies are provable has to be one answer across every
// transform, or five adapters drift on which call sites lower — the divergence the spec exists to
// stop. Only the substitution is shared; each transform still owns its own AST plumbing.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  specializeStateStyle,
} = require('@symbiote-native/components/specialize-state-style');

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
  const attributesAreReadable = openingElement.attributes.every(
    attribute =>
      attribute.type === 'JSXAttribute' &&
      !needsBagFold(attributeName(attribute)),
  );
  if (!attributesAreReadable) return false;
  if (!spec.observesState) return true;
  return (
    // A functional style refuses ONLY when it cannot be specialised. `styleSpecializationFor`
    // returns null for exactly the bodies the substitution cannot prove, so the refusal surface
    // shrinks without the detection getting looser: an unreadable body still keeps the component.
    !openingElement.attributes.some(
      attribute =>
        isFunctionStyle(attribute) &&
        styleSpecializationFor(attribute, types) === null,
    ) && !element.children.some(isRenderPropChild)
  );
}

function styleSpecializationFor(attribute, types) {
  const value = attribute.value;
  return value === null || value.type !== 'JSXExpressionContainer'
    ? null
    : specializeStateStyle(value.expression, types);
}

// `style={fn}` becomes `style={base} activeStyle={active}`. The engine consumes `activeStyle` in
// `routeProp` and never forwards it to Fabric; while pressed it stands in for slot 1, which is the
// authored style's slot — so a `:active` CLASS rule can still win slot 0 underneath it and the two
// mechanisms compose.
function expandStateStyles(openingElement, types) {
  const expanded = [];
  for (const attribute of openingElement.attributes) {
    const split =
      attribute.type === 'JSXAttribute' && isFunctionStyle(attribute)
        ? styleSpecializationFor(attribute, types)
        : null;
    if (split === null) {
      expanded.push(attribute);
      continue;
    }
    expanded.push(
      types.jsxAttribute(
        types.jsxIdentifier('style'),
        types.jsxExpressionContainer(split.base),
      ),
      types.jsxAttribute(
        types.jsxIdentifier('activeStyle'),
        types.jsxExpressionContainer(split.active),
      ),
    );
  }
  openingElement.attributes = expanded;
}

// Per TAG, not global: the spec gives each primitive its own alias map, and reading it per tag is
// what keeps this honest if they ever stop agreeing.
function renameAliasedAttributes(openingElement, aliases, types) {
  openingElement.attributes.forEach(attribute => {
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
            expandStateStyles(openingElement, types);
            renameAliasedAttributes(openingElement, spec.aliases, types);
            openingElement.name = types.jsxIdentifier(spec.intrinsic);
            if (closingElement)
              closingElement.name = types.jsxIdentifier(spec.intrinsic);
          },
        });
      },
    },
  };
};
