// `babel-lower-host-primitives.cjs`'s own tests. The shared fixture table
// (`lowering-parity.test.ts`, alongside this file) answers the cross-adapter QUESTION; this file
// pins the ANGULAR-SPECIFIC mechanism: the `dependencies` removal, the all-or-nothing rule per tag
// name, self-closing tags, and — the strongest proof available without a real device — that the
// rewritten metadata actually LINKS to a plain host-element Ivy instruction, not merely to text
// that looks lowered.
//
// Snippets below are hand-built to the EXACT shape a real `ngc --compilationMode partial` compile
// emits for `<View>`/`<Text>` — verified against a real compile of a throwaway component
// (2026-08-31, not committed) before writing these by hand, the same way this project verifies any
// claim about a compiler's output rather than assuming it. No other transform's suite spawns a real
// compiler CLI per case either (Solid/Vue hand-write JSX/SFC snippets) — the ngc dependency is
// exercised once, manually, to derive the shape; every case here re-uses it.
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { transformSync } from '@babel/core';

const require_ = createRequire(import.meta.url);
const lowerHostPrimitives = require_('./babel-lower-host-primitives.cjs');
const linker = require_('./babel-linker.cjs');

function declareComponent(template: string, dependencies: string): string {
  return `
import * as i0 from '@angular/core';
export class Probe {
  static ɵcmp = i0.ɵɵngDeclareComponent({
    minVersion: "14.0.0",
    version: "22.0.8",
    type: Probe,
    isStandalone: true,
    selector: 'probe',
    ngImport: i0,
    template: \`${template}\`,
    isInline: true,
    dependencies: [${dependencies}],
  });
}
`;
}

const VIEW_DEP =
  '{ kind: "component", type: View, selector: "symbiote-view, View" }';
const TEXT_DEP =
  '{ kind: "component", type: Text, selector: "symbiote-text, Text" }';

function lower(source: string): string {
  return (
    transformSync(source, {
      filename: 'probe.js',
      babelrc: false,
      configFile: false,
      plugins: [lowerHostPrimitives],
    })?.code ?? ''
  );
}

describe('lowers View and Text', () => {
  it('rewrites both tags and empties the dependencies array', () => {
    const code = lower(
      declareComponent(
        '<View class="x"><Text>hi</Text></View>',
        `${VIEW_DEP}, ${TEXT_DEP}`,
      ),
    );
    expect(code).toContain(
      'template: `<symbiote-view class="x"><symbiote-text>hi</symbiote-text></symbiote-view>`',
    );
    expect(code).toMatch(/dependencies:\s*\[\s*\]/);
  });

  it('leaves a template untouched when it names neither tag', () => {
    const source = declareComponent('<FlatList></FlatList>', '');
    expect(lower(source)).toBe(
      transformSync(source, {
        filename: 'probe.js',
        babelrc: false,
        configFile: false,
        plugins: [],
      })?.code,
    );
  });
});

describe('self-closing tags', () => {
  it('rewrites a self-closing View with no separate close tag to touch', () => {
    const code = lower(declareComponent('<View [testID]="x" />', VIEW_DEP));
    expect(code).toContain('template: `<symbiote-view [testID]="x" />`');
  });
});

describe('the all-or-nothing rule, scoped per tag name', () => {
  it('refuses every View in the template when ONE carries #ref, but still lowers Text', () => {
    const code = lower(
      declareComponent(
        '<View #a class="x"></View><View class="y"></View><Text>hi</Text>',
        `${VIEW_DEP}, ${TEXT_DEP}`,
      ),
    );
    // Neither View was rewritten — not just the one with #ref.
    expect(code).toContain('<View #a class="x"></View><View class="y"></View>');
    expect(code).toContain('symbiote-text');
    expect(code).toContain('type: View');
    expect(code).not.toContain('type: Text');
  });

  it('lowers every View when NONE carries #ref, even with several occurrences', () => {
    const code = lower(
      declareComponent(
        '<View class="a"></View><View class="b"></View>',
        VIEW_DEP,
      ),
    );
    expect(code).not.toContain('<View');
    expect((code.match(/symbiote-view/g) ?? []).length).toBe(4); // 2 open + 2 close tags
    expect(code).toMatch(/dependencies:\s*\[\s*\]/);
  });
});

