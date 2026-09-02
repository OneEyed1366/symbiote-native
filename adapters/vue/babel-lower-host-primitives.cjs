// Compile-time lowering of <View>/<Text> to the intrinsic tags the renderer maps to Fabric, for the
// TSX/JSX authoring path. The SFC twin is the nodeTransform in metro-vue-transformer.cjs — same
// rewrite, different vehicle, and until this existed TSX paid a tax SFC no longer did.
//
// WHY. Vue charges a full component instance even for a FUNCTIONAL component
// (createComponentInstance + initProps + initSlots + setupRenderEffect). View and Text are ~73% of
// the static tags in a real screen, so that is one instance per node on nearly three quarters of
// the tree. Lowered, they become plain element vnodes the renderer's nodeOps handle directly.
// Measured on the SFC path: 25-29% off all three create-shaped rows on device.
//
// Do NOT ship this plugin without also configuring @vue/babel-plugin-jsx's `isCustomElement` to
// answer true for `symbiote-*` — see ./babel-jsx.cjs, which is why the two are handed out together
// and should not be wired separately. Without it a lowered tag compiles to
// `createVNode(resolveComponent("symbiote-view"), …, {default: () => […]})`: a component that
// resolves to nothing, with slot children an element path would never mount.
//
// .cjs because Babel require()s it and this package is "type": "module".

const SOURCE = '@symbiote-native/vue';

// The tag map is the SHARED SPEC's, not this file's — four transforms each carried a copy before
// it existed and they had already drifted. Only `intrinsic` is read: Vue applies the `id` ->
// `nativeID` alias at RUNTIME (patchProp), because compile time reaches two of Vue's four paths to
// a node. See the spec's own `aliases` comment.
const {
  HOST_PRIMITIVES,
} = require('@symbiote-native/components/host-primitives');

// A functional `style` keeps the RN idiom AND lowers, by being CALLED once per state at bag-build
// time instead of being handed to a component that calls it per press.
//

const LOWERABLE = new Map(
  Object.entries(HOST_PRIMITIVES).map(([name, spec]) => [
    name,
    {
      intrinsic: spec.intrinsic,
      observesState: spec.observesState === true,
      intrinsicWhen: spec.intrinsicWhen,
    },
  ]),
);

// REFUSAL_CATEGORIES.dynamicIntrinsicChoice. A primitive whose spec entry carries `intrinsicWhen`
// picks between TWO Fabric views by the value of one prop, and the transform prints a STATIC tag
// name — so it can only choose when that value is a compile-time literal.
//
// This is not the unreadable-VALUE hazard wearing a new hat, and the difference decides how hard to
// refuse: an unreadable value lands a prop wrong, which a later write can still correct; the wrong
// choice here commits the wrong native view, and no prop write moves a node between views. So only
// the two provable shapes resolve and everything else keeps the component.
//
// `multiline="true"` — a STRING attribute — is deliberately NOT one of them, though the component
// would treat it as truthy. A string that reads as a boolean is the shape where an author and the
// runtime disagree most often (`multiline="false"` is truthy), and refusing costs only the
// optimisation while guessing costs the right view.
//
// Returns the tag to emit, or undefined to refuse.
function intrinsicWhenFor(openingElement, entry) {
  const choice = entry.intrinsicWhen;
  if (choice === undefined) return entry.intrinsic;

  let resolved = false;
  for (const attribute of openingElement.attributes) {
    // A spread may carry the selector prop, and the transform cannot see inside it. Nothing else
    // in this loop can tell that apart from "the prop is absent", so it must refuse outright.
    if (attribute.type === 'JSXSpreadAttribute') return undefined;
    if (attribute.type !== 'JSXAttribute') continue;
    if (attribute.name.type !== 'JSXIdentifier') continue;
    if (attribute.name.name !== choice.prop) continue;

    // A bare `multiline` with no value is JSX for `true`.
    if (attribute.value === null || attribute.value === undefined) {
      resolved = true;
      continue;
    }
    if (attribute.value.type !== 'JSXExpressionContainer') return undefined;
    const expression = attribute.value.expression;
    if (expression.type !== 'BooleanLiteral') return undefined;
    resolved = expression.value;
  }

  return resolved ? choice.intrinsic : entry.intrinsic;
}

// The shared spec's allow-list for `stateInTemplate`, spelled the same in all five transforms:
// only a provably inert value shape lowers. `style={styleFn}` is an Identifier at compile time and
// no transform can tell an object from a function, so anything that is not one of these refuses. A
// narrow "refuse a function literal" reading passes every obvious test and then fails on the one
// call site that hoists its style into a variable — which is what ActionButton does.
const INERT_VALUE_TYPES = new Set([
  'ObjectExpression',
  'ArrayExpression',
  'StringLiteral',
  'NumericLiteral',
  'BooleanLiteral',
  'NullLiteral',
  'TemplateLiteral',
]);

// A bare `style="x"` attribute value is a JSXText-ish literal and inert; `style={…}` is inert only
// when the expression inside is.
function isInertValueAttribute(value) {
  if (value === null || value === undefined) return true;
  if (value.type !== 'JSXExpressionContainer')
    return INERT_VALUE_TYPES.has(value.type);
  return INERT_VALUE_TYPES.has(value.expression.type);
}

