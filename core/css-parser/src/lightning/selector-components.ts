import type { Combinator, SelectorComponent } from 'lightningcss';
import {
  drop,
  pushToken,
  setCombinator,
  type IBuilder,
} from './selector-builder.ts';
import { isSelectorComponent } from './selector-guards.ts';
import { consumePayload } from './selector-payload.ts';
import { COMBINATOR, type ISelectorCombinator } from './selector-types.ts';
import { applyStateToken, STATE_PSEUDO_CLASS } from './state-token.ts';

type IPseudoClass = Extract<SelectorComponent, { type: 'pseudo-class' }>;
type IPseudoElement = Extract<SelectorComponent, { type: 'pseudo-element' }>;

const COMPONENT = {
  class: 'class',
  combinator: 'combinator',
  id: 'id',
  type: 'type',
  universal: 'universal',
  attribute: 'attribute',
  pseudoClass: 'pseudo-class',
  pseudoElement: 'pseudo-element',
} as const;

const KIND = {
  custom: 'custom',
  customFunction: 'custom-function',
  global: 'global',
  root: 'root',
} as const;

// Vue and Angular spell the deep combinator as a pseudo-element
const DEEP_PSEUDO_ELEMENT_NAMES = ['v-deep', 'ng-deep'] as const;
type IDeepPseudoElementName = (typeof DEEP_PSEUDO_ELEMENT_NAMES)[number];
const DEEP_PSEUDO_ELEMENTS: ReadonlySet<string> =
  new Set<IDeepPseudoElementName>(DEEP_PSEUDO_ELEMENT_NAMES);

// Both wrappers are read by hand, since lightningcss implements neither
const WRAPPER_NAME = { global: 'global', deep: 'deep' } as const;

// The combinators this pipeline can act on, the rest drop the rule
function combinatorFor(value: Combinator): ISelectorCombinator | null {
  switch (value) {
    case 'descendant':
    case 'child':
    case 'next-sibling':
    case 'later-sibling':
      return value;
    // `>>>` and `/deep/` differ only in spelling
    case 'deep-descendant':
    case 'deep':
      return COMBINATOR.deep;
    default:
      return null;
  }
}

function pseudoName(component: IPseudoClass | IPseudoElement): string {
  return component.kind === KIND.custom ||
    component.kind === KIND.customFunction
    ? component.name
    : component.kind;
}

// Neither wrapper adds specificity, the payload's classes carry it
// `:deep(X)` reaches through a scope boundary, so the gap into X is `deep`
function consumeWrapper(
  builder: IBuilder,
  name: string,
  args: readonly unknown[],
): boolean {
  if (name === WRAPPER_NAME.global) {
    consumePayload(builder, args, `:${name}()`);
    return true;
  }
  if (name === WRAPPER_NAME.deep) {
    setCombinator(builder, COMBINATOR.deep);
    consumePayload(builder, args, `:${name}()`);
    return true;
  }
  return false;
}

function consumeCombinator(builder: IBuilder, value: Combinator): void {
  const combinator = combinatorFor(value);
  if (combinator === null) drop(builder, 'unsupported', value);
  else setCombinator(builder, combinator);
}

// `:root` declares custom properties, which `collectRootVariables` already read
// It gets its own reason so the caller stays silent unless the rule also paints
function consumePseudoClass(builder: IBuilder, component: IPseudoClass): void {
  // With `cssModules` on, `:global(X)` arrives parsed as an ordinary component array
  if (component.kind === KIND.global) {
    consumeSelector(builder, component.selector);
    return;
  }
  if (component.kind === KIND.root) {
    drop(builder, 'root', KIND.root);
    return;
  }
  const isWrapper =
    component.kind === KIND.customFunction &&
    consumeWrapper(builder, component.name, component.arguments);
  if (isWrapper) return;

  // `:not()` and `:is()` take their argument's specificity, but they drop here regardless
  builder.specificity[1]++;
  if (component.kind === STATE_PSEUDO_CLASS) {
    applyStateToken(builder);
    return;
  }
  drop(builder, 'pseudo-class', pseudoName(component));
}

function consumePseudoElement(
  builder: IBuilder,
  component: IPseudoElement,
): void {
  if (
    component.kind === KIND.custom &&
    DEEP_PSEUDO_ELEMENTS.has(component.name)
  ) {
    setCombinator(builder, COMBINATOR.deep);
    return;
  }
  builder.specificity[2]++;
  drop(builder, 'pseudo-element', pseudoName(component));
}

function consumeComponent(
  builder: IBuilder,
  component: SelectorComponent,
): void {
  switch (component.type) {
    case COMPONENT.class:
      builder.specificity[1]++;
      pushToken(builder, component.name);
      return;
    case COMPONENT.combinator:
      consumeCombinator(builder, component.value);
      return;
    case COMPONENT.id:
      builder.specificity[0]++;
      drop(builder, 'id', `#${component.name}`);
      return;
    case COMPONENT.type:
      builder.specificity[2]++;
      drop(builder, 'element', component.name);
      return;
    case COMPONENT.universal:
      drop(builder, 'universal', '*');
      return;
    case COMPONENT.attribute:
      builder.specificity[1]++;
      drop(builder, 'attribute', `[${component.name}]`);
      return;
    case COMPONENT.pseudoClass:
      consumePseudoClass(builder, component);
      return;
    case COMPONENT.pseudoElement:
      consumePseudoElement(builder, component);
      return;
    // `namespace` (`ns|div`) and `nesting` (`&`) need context this compiler lacks
    default:
      drop(builder, 'unsupported', component.type);
  }
}

export function consumeSelector(
  builder: IBuilder,
  selector: readonly unknown[],
): void {
  for (const component of selector) {
    if (!isSelectorComponent(component)) {
      drop(builder, 'unsupported', String(component));
      continue;
    }
    consumeComponent(builder, component);
  }
}
