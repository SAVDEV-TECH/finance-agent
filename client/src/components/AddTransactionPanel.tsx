import React, { useState } from 'react';
import { PlusCircle, Sparkles } from 'lucide-react';
import { trpc } from '../lib/trpc';
import {
  TRANSACTION_CATEGORIES,
  CATEGORY_LABELS,
} from '../../../shared/categories';

interface AddTransactionPanelProps {
  fileUploadId: number;
  currencySymbol: string;
}

export const AddTransactionPanel: React.FC<AddTransactionPanelProps> = ({
  fileUploadId,
  currencySymbol,
}) => {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [flowType, setFlowType] = useState<'expense' | 'income' | 'transfer'>('expense');
  const [category, setCategory] = useState<string>('auto');
  const [account, setAccount] = useState('Primary Checking');
  const [feedback, setFeedback] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const addMutation = trpc.finance.addTransaction.useMutation({
    onSuccess: async (res) => {
      setDescription('');
      setAmount('');
      const label =
        CATEGORY_LABELS[res.category as keyof typeof CATEGORY_LABELS] ||
        res.category;
      setFeedback(`Added & classified under "${label}".`);
      setTimeout(() => setFeedback(null), 4000);
      await Promise.all([
        utils.finance.getTransactions.invalidate({ fileUploadId }),
        utils.finance.getMetrics.invalidate({ fileUploadId }),
        utils.finance.getAnalysis.invalidate({ fileUploadId }),
        utils.finance.getFileUploads.invalidate(),
      ]);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = parseFloat(amount);
    if (!description.trim() || Number.isNaN(numericAmount) || numericAmount <= 0) {
      return;
    }

    addMutation.mutate({
      fileUploadId,
      date,
      description: description.trim(),
      amount: numericAmount,
      flowType,
      category,
      account: account.trim() || 'Primary Checking',
    });
  };

  return (
    <section className="surface-card" aria-label="Add Live Transaction">
      <div className="card-header">
        <div>
          <h2 className="card-title">
            <PlusCircle size={17} style={{ color: 'var(--accent-primary)' }} />
            Log Live Transaction
          </h2>
          <p className="card-subtitle">
            Add income, expenses, or transfers manually — leave Category on Auto-Detect for instant AI classification
          </p>
        </div>
        {feedback && (
          <span
            style={{
              fontSize: '0.78rem',
              fontWeight: 600,
              color: 'var(--positive-fg)',
              background: 'var(--positive-bg)',
              padding: '0.3rem 0.65rem',
              borderRadius: '999px',
            }}
          >
            {feedback}
          </span>
        )}
      </div>

      <div className="card-body">
        <form
          onSubmit={handleSubmit}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '0.75rem',
            alignItems: 'end',
          }}
        >
          <div>
            <label
              htmlFor="add-tx-date"
              style={{
                display: 'block',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: '0.3rem',
              }}
            >
              Date
            </label>
            <input
              id="add-tx-date"
              type="date"
              required
              className="input-control"
              style={{ width: '100%' }}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div style={{ gridColumn: 'span 2', minWidth: 200 }}>
            <label
              htmlFor="add-tx-desc"
              style={{
                display: 'block',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: '0.3rem',
              }}
            >
              Merchant / Description
            </label>
            <input
              id="add-tx-desc"
              type="text"
              required
              placeholder="e.g. Whole Foods Market, Client Retainer, Uber..."
              className="input-control"
              style={{ width: '100%' }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label
              htmlFor="add-tx-amount"
              style={{
                display: 'block',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: '0.3rem',
              }}
            >
              Amount ({currencySymbol})
            </label>
            <input
              id="add-tx-amount"
              type="number"
              step="0.01"
              min="0.01"
              required
              placeholder="0.00"
              className="input-control"
              style={{ width: '100%' }}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div>
            <label
              htmlFor="add-tx-flow"
              style={{
                display: 'block',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: '0.3rem',
              }}
            >
              Flow Type
            </label>
            <select
              id="add-tx-flow"
              className="select-control"
              style={{ width: '100%' }}
              value={flowType}
              onChange={(e) =>
                setFlowType(e.target.value as 'expense' | 'income' | 'transfer')
              }
            >
              <option value="expense">Expense (-)</option>
              <option value="income">Income (+)</option>
              <option value="transfer">Transfer</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="add-tx-category"
              style={{
                display: 'block',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: '0.3rem',
              }}
            >
              Category
            </label>
            <select
              id="add-tx-category"
              className="select-control"
              style={{ width: '100%' }}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="auto">✨ Auto-Detect with AI</option>
              {TRANSACTION_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="add-tx-account"
              style={{
                display: 'block',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: '0.3rem',
              }}
            >
              Account
            </label>
            <input
              id="add-tx-account"
              type="text"
              className="input-control"
              style={{ width: '100%' }}
              value={account}
              onChange={(e) => setAccount(e.target.value)}
            />
          </div>

          <div>
            <button
              id="submit-add-tx-btn"
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', height: 36 }}
              disabled={addMutation.isPending}
            >
              <Sparkles size={14} />
              {addMutation.isPending ? 'Adding...' : 'Add Transaction'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
};
