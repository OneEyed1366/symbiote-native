// `primitive-suite.ts` through the Angular adapter, in the shape an app ships: `SYMBIOTE_ELEMENTS`
// imported, one `@for` over the tag. One screen component per primitive, compiled from a plain
// declarative template — the fixture writes the template an app would, it does not rewrite one.
//
// RUN ON `build-release` with `SYMBIOTE_ITEST_BYTECODE=1`, one arm per process.

import '@angular/compiler';
import { Component, signal, type Type } from '@angular/core';
import { SYMBIOTE_ELEMENTS, mount, unmount } from '@symbiote-native/angular';

import {
  CHILD_STYLE,
  runPrimitiveSuite,
  type IPrimitiveSpec,
  type IPrimitiveState,
} from './primitive-suite';
import { describe, flushTimers, it, mounted, report } from './harness';

const ROOT_TAG = 1;

// Each tag's measured `createKB` plus 10%. Its own table т.к. Angular reads 1.2-1.7x the Vue arm
// on every tag, which is the framework's own cost and not the engine's
const CREATE_BUDGET_KB: ReadonlyMap<string, number> = new Map([
  ['view', 2_400],
  ['text', 3_170],
  ['image', 2_780],
  ['image-background', 3_360],
  ['pressable', 2_390],
  ['touchable-opacity', 5_230],
  ['touchable-highlight', 4_330],
  ['touchable-native-feedback', 3_910],
  ['touchable-without-feedback', 4_030],
  ['button', 6_000],
  ['text-input', 5_200],
  ['text-input-multiline', 5_200],
  ['switch', 3_750],
  ['activity-indicator', 3_320],
  ['scroll-view', 4_020],
  ['horizontal-scroll-view', 4_020],
  ['safe-area-view', 2_510],
  ['modal', 280],
  ['refresh-control', 5_500],
]);

function templateFor(spec: IPrimitiveSpec): string {
  const bindings = [...Object.keys(spec.props), 'style']
    .map(name => `[${name}]="item.props['${name}']"`)
    .join(' ');
  const inner =
    spec.child === 'label'
      ? '{{ item.label }}'
      : spec.child === 'view'
        ? '<view [style]="childStyle"></view>'
        : '';
  const element = `<${spec.tag} ${bindings}>${inner}</${spec.tag}>`;
  const item =
    spec.parent === undefined
      ? element
      : `<${spec.parent}>${element}</${spec.parent}>`;
  return `<view [style]="{ flex: 1 }">@for (item of state().items; track item.id) {${item}}</view>`;
}

type IScreen = { readonly state: ReturnType<typeof signal<IPrimitiveState>> };

let current:
  { spec: IPrimitiveSpec; screen: IScreen; commit: () => void } | undefined;

function screenFor(spec: IPrimitiveSpec): {
  type: Type<unknown>;
  created: () => IScreen;
} {
  let instance: IScreen | undefined;
  class PrimitiveScreen {
    readonly state = signal<IPrimitiveState>({ items: [] });
    readonly childStyle = CHILD_STYLE;
    constructor() {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      instance = this;
    }
  }
  Component({
    selector: `primitive-screen-${spec.tag}`,
    standalone: true,
    imports: [SYMBIOTE_ELEMENTS],
    template: templateFor(spec),
  })(PrimitiveScreen);
  return {
    type: PrimitiveScreen,
    created: () => {
      if (instance === undefined)
        throw new Error(`${spec.tag} screen never rendered`);
      return instance;
    },
  };
}

const settle = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, 0);
    flushTimers();
  });

describe('every primitive through the Angular adapter', () => {
  it('runs the primitive steps', async () => {
    await runPrimitiveSuite({
      name: 'ng',
      chrome: 3,
      createBudgetKB: CREATE_BUDGET_KB,
      apply: async (spec, state) => {
        if (current?.spec !== spec) {
          if (current !== undefined) {
            unmount(ROOT_TAG);
            mounted();
          }
          const screen = screenFor(spec);
          const surface = mount(ROOT_TAG, screen.type);
          await settle();
          surface.commit();
          mounted();
          current = {
            spec,
            screen: screen.created(),
            commit: () => surface.commit(),
          };
        }
        current.screen.state.set(state);
        await settle();
        current.commit();
      },
    });
  });
});

report();
