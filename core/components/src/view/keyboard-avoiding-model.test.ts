// RN's KeyboardAvoidingView recomputes the inset whenever the keyboard event or the frame moves
import { describe, expect, it } from 'vitest';
import {
  createKeyboardAvoidingModel,
  type IKeyboardAvoidingModelOptions,
} from './keyboard-avoiding-model';

const SCREEN_Y = 600;
const FRAME = { x: 0, y: 500, width: 320, height: 300 };

function keyboardEvent(): Record<string, unknown> {
  return {
    duration: 250,
    easing: 'keyboard',
    endCoordinates: { screenY: SCREEN_Y, height: 300 },
  };
}

function setup(options: Partial<IKeyboardAvoidingModelOptions> = {}) {
  // Only a changed value, as an adapter's state setter would report it
  const insets: number[] = [];
  let current = 0;
  const animations: unknown[] = [];
  const model = createKeyboardAvoidingModel({
    options: () => ({
      behavior: 'padding',
      enabled: true,
      keyboardVerticalOffset: 0,
      ...options,
    }),
    setInset: inset => {
      if (inset === current) return;
      current = inset;
      insets.push(inset);
    },
    prefersCrossFade: () => false,
    animate: config => animations.push(config),
    os: 'ios',
  });
  return { model, insets, animations };
}

describe('the inset follows the keyboard and the frame', () => {
  it('lifts the view by its overlap with the keyboard once both are known', () => {
    const { model, insets } = setup();

    model.laidOut(FRAME);
    model.keyboardShown(keyboardEvent());

    expect(insets).toEqual([200]);
  });

  it('applies a keyboard event that came before the first layout, at that layout', () => {
    const { model, insets } = setup();

    model.keyboardShown(keyboardEvent());
    expect(insets).toEqual([]);
    model.laidOut(FRAME);

    expect(insets).toEqual([200]);
  });

  it('recomputes when the view changes height while the keyboard is up', () => {
    const { model, insets } = setup();
    model.laidOut(FRAME);
    model.keyboardShown(keyboardEvent());

    model.laidOut({ ...FRAME, height: 250 });

    expect(insets).toEqual([200, 150]);
  });

  it('ignores a layout that keeps the height', () => {
    const { model, insets } = setup();
    model.laidOut(FRAME);
    model.keyboardShown(keyboardEvent());

    model.laidOut({ ...FRAME, y: 480 });

    expect(insets).toEqual([200]);
  });

  it('drops the inset to zero when the keyboard hides, and a later layout keeps it there', () => {
    const { model, insets } = setup();
    model.laidOut(FRAME);
    model.keyboardShown(keyboardEvent());

    model.keyboardHidden();
    model.laidOut({ ...FRAME, height: 100 });

    expect(insets).toEqual([200, 0]);
  });

  it('does not set the same inset twice', () => {
    const { model, insets } = setup();
    model.laidOut(FRAME);
    model.keyboardShown(keyboardEvent());

    model.keyboardShown(keyboardEvent());

    expect(insets).toEqual([200]);
  });
});

describe('the first measured height stays the initial one', () => {
  it('keeps the height the view had before any later layout', () => {
    const { model } = setup();

    model.laidOut(FRAME);
    model.laidOut({ ...FRAME, height: 120 });

    expect(model.initialHeight()).toBe(FRAME.height);
  });
});

describe('the transition curve', () => {
  it('arms the next commit to animate over the keyboard curve when the inset changes', () => {
    const { model, animations } = setup();
    model.laidOut(FRAME);

    model.keyboardShown(keyboardEvent());

    expect(animations).toHaveLength(1);
  });

  it('arms nothing when the view is disabled', () => {
    const { model, animations } = setup({ enabled: false });
    model.laidOut(FRAME);

    model.keyboardShown(keyboardEvent());

    expect(animations).toHaveLength(0);
  });

  it('arms nothing when the inset did not move', () => {
    const { model, animations } = setup();
    model.laidOut(FRAME);
    model.keyboardShown(keyboardEvent());

    model.keyboardShown(keyboardEvent());

    expect(animations).toHaveLength(1);
  });
});

describe('the height behavior reads the inset it already applied', () => {
  it('does not walk the view down when the shrunk frame lays out again', () => {
    const { model, insets } = setup({ behavior: 'height' });
    model.laidOut(FRAME);
    model.keyboardShown(keyboardEvent());

    model.laidOut({ ...FRAME, height: FRAME.height - 200 });

    expect(insets).toEqual([200]);
  });

  // RN adds `state.bottom`, which a disabled view never sets, so a repeated event settles
  it('does not stack the overlap again while the view is disabled', () => {
    const { model, insets } = setup({ behavior: 'height', enabled: false });
    model.laidOut(FRAME);

    model.keyboardShown(keyboardEvent());
    model.keyboardShown(keyboardEvent());

    expect(insets).toEqual([200]);
  });
});
