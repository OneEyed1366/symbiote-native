// Switch.js:221-225, на Android отклонённый тоггл чинится `setNativeValue`, а не `setValue`
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installRecordingFabric } from '../../../test-utils/src/index';
import {
  clearHostBehaviors,
  createElement,
  createSurface,
  listenerFor,
  routeProp,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { registerSwitchBehavior, SWITCH_TAG } from './switch';

type IEngineModule = typeof import('@symbiote-native/engine');

vi.mock('@symbiote-native/engine', async () => {
  const realEngine = await vi.importActual<IEngineModule>(
    '@symbiote-native/engine',
  );
  return {
    ...realEngine,
    Platform: { ...realEngine.Platform, OS: 'android' },
  };
});

const fabric = installRecordingFabric();
const ROOT_TAG = 8_300;

afterEach(() => clearHostBehaviors());

function changeEvent(node: ISymbioteNode, value: boolean): ISymbioteEvent {
  return {
    type: 'topChange',
    target: node,
    currentTarget: node,
    nativeEvent: { value, eventCount: 1 },
    stopPropagation: () => {},
  };
}

describe('Switch snap-back on Android', () => {
  it('sends setNativeValue when a no-op handler rejects the toggle', async () => {
    registerSwitchBehavior();
    const node = createElement('AndroidSwitch', false, SWITCH_TAG);
    routeProp(node, 'value', false);
    routeProp(node, 'onValueChange', vi.fn());
    const surface = createSurface(ROOT_TAG);
    surface.appendChild(node);
    surface.commit();

    listenerFor(node, 'change')?.(changeEvent(node, true));
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const named = (name: string) =>
      fabric.commands.filter(command => command.commandName === name);
    expect(named('setNativeValue')).toHaveLength(1);
    expect(named('setNativeValue')[0]?.args[0]).toBe(false);
    expect(named('setValue')).toHaveLength(0);
  });
});
