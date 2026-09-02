// Compile-time lowering of `<View>`/`<Text>`/`<Pressable>`/`<TextInput>` to their intrinsic tags —
// the automated form of the hand-written technique already proven in
// examples/angular/src/screens/BenchmarkScreen.ts's `LoweredBenchmarkRows` (33.2% headless cut on
// Create-1000, angular-adapter-change-detection §19). That technique needs an author to spell the
// intrinsic tag AND keep the wrapper out of the template's own `imports` — this plugin does both
// mechanically, for any ordinary app component.
//
// THE SEAM. Runs in the SAME Babel pass as `babel-register-composed.cjs`, BEFORE the linker
// (`babel-linker.cjs`) — Stage A (`ngc --compilationMode partial`) has already emitted
// `ɵɵngDeclareComponent({ template: \`...\`, dependencies: [...] })`, and at THIS stage `template`
// is a plain string and `dependencies` a plain array the linker has not yet turned into Ivy. Two
// edits on that ONE object, matched by the same CallExpression:
//
//   template      `<View class="x">`      ->  `<symbiote-view class="x">`
//   dependencies  [{ type: View, selector: "symbiote-view, View" }, ...]  ->  entry REMOVED
//
// The second edit is not cleanup, it IS the mechanism. `dependencies`' `selector` string is BOTH
// spellings of View's dual selector at once (`'symbiote-view, View'` — see
// `adapters/angular/src/primitives/index.ts`), so leaving the entry in place while rewriting only
// the template text makes `symbiote-view` keep resolving to the real component: a rewritten tag
// with its dependency intact is not lowered, it looks lowered and silently is not. Confirmed
// against the installed compiler-cli (2026-08-31): removing a component's `ɵɵngDeclareComponent`
// `dependencies` entry with NO corresponding `schemas` change still links and runs — `schemas`
// (`CUSTOM_ELEMENTS_SCHEMA`) is consulted only by Stage A's ngtsc type-checker against the
// ORIGINAL source, never by the linker against this declared metadata, so an ordinary app
// component needs no `schemas`/`CUSTOM_ELEMENTS_SCHEMA` change at all to become lowerable — unlike
// `LoweredBenchmarkRows`, which types `<symbiote-view>` directly in source and therefore DOES need
// it, for ngtsc's sake, not the linker's. `Pressable`/`TextInput` carry a SINGLE-name selector
// (`'Pressable'`, `'TextInput'`, no comma), so removing their dependency entry is the same
// single-token removal, not a dual-spelling split.
//
// WHY View/Text/Pressable/TextInput AND NOT MORE — `HOST_PRIMITIVES` lists five; `Image` is not
// here because it has no `observesState`/`intrinsicWhen` prerequisite blocking it, it is simply
// not yet done. The other four are done as of 2026-09-01:
//
//   Pressable   `observesState: true`. Landed here once two prerequisites closed. First, the
//               engine-side press machine (`registerPressableBehavior`, called from
//               `register.ts`, below). Second — RETIRED 2026-08-31, corrected here because the
//               header used to describe it as still open — the anchor-registry collision:
//               `symbiote-pressable` used to be one spelling of the COMPOSED Pressable's own dual
//               selector (`'Pressable, symbiote-pressable'`), which forced it unconditionally into
//               `ANCHOR_HOST_COMPONENTS` and made a bare lowered tag collide with its own anchor.
//               The composed selector dropped the vestigial second spelling (nothing ever rendered
//               or matched it) and `symbiote-pressable` came out of `ANCHOR_HOST_COMPONENTS`, so
//               the bare tag now resolves unambiguously to the engine-node behavior — see
//               Pressable's own `@Component` comment and `.claude/rules/host-primitive-tier.md`.
//   TextInput   `intrinsicWhen: { prop: 'multiline', intrinsic: 'symbiote-text-input-multiline' }`
//               — `multiline` selects between two DIFFERENT native views, not one view with a
//               flag, so a runtime value refuses (`REFUSAL_CATEGORIES.dynamicIntrinsicChoice`,
//               `staticTruthOf`/`intrinsicFor` below). The wrapper renders `-managed`/
//               `-multiline-managed` tags (`component-names/shared.ts`), so the LOWERED plain pair
//               never collides with a wrapper-built node the way a shared tag would have.
//
// THE REFUSAL CRITERION (agreed across cross-session work, replaces a per-category checklist): a
// compile-time refusal is owed exactly where the transform would make a decision FROM THE STATIC
// ATTRIBUTE LIST that the runtime cannot replay. A prop FOLD is never a reason to refuse — the
// engine folds by key, at commit time, on a lowered node exactly as it would on a wrapped one
// (`core/engine/src/accessibility-props.ts`'s aria fold is the reference case). Tag CHOICE is
// (TextInput's `intrinsicWhen`, above). For View/Text, with `observesState` unset, the one thing
// this criterion reaches is `#ref`:
//
//   `#ref` on a WRAPPED `<View>`/`<Text>` yields the `ViewHost`/`TextHost` COMPONENT INSTANCE
//   (`SymbiotePrimitiveHost`'s own `nativeElement` getter, `style` @Input, `ngDoCheck`) — Angular's
//   own default resolves a bare template reference to a matched component/directive instance
//   before falling back to the element. A lowered bare `<symbiote-view #ref>` matches no directive
//   (see the dependency-removal step above) and hands back the raw engine node DIRECTLY instead.
//   Same object, reached two different ways, is fine; a DIFFERENT surface is the hazard this
//   project's own `instance-bound-directive` fixture row exists for (`core/components/
//   lowering-fixtures.cjs`) — lowering must not change what an app's `ref` receives, in EITHER
//   direction. Unlike Solid (whose View/Text explicitly forward the SAME node either way, so only
//   Pressable there needs the refusal — `.claude/rules/solid-host-primitive-lowering.md`), Angular's
//   wrapper does NOT forward identically, so this refuses UNIVERSALLY here, the same width as Vue's
//   — same verdict, different per-adapter reason, which is the right shape
//   (`<prop_types_split_agnostic_vs_per_adapter>`'s "must every adapter answer identically by
//   construction" test says no). `#ref` on Pressable would ADD a handle it never had (no public
//   ref on any adapter's Pressable, per `lowering-fixtures.cjs`'s own `instance-bound-directive`
//   row) and on TextInput would SWAP its imperative handle for a bare public instance — both
//   refuse for the same reason View/Text do, so the check below applies to all four names
//   uniformly rather than needing a per-primitive allow-list the way Solid's does.
//
// THE ALL-OR-NOTHING RULE, per tag name per template. If ONE `<View>` in a template carries `#ref`
// (or, for `TextInput`, one instance has a dynamic `multiline`) and refuses, EVERY occurrence of
// that name in this SAME template stays a component — not just the refusing one.
// `dependencies`' selector covers the WHOLE template at once, so keeping the entry (because the
// refusing element still needs it) means the bare tag keeps resolving to the component everywhere
// in this template regardless of which individual tags this plugin rewrote the text of. Rewriting
// only SOME occurrences while the dependency survives is not partial coverage, it is every
// "lowered" spelling silently still being the component — the same failure shape
// `LoweredBenchmarkRows`'s own header names for the hand-written technique.
//
// STYLE ON A STATE-OBSERVING PRIMITIVE (`observesState`, Pressable only today).
// `REFUSAL_CATEGORIES.stateInTemplate` never fires here or in any transform — coverage is decided
// by INVOCATION, not by proving the shape (`core/components/lowering-fixtures.cjs`'s own header:
// "a transform that reports `refuse` here has wired substitution as the mechanism instead of as
// the optimisation"). Every `style` shape lowers; only the EMISSION differs, and
// `REFUSAL_CATEGORIES.emitStyleExpressionOnce` sets the one real constraint — an expression capable
// of doing work (a call, a computed member, a conditional…) is printed in the output exactly ONCE.
//
// Angular's template grammar cannot write an inline arrow function at all (`parseTemplate` throws
// on `[style]="({pressed}) => ({...})"`, verified 2026-08-31 — `specialisable-state-style`/
// `nested-function-state-style` are UNWRITABLE here, see `lowering-parity.test.ts`), so the
// "literal function, call it directly" bucket other transforms have simply does not exist in this
// adapter. Two buckets only:
//
//   inert       object/array/string LITERAL — provably not a function, left untouched.
//   reference   a bare identifier or a non-computed property chain (`fnStyle`, `this.a.b`) — safe
//               to print TWICE (a read, not work): `typeof (e) === 'function' ? (e)({pressed}) :
//               (e)`, split across `[style]`/`[activeStyle]`.
//   opaque      anything else (`getStyle()`, `bag[i]`, `flag ? a : b`, …) — CANNOT be read twice.
//               Angular templates cannot call an arbitrary imported function (`resolveStateStyle
//               (e)` in a template resolves to `ctx.resolveStateStyle(e)`, a component-INSTANCE
//               method lookup this transform has no component to add one to — verified against the
//               real linker, `state-style.ts`'s own header). A PIPE is the one thing that resolves
//               through `dependencies` like a component does, so this emits
//               `@let v = (e | resolveStateStyle); [style]="v.style" [activeStyle]="v.activeStyle"`
//               — `e` evaluated exactly once (`ɵɵpipeBind1`, one call), `v` read twice for free.
//
// .cjs because Babel `require()`s it directly (Metro loads it via a raw require, no transpile step
// available) and this package is otherwise ESM-flavoured.

