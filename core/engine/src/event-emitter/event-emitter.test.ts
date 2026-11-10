// RN exports its `EventEmitter` class from `react-native`, apps and libraries construct their own

import { describe, expect, it } from 'vitest';
import { EventEmitter } from '../index';

describe('EventEmitter', () => {
  it('calls a listener with the arguments of an emit', () => {
    const emitter = new EventEmitter();
    const seen: unknown[][] = [];
    emitter.addListener('ping', (...args: unknown[]) => seen.push(args));
    emitter.emit('ping', 1, 'two');

    expect(seen).toEqual([[1, 'two']]);
  });

  it('stops calling a listener once its subscription is removed', () => {
    const emitter = new EventEmitter();
    let calls = 0;
    const subscription = emitter.addListener('ping', () => {
      calls += 1;
    });
    emitter.emit('ping');
    subscription.remove();
    emitter.emit('ping');

    expect(calls).toBe(1);
  });

  it('counts the listeners of an event and removes them all', () => {
    const emitter = new EventEmitter();
    emitter.addListener('ping', () => {});
    emitter.addListener('ping', () => {});
    expect(emitter.listenerCount('ping')).toBe(2);

    emitter.removeAllListeners('ping');
    expect(emitter.listenerCount('ping')).toBe(0);
  });
});
