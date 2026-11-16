import React, { useEffect, useState } from 'react';
import {
  Landmark,
  TrendingUp,
  TrendingDown,
  Wallet,
  Percent,
  Trash2,
  FolderOpen,
  Plus,
} from 'lucide-react';
import { trpc } from './lib/trpc';
import { StatementUploader } from './components/StatementUploader';
import { AddTransactionPanel } from './components/AddTransactionPanel';
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
  const [newLedgerName, setNewLedgerName] = useState('');

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

  const createLedgerMutation = trpc.finance.createLedger.useMutation({
    onSuccess: async (data) => {
      setNewLedgerName('');
      await utils.finance.getFileUploads.invalidate();
      setSelectedCategoryFilter('all');
      setSelectedUploadId(data.fileUploadId);
    },
  });

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
                Dynamic Statement Parsing, Live Transaction Logging &amp; AI Financial Advisory
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
        {/* Left Sidebar: Uploader + Custom Ledger Creator + Statement Selector */}
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
                  Active Ledgers &amp; Statements
                </h2>
                <p className="card-subtitle">
                  {uploads.length} {uploads.length === 1 ? 'ledger' : 'ledgers'} in workspace
                </p>
              </div>
            </div>
            <div className="card-body">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newLedgerName.trim()) return;
                  createLedgerMutation.mutate({
                    ledgerName: newLedgerName.trim(),
                  });
                }}
                style={{
                  display: 'flex',
                  gap: '0.45rem',
                  marginBottom: '0.85rem',
                }}
              >
                <input
                  id="new-ledger-name-input"
                  type="text"
                  className="input-control"
                  style={{ flex: 1, minWidth: 0 }}
                  placeholder="New blank ledger name..."
                  value={newLedgerName}
                  onChange={(e) => setNewLedgerName(e.target.value)}
                />
                <button
                  id="create-blank-ledger-btn"
                  type="submit"
                  className="btn btn-primary"
                  disabled={
                    createLedgerMutation.isPending || !newLedgerName.trim()
                  }
                  title="Create a new empty ledger"
                >
                  <Plus size={14} />
                  Create
                </button>
              </form>

              {uploadsLoading ? (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Loading ledgers...
                </p>
              ) : uploads.length === 0 ? (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  No ledgers yet. Create a blank ledger above or upload a CSV, XLSX, DOCX, or PDF statement.
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
                          title="Delete ledger"
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
                Create a Ledger or Upload a Bank Statement
              </h2>
              <p
                style={{
                  color: 'var(--text-secondary)',
                  maxWidth: 520,
                  margin: '0.5rem auto 0',
                  fontSize: '0.9rem',
                }}
              >
                Enter a name under <strong>Active Ledgers &amp; Statements</strong> on the left to start a blank ledger, or upload a CSV, Excel, Word, or PDF bank statement.
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

              {/* Dynamic Live Transaction Entry Bar */}
              <AddTransactionPanel
                fileUploadId={activeUploadId}
                currencySymbol={currencySymbol}
              />

              {/* AI Financial Analyst Insights & Interactive Q&A */}
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