const {
  HOST_PRIMITIVES,
  REFUSAL_CATEGORIES,
} = require('@symbiote-native/components/host-primitives');
const { parseTemplate } = require('@angular/compiler');

const SOURCE = '@symbiote-native/angular';
const PIPE_NAME = 'resolveStateStyle';
const PIPE_EXPORT = 'SymbioteStateStylePipe';
const PIPE_MODULE = `${SOURCE}/state-style`;

const LOWERABLE_NAMES = [
  'View',
  'Text',
  'Pressable',
  'TextInput',
  // Fold-only: neither sets `observesState` nor `intrinsicWhen`, so every occurrence lowers
  // through the same generic path as View/Text — no new refusal category needed.
  'Image',
  'InputAccessoryView',
  // Carries an ENGINE machine (`registerSwitchBehavior`) but sets neither `observesState` nor
  // `intrinsicWhen`, so this transform's verdict is unaffected by it — same generic path.
  'Switch',
];

// name -> a projection of the shared spec. Built once at plugin load. This is a WHITELIST — see
// Solid's own LOWERABLE map for why a field the spec grows and this list does not copy simply
// never reaches the detections below (measured there: `intrinsicWhen` implemented end to end and
// silently inert because the projection dropped the field).
const SPECS = new Map(
  LOWERABLE_NAMES.map(name => [
    name,
    {
      intrinsic: HOST_PRIMITIVES[name].intrinsic,
      observesState: HOST_PRIMITIVES[name].observesState === true,
      intrinsicWhen: HOST_PRIMITIVES[name].intrinsicWhen,
    },
  ]),
);

