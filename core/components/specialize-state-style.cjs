// Turn `style={({ pressed }) => …}` into two plain style objects, so a Pressable that reads its own
// press state in the template can still be lowered to an intrinsic tag.
//
// WHY THIS EXISTS AT ALL. The alternative we shipped first is a `:active` CSS rule, and it works —
// but it asks a developer to abandon a genuine best-practice. A ternary in a style callback is how
// dynamic styling is written across this ecosystem, in this project's own examples and at large
// engineering organisations. A tool that demands a rewrite to be fast is a tool with a defect, so
// the compiler does the conversion instead of the human.
//
// IT IS A SUBSTITUTION, NOT AN EVALUATION, and that distinction is the whole safety argument. No
// user code runs at build time. The arrow's body is cloned twice, the state identifier is replaced
// by `true` in one copy and `false` in the other, and conditionals whose test has become a literal
// are folded. Anything else in the body — `color`, `props.x`, a call — is carried through as an
// expression in both copies, untouched. That is why a runtime prop survives the transform.
//
// WHY IT IS SAFE TO BE EXHAUSTIVE: the callback's argument is OURS. We declare `pressed`, so we
// know its domain is exactly {true, false} and two specialisations cover it completely. A callback
// whose argument domain we did not own could not be handled this way at all.

// The state keys a primitive exposes to a style callback. One today; the mechanism generalises to
// any FINITE domain we declare, which is the property that makes exhaustive specialisation legal.
const STATE_KEYS = new Set(['pressed']);

function singleReturnedObject(body, types) {
  if (types.isObjectExpression(body)) return body;
  if (!types.isBlockStatement(body) || body.body.length !== 1) return null;
  const [statement] = body.body;
  return types.isReturnStatement(statement) &&
    types.isObjectExpression(statement.argument)
    ? statement.argument
    : null;
}

// `({ pressed }) => …` only. An Identifier param (`state => state.pressed`) is a legal shape we
// deliberately do not accept yet: it needs member-expression substitution, which is a second
// mechanism, and refusing costs a call site rather than correctness.
function destructuredStateKeys(param, types) {
  if (!types.isObjectPattern(param)) return null;
  const keys = [];
  for (const property of param.properties) {
    if (
      !types.isObjectProperty(property) ||
      property.computed ||
      !types.isIdentifier(property.key) ||
      !types.isIdentifier(property.value) ||
      property.key.name !== property.value.name ||
      !STATE_KEYS.has(property.key.name)
    ) {
      return null;
    }
    keys.push(property.key.name);
  }
  return keys.length > 0 ? keys : null;
}

// A nested function could REDECLARE the state name, and then substituting it would rewrite a
// binding that has nothing to do with the press state. Cheaper to refuse than to scope-track.
function containsFunction(node, types) {
  let found = false;
  walk(node, child => {
    if (
      types.isFunctionExpression(child) ||
      types.isArrowFunctionExpression(child) ||
      types.isFunctionDeclaration(child)
    ) {
      found = true;
    }
  });
  return found;
}

function walk(node, visit) {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
    return;
  }
  if (typeof node.type !== 'string') return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue;
    walk(node[key], visit);
  }
}

// Rewrites in place on an already-cloned tree. A property KEY named `pressed` is not a reference to
// the parameter, and neither is `x.pressed` — both are skipped, which is why this walks parents
// rather than blindly matching identifiers.
function substitute(node, name, literal, types) {
  walk(node, parent => {
    for (const key of Object.keys(parent)) {
      const value = parent[key];
      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          if (isStateRef(parent, key, item, name, types))
            value[index] = literal();
        });
      } else if (isStateRef(parent, key, value, name, types)) {
        parent[key] = literal();
      }
    }
  });
}

function isStateRef(parent, key, node, name, types) {
  if (!types.isIdentifier(node) || node.name !== name) return false;
  if (types.isObjectProperty(parent) && key === 'key' && !parent.computed)
    return false;
  if (
    types.isMemberExpression(parent) &&
    key === 'property' &&
    !parent.computed
  ) {
    return false;
  }
  return true;
}

// Bottom-up, because folding a branch can turn its parent's test into a literal too.
function fold(node, types) {
  walk(node, parent => {
    for (const key of Object.keys(parent)) {
      const value = parent[key];
      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          const folded = foldOne(item, types);
          if (folded !== null) value[index] = folded;
        });
      } else {
        const folded = foldOne(value, types);
        if (folded !== null) parent[key] = folded;
      }
    }
  });
}

function foldOne(node, types) {
  if (
    node === null ||
    typeof node !== 'object' ||
    typeof node.type !== 'string'
  ) {
    return null;
  }
  fold(node, types);
  if (
    types.isConditionalExpression(node) &&
    types.isBooleanLiteral(node.test)
  ) {
    return node.test.value ? node.consequent : node.alternate;
  }
  if (
    types.isUnaryExpression(node, { operator: '!' }) &&
    types.isBooleanLiteral(node.argument)
  ) {
    return types.booleanLiteral(!node.argument.value);
  }
  if (types.isLogicalExpression(node) && types.isBooleanLiteral(node.left)) {
    if (node.operator === '&&') return node.left.value ? node.right : node.left;
    if (node.operator === '||') return node.left.value ? node.left : node.right;
  }
  return null;
}

function specializeAt(object, keys, value, types) {
  const clone = types.cloneNode(object, true);
  for (const key of keys) {
    substitute(clone, key, () => types.booleanLiteral(value), types);
  }
  fold(clone, types);
  return hasStateRef(clone, keys, types) ? null : clone;
}

// Returns the two specialisations, or null to refuse — the caller then keeps the component, which
// is exactly today's behaviour.
// A surviving REFERENCE means the body used the state somewhere the substitution could not reach,
// and emitting a half-specialised object would be worse than refusing. It must use the same
// parent-aware predicate as `substitute`, or a property named `pressed` and a `state.pressed` read
// both count as survivors and every such call site refuses for no reason — which is exactly what a
// naive identifier scan did here first.
function hasStateRef(node, keys, types) {
  let found = false;
  walk(node, parent => {
    for (const key of Object.keys(parent)) {
      const value = parent[key];
      const items = Array.isArray(value) ? value : [value];
      for (const item of items) {
        if (
          types.isIdentifier(item) &&
          keys.includes(item.name) &&
          isStateRef(parent, key, item, item.name, types)
        ) {
          found = true;
        }
      }
    }
  });
  return found;
}

function specializeStateStyle(expression, types) {
  if (
    !types.isArrowFunctionExpression(expression) &&
    !types.isFunctionExpression(expression)
  ) {
    return null;
  }
  if (expression.params.length !== 1) return null;
  const keys = destructuredStateKeys(expression.params[0], types);
  if (keys === null) return null;
  const object = singleReturnedObject(expression.body, types);
  if (object === null) return null;
  if (containsFunction(object, types)) return null;
  const base = specializeAt(object, keys, false, types);
  const active = specializeAt(object, keys, true, types);
  return base === null || active === null ? null : { base, active };
}

module.exports = { specializeStateStyle, STATE_KEYS };
