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
// TWO MECHANISMS, AND ONLY ONE OF THEM DECIDES THE VERDICT. The CALL covers every shape and is
// spelled identically in all five transforms, so what lowers is one answer everywhere.
// `specializeStateStyle` is a pure OPTIMISATION on top: where the body is provable, substitution
// folds it into two plain object literals and no closure is allocated. It is shared for the same
// reason HOST_PRIMITIVES is, but it can be absent — the SFC path has no AST in hand and emits only
// calls — WITHOUT the two paths disagreeing on which call sites lower. That separation is the
// whole point; if the optimisation ever started gating the verdict, SFC and TSX would drift.
//
// THE CONTRACT THE CALL IMPOSES, stated because it is a real constraint on app code: the callback
// must be PURE IN THE STATE. Its body runs twice per bag build, once per state.
const {
  specializeStateStyle,
  STATE_KEYS,
} = require('@symbiote-native/components/specialize-state-style');

const LOWERABLE = new Map(
  Object.entries(HOST_PRIMITIVES).map(([name, spec]) => [
    name,
    { intrinsic: spec.intrinsic, observesState: spec.observesState === true },
  ]),
);

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

function styleExpressionOf(attribute) {
  const value = attribute.value;
  return value === null || value?.type !== 'JSXExpressionContainer'
    ? undefined
    : value.expression;
}

// `{ pressed: <value> }` — the argument the callback is invoked with. Built from the shared
// STATE_KEYS rather than a literal 'pressed', so a primitive that later exposes a second state key
// does not need this line edited in five transforms.
function stateArgument(value, types) {
  return types.objectExpression(
    [...STATE_KEYS].map(key =>
      types.objectProperty(types.identifier(key), types.booleanLiteral(value)),
    ),
  );
}

// HOW the pair is emitted, never WHETHER the element lowers. Every shape lowers; the three buckets
// differ only in what the emitted code costs, and the split is a measurement:
//
//   literal    (({p}) => …)({pressed:false})            two closure allocations, no read hazard
//   reference  typeof e === 'function' ? e({…}) : e     `e` printed twice per prop, but it is a read
//   opaque     ...resolveStateStyle(e)                   `e` printed ONCE — required, and it costs
//                                                        the element its patch flag, so it is used
//                                                        only where a repeated read would be wrong
//
// `REFUSAL_CATEGORIES.emitStyleExpressionOnce` is what the third bucket satisfies: `getStyle()`,
// `bag[i]` and `flag ? a : b` change meaning when printed twice, and the helper prints them once.
// The first two buckets keep the cheap form because re-reading a literal or a name cannot change
// anything — measured cost of getting that wrong: `12 /* STYLE, PROPS */` becomes
// `16 /* FULL_PROPS */` plus a mergeProps on every render, on the hottest element in the tree.
function styleEmissionKind(expression, types) {
  if (expression === undefined) return undefined;
  if (isFunctionLiteral(expression, types)) return 'literal';
  return isCheapReference(expression, types) ? 'reference' : 'opaque';
}

function isFunctionLiteral(expression, types) {
  return (
    types.isArrowFunctionExpression(expression) ||
    types.isFunctionExpression(expression)
  );
}

// An identifier or a dotted path of identifiers — `styleFn`, `props.style`, `a.b.c`. A computed
// member (`a[i]`) is excluded: the index expression would also be evaluated twice.
function isCheapReference(expression, types) {
  if (types.isIdentifier(expression)) return true;
  return (
    types.isMemberExpression(expression) &&
    !expression.computed &&
    types.isIdentifier(expression.property) &&
    isCheapReference(expression.object, types)
  );
}