function isNgDeclareComponentCall(node) {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    !node.callee.computed &&
    node.callee.property.type === 'Identifier' &&
    node.callee.property.name === 'ɵɵngDeclareComponent'
  );
}

function propertyOf(objectExpression, name) {
  return objectExpression.properties.find(
    prop =>
      prop.type === 'ObjectProperty' &&
      !prop.computed &&
      ((prop.key.type === 'Identifier' && prop.key.name === name) ||
        (prop.key.type === 'StringLiteral' && prop.key.value === name)),
  );
}

// ngc's own partial-declare emit always writes `template` as a backtick template literal with NO
// interpolation, never a plain StringLiteral (verified against the installed compiler-cli,
// 2026-08-31) — presumably to dodge quote-escaping the author's own HTML. Read/write through the
// one quasi; bail (return undefined) on anything else rather than guess.
function templateTextOf(valueNode) {
  if (
    valueNode.type === 'TemplateLiteral' &&
    valueNode.expressions.length === 0 &&
    valueNode.quasis.length === 1
  ) {
    return valueNode.quasis[0].value.raw;
  }
  if (valueNode.type === 'StringLiteral') return valueNode.value;
  return undefined;
}

// Per-file flag for the Program-exit guard below, set the moment this transform edits anything.
const EDITED_KEY = 'symbiote-lower-host-primitives/edited';

