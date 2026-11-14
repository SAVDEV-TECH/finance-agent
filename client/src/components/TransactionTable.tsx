import React, { useMemo, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import {
  ArrowUpDown,
  Search,
  Download,
  Filter,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { trpc } from '../lib/trpc';
import {
  TRANSACTION_CATEGORIES,
  CATEGORY_LABELS,
  type TransactionCategoryValue,
} from '../../../shared/categories';

export interface LedgerTransaction {
  id: number;
  fileUploadId: number;
  date: Date | string;
  description: string;
  amount: string;
  category: TransactionCategoryValue;
  transactionType: 'income' | 'expense' | 'transfer';
  account: string;
}

interface TransactionTableProps {
  fileUploadId: number;
  transactions: LedgerTransaction[];
  currencySymbol: string;
  selectedCategoryFilter: string;
  onCategoryFilterChange: (category: string) => void;
}

const columnHelper = createColumnHelper<LedgerTransaction>();

export const TransactionTable: React.FC<TransactionTableProps> = ({
  fileUploadId,
  transactions,
  currencySymbol,
  selectedCategoryFilter,
  onCategoryFilterChange,
}) => {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'date', desc: true },
  ]);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const utils = trpc.useUtils();
  const recategorizeMutation = trpc.finance.recategorize.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.finance.getTransactions.invalidate({ fileUploadId }),
        utils.finance.getMetrics.invalidate({ fileUploadId }),
        utils.finance.getAnalysis.invalidate({ fileUploadId }),
      ]);
    },
  });

  const filteredData = useMemo(() => {
    return transactions.filter((tx) => {
      if (typeFilter !== 'all' && tx.transactionType !== typeFilter) {
        return false;
      }
      if (
        selectedCategoryFilter !== 'all' &&
        tx.category !== selectedCategoryFilter
      ) {
        return false;
      }
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase();
        const matchesDesc = tx.description.toLowerCase().includes(q);
        const matchesAcc = tx.account.toLowerCase().includes(q);
        const matchesCat = (
          CATEGORY_LABELS[tx.category] || tx.category
        )
          .toLowerCase()
          .includes(q);
        return matchesDesc || matchesAcc || matchesCat;
      }
      return true;
    });
  }, [transactions, typeFilter, selectedCategoryFilter, searchQuery]);

  const columns = useMemo(
    () => [
      columnHelper.accessor(
        (row) =>
          row.date instanceof Date
            ? row.date.getTime()
            : new Date(row.date).getTime(),
        {
          id: 'date',
          header: 'Date',
          cell: (info) => {
            const d = new Date(info.getValue());
            return (
              <span className="mono-cell">
                {Number.isNaN(d.getTime())
                  ? '—'
                  : d.toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: '2-digit',
                    })}
              </span>
            );
          },
        }
      ),
      columnHelper.accessor('description', {
        header: 'Merchant / Description',
        cell: (info) => (
          <div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {info.getValue()}
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              {info.row.original.account}
            </div>
          </div>
        ),
      }),
      columnHelper.accessor('transactionType', {
        header: 'Flow',
        cell: (info) => {
          const val = info.getValue();
          return <span className={`type-pill ${val}`}>{val}</span>;
        },
      }),
      columnHelper.accessor('category', {
        header: 'Category (Inline Edit)',
        cell: (info) => {
          const tx = info.row.original;
          return (
            <select
              aria-label={`Category for ${tx.description}`}
              className="select-control"
              style={{ fontSize: '0.79rem', padding: '0.32rem 0.55rem' }}
              value={tx.category}
              disabled={recategorizeMutation.isPending}
              onChange={(e) => {
                const newCat = e.target.value as TransactionCategoryValue;
                recategorizeMutation.mutate({
                  transactionId: tx.id,
                  fileUploadId,
                  category: newCat,
                });
              }}
            >
              {TRANSACTION_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>
          );
        },
      }),
      columnHelper.accessor((row) => Number(row.amount), {
        id: 'amount',
        header: 'Amount',
        cell: (info) => {
          const num = info.getValue();
          const txType = info.row.original.transactionType;
          const prefix = num > 0 ? '+' : num < 0 ? '-' : '';
          return (
            <span className={`amount-badge ${txType}`}>
              {prefix}
              {currencySymbol}
              {Math.abs(num).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          );
        },
      }),
    ],
    [currencySymbol, fileUploadId, recategorizeMutation]
  );

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  const handleExportCsv = () => {
    const headers = ['Date', 'Description', 'Account', 'Type', 'Category', 'Amount'];
    const csvRows = [
      headers.join(','),
      ...filteredData.map((r) => {
        const d = new Date(r.date).toISOString().slice(0, 10);
        const desc = `"${r.description.replace(/"/g, '""')}"`;
        const acc = `"${r.account.replace(/"/g, '""')}"`;
        return [d, desc, acc, r.transactionType, r.category, r.amount].join(',');
      }),
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `categorized-ledger-${fileUploadId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="surface-card" aria-label="Transaction Ledger">
      <div className="card-header">
        <div>
          <h2 className="card-title">
            <Filter size={17} />
            Categorized Transaction Ledger
          </h2>
          <p className="card-subtitle">
            Showing {filteredData.length} of {transactions.length} transactions — reassign any category inline to recalculate totals
          </p>
        </div>

        <button
          id="export-ledger-csv-btn"
          type="button"
          className="btn btn-secondary"
          onClick={handleExportCsv}
        >
          <Download size={14} />
          Export Filtered CSV
        </button>
      </div>

      <div className="table-toolbar">
        <div className="toolbar-filters">
          <div style={{ position: 'relative', minWidth: 230, flex: '1 1 230px', maxWidth: 340 }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              id="ledger-search-input"
              type="search"
              className="input-control"
              style={{ width: '100%', paddingLeft: '2rem' }}
              placeholder="Search merchant, account, or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <select
            id="ledger-type-filter"
            className="select-control"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">All Flows (Income &amp; Expense)</option>
            <option value="income">Income Only</option>
            <option value="expense">Expenses Only</option>
            <option value="transfer">Transfers Only</option>
          </select>

          <select
            id="ledger-category-filter"
            className="select-control"
            value={selectedCategoryFilter}
            onChange={(e) => onCategoryFilterChange(e.target.value)}
          >
            <option value="all">All Categories</option>
            {TRANSACTION_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>

          {(typeFilter !== 'all' ||
            selectedCategoryFilter !== 'all' ||
            searchQuery.trim() !== '') && (
            <button
              id="clear-ledger-filters-btn"
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setTypeFilter('all');
                onCategoryFilterChange('all');
                setSearchQuery('');
              }}
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      <div className="table-scroll">
        <table className="ledger-table">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  return (
                    <th
                      key={header.id}
                      className={canSort ? 'sortable' : ''}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                        }}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {canSort && <ArrowUpDown size={12} />}
                      </span>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{
                    textAlign: 'center',
                    padding: '2.25rem',
                    color: 'var(--text-muted)',
                  }}
                >
                  No transactions match your current filter criteria.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="pagination-bar">
        <div>
          Page <strong>{table.getState().pagination.pageIndex + 1}</strong> of{' '}
          <strong>{Math.max(table.getPageCount(), 1)}</strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            id="ledger-prev-page-btn"
            type="button"
            className="btn btn-secondary"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            <ChevronLeft size={14} />
            Previous
          </button>
          <button
            id="ledger-next-page-btn"
            type="button"
            className="btn btn-secondary"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            Next
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </section>
  );
};
