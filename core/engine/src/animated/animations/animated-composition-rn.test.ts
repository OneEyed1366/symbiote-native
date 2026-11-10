// Порт кейсов sequence, loop, parallel, delay и stagger из `Animated-test.js` RN

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  delay,
  loop,
  parallel,
  sequence,
  stagger,
  type IEndCallback,
  type IEndResult,
  type ILoopAnimationConfig,
} from '@symbiote-native/engine';

function mockAnimation() {
  const start = vi.fn<(callback?: IEndCallback, isLooping?: boolean) => void>();
  const stop = vi.fn<() => void>();
  const reset = vi.fn<() => void>();
  return { start, stop, reset };
}

type IMock = ReturnType<typeof mockAnimation>;

// Завершает запуск мок-анимации так, как это делает native или таймер
function finish(animation: IMock, result: IEndResult, call = 0): void {
  const [callback] = animation.start.mock.calls[call];
  callback?.(result);
}

const OTHER_KEY_CONFIG: ILoopAnimationConfig = JSON.parse(
  '{"anotherKey":"value"}',
);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Animated Sequence', () => {
  it('works with an empty sequence', () => {
    const cb = vi.fn();
    sequence([]).start(cb);
    expect(cb).toHaveBeenCalledWith({ finished: true });
  });

  it('sequences well', () => {
    const anim1 = mockAnimation();
    const anim2 = mockAnimation();
    const cb = vi.fn();
    const seq = sequence([anim1, anim2]);
    expect(anim1.start).not.toHaveBeenCalled();
    expect(anim2.start).not.toHaveBeenCalled();

    seq.start(cb);
    expect(anim1.start).toHaveBeenCalled();
    expect(anim2.start).not.toHaveBeenCalled();
    expect(cb).not.toHaveBeenCalled();

    finish(anim1, { finished: true });
    expect(anim2.start).toHaveBeenCalled();
    expect(cb).not.toHaveBeenCalled();

    finish(anim2, { finished: true });
    expect(cb).toHaveBeenCalledWith({ finished: true });
  });

  it('supports interrupting sequence', () => {
    const anim1 = mockAnimation();
    const anim2 = mockAnimation();
    const cb = vi.fn();
    sequence([anim1, anim2]).start(cb);
    finish(anim1, { finished: false });
    expect(anim2.start).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith({ finished: false });
  });

  it('supports stopping sequence', () => {
    const anim1 = mockAnimation();
    const anim2 = mockAnimation();
    const cb = vi.fn();
    const seq = sequence([anim1, anim2]);
    seq.start(cb);
    seq.stop();
    expect(anim1.stop).toHaveBeenCalled();
    expect(anim2.stop).not.toHaveBeenCalled();
    expect(cb).not.toHaveBeenCalled();

    finish(anim1, { finished: false });
    expect(cb).toHaveBeenCalledWith({ finished: false });
  });

  it('supports restarting sequence after it was stopped during execution', () => {
    const anim1 = mockAnimation();
    const anim2 = mockAnimation();
    const cb = vi.fn();
    const seq = sequence([anim1, anim2]);
    seq.start(cb);
    finish(anim1, { finished: true });
    seq.stop();
    expect(anim1.start).toHaveBeenCalledTimes(1);
    expect(anim2.start).toHaveBeenCalledTimes(1);

    seq.start(cb);
    expect(anim1.start).toHaveBeenCalledTimes(1);
    expect(anim2.start).toHaveBeenCalledTimes(2);
  });

  it('supports restarting sequence after it was finished without a reset', () => {
    const anim1 = mockAnimation();
    const anim2 = mockAnimation();
    const cb = vi.fn();
    const seq = sequence([anim1, anim2]);
    seq.start(cb);
    finish(anim1, { finished: true });
    finish(anim2, { finished: true });
    expect(cb).toHaveBeenCalledWith({ finished: true });

    seq.start(cb);
    expect(anim1.start).toHaveBeenCalledTimes(2);
    expect(anim2.start).toHaveBeenCalledTimes(1);
  });
});