function setTemplateText(valueNode, text) {
  if (valueNode.type === 'TemplateLiteral') {
    valueNode.quasis[0].value.raw = text;
    valueNode.quasis[0].value.cooked = text;
    return;
  }
  valueNode.value = text;
}

// Every shape this codebase's templates actually nest a lowerable element under, empirically
// checked against the installed `@angular/compiler` (2026-08-31): a plain Element/Template holds
// `.children`; `@if`/`@else` holds `.branches[].children`; `@switch` holds `.groups[].children`
// (the group, not each case, carries the children); `@for` holds `.children` plus a SEPARATE
// `.empty` block. NOT walked: `@defer`'s placeholder/loading/error sub-blocks — grepped, nothing
// in this repo's templates uses `@defer` today; add those four properties here before the first
// one does.
function childrenOf(node) {
  const out = [];
  if (Array.isArray(node.children)) out.push(...node.children);
  if (Array.isArray(node.branches)) {
    for (const branch of node.branches) out.push(...(branch.children || []));
  }
  if (Array.isArray(node.groups)) {
    for (const group of node.groups) out.push(...(group.children || []));
  }
  if (node.empty !== undefined && node.empty !== null) {
    out.push(...(node.empty.children || []));
  }
  return out;
}

function walk(nodes, visit) {
  for (const node of nodes) {
    visit(node);
    walk(childrenOf(node), visit);
  }
}

// `.name` alone is not enough to prove this is a real TmplAstElement — check the element-specific
// array fields too, so a differently-shaped node that merely happens to carry a `.name` (unlikely
// today, cheap to guard) cannot be misread as a lowerable tag.
function isElementNamed(node, name) {
  return (
    node.name === name &&
    Array.isArray(node.attributes) &&
    Array.isArray(node.inputs) &&
    Array.isArray(node.outputs)
  );
}

// REFUSAL_CATEGORIES.instanceBoundDirective — see the header's `#ref` section for why this refuses
// UNIVERSALLY, on all four names, rather than being scoped the way Solid's per-primitive list is.
function hasInstanceBoundRef(element) {
  return Array.isArray(element.references) && element.references.length > 0;
}

// REFUSAL_CATEGORIES.dynamicIntrinsicChoice. IDENTITY, not truthiness — see host-primitives.cjs's
// own comment on `intrinsicWhen`: a bare attribute is `true`, an explicit boolean literal is
// itself, absence is `false`, and everything else (including a truthy non-boolean literal like
// `multiline={1}`) refuses. Verified against the installed `@angular/compiler`, 2026-09-01: a bare
// `multiline` parses as a plain TextAttribute (`.attributes`), a bound `[multiline]="expr"` as a
// BoundAttribute (`.inputs`) whose `.value.ast` is a `LiteralPrimitive` for a literal and something
// else (`PropertyRead`, `Call`, …) for anything the transform cannot resolve.
function staticTruthOf(element, propName) {
  const plain = element.attributes.find(attribute => attribute.name === propName);
  if (plain !== undefined) return true;
  const bound = element.inputs.find(input => input.name === propName);
  if (bound === undefined) return false;
  const ast = bound.value.ast;
  if (ast.constructor.name !== 'LiteralPrimitive') return undefined;
  return typeof ast.value === 'boolean' ? ast.value : undefined;
}

