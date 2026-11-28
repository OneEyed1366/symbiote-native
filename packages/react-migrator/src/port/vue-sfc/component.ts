// One React function component as the parts of a Vue SFC: props, setup from its body, template
import type { NodePath } from '@babel/traverse';
import type {
  BlockStatement,
  Expression,
  Function as IFunction,
  JSXElement,
  ObjectPattern,
  ObjectProperty,
  Program,
  ReturnStatement,
} from '@babel/types';
import { babelTypes as t } from '../../source-graph.ts';
import { printCode, stripStatementTypes } from '../codegen.ts';
import { refuse } from '../ledger.ts';
import { BRIDGE_METHOD, VUE_API, rewriteComponentHooks } from './hooks.ts';
import type { IHookRules } from './hooks.ts';
import { jsxToTemplate } from './template.ts';
import type { ITag, ITemplateHost } from './template.ts';

export type IComponentInput = {
  fn: NodePath<IFunction>;
  program: NodePath<Program>;
  rules: IHookRules;
  tagOf: (name: JSXElement['openingElement']['name']) => ITag;
};

export type IComponentPort = {
  setup: string;
  template: string;
  programNames: Set<string>;
  notes: string[];
};

type IProps = {
  kept: ObjectPattern['properties'];
  names: string[];
  childrenName: string | null;
  restName: string | null;
  refName: string | null;
};

const CHILDREN_PROP = 'children';
const REF_PROP = 'ref';
const DEFINE_PROPS = 'defineProps';
const PROVIDE = BRIDGE_METHOD.provide;

function propKey(property: ObjectProperty): string {
  if (t.isIdentifier(property.key)) return property.key.name;
  return t.isStringLiteral(property.key) ? property.key.value : refuse('computed prop key');
}

function boundName(property: ObjectProperty): string {
  const { value } = property;
  if (t.isIdentifier(value)) return value.name;
  if (t.isAssignmentPattern(value) && t.isIdentifier(value.left)) return value.left.name;
  return refuse(`prop ${propKey(property)} destructured further`);
}

// `children` becomes the default slot and `ref` is dropped, so neither is a Vue prop
function readPropsEntry(property: ObjectPattern['properties'][number], props: IProps): void {
  if (t.isRestElement(property)) {
    props.restName = t.isIdentifier(property.argument) ? property.argument.name : null;
    return;
  }
  const key = propKey(property);
  if (key === CHILDREN_PROP) {
    props.childrenName = boundName(property);
    return;
  }
  if (key === REF_PROP) {
    props.refName = boundName(property);
    return;
  }
  props.names.push(key);
  props.kept.push(t.cloneNode(property, true));
}

function readProps(fn: IFunction): IProps {
  const [first, second] = fn.params;
  const props: IProps = {
    kept: [],
    names: [],
    childrenName: null,
    restName: null,
    refName: t.isIdentifier(second) ? second.name : null,
  };
  if (first === undefined) return props;
  if (!t.isObjectPattern(first)) return refuse('props taken whole, not destructured');
  for (const property of first.properties) readPropsEntry(property, props);
  return props;
}

function blockBody(fn: NodePath<IFunction>): NodePath<BlockStatement> {
  const body = fn.get('body');
  if (body.isBlockStatement()) return body;
  if (!body.isExpression()) return refuse('component body shape');
  body.replaceWith(t.blockStatement([t.returnStatement(body.node)]));
  const block = fn.get('body');
  return block.isBlockStatement() ? block : refuse('component body shape');
}

function soleReturn(body: NodePath<BlockStatement>): NodePath<ReturnStatement> {
  let returns = 0;
  body.traverse({
    Function: (path) => path.skip(),
    ReturnStatement: () => {
      returns += 1;
    },
  });
  const last = body.get('body').at(-1);
  if (returns !== 1 || !last?.isReturnStatement()) return refuse('more than one return');
  return last;
}

// A type is stripped from the SFC script, so a name used only as a type needs no import there
function collectProgramNames(path: NodePath, program: NodePath<Program>, into: Set<string>) {
  path.traverse({
    TSType: (each) => each.skip(),
    Identifier(each) {
      if (!each.isReferencedIdentifier()) return;
      const binding = each.scope.getBinding(each.node.name);
      if (binding?.scope === program.scope) into.add(each.node.name);
    },
  });
}

type IProvides = { raw: [string, string][] };

function stripPatternTypes(pattern: ObjectPattern): ObjectPattern {
  const declaration = t.variableDeclaration('const', [
    t.variableDeclarator(pattern, t.identifier(DEFINE_PROPS)),
  ]);
  const stripped = stripStatementTypes(declaration);
  const [declarator] = t.isVariableDeclaration(stripped) ? stripped.declarations : [];
  return t.isObjectPattern(declarator?.id) ? declarator.id : pattern;
}

function setupHost(
  input: IComponentInput,
  props: IProps,
  returned: NodePath<ReturnStatement>,
  provides: IProvides,
): ITemplateHost {
  const hoist = (preferredName: string, value: Expression): string => {
    const name = returned.scope.hasBinding(preferredName)
      ? returned.scope.generateUidIdentifier(preferredName).name
      : preferredName;
    returned.insertBefore(t.variableDeclaration('const', [t.variableDeclarator(t.identifier(name), value)]));
    return name;
  };
  const provide = (context: string, value: Expression): void => {
    if (t.isIdentifier(value)) {
      provides.raw.push([context, value.name]);
      return;
    }
    input.rules.vueApis.add(VUE_API.computed);
    const computed = t.callExpression(t.identifier(VUE_API.computed), [t.arrowFunctionExpression([], value)]);
    returned.insertBefore(t.expressionStatement(provideCall(context, computed)));
  };
  return { ...props, tagOf: input.tagOf, hoist, provide };
}

function provideCall(context: string, value: Expression): Expression {
  return t.callExpression(t.memberExpression(t.identifier(context), t.identifier(PROVIDE)), [value]);
}

function propsLine(props: IProps): string {
  if (props.names.length === 0) return '';
  const call = `${DEFINE_PROPS}(${JSON.stringify(props.names)})`;
  return `const ${printCode(stripPatternTypes(t.objectPattern(props.kept)))} = ${call};\n`;
}

function notesOf(props: IProps): string[] {
  const notes = ['SFC script carries no types'];
  if (props.refName !== null) notes.push('forwarded ref is dropped');
  if (props.restName !== null) notes.push('rest props reach the root through attribute fallthrough');
  return notes;
}

export function portComponent(input: IComponentInput): IComponentPort {
  const props = readProps(input.fn.node);
  const body = blockBody(input.fn);
  const returned = soleReturn(body);
  const programNames = new Set<string>();
  const provides: IProvides = { raw: [] };
  const argument = returned.get('argument');
  if (!argument.isExpression()) return refuse('component returns nothing');
  collectProgramNames(argument, input.program, programNames);
  const template = jsxToTemplate(argument.node, setupHost(input, props, returned, provides));
  returned.remove();
  rewriteComponentHooks(body, input.rules);
  for (const [context, name] of provides.raw) {
    body.pushContainer('body', t.expressionStatement(provideCall(context, t.identifier(name))));
  }
  body.scope.crawl();
  collectProgramNames(body, input.program, programNames);
  const statements = body.node.body.map((statement) => printCode(stripStatementTypes(statement)));
  return {
    setup: `${propsLine(props)}${statements.join('\n')}\n`,
    template,
    programNames,
    notes: notesOf(props),
  };
}
