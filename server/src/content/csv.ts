export class CsvError extends Error {
  constructor(message: string) { super(message); this.name = 'CsvError'; }
}

export function parseCsv(text: string): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };
  while (i < input.length) {
    const char = input[i];
    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      field += char; i += 1; continue;
    }
    if (char === '"' && field === '') { inQuotes = true; i += 1; continue; }
    if (char === ',') { pushField(); i += 1; continue; }
    if (char === '\r' || char === '\n') {
      pushRow();
      if (char === '\r' && input[i + 1] === '\n') i += 2; else i += 1;
      continue;
    }
    field += char; i += 1;
  }
  if (inQuotes) throw new CsvError('Unterminated quoted field in CSV.');
  if (field !== '' || row.length > 0) pushRow();
  return rows;
}

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function escapeCsvCell(value: string, formulaProtection = true): string {
  let cell = value;
  if (formulaProtection && FORMULA_PREFIX.test(cell)) cell = `'${cell}`;
  if (/[",\r\n]/.test(cell) || cell !== cell.trim()) return `"${cell.replaceAll('"', '""')}"`;
  return cell;
}

export function serializeCsv(rows: readonly (readonly string[])[], options: { formulaProtection?: boolean } = {}): string {
  const protect = options.formulaProtection !== false;
  return rows.map((row) => row.map((cell) => escapeCsvCell(String(cell ?? ''), protect)).join(',')).join('\r\n');
}

export interface CsvTable { headers: string[]; records: Record<string, string>[] }

export function parseCsvTable(text: string): CsvTable {
  const rows = parseCsv(text).filter((row) => row.some((cell) => cell.trim() !== ''));
  if (rows.length === 0) throw new CsvError('CSV file is empty.');
  const headers = rows[0].map((header) => header.trim());
  if (headers.some((header) => header === '')) throw new CsvError('CSV header row contains an empty column name.');
  if (new Set(headers).size !== headers.length) throw new CsvError('CSV header row contains duplicate column names.');
  const records = rows.slice(1).map((row, index) => {
    if (row.length > headers.length) throw new CsvError(`CSV row ${index + 2} has more columns than the header.`);
    const record: Record<string, string> = {};
    headers.forEach((header, column) => { record[header] = row[column] ?? ''; });
    return record;
  });
  return { headers, records };
}