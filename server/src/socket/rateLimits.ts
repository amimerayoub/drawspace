export interface SlidingWindow {
  allow(key: string, now?: number): boolean;
}

export function slidingWindow(limit: number, windowMs: number): SlidingWindow {
  const hits = new Map<string, number[]>();
  return {
    allow(key, now = Date.now()) {
      let times = hits.get(key);
      if (!times) { times = []; hits.set(key, times); }
      while (times.length && now - times[0] >= windowMs) times.shift();
      if (times.length >= limit) return false;
      times.push(now);
      if (hits.size > 10_000) {
        for (const [client, states] of hits) {
          if (!states.length || now - states[states.length - 1] >= windowMs) hits.delete(client);
        }
      }
      return true;
    },
  };
}