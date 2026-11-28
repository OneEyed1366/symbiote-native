// Spike: a framework-neutral model of React class components (props, state, fields, lifecycle)
// Usage: OUT=model.json node class-model.cjs <dir-with-babel> <files...>
const { createRequire } = require('node:module');
const fs = require('node:fs');

const req = createRequire(process.argv[2] + '/package.json');
const { parse } = req('@babel/parser');
const traverse = req('@babel/traverse').default;

const NODE = {
  member: 'MemberExpression',
  thisExpression: 'ThisExpression',
  classProperty: 'ClassProperty',
  classPrivateProperty: 'ClassPrivateProperty',
  classMethod: 'ClassMethod',
  assignment: 'AssignmentExpression',
  call: 'CallExpression',
  arrow: 'ArrowFunctionExpression',
};
const FIELD_KIND = {
  static: 'static',
  decl: 'decl',
  ref: 'ref',
  arrowMethod: 'arrow-method',
  plain: 'plain',
  declOnly: 'decl-only',
  ctorAssigned: 'ctor-assigned',
};
const THIS = { props: 'props', state: 'state', current: 'current' };
const LIFECYCLE = new Set([
  'componentDidMount', 'componentDidUpdate', 'componentWillUnmount', 'shouldComponentUpdate',
  'getSnapshotBeforeUpdate', 'componentDidCatch', 'UNSAFE_componentWillReceiveProps',
  'UNSAFE_componentWillMount', 'UNSAFE_componentWillUpdate',
]);
const STATIC_LIFECYCLE = new Set(['getDerivedStateFromProps', 'getDerivedStateFromError']);
const COMPONENT_BASE = /^(React\.)?(Pure)?Component$/;
const INIT_PREVIEW = 60;
const CTOR_INIT_PREVIEW = 50;

const lineSpan = (node) => node.loc.end.line - node.loc.start.line + 1;
const sourceOf = (code, node) => code.slice(node.start, node.end);

function isComponentBase(superClass) {
  if (!superClass) return false;
  const name = superClass.type === NODE.member
    ? `${superClass.object.name}.${superClass.property.name}`
    : (superClass.name ?? '');
  return COMPONENT_BASE.test(name);
}

function thisMemberName(node) {
  const isThisMember = node.type === NODE.member && node.object.type === NODE.thisExpression;
  return isThisMember && !node.computed ? node.property.name : null;
}

