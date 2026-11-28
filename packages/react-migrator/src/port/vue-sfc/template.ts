// JSX returned by a React component as a Vue template, one rule per JSX form
import type {
  Expression,
  JSXAttribute,
  JSXElement,
  JSXExpressionContainer,
  JSXSpreadAttribute,
  Node,
} from '@babel/types';
import { babelTypes as t } from '../../source-graph.ts';
import { printCode, stripExpressionTypes } from '../codegen.ts';
import { refuse } from '../ledger.ts';
import { isFunctionValue } from '../react-shapes.ts';

export const TAG_KIND = {
  native: 'native',
  component: 'component',
  provider: 'provider',
} as const;

export type ITag =
  | { kind: typeof TAG_KIND.native; viewName: string }
  | { kind: typeof TAG_KIND.component; name: string }
  | { kind: typeof TAG_KIND.provider; context: string };

// What the component around the JSX knows: names its props were bound to, where hoisted code goes
export type ITemplateHost = {
  tagOf: (name: JSXElement['openingElement']['name']) => ITag;
  childrenName: string | null;
  restName: string | null;
  refName: string | null;
  hoist: (preferredName: string, value: Expression) => string;
  provide: (context: string, value: Expression) => void;
};

const INDENT = '  ';
const EVENT_PROP = /^on[A-Z]/;
const KEY_PROP = 'key';
const REF_PROP = 'ref';
const VALUE_PROP = 'value';

const kebab = (name: string): string => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
const quoted = (code: string): string => code.replaceAll('"', '&quot;');
const expressionCode = (expression: Expression): string =>
  printCode(stripExpressionTypes(expression));

function isNullish(node: Node): boolean {
  return t.isNullLiteral(node) || t.isIdentifier(node, { name: 'undefined' });
}

function isNamed(node: Node, name: string | null): boolean {
  return name !== null && t.isIdentifier(node, { name });
}

function attributeValue(attribute: JSXAttribute): Expression | null {
  const { value } = attribute;
  if (value === null || value === undefined) return t.booleanLiteral(true);
  if (t.isStringLiteral(value)) return value;
  if (t.isJSXExpressionContainer(value) && t.isExpression(value.expression)) return value.expression;
  return refuse(`attribute value of kind ${value.type}`);
}

function renderSpread(attribute: JSXSpreadAttribute, host: ITemplateHost): string | null {
  // The rest of the props reaches the root through Vue's attribute fallthrough
  if (isNamed(attribute.argument, host.restName)) return null;
  return `v-bind="${quoted(expressionCode(attribute.argument))}"`;
}

function renderAttribute(attribute: JSXAttribute, host: ITemplateHost): string | null {
  if (!t.isJSXIdentifier(attribute.name)) return refuse('namespaced JSX attribute');
  const name = attribute.name.name;
  const value = attributeValue(attribute);
  if (value === null) return null;
  if (name === REF_PROP) {
    return isNamed(value, host.refName) ? null : refuse('a ref other than the forwarded one');
  }
  if (t.isStringLiteral(value) && name !== KEY_PROP) return `${name}="${quoted(value.value)}"`;
  if (EVENT_PROP.test(name)) {
    const handler = isFunctionValue(value) ? host.hoist(name, value) : expressionCode(value);
    return `@${kebab(name.slice(2)).slice(1)}="${quoted(handler)}"`;
  }
  return `:${name}="${quoted(expressionCode(value))}"`;
}

function renderAttributes(element: JSXElement, host: ITemplateHost): string {
  const rendered = element.openingElement.attributes.map((attribute) =>
    t.isJSXSpreadAttribute(attribute)
      ? renderSpread(attribute, host)
      : renderAttribute(attribute, host),
  );
  return rendered.filter((each) => each !== null).map((each) => ` ${each}`).join('');
}

function withCondition(lines: string[], condition: string | null, depth: number): string[] {
  if (condition === null) return lines;
  const [only] = lines;
  if (lines.length === 1 && only !== undefined) {
    return [only.replace(/^(\s*<[\w-]+)/, `$1 v-if="${quoted(condition)}"`)];
  }
  const pad = INDENT.repeat(depth);
  return [`${pad}<template v-if="${quoted(condition)}">`, ...lines, `${pad}</template>`];
}

