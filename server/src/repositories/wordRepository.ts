import { Query, type AppwriteDatabase } from '../database/appwrite';
import { RowRepository } from './rowRepository';

export interface GameWord { id: string; word: string; category: string; difficulty: string }

// Engine guess matching strips everything outside a-z0-9, so words that normalize to empty can never be guessed.
const playable = (word: string) => word.normalize('NFKD').toLowerCase().replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '') !== '';

export class WordRepository {
  private readonly rows: RowRepository;
  constructor(database: AppwriteDatabase) { this.rows = new RowRepository(database, 'custom_words'); }

  async active(mode: 'all' | 'easy' | 'medium' | 'hard' | 'custom' | 'mixed' = 'all'): Promise<GameWord[]> {
    const rows = await this.rows.list([Query.equal('isActive', true), Query.limit(500)]);
    const filtered = mode === 'all' || mode === 'custom' || mode === 'mixed' ? rows : rows.filter((row) => row.difficulty === mode);
    return filtered.filter((row) => playable(String(row.word))).map((row) => ({ id: String(row.id), word: String(row.word), category: String(row.category), difficulty: String(row.difficulty) }));
  }
}