// The JSX twin of metro-vue-transformer.cjs's refusesLowering — same three categories, different
// AST. A primitive that owns state can lower only when the template does not read that state,
// because a lowered element has no instance to read it from. Refusing is always safe; lowering a
// button that reads `pressed` gives a button that renders and does not respond, on device, with
// nothing red.
function refusesLowering(openingElement, children, types) {
  for (const attribute of openingElement.attributes) {
    // `{...props}` — an attribute set this pass cannot enumerate, so it may hide a functional
    // `style`. REFUSAL_CATEGORIES.unreadableAttributeSet.
    if (attribute.type === 'JSXSpreadAttribute') return true;
    if (attribute.type !== 'JSXAttribute') continue;
    if (attribute.name.type !== 'JSXIdentifier') continue;

    // REFUSAL_CATEGORIES.instanceBoundDirective. `ref` on a COMPONENT yields the component
    // instance; on an element it yields the host node. Lowering silently changes which one the app
    // receives, so a `pressableRef.value.measure()` starts reaching a different object — a runtime
    // failure with nothing red at build time. Found by the shared verdict table, not by a Vue test.
    if (attribute.name.name === 'ref') return true;

    if (attribute.name.name !== 'style') continue;

    // REFUSAL_CATEGORIES.stateInTemplate no longer fires on a `style` at all. Every shape is
    // covered: an inert value rides through, and anything else is either called directly or handed
    // to the runtime helper, which decides with a `typeof` what no compile-time analysis could.
    // What still refuses is above (an unreadable attribute set) and below (a child reading state).
    if (!isInertValueAttribute(attribute.value)) continue;
  }

  // A function child that TAKES an argument is the render-prop form, i.e. children as a function
  // of press state. A zero-arity function child is an ordinary lazy child and lowers fine — the
  // distinction the shared spec spells out for renderPropChild.
  return children.some(child => {
    if (child.type !== 'JSXExpressionContainer') return false;
    const { expression } = child;
    return (
      (expression.type === 'ArrowFunctionExpression' ||
        expression.type === 'FunctionExpression') &&
      expression.params.length >= 1
    );
  });
}

// Every local name bound to a lowerable export of @symbiote-native/vue in THIS file, honouring
// `import { View as Box }`. Matching bare tag names instead would rewrite an app's own <View>.
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
      const entry = LOWERABLE.get(imported);
      if (entry !== undefined) names.set(specifier.local.name, entry);
    });
  });
  return names;
}

// Refusals apply ONLY to a primitive that owns state. View and Text still lower unconditionally,
// and that remains deliberate: their only folds are kebab->camel and RN's Text defaults, both of
// which moved into the renderer (normalizeVueAttrKey in patchProp, seedTextDefaults/textDefaultFor
// in createElement) when the SFC lowering landed, so nothing a spread could hide is left. Adding a
// refusal for them would make TSX diverge from SFC, which lowers them unconditionally too.
module.exports = function lowerHostPrimitives({ types }) {
  return {
    name: 'symbiote-vue-lower-host-primitives',
    visitor: {
      Program(programPath) {
        const names = lowerableLocalNames(programPath);
        if (names.size === 0) return;
        programPath.traverse({
          JSXElement(elementPath) {
            const { openingElement, closingElement } = elementPath.node;
            const tag = openingElement.name;
            if (tag.type !== 'JSXIdentifier') return;
            const entry = names.get(tag.name);
            if (entry === undefined) return;
            // Resolved BEFORE the state refusal and outside its `observesState` gate: the two
            // guard different things, and this one applies to a primitive that owns no state at
            // all. Reading it as "another case for refusesLowering" would put it behind that flag
            // and it would never run for TextInput.
            const intrinsic = intrinsicWhenFor(openingElement, entry);
            if (intrinsic === undefined) return;
            if (
              entry.observesState &&
              refusesLowering(openingElement, elementPath.node.children, types)
            )
              return;
            // A shadowing local binding (a parameter, or a `const View = …` in scope) is NOT our
            // import even though the name matches. Only rewrite where the binding at this use site
            // is still the module-level import.
            const binding = elementPath.scope.getBinding(tag.name);
            if (binding === undefined || binding.kind !== 'module') return;
            // NO state-style expansion. A functional `style` reaches `routeProp` untouched and
            // the engine resolves it at both values of `pressed` (`isStyleCallback`), so rewriting
            // the attribute into a pair here would be this transform carrying BEHAVIOUR — what
            // `tests/lowering-transform-carries-no-behaviour.test.ts` exists to keep out. Removed
            // from BOTH Vue paths in one change: the SFC twin sees an expression as source text
            // where this one has the AST, so a split removed from one and not the other is the
            // exact drift `.claude/rules/adapter-parity-audit.md` records for this pair.
            openingElement.name = types.jsxIdentifier(intrinsic);
            if (closingElement)
              closingElement.name = types.jsxIdentifier(intrinsic);
          },
        });
      },
    },
  };
};