function fieldKind(member, init) {
  if (member.static) return FIELD_KIND.static;
  if (!member.value && member.declare !== undefined) return FIELD_KIND.decl;
  if (/createRef/.test(init ?? '')) return FIELD_KIND.ref;
  if (/^\(.*=>/.test(init ?? '') || member.value?.type === NODE.arrow) return FIELD_KIND.arrowMethod;
  return member.value ? FIELD_KIND.plain : FIELD_KIND.declOnly;
}

function addProperty(model, member, key, code) {
  const init = member.value ? sourceOf(code, member.value).slice(0, INIT_PREVIEW) : null;
  const bucket = member.static ? model.statics : model.fields;
  bucket.push({ name: key, kind: fieldKind(member, init), init, loc: lineSpan(member) });
}

function addConstructorAssignment(model, expression, code) {
  const target = thisMemberName(expression.left);
  const right = expression.right;
  if (target === THIS.state) {
    model.ctor.stateInit = true;
    return;
  }
  if (right.type === NODE.call && sourceOf(code, right.callee).endsWith('.bind')) {
    model.ctor.binds.push(target);
    return;
  }
  const init = sourceOf(code, right);
  const kind = /createRef/.test(init) ? FIELD_KIND.ref : FIELD_KIND.ctorAssigned;
  model.fields.push({ name: target, kind, init: init.slice(0, CTOR_INIT_PREVIEW) });
}

function addConstructor(model, member, code) {
  model.ctor = { params: member.params.length, binds: [], stateInit: false };
  for (const statement of member.body.body) {
    if (statement.expression?.type === NODE.assignment) {
      addConstructorAssignment(model, statement.expression, code);
    }
  }
}

function addMethod(model, member, key, code) {
  if (member.kind === 'constructor') {
    addConstructor(model, member, code);
    return;
  }
  const record = {
    name: key,
    static: Boolean(member.static),
    params: member.params.length,
    async: member.async,
    loc: lineSpan(member),
  };
  if (key === 'render') model.render = record;
  else if (LIFECYCLE.has(key) || (member.static && STATIC_LIFECYCLE.has(key))) model.lifecycle.push(record);
  else model.methods.push(record);
}

function addMember(model, member, code) {
  const key = member.key?.name ?? member.key?.value;
  const isProperty = member.type === NODE.classProperty || member.type === NODE.classPrivateProperty;
  if (member.type === NODE.classProperty && key === THIS.state && !member.static) model.uses.state = true;
  if (isProperty) addProperty(model, member, key, code);
  else if (member.type === NODE.classMethod) addMethod(model, member, key, code);
}

// What each `this.<name>` read records on `uses`, any other name lands in `thisReads`
const THIS_USE = {
  props: (uses, path) => {
    const parent = path.parent;
    const isKeyRead = parent.type === NODE.member && parent.object === path.node && !parent.computed;
    uses.propsKeys.add(isKeyRead ? parent.property.name : '*spread/whole');
  },
  state: (uses) => { uses.state = true; },
  context: (uses) => { uses.context = true; },
  setState: (uses) => { uses.setState += 1; },
  forceUpdate: (uses) => { uses.forceUpdate = true; },
};

function recordThisUse(uses, path) {
  const name = thisMemberName(path.node);
  const handler = name ? THIS_USE[name] : undefined;
  if (handler) handler(uses, path);
  else if (name) uses.thisReads.add(name);
  const node = path.node;
  const isRefCurrent = node.property?.name === THIS.current && node.object.type === NODE.member;
  if (isRefCurrent && thisMemberName(node.object)) uses.refsCurrent += 1;
}

function emptyModel(node, file, code) {
  const propsType = node.superTypeParameters?.params?.[0];
  return {
    classLoc: lineSpan(node),
    file: file.replace(/.*package\//, ''),
    name: node.id?.name ?? '(anon)',
    extends: sourceOf(code, node.superClass),
    propsType: propsType ? sourceOf(code, propsType) : null,
    fields: [], statics: [], lifecycle: [], methods: [], render: null,
    uses: {
      propsKeys: new Set(), state: false, setState: 0, context: false,
      refsCurrent: 0, forceUpdate: false, thisReads: new Set(),
    },
  };
}

function modelClass(path, file, code) {
  const model = emptyModel(path.node, file, code);
  for (const member of path.node.body.body) addMember(model, member, code);
  path.traverse({ MemberExpression: (inner) => recordThisUse(model.uses, inner) });
  model.uses.propsKeys = [...model.uses.propsKeys];
  model.uses.thisReads = [...model.uses.thisReads];
  return model;
}

function modelFile(file) {
  const code = fs.readFileSync(file, 'utf8');
  const plugins = file.endsWith('.js')
    ? ['flow', 'jsx', 'classProperties']
    : ['typescript', 'jsx', 'classProperties', 'decorators-legacy'];
  const ast = parse(code, { sourceType: 'module', plugins });
  const models = [];
  const visit = (path) => {
    if (isComponentBase(path.node.superClass)) models.push(modelClass(path, file, code));
  };
  traverse(ast, { ClassDeclaration: visit, ClassExpression: visit });
  return models;
}

function summary(model) {
  const refs = model.fields.filter((field) => field.kind === FIELD_KIND.ref).length;
  const lifecycle = model.lifecycle.map((method) => method.name).join(',');
  const hasState = model.uses.state || model.ctor?.stateInit;
  return `${model.name.padEnd(16)} ${model.file.padEnd(26)} fields ${String(model.fields.length).padStart(2)}`
    + ` (ref ${refs}) statics ${model.statics.length} lifecycle [${lifecycle}] methods ${model.methods.length}`
    + ` state ${hasState} setState ${model.uses.setState} ctx ${model.uses.context}`
    + ` binds ${model.ctor?.binds.length ?? 0} propsKeys ${model.uses.propsKeys.length}`;
}

const models = process.argv.slice(3).flatMap(modelFile);
fs.writeFileSync(process.env.OUT, JSON.stringify(models, null, 1));
for (const model of models) console.log(summary(model));
