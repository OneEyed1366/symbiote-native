// `AppRegistryImpl.js` of RN: the invariants, console output and registry calls around a surface
// runnable and a headless task
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeadlessJsTaskError, createAppRegistry } from './index';

const ROOT_TAG = 11;

function registry() {
  return createAppRegistry<() => void, never>(() => () => {});
}

afterEach(() => vi.restoreAllMocks());

describe('runApplication', () => {
  it("throws RN's invariant for a key nobody registered", () => {
    const { AppRegistry } = registry();

    expect(() =>
      AppRegistry.runApplication('Missing', { rootTag: ROOT_TAG }),
    ).toThrow('"Missing" has not been registered. This can happen if:');
  });
});

describe('setSurfaceProps', () => {
  it('runs the registered runnable again with the new parameters', () => {
    const { AppRegistry } = registry();
    const run = vi.fn();
    AppRegistry.registerRunnable('Home', run);
    AppRegistry.setSurfaceProps('Home', {
      rootTag: ROOT_TAG,
      initialProps: { a: 1 },
    });

    expect(run).toHaveBeenCalledWith({
      rootTag: ROOT_TAG,
      initialProps: { a: 1 },
    });
  });

  it('throws for a key nobody registered', () => {
    const { AppRegistry } = registry();

    expect(() =>
      AppRegistry.setSurfaceProps('Missing', { rootTag: ROOT_TAG }),
    ).toThrow('"Missing" has not been registered');
  });
});

describe('registerConfig', () => {
  it('registers a `run` as a runnable and a `component` through the component path', () => {
    const { AppRegistry } = registry();
    const run = vi.fn();
    AppRegistry.registerConfig([
      { appKey: 'ByRun', run },
      { appKey: 'ByComponent', component: () => {}, section: true },
    ]);

    expect(AppRegistry.getAppKeys()).toEqual(['ByRun', 'ByComponent']);
    expect(AppRegistry.getSectionKeys()).toEqual(['ByComponent']);
  });

  it('throws for a config with neither', () => {
    const { AppRegistry } = registry();

    expect(() => AppRegistry.registerConfig([{ appKey: 'Empty' }])).toThrow(
      'AppRegistry.registerConfig(...): Every config is expected to set either `run` or `component`, but `Empty` has neither.',
    );
  });
});

describe('headless tasks', () => {
  it('warns when a key is registered twice', () => {
    const { AppRegistry } = registry();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    AppRegistry.registerHeadlessTask('t', () => async () => {});
    AppRegistry.registerHeadlessTask('t', () => async () => {});

    expect(warn).toHaveBeenCalledWith(
      "registerHeadlessTask or registerCancellableHeadlessTask called multiple times for same key 't'",
    );
  });

  it('warns about a task nobody registered', () => {
    const { AppRegistry } = registry();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    AppRegistry.startHeadlessTask(1, 'nope', {});

    expect(warn).toHaveBeenCalledWith('No task registered for key nope');
  });

  it('logs a failure with console.error', async () => {
    const { AppRegistry } = registry();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const reason = new Error('boom');
    AppRegistry.registerHeadlessTask('t', () => async () => {
      throw reason;
    });
    AppRegistry.startHeadlessTask(1, 't', {});
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(error).toHaveBeenCalledWith(reason);
  });

  it('throws when it is asked to cancel a task nobody registered', () => {
    const { AppRegistry } = registry();

    expect(() => AppRegistry.cancelHeadlessTask(1, 'nope')).toThrow(
      "No task canceller registered for key 'nope'",
    );
  });

  it('is a plain Error subclass a task throws to ask for a retry', () => {
    const error = new HeadlessJsTaskError('again');

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('again');
  });
});
