// One lightningcss selector component at a time, folded into the builder

import type { SelectorComponent } from 'lightningcss';
import {
  drop,
  pushToken,
  setCombinator,
  takeState,
  type IBuilder,
} from './selector-builder.ts';
import { consumePayload } from './selector-payload.ts';
import { stateKeyOf } from './selector-states.ts';
import { COMBINATOR, type ISelectorCombinator } from './selector-types.ts';

type IPseudoClass = Extract<SelectorComponent, { type: 'pseudo-class' }>;
type IPseudoElement = Extract<SelectorComponent, { type: 'pseudo-element' }>;
type IDeepPseudoElement = 'v-deep' | 'ng-deep';

// The two wrappers, spelled the way lightningcss reports their name
const WRAPPER = { global: 'global', deep: 'deep' } as const;

const CLASS_COMPONENT = 'class';

// Every component type, so a shape lightningcss does not produce is told apart from one it does
const SELECTOR_COMPONENT_TYPES = [
  'combinator',
  'universal',
  'namespace',
  'type',
  'id',
  CLASS_COMPONENT,
  'attribute',
  'pseudo-class',
  'pseudo-element',
  'nesting',
] as const satisfies readonly SelectorComponent['type'][];

// `>>>` and `/deep/` differ only in spelling, the rest of the combinators drop the rule
const COMBINATORS = new Map<string, ISelectorCombinator>([
  ['descendant', COMBINATOR.descendant],
  ['child', COMBINATOR.child],
  ['next-sibling', COMBINATOR.nextSibling],
  ['later-sibling', COMBINATOR.laterSibling],
  ['deep-descendant', COMBINATOR.deep],
  [WRAPPER.deep, COMBINATOR.deep],
]);

// They arrive as a custom pseudo-element between two descendant combinators
const DEEP_PSEUDO_ELEMENTS = [
  'v-deep',
  'ng-deep',
] as const satisfies readonly IDeepPseudoElement[];

function isSelectorComponent(value: unknown): value is SelectorComponent {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    SELECTOR_COMPONENT_TYPES.some(type => type === value.type)
  );
}

function pseudoName(component: IPseudoClass | IPseudoElement): string {
  return component.kind === 'custom' || component.kind === 'custom-function'
    ? component.name
    : component.kind;
}

// `:global(X)` says only that the name lives outside the scope, `:deep(X)` that the match may
// cross a scope boundary, so the gap into X is `deep`
function consumeWrapper(
  builder: IBuilder,
  name: string,
  args: readonly unknown[],
): boolean {
  if (name === WRAPPER.global) {
    consumePayload(builder, args, ':global()');
    return true;
  }
  if (name === WRAPPER.deep) {
    setCombinator(builder, COMBINATOR.deep);
    consumePayload(builder, args, ':deep()');
    return true;
  }
  return false;
}

function consumePseudoClass(builder: IBuilder, component: IPseudoClass): void {
  // The parsed `:global(X)` of `cssModules` mode: its payload is an ordinary component array
  if (component.kind === WRAPPER.global) {
    consumeSelector(builder, component.selector);
    return;
  }
  // `:root` is where custom properties are declared, so it is reported apart from a real drop
  if (component.kind === 'root') {
    drop(builder, 'root', 'root');
    return;
  }
  if (
    component.kind === 'custom-function' &&
    consumeWrapper(builder, component.name, component.arguments)
  ) {
    return;
  }
  const name = pseudoName(component);
  const stateKey = stateKeyOf(name);
  if (stateKey !== null) {
    takeState(builder, name, stateKey);
    return;
  }
  builder.specificity[1]++;
  drop(builder, 'pseudo-class', name);
}

function consumePseudoElement(
  builder: IBuilder,
  component: IPseudoElement,
): void {
  const isDeep =
    component.kind === 'custom' &&
    DEEP_PSEUDO_ELEMENTS.some(name => name === component.name);
  if (isDeep) {
    setCombinator(builder, COMBINATOR.deep);
    return;
  }
  builder.specificity[2]++;
  drop(builder, 'pseudo-element', pseudoName(component));
}

function consumeCombinator(builder: IBuilder, value: string): void {
  const combinator = COMBINATORS.get(value);
  if (combinator === undefined) {
    drop(builder, 'unsupported', value);
    return;
  }
  setCombinator(builder, combinator);
}

function consumeComponent(
  builder: IBuilder,
  component: SelectorComponent,
): void {
  switch (component.type) {
    case CLASS_COMPONENT:
      builder.specificity[1]++;
      pushToken(builder, component.name);
      break;
    case 'combinator':
      consumeCombinator(builder, component.value);
      break;
    case 'id':
      builder.specificity[0]++;
      drop(builder, 'id', `#${component.name}`);
      break;
    case 'type':
      builder.specificity[2]++;
      drop(builder, 'element', component.name);
      break;
    case 'universal':
      drop(builder, 'universal', '*');
      break;
    case 'attribute':
      builder.specificity[1]++;
      drop(builder, 'attribute', `[${component.name}]`);
      break;
    case 'pseudo-class':
      consumePseudoClass(builder, component);
      break;
    case 'pseudo-element':
      consumePseudoElement(builder, component);
      break;
    // `namespace` (`ns|div`) and `nesting` (`&`) need context this compiler does not have
    default:
      drop(builder, 'unsupported', component.type);
      break;
  }
}

export function consumeSelector(
  builder: IBuilder,
  selector: readonly unknown[],
): void {
  for (const component of selector) {
    if (isSelectorComponent(component)) {
      consumeComponent(builder, component);
    } else {
      drop(builder, 'unsupported', String(component));
    }
  }
}
