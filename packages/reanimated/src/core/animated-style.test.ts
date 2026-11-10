import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { updateProps } from 'react-native-reanimated/src/updateProps';
import { settle, workletOf } from '../../test-support/worklet';
import {
  createAnimatedPropsController,
  createAnimatedStyleController,
} from './animated-style';
import { createSharedValue } from './shared-value';

vi.mock('react-native-reanimated/src/updateProps', () => ({
  updateProps: vi.fn(),
}));

type IStyle = { opacity?: number; width?: number };

const VIEW = { tag: 7, shadowNodeWrapper: {} };

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(updateProps).mockClear();
});

afterEach(() => vi.useRealTimers());

describe('an animated style made by the controller', () => {
  it('starts out as what the updater returns, run once', () => {
    const updater = vi.fn((): IStyle => ({ opacity: 0.5 }));

    const { handle } = createAnimatedStyleController(workletOf(updater, []));

    expect(handle.initial.value).toEqual({ opacity: 0.5 });
    expect(updater).toHaveBeenCalledTimes(1);
  });

  it('writes the updater result to an attached view when a shared value changes', async () => {
    const { shared } = createSharedValue(1);
    const updater = workletOf(
      (): IStyle => ({ opacity: shared.value }),
      [shared],
    );
    const controller = createAnimatedStyleController(updater);
    controller.start(updater);
    controller.handle.viewDescriptors.add(
      VIEW,
      controller.handle.styleUpdaterContainer,
    );
    await settle();
    vi.mocked(updateProps).mockClear();

    shared.value = 0.25;
    await settle();

    expect(updateProps).toHaveBeenLastCalledWith(
      expect.anything(),
      { opacity: 0.25 },
      expect.anything(),
    );
  });

  it('stops writing once it is stopped', async () => {
    const { shared } = createSharedValue(1);
    const updater = workletOf(
      (): IStyle => ({ opacity: shared.value }),
      [shared],
    );
    const controller = createAnimatedStyleController(updater);
    controller.start(updater);
    controller.handle.viewDescriptors.add(
      VIEW,
      controller.handle.styleUpdaterContainer,
    );
    await settle();
    controller.stop();
    await settle();
    vi.mocked(updateProps).mockClear();

    shared.value = 0.1;
    await settle();

    expect(updateProps).not.toHaveBeenCalled();
  });

  it('follows a new updater and forgets the old one', async () => {
    const { shared } = createSharedValue(1);
    const first = workletOf(
      (): IStyle => ({ opacity: shared.value }),
      [shared],
      1,
    );
    const second = workletOf(
      (): IStyle => ({ width: shared.value }),
      [shared],
      2,
    );
    const controller = createAnimatedStyleController(first);
    controller.start(first);
    controller.handle.viewDescriptors.add(
      VIEW,
      controller.handle.styleUpdaterContainer,
    );
    await settle();

    controller.start(second);
    await settle();
    vi.mocked(updateProps).mockClear();
    shared.value = 9;
    await settle();

    expect(updateProps).toHaveBeenCalledWith(
      expect.anything(),
      { width: 9 },
      expect.anything(),
    );
    expect(updateProps).not.toHaveBeenCalledWith(
      expect.anything(),
      { opacity: 9 },
      expect.anything(),
    );
  });

  it('applies prop adapters to the values before they are written', async () => {
    const { shared } = createSharedValue(1);
    const updater = workletOf(
      (): IStyle => ({ opacity: shared.value }),
      [shared],
    );
    const adapter = workletOf((values: Record<string, unknown>) => {
      values.width = 4;
    }, []);
    const controller = createAnimatedStyleController(updater, {
      adapters: [adapter],
    });
    controller.start(updater);
    controller.handle.viewDescriptors.add(
      VIEW,
      controller.handle.styleUpdaterContainer,
    );
    await settle();
    vi.mocked(updateProps).mockClear();

    shared.value = 0.5;
    await settle();

    expect(updateProps).toHaveBeenLastCalledWith(
      expect.anything(),
      { opacity: 0.5, width: 4 },
      expect.anything(),
    );
  });
});

describe('animated props made by the controller', () => {
  async function writeOnChange(
    make:
      | typeof createAnimatedStyleController
      | typeof createAnimatedPropsController,
  ) {
    const { shared } = createSharedValue(1);
    const updater = workletOf(
      (): IStyle => ({ opacity: shared.value }),
      [shared],
    );
    const controller = make(updater);
    controller.start(updater);
    controller.handle.viewDescriptors.add(
      VIEW,
      controller.handle.styleUpdaterContainer,
    );
    await settle();
    vi.mocked(updateProps).mockClear();
    shared.value = 0.5;
    await settle();
  }

  it('are written as props, which the style controller does not do', async () => {
    await writeOnChange(createAnimatedPropsController);

    expect(updateProps).toHaveBeenLastCalledWith(
      expect.anything(),
      { opacity: 0.5 },
      true,
    );
  });

  it('are written as style by the style controller', async () => {
    await writeOnChange(createAnimatedStyleController);

    expect(updateProps).toHaveBeenLastCalledWith(
      expect.anything(),
      { opacity: 0.5 },
      false,
    );
  });
});
