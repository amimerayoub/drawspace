import { useSyncExternalStore } from 'react';
import { subscribe, db } from '@/services/db';

let version = 0;
const wrapped = new Set<() => void>();
subscribe(() => {
  version += 1;
  wrapped.forEach((l) => l());
});

export function useDb() {
  useSyncExternalStore(
    (cb) => {
      wrapped.add(cb);
      return () => {
        wrapped.delete(cb);
      };
    },
    () => version,
  );
  return db;
}