describe('leaves a template it cannot cleanly parse alone', () => {
  it('does not touch a template with a real syntax error', () => {
    const source = declareComponent('<View [style]="a +"></View>', VIEW_DEP);
    expect(lower(source)).toContain('<View [style]="a +">');
  });
});

// THE STRONGEST PROOF AVAILABLE SHORT OF A DEVICE: chain the REAL linker (`babel-linker.cjs`, the
// same plugin `examples/angular`'s own `babel.config.js` runs next) directly after this one, in
// the SAME transform call, and read the compiled Ivy TEMPLATE FUNCTION it produces. `schemas`
// (`CUSTOM_ELEMENTS_SCHEMA`) never reaches this call at all — verified separately, by compiling a
// component that DOES declare it and finding no `schemas` field in the emitted
// `ɵɵngDeclareComponent` — so the linker's behavior here is decided entirely by `dependencies` and
// `template`, exactly the two fields this plugin edits.
describe('links to a genuine host-element instruction, not merely lowered-looking text', () => {
  it('emits ɵɵdomElementStart for the intrinsic tag, with no dependencies array at all', () => {
    const source = declareComponent(
      '<View class="x"><Text>{{ label }}</Text></View>',
      `${VIEW_DEP}, ${TEXT_DEP}`,
    );
    const lowered = lower(source);
    const linked =
      transformSync(lowered, {
        filename: 'probe.js',
        babelrc: false,
        configFile: false,
        plugins: [linker],
      })?.code ?? '';

    expect(linked).toContain('ɵɵdomElementStart(0, "symbiote-view"');
    expect(linked).toContain('symbiote-text');
    // The un-lowered control: the SAME source, without this plugin, links to a component-bound
    // element instruction and carries a real `dependencies` array on the compiled def.
    const linkedPlain =
      transformSync(source, {
        filename: 'probe.js',
        babelrc: false,
        configFile: false,
        plugins: [linker],
      })?.code ?? '';
    expect(linkedPlain).toContain('ɵɵelementStart(0, "View"');
    expect(linkedPlain).toContain('dependencies: [View, Text]');
    // And the lowered link carries NEITHER — the property this whole mechanism rests on.
    expect(linked).not.toContain('dependencies:');
    expect(linked).not.toContain('ɵɵelementStart(0, "View"');
  });
});

// The block above links the plugin's PRINTED output — two babel passes, with the text laundered
// through the generator in between. An app runs one pass with both plugins in `babel.config.js`,
// and that is not the same thing: Angular's linker reads an inline template by slicing the FILE'S
// SOURCE TEXT at the node's byte range (`templateFromPartialCode`), so it never sees a string this
// plugin rewrote in the AST — while its `dependencies` edit, an ordinary array read, lands.
//
// Half-applied is worse than not applied: the primitives are gone from `dependencies` and the tags
// are still `<View>`, so they match no directive, no component template runs, and the screen loses
// its styles and its handlers with every test green. Shipped that way (device, 2026-09-02).
describe('the app runs ONE babel pass, and the linker reads the file text', () => {
  const source = declareComponent(
    '<View class="x"><Text>{{ label }}</Text></View>',
    `${VIEW_DEP}, ${TEXT_DEP}`,
  );

  it('throws rather than half-apply when the linker shares the pass', () => {
    expect(() =>
      transformSync(source, {
        filename: 'probe.js',
        babelrc: false,
        configFile: false,
        plugins: [lowerHostPrimitives, linker],
      }),
    ).toThrow(/same Babel pass/);
  });

  it('lowers when the rewrite reaches the file TEXT, which is what the Metro transformer does', () => {
    const prePassed = lower(source);
    const linked =
      transformSync(prePassed, {
        filename: 'probe.js',
        babelrc: false,
        configFile: false,
        plugins: [linker],
      })?.code ?? '';

    expect(linked).toContain('symbiote-view');
    expect(linked).not.toContain('"View"');
  });
});

