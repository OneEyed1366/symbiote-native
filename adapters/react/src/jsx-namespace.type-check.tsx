// A COMPILED two-sided check that this package's JSX namespace is the one in force, and that it is
// strict where it claims to be. Not a test: no test file in this repo is type-checked by anything
// (`tsconfig`s exclude `*.test.ts*`, and vitest strips types without checking them), so a
// type-level assertion only runs if it sits in source the build compiles.
//
// WHY IT IS NEEDED AT ALL. `jsxImportSource` resolving is not the same as a tag resolving THROUGH
// it: a missing module is TS2875, but a namespace that resolves and carries the wrong shape is
// silent. And the adapter's own source builds nodes with `createElement(tag, …)`, whose React
// overloads are keyed on React's own tables — so before this file, nothing in the repo asked our
// `IntrinsicElements` anything, and `tsc --build` was green either way. Measured: deleting the
// whole `declare module 'react'` augmentation changed no output.
//
// BOTH directions are covered, which is what makes it an oracle rather than a smoke check:
//
//   the positive line fails    if the namespace is absent or unreachable (the tag is unknown)
//   the negative line fails    if the namespace is present but LOOSE — `@ts-expect-error` is
//                              itself an error when the line it guards compiles, so an
//                              `IHostProps` index signature standing in for `IViewProps` reddens
//                              here instead of passing silently
import type { ReactElement } from 'react';

const strictIntrinsicAcceptsItsOwnProp: ReactElement = (
  <view testID="jsx-namespace-check" />
);

const strictIntrinsicRejectsAnUnknownProp: ReactElement = (
  // @ts-expect-error `view` is typed by IViewProps, not by the loose host bag
  <view definitelyNotAViewProp={1} />
);

export const JSX_NAMESPACE_CHECK = [
  strictIntrinsicAcceptsItsOwnProp,
  strictIntrinsicRejectsAnUnknownProp,
].length;
