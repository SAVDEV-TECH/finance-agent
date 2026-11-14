import React, { useEffect, useState } from 'react';
import {
  Landmark,
  TrendingUp,
  TrendingDown,
  Wallet,
  Percent,
  Trash2,
  FolderOpen,
} from 'lucide-react';
import { trpc } from './lib/trpc';
import { StatementUploader } from './components/StatementUploader';
import { CashFlowCharts } from './components/CashFlowCharts';
import { AiInsightsPanel } from './components/AiInsightsPanel';
import {
  TransactionTable,
  type LedgerTransaction,
} from './components/TransactionTable';

const CURRENCY_OPTIONS = [
  { symbol: '$', label: 'USD ($)' },
  { symbol: '€', label: 'EUR (€)' },
  { symbol: '£', label: 'GBP (£)' },
  { symbol: '₦', label: 'NGN (₦)' },
  { symbol: '¥', label: 'JPY (¥)' },
];

function formatCurrency(val: string | number | undefined, symbol: string): string {
  const num = Number(val ?? 0);
  const absFormatted = Math.abs(num).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${num < 0 ? '-' : ''}${symbol}${absFormatted}`;
}

export function App() {
  const [selectedUploadId, setSelectedUploadId] = useState<number | null>(null);
  const [currencySymbol, setCurrencySymbol] = useState<string>('$');
  const [selectedCategoryFilter, setSelectedCategoryFilter] =
    useState<string>('all');

  const utils = trpc.useUtils();
  const { data: user } = trpc.auth.me.useQuery();
  const { data: uploads = [], isLoading: uploadsLoading } =
    trpc.finance.getFileUploads.useQuery();

  useEffect(() => {
    if (uploads.length > 0 && selectedUploadId === null) {
      setSelectedUploadId(uploads[0].id);
    } else if (
      uploads.length > 0 &&
      selectedUploadId !== null &&
      !uploads.some((u) => u.id === selectedUploadId)
    ) {
      setSelectedUploadId(uploads[0].id);
    } else if (uploads.length === 0) {
      setSelectedUploadId(null);
    }
  }, [uploads, selectedUploadId]);

  const activeUploadId = selectedUploadId ?? uploads[0]?.id ?? null;

  const { data: metrics } = trpc.finance.getMetrics.useQuery(
    { fileUploadId: activeUploadId! },
    { enabled: activeUploadId !== null }
  );

  const { data: transactions = [] } = trpc.finance.getTransactions.useQuery(
    { fileUploadId: activeUploadId! },
    { enabled: activeUploadId !== null }
  );

  const deleteMutation = trpc.finance.deleteUpload.useMutation({
    onSuccess: async () => {
      await utils.finance.getFileUploads.invalidate();
    },
  });

  const netNum = Number(metrics?.netCashFlow ?? 0);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand-group">
            <div className="brand-mark" aria-hidden="true">
              <Landmark size={19} />
            </div>
            <div>
              <h1 className="brand-title">LedgerPulse Finance Agent</h1>
              <p className="brand-subtitle">
                Automated Statement Parsing, Hybrid AI Categorization &amp; Cash Flow Advisory
              </p>
            </div>
          </div>

          <div className="topbar-controls">
            <label
              htmlFor="currency-selector"
              style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}
            >
              Currency
            </label>
            <select
              id="currency-selector"
              className="select-control"
              value={currencySymbol}
              onChange={(e) => setCurrencySymbol(e.target.value)}
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c.symbol} value={c.symbol}>
                  {c.label}
                </option>
              ))}
            </select>

            {user && (
              <div
                style={{
                  fontSize: '0.8rem',
                  padding: '0.38rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-subtle)',
                  color: 'var(--text-secondary)',
                  fontWeight: 500,
                }}
              >
                {user.name || user.email}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="workspace-container">
        {/* Left Sidebar: Uploader + Statement Selector */}
        <aside className="sidebar-column" aria-label="Statement management">
          <StatementUploader
            onUploadSuccess={(newId) => {
              setSelectedCategoryFilter('all');
              setSelectedUploadId(newId);
            }}
          />

          <div className="surface-card">
            <div className="card-header">
              <div>
                <h2 className="card-title">
                  <FolderOpen size={17} />
                  Imported Statements
                </h2>
                <p className="card-subtitle">
                  {uploads.length} {uploads.length === 1 ? 'file' : 'files'} in workspace
                </p>
              </div>
            </div>
            <div className="card-body">
              {uploadsLoading ? (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Loading statements...
                </p>
              ) : uploads.length === 0 ? (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  No statements imported yet. Upload a CSV, XLSX, DOCX, or PDF above.
                </p>
              ) : (
                <div className="statement-list">
                  {uploads.map((u) => {
                    const isSelected = u.id === activeUploadId;
                    return (
                      <div
                        key={u.id}
                        className={`statement-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => {
                          setSelectedCategoryFilter('all');
                          setSelectedUploadId(u.id);
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="statement-name">{u.fileName}</div>
                          <div className="statement-meta">
                            {u.fileType.toUpperCase()} • {u.transactionCount} txns •{' '}
                            {new Date(u.createdAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </div>
                        </div>
                        <button
                          id={`delete-statement-${u.id}`}
                          type="button"
                          className="btn btn-danger-ghost"
                          title="Delete statement"
                          disabled={deleteMutation.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteMutation.mutate({ fileUploadId: u.id });
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Main Analytical Workspace */}
        <main className="main-column">
          {activeUploadId === null ? (
            <div className="surface-card" style={{ padding: '3rem 2rem', textAlign: 'center' }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 600 }}>
                Ready to Analyze Your Financial Statements
              </h2>
              <p
                style={{
                  color: 'var(--text-secondary)',
                  maxWidth: 520,
                  margin: '0.5rem auto 0',
                  fontSize: '0.9rem',
                }}
              >
                Upload a CSV, Excel, Word, or PDF bank statement on the left—or click{' '}
                <strong>Load Sample Statement</strong> to explore live categorization and AI insights.
              </p>
            </div>
          ) : (
            <>
              {/* 4-Card KPI Strip */}
              <section className="kpi-strip" aria-label="Key financial metrics">
                <div className="kpi-tile">
                  <div className="kpi-label-row">
                    <span>Total Inflow</span>
                    <TrendingUp size={16} style={{ color: 'var(--positive-fg)' }} />
                  </div>
                  <div className="kpi-value positive">
                    {formatCurrency(metrics?.totalIncome, currencySymbol)}
                  </div>
                  <div className="kpi-meta">
                    Verified deposits, payroll &amp; dividends
                  </div>
                </div>

                <div className="kpi-tile">
                  <div className="kpi-label-row">
                    <span>Total Outflow</span>
                    <TrendingDown size={16} style={{ color: 'var(--negative-fg)' }} />
                  </div>
                  <div className="kpi-value">
                    {formatCurrency(metrics?.totalExpenses, currencySymbol)}
                  </div>
                  <div className="kpi-meta">
                    Largest expense:{' '}
                    <span className="mono-cell">
                      {formatCurrency(metrics?.largestExpense, currencySymbol)}
                    </span>
                  </div>
                </div>

                <div className="kpi-tile">
                  <div className="kpi-label-row">
                    <span>Net Cash Flow</span>
                    <Wallet size={16} />
                  </div>
                  <div
                    className={`kpi-value ${
                      netNum > 0 ? 'positive' : netNum < 0 ? 'negative' : ''
                    }`}
                  >
                    {netNum > 0 ? '+' : ''}
                    {formatCurrency(metrics?.netCashFlow, currencySymbol)}
                  </div>
                  <div className="kpi-meta">
                    Across {metrics?.transactionCount ?? 0} total transactions
                  </div>
                </div>

                <div className="kpi-tile">
                  <div className="kpi-label-row">
                    <span>Savings Rate</span>
                    <Percent size={16} />
                  </div>
                  <div
                    className={`kpi-value ${
                      (metrics?.savingsRate ?? 0) >= 20 ? 'positive' : ''
                    }`}
                  >
                    {(metrics?.savingsRate ?? 0).toFixed(1)}%
                  </div>
                  <div className="kpi-meta">
                    Avg. expense:{' '}
                    <span className="mono-cell">
                      {formatCurrency(metrics?.averageExpense, currencySymbol)}
                    </span>
                  </div>
                </div>
              </section>

              {/* AI Financial Analyst Insights */}
              <AiInsightsPanel
                fileUploadId={activeUploadId}
                currencySymbol={currencySymbol}
              />

              {/* Cash Flow & Category Breakdown Charts */}
              <CashFlowCharts
                monthlyTrends={metrics?.monthlyTrends ?? []}
                categoryBreakdown={metrics?.categoryBreakdown ?? []}
                currencySymbol={currencySymbol}
                onSelectCategory={(cat) =>
                  setSelectedCategoryFilter((prev) =>
                    prev === cat ? 'all' : cat
                  )
                }
              />

              {/* Interactive TanStack Transaction Ledger */}
              <TransactionTable
                fileUploadId={activeUploadId}
                transactions={transactions as unknown as LedgerTransaction[]}
                currencySymbol={currencySymbol}
                selectedCategoryFilter={selectedCategoryFilter}
                onCategoryFilterChange={setSelectedCategoryFilter}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