describe('Animated Loop', () => {
  it.each([
    ['config not specified', undefined],
    ['iterations is -1', { iterations: -1 }],
    ['iterations not specified', OTHER_KEY_CONFIG],
  ])('loops indefinitely if %s', (_label, config) => {
    const animation = mockAnimation();
    const cb = vi.fn();
    const looped = loop(animation, config);
    expect(animation.start).not.toHaveBeenCalled();

    looped.start(cb);
    expect(animation.start).toHaveBeenCalled();
    expect(animation.reset).toHaveBeenCalledTimes(1);
    expect(cb).not.toHaveBeenCalled();

    for (let iteration = 2; iteration <= 4; iteration++) {
      finish(animation, { finished: true });
      expect(animation.reset).toHaveBeenCalledTimes(iteration);
      expect(cb).not.toHaveBeenCalled();
    }
  });

  it('loops three times if iterations is 3', () => {
    const animation = mockAnimation();
    const cb = vi.fn();
    loop(animation, { iterations: 3 }).start(cb);
    expect(animation.reset).toHaveBeenCalledTimes(1);

    finish(animation, { finished: true });
    expect(animation.reset).toHaveBeenCalledTimes(2);
    expect(cb).not.toHaveBeenCalled();

    finish(animation, { finished: true });
    expect(animation.reset).toHaveBeenCalledTimes(3);
    expect(cb).not.toHaveBeenCalled();

    finish(animation, { finished: true });
    expect(animation.reset).toHaveBeenCalledTimes(3);
    expect(cb).toHaveBeenCalledWith({ finished: true });
  });

  it('does not loop if iterations is 1', () => {
    const animation = mockAnimation();
    const cb = vi.fn();
    loop(animation, { iterations: 1 }).start(cb);
    expect(animation.start).toHaveBeenCalled();
    expect(cb).not.toHaveBeenCalled();
    finish(animation, { finished: true });
    expect(cb).toHaveBeenCalledWith({ finished: true });
  });

  it('does not animate if iterations is 0', () => {
    const animation = mockAnimation();
    const cb = vi.fn();
    loop(animation, { iterations: 0 }).start(cb);
    expect(animation.start).not.toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith({ finished: true });
  });

  it('supports interrupting an indefinite loop', () => {
    const animation = mockAnimation();
    const cb = vi.fn();
    loop(animation).start(cb);
    finish(animation, { finished: true });
    expect(animation.reset).toHaveBeenCalledTimes(2);

    finish(animation, { finished: false });
    expect(animation.reset).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenCalledWith({ finished: false });
  });

  it('supports stopping loop', () => {
    const animation = mockAnimation();
    const cb = vi.fn();
    const looped = loop(animation);
    looped.start(cb);
    looped.stop();
    expect(animation.reset).toHaveBeenCalledTimes(1);
    expect(animation.stop).toHaveBeenCalled();

    finish(animation, { finished: false });
    expect(animation.reset).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith({ finished: false });
  });

  it('does not reset animation in a loop if resetBeforeIteration is false', () => {
    const animation = mockAnimation();
    const cb = vi.fn();
    loop(animation, { resetBeforeIteration: false }).start(cb);
    expect(animation.start).toHaveBeenCalled();
    expect(animation.reset).not.toHaveBeenCalled();

    for (let iteration = 0; iteration < 3; iteration++) {
      finish(animation, { finished: true });
    }
    expect(animation.reset).not.toHaveBeenCalled();
    expect(cb).not.toHaveBeenCalled();
  });

  it('restarts sequence normally in a loop if resetBeforeIteration is false', () => {
    const anim1 = mockAnimation();
    const anim2 = mockAnimation();
    const looped = loop(sequence([anim1, anim2]), {
      resetBeforeIteration: false,
    });
    looped.start();
    expect(anim1.start).toHaveBeenCalledTimes(1);

    finish(anim1, { finished: true });
    expect(anim2.start).toHaveBeenCalledTimes(1);

    finish(anim2, { finished: true });
    expect(anim1.start).toHaveBeenCalledTimes(2);
  });
});

describe('Animated Parallel', () => {
  it('works with an empty parallel', () => {
    const cb = vi.fn();
    parallel([]).start(cb);
    expect(cb).toHaveBeenCalledWith({ finished: true });
  });

  it('works with an empty element in array', () => {
    const anim1 = mockAnimation();
    const cb = vi.fn();
    parallel([undefined, anim1]).start(cb);
    expect(anim1.start).toHaveBeenCalled();
    finish(anim1, { finished: true });
    expect(cb).toHaveBeenCalledWith({ finished: true });
  });

  it('parallelizes well', () => {
    const anim1 = mockAnimation();
    const anim2 = mockAnimation();
    const cb = vi.fn();
    const par = parallel([anim1, anim2]);
    expect(anim1.start).not.toHaveBeenCalled();

    par.start(cb);
    expect(anim1.start).toHaveBeenCalled();
    expect(anim2.start).toHaveBeenCalled();
    expect(cb).not.toHaveBeenCalled();

    finish(anim1, { finished: true });
    expect(cb).not.toHaveBeenCalled();

    finish(anim2, { finished: true });
    expect(cb).toHaveBeenCalledWith({ finished: true });
  });

  it('supports stopping parallel', () => {
    const anim1 = mockAnimation();
    const anim2 = mockAnimation();
    const cb = vi.fn();
    const par = parallel([anim1, anim2]);
    par.start(cb);
    par.stop();
    expect(anim1.stop).toHaveBeenCalled();
    expect(anim2.stop).toHaveBeenCalled();
    expect(cb).not.toHaveBeenCalled();

    finish(anim1, { finished: false });
    expect(cb).not.toHaveBeenCalled();

    finish(anim2, { finished: false });
    expect(cb).toHaveBeenCalledWith({ finished: false });
  });

  it('does not call stop more than once when stopping', () => {
    const anim1 = mockAnimation();
    const anim2 = mockAnimation();
    const anim3 = mockAnimation();
    parallel([anim1, anim2, anim3]).start();

    finish(anim1, { finished: false });
    expect(anim1.stop).toHaveBeenCalledTimes(0);
    expect(anim2.stop).toHaveBeenCalledTimes(1);
    expect(anim3.stop).toHaveBeenCalledTimes(1);

    finish(anim2, { finished: false });
    finish(anim3, { finished: false });
    expect(anim1.stop).toHaveBeenCalledTimes(0);
    expect(anim2.stop).toHaveBeenCalledTimes(1);
    expect(anim3.stop).toHaveBeenCalledTimes(1);
  });
});

describe('Animated delays', () => {
  it('calls anim after delay in sequence', () => {
    const anim = mockAnimation();
    const cb = vi.fn();
    sequence([delay(1_000), anim]).start(cb);
    vi.runAllTimers();
    expect(anim.start).toHaveBeenCalledTimes(1);
    expect(cb).not.toHaveBeenCalled();

    finish(anim, { finished: true });
    expect(cb).toHaveBeenCalledWith({ finished: true });
  });

  it('runs stagger to end', () => {
    const cb = vi.fn();
    stagger(1_000, [delay(1_000), delay(1_000), delay(1_000)]).start(cb);
    vi.runAllTimers();
    expect(cb).toHaveBeenCalledWith({ finished: true });
  });
});