function renderContainer(container: JSXExpressionContainer, host: ITemplateHost, depth: number) {
  const { expression } = container;
  if (t.isJSXEmptyExpression(expression)) return [];
  if (isNamed(expression, host.childrenName)) return [`${INDENT.repeat(depth)}<slot />`];
  return renderExpression(expression, host, depth, null);
}

function renderExpression(
  expression: Expression,
  host: ITemplateHost,
  depth: number,
  condition: string | null,
): string[] {
  if (t.isConditionalExpression(expression) && isNullish(expression.alternate)) {
    const test = expressionCode(expression.test);
    return renderExpression(expression.consequent, host, depth, test);
  }
  if (t.isLogicalExpression(expression, { operator: '&&' })) {
    return renderExpression(expression.right, host, depth, expressionCode(expression.left));
  }
  if (isNamed(expression, host.childrenName)) {
    return withCondition([`${INDENT.repeat(depth)}<slot />`], condition, depth);
  }
  if (t.isJSXElement(expression)) {
    return withCondition(renderElement(expression, host, depth), condition, depth);
  }
  if (t.isJSXFragment(expression)) {
    return withCondition(renderChildren(expression.children, host, depth), condition, depth);
  }
  const text = [`${INDENT.repeat(depth)}{{ ${expressionCode(expression)} }}`];
  return withCondition(text, condition, depth);
}

function renderChildren(children: JSXElement['children'], host: ITemplateHost, depth: number) {
  return children.flatMap((child): string[] => {
    if (t.isJSXText(child)) {
      const text = child.value.replace(/\s+/g, ' ').trim();
      return text === '' ? [] : [`${INDENT.repeat(depth)}${text}`];
    }
    if (t.isJSXExpressionContainer(child)) return renderContainer(child, host, depth);
    if (t.isJSXElement(child)) return renderElement(child, host, depth);
    if (t.isJSXFragment(child)) return renderChildren(child.children, host, depth);
    return refuse(`JSX child of kind ${child.type}`);
  });
}

// A context Provider leaves no element: its value is provided in setup and its children stay
function renderProvider(element: JSXElement, context: string, host: ITemplateHost, depth: number) {
  const valueAttribute = element.openingElement.attributes.find(
    (each): each is JSXAttribute => t.isJSXAttribute(each) && t.isJSXIdentifier(each.name, { name: VALUE_PROP }),
  );
  const value = valueAttribute ? attributeValue(valueAttribute) : null;
  if (value === null) return refuse(`${context}.Provider without a value`);
  host.provide(context, value);
  return renderChildren(element.children, host, depth);
}

function spreadsRest(element: JSXElement, host: ITemplateHost): boolean {
  return element.openingElement.attributes.some(
    (each) => t.isJSXSpreadAttribute(each) && isNamed(each.argument, host.restName),
  );
}

// `{...rest}` carries `children` when the props pattern left it in: the default slot goes there
function elementChildren(element: JSXElement, host: ITemplateHost, depth: number): string[] {
  const isRestSpread = spreadsRest(element, host);
  if (isRestSpread && depth !== 1) return refuse('rest props spread below the root element');
  const carriesChildren = isRestSpread && host.childrenName === null && element.children.length === 0;
  if (carriesChildren) return [`${INDENT.repeat(depth + 1)}<slot />`];
  return renderChildren(element.children, host, depth + 1);
}

function renderElement(element: JSXElement, host: ITemplateHost, depth: number): string[] {
  const tag = host.tagOf(element.openingElement.name);
  if (tag.kind === TAG_KIND.provider) return renderProvider(element, tag.context, host, depth);
  const open = tag.kind === TAG_KIND.native ? `component is="${tag.viewName}"` : tag.name;
  const close = tag.kind === TAG_KIND.native ? 'component' : tag.name;
  const pad = INDENT.repeat(depth);
  const attributes = renderAttributes(element, host);
  const children = elementChildren(element, host, depth);
  if (children.length === 0) return [`${pad}<${open}${attributes} />`];
  return [`${pad}<${open}${attributes}>`, ...children, `${pad}</${close}>`];
}

export function jsxToTemplate(returned: Expression, host: ITemplateHost): string {
  const lines = renderExpression(returned, host, 1, null);
  return ['<template>', ...lines, '</template>', ''].join('\n');
}
