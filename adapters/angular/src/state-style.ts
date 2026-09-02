// Re-export only. The implementation is shared (`@symbiote-native/components`) because two adapters
// had written byte-identical copies; this file exists so the code a transform EMITS keeps importing
// from the adapter package the app already depends on, rather than reaching past it.
//
// Imported from the SUBPATH, not the barrel: every adapter barrel re-exports
// `@symbiote-native/components` wholesale, so a name on that barrel silently becomes public API on
// all five — which is how a transform internal nearly shipped as a supported export.
//
// Present on every adapter, including those with no lowering transform yet: a per-framework subpath
// that four of five declare is exactly the silent gap `tests/package-subpath-parity.test.ts` exists
// to catch, and the file costs a re-export. Deliberately NOT on the public barrel — the emitted
// code names it, app code does not.
export {
  resolveStateStyle,
  type IPressStateArgument,
  type IResolvedStateStyle,
} from '@symbiote-native/components/state-style';

// Angular-only addition to this otherwise byte-identical file: a template expression can call a
// PIPE, never an arbitrary imported function — `resolveStateStyle(x)` in a template resolves as
// `ctx.resolveStateStyle(x)`, a component-instance method lookup, which the lowering transform has
// no component to add one to (verified against the installed compiler-cli, 2026-09-01: the linker
// compiles it straight to a `ctx.` property read with no error, so this fails at RUNTIME —
// `ctx.resolveStateStyle is not a function` — not at compile time). A pipe is the one thing that
// resolves through `dependencies` the way a component/directive does.
//
// `emitStyleExpressionOnce` still applies: the transform's `@let pair = (expr | resolveStateStyle);`
// evaluates `expr` exactly once (verified via the compiled `ɵɵpipeBind1` call) and `pair.style` /
// `pair.activeStyle` are two cheap reads of the local, never a second evaluation of `expr`.
import { Pipe, type PipeTransform } from '@angular/core';
import { resolveStateStyle as resolveStateStyleImpl } from '@symbiote-native/components/state-style';
import type { IResolvedStateStyle } from '@symbiote-native/components/state-style';

@Pipe({ name: 'resolveStateStyle', standalone: true })
export class SymbioteStateStylePipe implements PipeTransform {
  transform(value: unknown): IResolvedStateStyle {
    return resolveStateStyleImpl(value);
  }
}
