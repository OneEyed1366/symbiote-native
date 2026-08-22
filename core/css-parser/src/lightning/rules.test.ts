// `compileCssToRules` is the only level that sees a rule's SELECTOR and its DECLARATIONS at once,
// which is why one warning has to live here rather than in ./selectors.ts — see the `:root` block
// in both files.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compileCssToRules } from './rules.ts';

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

function warnings(): string[] {
  return warn.mock.calls.map(call => String(call[0]));
}

describe('compileCssToRules — `:root`', () => {
  it('says nothing about a block that only declares custom properties', () => {
    const { rules } = compileCssToRules(
      ':root { --lime: #a3d94f; }\n.tile { color: var(--lime); }',
      { filename: 'tokens.css' },
    );

    // Silent AND resolved — the warning was a false alarm, not a symptom.
    expect(warnings()).toEqual([]);
    expect(rules.map(rule => rule.style)).toEqual([{ color: '#a3d94f' }]);
  });

  it('speaks up when the same block also carries a painting declaration', () => {
    compileCssToRules(':root { --lime: #a3d94f; color: blue; }', {
      filename: 'tokens.css',
    });

    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toContain('tokens.css');
    expect(warnings()[0]).toContain('more than custom properties');
  });
});
