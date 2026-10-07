import { describe, expect, it, vi } from 'vitest';
import { createJsonKeyedResourceController } from './json-keyed-resource-controller';

function controllerOf() {
  const dispose = vi.fn();
  const controller = createJsonKeyedResourceController(
    (key: { id: number }) => ({ ...key }),
    dispose,
  );
  return { controller, dispose };
}

describe('createJsonKeyedResourceController', () => {
  it('reuses the resource for a key that is equal by value, not by identity', () => {
    const { controller } = controllerOf();

    const first = controller.resolve({ id: 1 });
    const second = controller.resolve({ id: 1 });

    expect(second).toBe(first);
  });

  it('creates a new resource when the key changes and releases the old one on flush', () => {
    const { controller, dispose } = controllerOf();

    const first = controller.resolve({ id: 1 });
    controller.resolve({ id: 2 });
    expect(dispose).not.toHaveBeenCalled();
    controller.flushDispose();

    expect(dispose).toHaveBeenCalledWith(first);
  });

  it('releases the current resource on dispose', () => {
    const { controller, dispose } = controllerOf();

    const resource = controller.resolve({ id: 1 });
    controller.dispose();

    expect(dispose).toHaveBeenCalledWith(resource);
  });
});