function selectsIntrinsicStatically(element, spec) {
  return (
    spec.intrinsicWhen === undefined ||
    staticTruthOf(element, spec.intrinsicWhen.prop) !== undefined
  );
}

function intrinsicFor(element, spec) {
  if (spec.intrinsicWhen === undefined) return spec.intrinsic;
  return staticTruthOf(element, spec.intrinsicWhen.prop) === true
    ? spec.intrinsicWhen.intrinsic
    : spec.intrinsic;
}

// `ngModel` needs the ControlValueAccessor the component PROVIDES, and an element cannot be one at
// all — no rename rescues it, so it refuses on every primitive.
//
// `[(value)]` used to refuse here and no longer does, which is worth stating: it desugars to
// `(valueChange)`, an @Output the component derives from the raw `change` payload — and the LOWERED
// path already carries the same fold under RN's own spelling, `node.props.onValueChange(value,
// event)`, called by both behaviors. The renderer routes the binding there (`renderer/index.ts`,
// `listen()`), so both paths agree. Refusing was tried first and cost the lowering of BOTH
// primitives outright: `[(value)]` is not one spelling among several, it is how every Angular
// template writes a Switch or a TextInput, and an optimisation that asks consumers to write
// differently does not exist.
//
// `valueChange` is not a native event and no behavior emits it: `text-input.ts` and `switch/
// shared.ts` DERIVE it from `change` purely so `[(value)]` works, which is the idiom every Angular
// template actually writes. Lowered, `[(value)]="name"` desugars to a `(valueChange)` listener that
// the engine registers and nothing ever fires — the native field echoes keystrokes on its own, so
// the input looks alive while every value read off it stays frozen. Device-diagnosed 2026-09-02 on
// `CanaryScreen`; nothing is red, on either side.
//
// `ngModel` is the same class one step further out: it needs the ControlValueAccessor the component
// PROVIDES, and an element cannot be one at all — so it refuses on every primitive, not per name.
//
// Per-adapter by construction, so it stays here rather than in `host-primitives.cjs`: which outputs
// are derived is a fact about Angular's component surface, and the shared spec must not carry one
// answer for five adapters (`<prop_types_split_agnostic_vs_per_adapter>`, same test).
const FORMS_BINDINGS = ['ngModel', 'ngModelChange'];

// `style` is the one binding name Angular will not hand to a plain element as a VALUE. It compiles
// to the styling instructions, which decompose the value key by key through Angular's own CSS
// engine — and that engine cannot represent an RN StyleProp: an ARRAY makes `applyStyling` use
// each element as a style KEY and throw `prop.indexOf is not a function` mid-change-detection,
// killing the tick for the whole app. `primitives/shared.ts` states the constraint from the other
// side: every composed component declares `style` as a real `@Input()` precisely so the binding
// never reaches that engine. A component input SHADOWS the instruction, so an un-lowered element
// is safe and a lowered one is not — this transform is what moves it across that line.
// Device-diagnosed 2026-09-02 on `ImageBackground`'s `<Image [style]="imageStyle">`.
//
// A BOUND `[style]` is not refused, it is RENAMED (`styleKeyRenameEdit` below) so the instruction
// never sees it. A STATIC `style="…"` is refused instead: its value is CSS text, which the engine's
// prop layer would read as a registered class name rather than as declarations.
//
// `class` is NOT in the same class of problem: `ɵɵclassMap` resolves through
// `addClass`/`removeClass`, which this adapter's renderer implements against the engine's class
// registry, so a lowered element keeps its classes.
const LOWERED_STYLE_PROP = 'symbioteStyle';

function bindsStaticStyle(element) {
  return element.attributes.some(attribute => attribute.name === 'style');
}