// A binding only the Angular COMPONENT can answer. `valueChange` is derived from `change` inside
// TextInput/Switch so `[(value)]` works; no behavior emits it, so a lowered element registers a
// listener nothing fires — and the native field echoes keystrokes on its own, so the input looks
// alive while every value read off it stays frozen. Device-diagnosed 2026-09-02.
describe('[(value)] lowers, and [(ngModel)] does not', () => {
  const TEXT_INPUT_DEP =
    '{ kind: "component", type: TextInput, selector: "symbiote-text-input, TextInput" }';

  // `<`-anchored: the dependency entry's own `selector: "symbiote-text-input, TextInput"` puts the
  // bare name in the output whether or not anything lowered, so a substring oracle reads `lower`
  // for every case — including the refusal this block exists to check.
  const lowersTag = (template: string): boolean =>
    lower(declareComponent(template, TEXT_INPUT_DEP)).includes(
      '<symbiote-text-input',
    );

  // `[(value)]` is how every Angular template writes a Switch or a TextInput. Refusing it, which is
  // what this transform did for a few hours, took both primitives off the lowered path entirely —
  // an optimisation that asks consumers to write differently does not exist. The lowered element
  // answers it through `node.props.onValueChange`; see the renderer's `listen()`.
  it('lowers [(value)] and its desugared (valueChange)', () => {
    expect(lowersTag('<TextInput [(value)]="name" />')).toBe(true);
    expect(lowersTag('<TextInput (valueChange)="onText($event)" />')).toBe(
      true,
    );
  });

  it('refuses [(ngModel)] — an element cannot be a ControlValueAccessor', () => {
    expect(lowersTag('<TextInput [(ngModel)]="name" />')).toBe(false);
  });

  it('lowers a one-way [value] with the (change) the behavior owns', () => {
    expect(
      lowersTag('<TextInput [value]="name" (change)="onChange($event)" />'),
    ).toBe(true);
  });
});

// `[style]` compiles to Angular's styling instructions, which decompose the value through its CSS
// engine. That engine cannot represent an RN StyleProp: an ARRAY makes `applyStyling` use each
// element as a style KEY and throw `prop.indexOf is not a function` inside change detection,
// killing the tick for the whole app. A component input shadows the instruction, so lowering is
// what moves the binding across that line. Device-diagnosed 2026-09-02 on ImageBackground.
describe('keeps a style binding away from Angular styling instructions', () => {
  const loweredView = (template: string): string =>
    lower(declareComponent(template, VIEW_DEP));

  it('renames a bound [style] rather than refusing, so the element still lowers', () => {
    const out = loweredView('<View [style]="s"></View>');
    expect(out).toContain('<symbiote-view');
    expect(out).toContain('[symbioteStyle]="s"');
    // The name is the whole point: left as `style` it compiles to ɵɵstyleMap, which decomposes an
    // RN StyleProp through Angular's CSS engine and throws on an array.
    expect(out).not.toContain('[style]=');
  });

  it('renames it on Pressable too, alongside the state-style specialisation', () => {
    const out = lower(
      declareComponent(
        '<Pressable [style]="s"></Pressable>',
        '{ kind: "component", type: Pressable, selector: "symbiote-pressable, Pressable" }',
      ),
    );
    expect(out).toContain('[symbioteStyle]=');
    expect(out).toContain('[activeStyle]=');
    expect(out).not.toContain('[style]=');
  });

  it('refuses a STATIC style attribute — its value is CSS text, not a StyleProp', () => {
    expect(loweredView('<View style="color: red"></View>')).not.toContain(
      '<symbiote-view',
    );
  });

  it('still lowers a [class] binding — ɵɵclassMap routes through addClass/removeClass', () => {
    expect(loweredView('<View [class]="c"></View>')).toContain(
      '<symbiote-view',
    );
  });
});
