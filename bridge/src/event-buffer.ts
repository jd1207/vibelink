export interface BufferedEvent {
  eventId: number;
  timestamp: number;
  payload: unknown;
}

export class EventBuffer {
  private events: BufferedEvent[] = [];
  private nextId = 1;
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  push(payload: unknown): BufferedEvent {
    const event: BufferedEvent = {
      eventId: this.nextId++,
      timestamp: Date.now(),
      payload,
    };

    this.events.push(event);

    if (this.events.length > this.maxSize) {
      this.events.shift();
    }

    return event;
  }

  getAll(): BufferedEvent[] {
    return [...this.events];
  }

  getAfter(lastEventId: number): BufferedEvent[] {
    return this.events.filter((e) => e.eventId > lastEventId);
  }
}
