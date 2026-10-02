import { beforeEach, describe, expect, it, vi } from 'vitest';

const { setStyle, setHidden } = vi.hoisted(() => ({
  setStyle: vi.fn(),
  setHidden: vi.fn(),
}));

vi.mock('./navigation-bar', () => ({
  setStyle,
  setHidden,
  defaultNavigationBarProps: { style: 'light', hidden: false },
}));

const { pushStackEntry, popStackEntry, replaceStackEntry } =
  await import('./entries-stack');
const { defaultNavigationBarProps } = await import('./navigation-bar');

function flush(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

beforeEach(() => {
  vi.clearAllMocks();
  defaultNavigationBarProps.style = 'light';
  defaultNavigationBarProps.hidden = false;
});

describe('pushStackEntry (Positive)', () => {
  it('applies the pushed entry after the debounce window', async () => {
    const entry = pushStackEntry({ style: 'dark', hidden: true });
    expect(setStyle).not.toHaveBeenCalled();

    await flush();

    expect(setStyle).toHaveBeenCalledWith('dark');
    expect(setHidden).toHaveBeenCalledWith(true);

    popStackEntry(entry);
    await flush();
  });

  it('merges two entries, the later push winning on shared fields', async () => {
    const first = pushStackEntry({ style: 'dark', hidden: false });
    const second = pushStackEntry({ style: 'light' });
    await flush();

    expect(setStyle).toHaveBeenLastCalledWith('light');
    expect(setHidden).toHaveBeenLastCalledWith(false);

    popStackEntry(second);
    popStackEntry(first);
    await flush();
  });

  it('falls back to the default props once every entry pops', async () => {
    defaultNavigationBarProps.style = 'dark';
    defaultNavigationBarProps.hidden = true;

    const entry = pushStackEntry({ style: 'light', hidden: false });
    await flush();
    vi.clearAllMocks();

    popStackEntry(entry);
    await flush();

    expect(setStyle).toHaveBeenCalledWith('dark');
    expect(setHidden).toHaveBeenCalledWith(true);
  });
});

describe('replaceStackEntry (Positive)', () => {
  it('applies the replacement props', async () => {
    const entry = pushStackEntry({ style: 'dark' });
    await flush();
    vi.clearAllMocks();

    const replaced = replaceStackEntry(entry, { style: 'light' });
    await flush();

    expect(setStyle).toHaveBeenCalledWith('light');

    popStackEntry(replaced);
    await flush();
  });
});