// Renames the BINDING, never the value — `[style]="x"` becomes `[symbioteStyle]="x"`, which is an
// ordinary property binding and reaches `Renderer2.setProperty`, where the renderer's PROP_ALIASES
// folds it straight back to `style`. Runs for every lowered element, alongside (and independent of)
// the state-style specialisation, which edits only the VALUE span.
function styleKeyRenameEdit(element) {
  const styleAttr = element.inputs.find(input => input.name === 'style');
  if (styleAttr === undefined || styleAttr.keySpan === undefined) return [];
  return [
    {
      start: styleAttr.keySpan.start.offset,
      end: styleAttr.keySpan.end.offset,
      text: LOWERED_STYLE_PROP,
    },
  ];
}

function bindsComponentOnlyName(element) {
  const banned = new Set(FORMS_BINDINGS);
  const named = binding => banned.has(binding.name);
  return (
    element.outputs.some(named) ||
    element.inputs.some(named) ||
    element.attributes.some(named)
  );
}

// The single per-element refusal check the all-or-nothing gate below asks of every occurrence of
// a name in a template — `#ref` for all four, a runtime-valued `intrinsicWhen` selector for
// TextInput, and a binding only the component can deliver. `void REFUSAL_CATEGORIES` below keeps
// the import a real, checkable binding rather than a string copy of the category names used only
// in comments.
function elementRefuses(element, spec, name) {
  return (
    hasInstanceBoundRef(element) ||
    !selectsIntrinsicStatically(element, spec) ||
    bindsComponentOnlyName(element) ||
    bindsStaticStyle(element)
  );
}
void REFUSAL_CATEGORIES;

// A LITERAL is provably not a function, so the template cannot be reading press state through it —
// `{ borderColor: c }` (LiteralMap), `[a, b]` (LiteralArray), `'x'` (LiteralPrimitive: a string
// literal specifically, though any LiteralPrimitive is inert here — a number/boolean/null style
// value is not a function either way).
function isLiteralStyleValue(ast) {
  const kind = ast.constructor.name;
  return kind === 'LiteralMap' || kind === 'LiteralArray' || kind === 'LiteralPrimitive';
}

// A bare identifier or a non-computed property chain — `fnStyle`, `this.fnStyle`, `this.a.b` — is
// cheap to print twice: reading a name twice is not work, unlike calling a function or indexing an
// array twice. `ImplicitReceiver`/`ThisReceiver` are the two base cases `parseTemplate` produces
// for a bare name and a `this.`-qualified one respectively (verified against the installed
// `@angular/compiler`, 2026-09-01).
function isCheapReference(ast) {
  const kind = ast.constructor.name;
  if (kind === 'ImplicitReceiver' || kind === 'ThisReceiver') return true;
  return kind === 'PropertyRead' && isCheapReference(ast.receiver);
}

// Splits a state-observing primitive's `style` into `style`/`activeStyle`, INVOCATION rather than
// substitution (see the header) — every shape lowers, only the emission differs. Returns text
// edits in the same `{start, end, text}` shape the tag-rewrite edits use, so both flow through one
// sort-and-splice pass. `letState` is per-template (reset per `ɵɵngDeclareComponent` call): a
// counter for unique `@let` names, and a flag telling the caller whether the `resolveStateStyle`
// pipe import/dependency needs adding at all.
function styleEditsFor(element, templateText, letState) {
  const styleAttr = element.inputs.find(input => input.name === 'style');
  if (styleAttr === undefined) return [];
  const ast = styleAttr.value.ast;
  if (isLiteralStyleValue(ast)) return [];

  const valueSpan = styleAttr.valueSpan;
  const exprText = templateText.slice(
    valueSpan.start.offset,
    valueSpan.end.offset,
  );
  const attrEnd = styleAttr.sourceSpan.end.offset;

  if (isCheapReference(ast)) {
    const resting = `typeof (${exprText}) === 'function' ? (${exprText})({ pressed: false }) : (${exprText})`;
    const pressed = `typeof (${exprText}) === 'function' ? (${exprText})({ pressed: true }) : (${exprText})`;
    return [
      { start: valueSpan.start.offset, end: valueSpan.end.offset, text: resting },
      { start: attrEnd, end: attrEnd, text: ` [activeStyle]="${pressed}"` },
    ];
  }

  const varName = `symbioteStateStyle${letState.counter}`;
  letState.counter += 1;
  letState.usesPipe = true;
  const letStart = element.startSourceSpan.start.offset;
  return [
    {
      start: letStart,
      end: letStart,
      text: `@let ${varName} = (${exprText} | ${PIPE_NAME}); `,
    },
    {
      start: valueSpan.start.offset,
      end: valueSpan.end.offset,
      text: `${varName}.style`,
    },
    { start: attrEnd, end: attrEnd, text: ` [activeStyle]="${varName}.activeStyle"` },
  ];
}

