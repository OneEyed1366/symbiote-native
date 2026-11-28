// Prints ported AST back to source, with or without its TypeScript syntax
import { createRequire } from 'node:module';
import type { GeneratorOptions } from '@babel/generator';
import type { NodePath } from '@babel/traverse';
import type { Expression, Node, Statement } from '@babel/types';
import { babelTypes as t, traverse } from '../source-graph.ts';

const generate: (node: Node, options?: GeneratorOptions) => { code: string } =
  createRequire(import.meta.url)('@babel/generator').default;

export const printCode = (node: Node): string => generate(node, { comments: false }).code;

const TYPE_FIELDS = ['typeAnnotation', 'returnType', 'typeParameters', 'typeArguments'] as const;
type ITypeField = (typeof TYPE_FIELDS)[number];

function unwrapTypeExpression(path: NodePath): void {
  const { node } = path;
  const isWrapper =
    t.isTSAsExpression(node) ||
    t.isTSSatisfiesExpression(node) ||
    t.isTSNonNullExpression(node) ||
    t.isTSTypeAssertion(node);
  if (isWrapper) path.replaceWith(node.expression);
}

function dropTypeFields(path: NodePath): void {
  for (const field of TYPE_FIELDS) {
    const key: ITypeField = field;
    if (key in path.node) Reflect.set(path.node, key, null);
  }
}

function stripInside(holder: Statement): void {
  traverse(holder, {
    noScope: true,
    enter(path) {
      unwrapTypeExpression(path);
      dropTypeFields(path);
    },
  });
}

// Drops every annotation and cast, `as const` too: an SFC script carries no types yet
export function stripExpressionTypes(expression: Expression): Expression {
  const holder = t.expressionStatement(t.cloneNode(expression, true));
  stripInside(holder);
  return holder.expression;
}

export function stripStatementTypes(statement: Statement): Statement {
  const holder = t.blockStatement([t.cloneNode(statement, true)]);
  stripInside(holder);
  return holder.body[0] ?? statement;
}

// Unwraps `as`, `satisfies` and `!` in place, other types stay: a `.ts` output keeps them
export function stripCasts(node: Node): void {
  traverse(node, { noScope: true, enter: unwrapTypeExpression });
}
