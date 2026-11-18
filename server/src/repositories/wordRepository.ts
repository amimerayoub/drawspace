import { Query, type AppwriteDatabase } from '../database/appwrite';
import { RowRepository } from './rowRepository';

export interface GameWord { id: string; word: string; category: string; difficulty: string }

// Engine guess matching strips everything outside a-z0-9, so words that normalize to empty can never be guessed.
const playable = (word: string) => word.normalize('NFKD').toLowerCase().replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '') !== '';

const DEFAULT_TTL_MS = 3_600_000;
const PAGE_SIZE = 100;
const MAX_PAGES = 100;
const RETRY_DELAY_MS = 60_000;
// TablesDB always returns system metadata; select trims the user attributes to what gameplay reads.
const SELECT_FIELDS = ['$id', 'id', 'word', 'category', 'difficulty', 'language'];

interface WordSnapshot {
  all: GameWord[];
  byLanguage: Map<string, Map<string, GameWord[]>>;
  loadedAt: number;
}

const liveRepositories = new Set<WordRepository>();

export function invalidateWords(): void {
  for (const repository of liveRepositories) repository.invalidate();
}

export class WordRepository {
  private readonly rows: RowRepository;
  private snapshot: WordSnapshot | null = null;
  private loading: Promise<WordSnapshot> | null = null;
  private generation = 0;
  private retryTimer: NodeJS.Timeout | null = null;

  constructor(database: AppwriteDatabase, private readonly ttlMs: number = DEFAULT_TTL_MS) {
    this.rows = new RowRepository(database, 'custom_words');
    liveRepositories.add(this);
  }

  warm(): void { void this.active().catch(() => undefined); }

  invalidate(): void {
    this.generation += 1;
    this.snapshot = null;
  }

  async active(mode: 'all' | 'easy' | 'medium' | 'hard' | 'custom' | 'mixed' = 'all'): Promise<GameWord[]> {
    const snapshot = await this.ensureSnapshot();
    if (mode === 'all' || mode === 'custom' || mode === 'mixed') return snapshot.all;
    const picks: GameWord[] = [];
    for (const byDifficulty of snapshot.byLanguage.values()) picks.push(...(byDifficulty.get(mode) ?? []));
    return picks;
  }

  private ensureSnapshot(): Promise<WordSnapshot> {
    if (this.snapshot && Date.now() - this.snapshot.loadedAt < this.ttlMs) return Promise.resolve(this.snapshot);
    if (!this.loading) {
      const generation = this.generation;
      this.loading = this.load().then((snapshot) => {
        this.loading = null;
        // An admin mutation landed mid-load; the fetched rows predate it, so load again.
        if (generation !== this.generation) return this.ensureSnapshot();
        this.snapshot = snapshot;
        return snapshot;
      }).catch((error) => {
        this.loading = null;
        if (this.snapshot) {
          this.scheduleRetry();
          return this.snapshot;
        }
        throw error;
      });
    }
    return this.loading;
  }

  private scheduleRetry(): void {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.active().catch(() => undefined);
    }, RETRY_DELAY_MS);
    this.retryTimer.unref();
  }

  private async load(): Promise<WordSnapshot> {
    const all: GameWord[] = [];
    const byLanguage = new Map<string, Map<string, GameWord[]>>();
    const seen = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const queries = [Query.equal('isActive', true), Query.limit(PAGE_SIZE), Query.select(SELECT_FIELDS)];
      if (cursor) queries.push(Query.cursorAfter(cursor));
      const batch = await this.rows.list(queries);
      let added = 0;
      for (const row of batch) {
        if (seen.has(row.$id)) continue;
        seen.add(row.$id);
        added += 1;
        const word: GameWord = { id: String(row.id ?? row.$id), word: String(row.word ?? ''), category: String(row.category ?? ''), difficulty: String(row.difficulty ?? 'medium') };
        if (!playable(word.word)) continue;
        all.push(word);
        const language = String(row.language || 'en');
        let byDifficulty = byLanguage.get(language);
        if (!byDifficulty) { byDifficulty = new Map(); byLanguage.set(language, byDifficulty); }
        const bucket = byDifficulty.get(word.difficulty);
        if (bucket) bucket.push(word); else byDifficulty.set(word.difficulty, [word]);
      }
      // added === 0 also stops backends that ignore cursorAfter instead of looping on the same page.
      if (batch.length < PAGE_SIZE || added === 0) break;
      cursor = batch[batch.length - 1].$id;
    }
    return { all, byLanguage, loadedAt: Date.now() };
  }
}