// The defaults RN's Text.js applies before handing props to native, folded once for every adapter.
//
// RN does this unconditionally on the outer (non-virtual) path, Text.js:288-291:
//
//   processedProps.allowFontScaling = allowFontScaling !== false;
//   processedProps.ellipsizeMode = ellipsizeMode ?? 'tail';
//
// We declared both props in all four adapters and applied NEITHER default, so native fell back to
// its own: `clip` instead of `tail`. Device-observed 2026-08-19 on examples/svelte — a Text with
// numberOfLines={1} cut mid-word with no ellipsis at all. Nothing failed; the text was simply
// wrong, which is why four adapters carried it.
//
// Both keys are emitted UNCONDITIONALLY, matching RN and — separately — keeping the key set
// stable. A fold with two branches that emit different key sets is the exact hazard
// .claude/rules/solid-descriptor-bridge.md §1 exists for, and Svelte's shim diffs the same way.

export type IEllipsizeMode = 'head' | 'middle' | 'tail' | 'clip';

export interface ITextDefaultableProps {
  ellipsizeMode?: IEllipsizeMode;
  allowFontScaling?: boolean;
}

export function resolveTextProps<T extends ITextDefaultableProps>(
  props: T,
): T & { ellipsizeMode: IEllipsizeMode; allowFontScaling: boolean } {
  return {
    ...props,
    ellipsizeMode: props.ellipsizeMode ?? 'tail',
    // `!== false`, not `?? true`: RN treats an explicit `undefined` and a missing prop alike, and
    // only a literal `false` opts out.
    allowFontScaling: props.allowFontScaling !== false,
  };
}
