import { createContext, useContext, type ReactNode } from 'react';
import type { HeadTag } from './head';

/* renderToString never runs effects, so during prerendering SeoHead hands its
   tags to a collector instead of mutating a DOM that does not exist. */
export interface HeadCollector {
  set: (tags: HeadTag[]) => void;
}

const Ctx = createContext<HeadCollector | null>(null);

export function HeadCollectorProvider({ collector, children }: { collector: HeadCollector; children: ReactNode }) {
  return <Ctx.Provider value={collector}>{children}</Ctx.Provider>;
}

export function useHeadCollector() {
  return useContext(Ctx);
}