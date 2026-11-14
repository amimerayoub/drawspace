import { Query, type AppwriteDatabase } from '../database/appwrite';

export type Row = Record<string, unknown> & { $id: string };

export class RowRepository {
  constructor(private readonly database: AppwriteDatabase, private readonly tableId: string) {}

  async findOne(field: string, value: string): Promise<Row | null> {
    const result = await this.database.tables.listRows(this.database.databaseId, this.tableId, [
      Query.equal(field, value), Query.limit(1),
    ]);
    return (result.rows[0] as Row | undefined) ?? null;
  }

  async insert(data: Record<string, unknown>): Promise<Row> {
    return await this.database.tables.createRow(
      this.database.databaseId,
      this.tableId,
      this.database.newId(),
      data,
    ) as Row;
  }

  async patch(rowId: string, data: Record<string, unknown>): Promise<Row> {
    return await this.database.tables.updateRow(this.database.databaseId, this.tableId, rowId, data) as Row;
  }

  async delete(rowId: string): Promise<void> {
    await this.database.tables.deleteRow(this.database.databaseId, this.tableId, rowId);
  }

  async list(queries: string[] = []): Promise<Row[]> {
    const result = await this.database.tables.listRows(this.database.databaseId, this.tableId, queries);
    return result.rows as Row[];
  }
}