function findDependencyIndex(dependenciesNode, tagName) {
  if (dependenciesNode === undefined || dependenciesNode.type !== 'ArrayExpression') {
    return -1;
  }
  return dependenciesNode.elements.findIndex(element => {
    if (element === null || element.type !== 'ObjectExpression') return false;
    const selectorProp = propertyOf(element, 'selector');
    if (!selectorProp || selectorProp.value.type !== 'StringLiteral') return false;
    const tokens = selectorProp.value.value.split(',').map(token => token.trim());
    return tokens.includes(tagName);
  });
}

module.exports = function lowerHostPrimitivesPlugin({ types }) {
  // Shared across every `ɵɵngDeclareComponent` call in the FILE, so a second template needing the
  // pipe reuses the one import instead of adding a second binding of the same name.
  let pipeImportLocal;

  function pipeDependencyEntry(programPath) {
    if (pipeImportLocal === undefined) {
      pipeImportLocal = programPath.scope.generateUidIdentifier(PIPE_EXPORT);
      programPath.unshiftContainer(
        'body',
        types.importDeclaration(
          [types.importSpecifier(pipeImportLocal, types.identifier(PIPE_EXPORT))],
          types.stringLiteral(PIPE_MODULE),
        ),
      );
    }
    return types.objectExpression([
      types.objectProperty(types.identifier('kind'), types.stringLiteral('pipe')),
      types.objectProperty(types.identifier('type'), types.cloneNode(pipeImportLocal, true)),
      types.objectProperty(types.identifier('name'), types.stringLiteral(PIPE_NAME)),
    ]);
  }

  return {
    name: 'symbiote-lower-host-primitives',
    visitor: {
      Program: {
      enter(programPath, state) {
        programPath.traverse({
          CallExpression(path) {
            if (!isNgDeclareComponentCall(path.node)) return;
            const [arg] = path.node.arguments;
            if (!arg || arg.type !== 'ObjectExpression') return;

            const templateProp = propertyOf(arg, 'template');
            if (!templateProp) return;
            const templateText = templateTextOf(templateProp.value);
            if (templateText === undefined) return;

            const dependenciesProp = propertyOf(arg, 'dependencies');
            let dependenciesNode = dependenciesProp
              ? dependenciesProp.value
              : undefined;

            // Never touch a template this parser rejects — refusing the WHOLE component is always
            // safe, and this transform has no business guessing past a real parse error.
            let parsed;
            try {
              parsed = parseTemplate(templateText, 'inline.html', {
                preserveWhitespaces: true,
              });
            } catch {
              return;
            }
            if (parsed.errors !== null && parsed.errors.length > 0) return;

            const occurrencesByName = new Map(
              LOWERABLE_NAMES.map(name => [name, []]),
            );
            walk(parsed.nodes, node => {
              for (const name of LOWERABLE_NAMES) {
                if (isElementNamed(node, name)) occurrencesByName.get(name).push(node);
              }
            });

            const edits = [];
            const removedDependencyIndices = new Set();
            const letState = { counter: 0, usesPipe: false };

            for (const name of LOWERABLE_NAMES) {
              const elements = occurrencesByName.get(name);
              if (elements.length === 0) continue;
              const spec = SPECS.get(name);
              // The all-or-nothing rule — see the header. One refusal in the family keeps every
              // occurrence of this name as the component, in this template.
              if (elements.some(element => elementRefuses(element, spec, name)))
                continue;

              for (const element of elements) {
                const openStart = element.startSourceSpan.start.offset;
                const intrinsic = intrinsicFor(element, spec);
                edits.push({
                  start: openStart + 1,
                  end: openStart + 1 + name.length,
                  text: intrinsic,
                });
                // A self-closing tag (`<View />`) carries an IDENTICAL start/end source span (the
                // whole tag, verified against the installed compiler-cli) — nothing to rewrite
                // there.
                const closeStart = element.endSourceSpan.start.offset;
                if (closeStart !== openStart) {
                  edits.push({
                    start: closeStart + 2,
                    end: closeStart + 2 + name.length,
                    text: intrinsic,
                  });
                }
                if (spec.observesState) {
                  edits.push(...styleEditsFor(element, templateText, letState));
                }
                edits.push(...styleKeyRenameEdit(element));
              }

              const depIndex = findDependencyIndex(dependenciesNode, name);
              if (depIndex !== -1) removedDependencyIndices.add(depIndex);
            }

            if (edits.length === 0) return;

            // Descending by start: each splice only ever touches text strictly AFTER every
            // not-yet-applied (smaller-offset) edit, so offsets never need re-basing mid-loop.
            edits.sort((a, b) => b.start - a.start);
            let nextText = templateText;
            for (const edit of edits) {
              nextText =
                nextText.slice(0, edit.start) + edit.text + nextText.slice(edit.end);
            }
            setTemplateText(templateProp.value, nextText);
            state.set(EDITED_KEY, true);

            if (removedDependencyIndices.size > 0 && dependenciesNode !== undefined) {
              dependenciesNode.elements = dependenciesNode.elements.filter(
                (_element, index) => !removedDependencyIndices.has(index),
              );
            }

            if (letState.usesPipe) {
              const pipeEntry = pipeDependencyEntry(programPath);
              if (dependenciesNode === undefined) {
                dependenciesNode = types.arrayExpression([pipeEntry]);
                arg.properties.push(
                  types.objectProperty(
                    types.identifier('dependencies'),
                    dependenciesNode,
                  ),
                );
              } else {
                dependenciesNode.elements.push(pipeEntry);
              }
            }
          },
        });
      },
      // This transform edits TWO fields and only one of them survives a linker running in the SAME
      // babel pass: Angular reads an inline template by slicing the FILE'S SOURCE TEXT at the AST
      // node's byte range (`templateFromPartialCode`), so the rewritten `template` string is
      // invisible to it, while the `dependencies` removal — an ordinary array read — lands. What
      // ships then is neither lowered nor un-lowered: the tag is still `<View>` and the directive
      // that answers it has been deleted, so nothing matches, no component template runs, and the
      // screen loses its styles and its handlers. Nothing goes red — every test in this suite
      // links the plugin's PRINTED output, which is a second pass. Device-diagnosed 2026-09-02.
      //
      // Detected by EFFECT rather than by plugin name (the linker's babel key is a generated
      // `base$N`): if `ɵɵdefineComponent` exists at Program exit in a file we edited, the linker
      // ran here. Use `@symbiote-native/angular/metro-transformer`, which prints the lowered code
      // back to text before Metro parses it.
      exit(programPath, state) {
        if (state.get(EDITED_KEY) !== true) return;
        let linkedHere = false;
        programPath.traverse({
          Identifier(path) {
            if (path.node.name === 'ɵɵdefineComponent') linkedHere = true;
          },
        });
        if (!linkedHere) return;
        throw new Error(
          'symbiote-lower-host-primitives: the Angular linker ran in the same Babel pass, so the ' +
            'rewritten template never reaches it and only the dependency removal lands — a ' +
            'half-lowered component that matches no directive at all. Remove this plugin from ' +
            "babel.config.js and set metro.config.js's babelTransformerPath to " +
            "'@symbiote-native/angular/metro-transformer'.",
        );
      },
      },
    },
  };
};

module.exports.LOWERABLE_NAMES = LOWERABLE_NAMES;
