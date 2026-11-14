import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Pagination, SearchInput } from './ui';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  width?: string;
  align?: 'start' | 'end' | 'center';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  searchable?: boolean;
  searchPlaceholder?: string;
  searchLabel?: string;
  searchValue?: (row: T) => string;
  pageSize?: number;
  toolbar?: ReactNode;
  emptyTitle?: string;
  emptyBody?: string;
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({
  columns, rows, rowKey, searchable, searchPlaceholder = 'Search', searchLabel = 'Search table',
  searchValue, pageSize = 10, toolbar, emptyTitle = 'Nothing here yet', emptyBody, onRowClick,
}: DataTableProps<T>) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    let out = rows;
    if (query && searchValue) {
      const q = query.toLowerCase();
      out = out.filter((r) => searchValue(r).toLowerCase().includes(q));
    }
    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey);
      if (col?.sortValue) {
        out = [...out].sort((a, b) => {
          const va = col.sortValue!(a);
          const vb = col.sortValue!(b);
          const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
          return cmp * sortDir;
        });
      }
    }
    return out;
  }, [rows, query, sortKey, sortDir, columns, searchValue]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(1);
    }
  };

  return (
    <div className="data-table">
      {(searchable || toolbar) && (
        <div className="table-toolbar">
          {searchable && <SearchInput value={query} onChange={(v) => { setQuery(v); setPage(1); }} placeholder={searchPlaceholder} label={searchLabel} />}
          {toolbar && <div className="table-toolbar-actions">{toolbar}</div>}
        </div>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} style={{ width: c.width, textAlign: c.align ?? 'start' }} aria-sort={sortKey === c.key ? (sortDir === 1 ? 'ascending' : 'descending') : undefined}>
                  {c.sortValue ? (
                    <button className="th-sort" onClick={() => toggleSort(c.key)}>
                      {c.header}
                      {sortKey === c.key ? (sortDir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} className="th-sort-idle" />}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr key={rowKey(row)} onClick={onRowClick ? () => onRowClick(row) : undefined} className={onRowClick ? 'row-click' : undefined}>
                {columns.map((c) => (
                  <td key={c.key} style={{ textAlign: c.align ?? 'start' }}>{c.render(row)}</td>
                ))}
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={columns.length}>
                  <div className="table-empty">
                    <p>{emptyTitle}</p>
                    {emptyBody && <p className="muted">{emptyBody}</p>}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="table-foot">
        <span className="muted table-count mono">{filtered.length} rows</span>
        <Pagination page={safePage} pages={pages} onChange={setPage} label="Table pagination" />
      </div>
    </div>
  );
}