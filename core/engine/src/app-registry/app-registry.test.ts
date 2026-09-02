import { describe, expect, it, vi } from 'vitest';
import {
  createAppRegistry,
  type IHostRegistrar,
  type ITaskCancelProvider,
  type ITaskProvider,
} from './index';

type IHostTask = {
  taskProvider: ITaskProvider;
  taskCancelProvider: ITaskCancelProvider;
};

function registry() {
  return createAppRegistry<() => void, never>(() => () => {});
}

function host() {
  const tasks = new Map<string, IHostTask>();
  const registerCancellableHeadlessTask = vi.fn(
    (
      key: string,
      taskProvider: ITaskProvider,
      taskCancelProvider: ITaskCancelProvider,
    ) => tasks.set(key, { taskProvider, taskCancelProvider }),
  );
  const registrar: IHostRegistrar = {
    registerRunnable: key => key,
    registerCancellableHeadlessTask,
  };
  return { registrar, tasks, registerCancellableHeadlessTask };
}

describe('AppRegistry headless-task host bridge', () => {
  it('forwards a cancellable task registered after host attachment', async () => {
    const { AppRegistry, setHostRegistrar } = registry();
    const native = host();
    const task = vi.fn(async () => {});
    const cancel = vi.fn();

    setHostRegistrar(native.registrar);
    AppRegistry.registerCancellableHeadlessTask(
      'voice',
      () => task,
      () => cancel,
    );

    await native.tasks.get('voice')?.taskProvider()({ roomId: 'one' });
    native.tasks.get('voice')?.taskCancelProvider()();
    expect(task).toHaveBeenCalledWith({ roomId: 'one' });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('replays a plain task registered before bootstrap with a no-op canceller', () => {
    const { AppRegistry, setHostRegistrar } = registry();
    const native = host();
    const taskProvider: ITaskProvider = () => async () => {};

    AppRegistry.registerHeadlessTask('early', taskProvider);
    setHostRegistrar(native.registrar);

    expect(native.tasks.get('early')?.taskProvider).toBe(taskProvider);
    expect(() =>
      native.tasks.get('early')?.taskCancelProvider()(),
    ).not.toThrow();
  });

  it('keeps custom registrars without headless support compatible', () => {
    const { AppRegistry, setHostRegistrar } = registry();
    setHostRegistrar({ registerRunnable: key => key });

    expect(() =>
      AppRegistry.registerHeadlessTask('local-only', () => async () => {}),
    ).not.toThrow();
  });

  it('does not replay twice to the same host and does replay to a replacement', () => {
    const { AppRegistry, setHostRegistrar } = registry();
    const first = host();
    const replacement = host();

    AppRegistry.registerHeadlessTask('task', () => async () => {});
    setHostRegistrar(first.registrar);
    setHostRegistrar(first.registrar);
    setHostRegistrar(replacement.registrar);

    expect(first.registerCancellableHeadlessTask).toHaveBeenCalledOnce();
    expect(replacement.registerCancellableHeadlessTask).toHaveBeenCalledOnce();
  });
});