// `style={fn}` becomes `style={base} activeStyle={active}`. The engine consumes `activeStyle` in
// routeProp and never forwards it to Fabric; while the node is pressed it stands in for SLOT 1,
// which is the authored style's slot — so a `:active` CSS rule still wins slot 0 underneath it and
// the two mechanisms compose rather than race.
function expandStateStyles(openingElement, types, helper) {
  const expanded = [];
  for (const attribute of openingElement.attributes) {
    const expression = stateStyleExpressionOf(attribute, types);
    if (expression === undefined) {
      expanded.push(attribute);
      continue;
    }
    const kind = styleEmissionKind(expression, types);

    // The one shape that must reach the output exactly once. A spread is the only Vue form that
    // yields two props from one evaluation, and it is why this is not simply the default.
    if (kind === 'opaque') {
      expanded.push(
        types.jsxSpreadAttribute(
          types.callExpression(types.cloneNode(helper.reference(), true), [
            types.cloneNode(expression, true),
          ]),
        ),
      );
      continue;
    }

    const pair = statePairFor(expression, kind, types);
    expanded.push(
      types.jsxAttribute(
        types.jsxIdentifier('style'),
        types.jsxExpressionContainer(pair.base),
      ),
      types.jsxAttribute(
        types.jsxIdentifier('activeStyle'),
        types.jsxExpressionContainer(pair.active),
      ),
    );
  }
  openingElement.attributes = expanded;
}

// The `style` expression when it needs a pair built, `undefined` for every other attribute and for
// an inert value (which rides through as the author wrote it and has no pressed variant).
function stateStyleExpressionOf(attribute, types) {
  if (
    attribute.type !== 'JSXAttribute' ||
    attribute.name.type !== 'JSXIdentifier' ||
    attribute.name.name !== 'style' ||
    isInertValueAttribute(attribute.value)
  ) {
    return undefined;
  }
  const expression = styleExpressionOf(attribute);
  return styleEmissionKind(expression, types) === undefined
    ? undefined
    : expression;
}

function statePairFor(expression, kind, types) {
  // The optimisation, tried first and allowed to fail. When the body is provable the pair is two
  // plain object literals and nothing is allocated or invoked at runtime; when it is not, the call
  // below covers the same site. The VERDICT is already settled, so a body this cannot prove costs
  // a closure, never the lowering.
  const substituted = specializeStateStyle(expression, types);
  if (substituted !== null) return substituted;
  return {
    base: stateCall(expression, kind, false, types),
    active: stateCall(expression, kind, true, types),
  };
}

// A function literal is called directly. A cheap reference cannot be told from a plain style OBJECT
// at compile time — `style={props.style}` is the same syntax either way — so it carries a runtime
// typeof guard, and that guard is what closes the hoisted-style call site no compile-time analysis
// could. `activeStyle` falls back to `undefined` for a non-function, which the engine reads as "no
// active variant" and leaves slot 1 alone.
function stateCall(expression, kind, value, types) {
  const call = types.callExpression(types.cloneNode(expression, true), [
    stateArgument(value, types),
  ]);
  if (kind === 'literal') return call;
  return types.conditionalExpression(
    types.binaryExpression(
      '===',
      types.unaryExpression('typeof', types.cloneNode(expression, true)),
      types.stringLiteral('function'),
    ),
    call,
    value ? types.identifier('undefined') : types.cloneNode(expression, true),
  );
}

// The helper import, added at most once per file and only if an opaque style actually needed it —
// an unused import in every lowered file would be dead weight Metro still has to resolve.
function createHelperImport(programPath, types) {
  let local;
  return {
    reference() {
      if (local === undefined) {
        local = programPath.scope.generateUidIdentifier('symbioteStateStyle');
        programPath.unshiftContainer(
          'body',
          types.importDeclaration(
            [types.importSpecifier(local, types.identifier(HELPER_EXPORT))],
            types.stringLiteral(HELPER_MODULE),
          ),
        );
      }
      return local;
    },
  };
}

const HELPER_EXPORT = 'resolveStateStyle';

// The SUBPATH, not the barrel. `resolveStateStyle` is a symbol for emitted code rather than public
// API, so putting it on `@symbiote-native/vue` would make every adapter owe the same barrel export
// or fail barrel parity for a name no app ever writes. Every adapter declares `./state-style`.
const HELPER_MODULE = `${SOURCE}/state-style`;

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
        const helper = createHelperImport(programPath, types);
        programPath.traverse({
          JSXElement(elementPath) {
            const { openingElement, closingElement } = elementPath.node;
            const tag = openingElement.name;
            if (tag.type !== 'JSXIdentifier') return;
            const entry = names.get(tag.name);
            if (entry === undefined) return;
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
            expandStateStyles(openingElement, types, helper);
            openingElement.name = types.jsxIdentifier(entry.intrinsic);
            if (closingElement)
              closingElement.name = types.jsxIdentifier(entry.intrinsic);
          },
        });
      },
    },
  };
};
