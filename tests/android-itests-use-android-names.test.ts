// An Android itest must commit what an Android device commits. A C++ rule gated on a component name
// and fixtured under the iOS name passes on the host and never runs on a device: the whole TextInput
// rule set was dead on Android that way (`isTextInput` knew only `RCTSinglelineTextInputView`, and
// the Android fixtures used that name too). The iOS-only names come from the two platform tables,
// so a new primitive is covered without editing this file.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { COMPONENT_DESCRIPTORS as ANDROID } from '../core/components/src/component-names/index.android';
import { COMPONENT_DESCRIPTORS as IOS } from '../core/components/src/component-names/index.ios';

const ITEST_DIR = join(import.meta.dirname, '../core/engine/cpp/tests/js');

function componentNames(
  descriptors: Readonly<Record<string, { component: string }>>,
): Set<string> {
  return new Set(Object.values(descriptors).map(d => d.component));
}

const androidNames = componentNames(ANDROID);
const iosOnlyNames = [...componentNames(IOS)].filter(
  name => !androidNames.has(name),
);

// Quoted literals only: comments name iOS components in backticks to explain the split.
function iosNamesIn(source: string): string[] {
  return iosOnlyNames.filter(
    name => source.includes(`'${name}'`) || source.includes(`"${name}"`),
  );
}

describe('android itest fixtures', () => {
  // why: the guard is only as good as its list — if the tables stop differing, it checks nothing.
  it('has iOS-only component names to look for', () => {
    expect(iosOnlyNames).toContain('RCTSinglelineTextInputView');
  });

  // why: see the header — an iOS name in an Android fixture tests a path no device takes.
  it('commit only Android component names', () => {
    const offenders = readdirSync(ITEST_DIR)
      .filter(file => file.endsWith('.android.itest.ts'))
      .flatMap(file =>
        iosNamesIn(readFileSync(join(ITEST_DIR, file), 'utf8')).map(
          name => `${file}: '${name}'`,
        ),
      );
    expect(offenders).toEqual([]);
  });
});
