// The shape of what a node asks of its element, apart from the code that works it out so the rule
// sets and the composer can both name it

import type { ICssDeclarations } from './css-values';
import type { IAttributes } from './dom-attributes';

export type IDomSpec = {
  classNames: string[];
  css: ICssDeclarations;
  attributes: IAttributes;
};
