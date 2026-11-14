// Pointers as the touches the engine reads. A touch belongs to the node it started on for its whole
// life, however far the pointer travels, as on a device

export type ITouchPoint = {
  identifier: number;
  pageX: number;
  pageY: number;
  locationX: number;
  locationY: number;
  timestamp: number;
};

// RN's touch event carries the changed touch's fields at the top level too
export type ITouchEvent = ITouchPoint & {
  touches: ITouchPoint[];
  changedTouches: ITouchPoint[];
};

export type IGesture = { target: object; event: ITouchEvent };

type IActiveTouch = {
  identifier: number;
  target: object;
  element: Element;
  point: ITouchPoint;
};

export type ITouchTracker = {
  begin: (event: PointerEvent, target: object, element: Element) => IGesture;
  update: (event: PointerEvent) => IGesture | undefined;
  // The touch leaves the list before the event is built, as a lifted finger is no longer down
  finish: (event: PointerEvent) => IGesture | undefined;
};

function pointOf(
  event: PointerEvent,
  element: Element,
  identifier: number,
): ITouchPoint {
  const rect = element.getBoundingClientRect();
  const view = element.ownerDocument.defaultView;
  return {
    identifier,
    pageX: event.clientX + (view?.scrollX ?? 0),
    pageY: event.clientY + (view?.scrollY ?? 0),
    locationX: event.clientX - rect.left,
    locationY: event.clientY - rect.top,
    timestamp: event.timeStamp,
  };
}

export function createTouchTracker(): ITouchTracker {
  const active = new Map<number, IActiveTouch>();

  const eventOf = (changed: ITouchPoint): ITouchEvent => ({
    ...changed,
    touches: [...active.values()].map(touch => touch.point),
    changedTouches: [changed],
  });

  // The smallest identifier not in use, as a device numbers fingers
  const freeIdentifier = (): number => {
    const used = new Set([...active.values()].map(touch => touch.identifier));
    let identifier = 0;
    while (used.has(identifier)) identifier += 1;
    return identifier;
  };

  return {
    begin(event, target, element) {
      const identifier = freeIdentifier();
      const point = pointOf(event, element, identifier);
      active.set(event.pointerId, { identifier, target, element, point });
      return { target, event: eventOf(point) };
    },
    update(event) {
      const touch = active.get(event.pointerId);
      if (touch === undefined) return undefined;
      touch.point = pointOf(event, touch.element, touch.identifier);
      return { target: touch.target, event: eventOf(touch.point) };
    },
    finish(event) {
      const touch = active.get(event.pointerId);
      if (touch === undefined) return undefined;
      active.delete(event.pointerId);
      const point = pointOf(event, touch.element, touch.identifier);
      return { target: touch.target, event: eventOf(point) };
    },
  };
}
