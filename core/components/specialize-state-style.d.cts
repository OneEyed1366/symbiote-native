// Hand-written types for the loose `.cjs` above — Babel/Metro transforms cannot import `.ts`, so
// the implementation stays CommonJS and its shape is declared here.
import type * as babelTypes from '@babel/types';

export interface ISpecializedStateStyle {
  base: babelTypes.ObjectExpression;
  active: babelTypes.ObjectExpression;
}

export declare function specializeStateStyle(
  expression: babelTypes.Node,
  types: typeof babelTypes,
): ISpecializedStateStyle | null;

export declare const STATE_KEYS: ReadonlySet<string>;
