import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { BarChart3, PieChart as PieChartIcon } from 'lucide-react';
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  type TransactionCategoryValue,
} from '../../../shared/categories';

interface CategoryMetric {
  category: string;
  transactionType: 'income' | 'expense' | 'transfer';
  total: string;
  count: number;
  percentage: number;
}

interface MonthlyTrendMetric {
  month: string;
  income: number;
  expenses: number;
  net: number;
  transactionCount: number;
}

interface CashFlowChartsProps {
  monthlyTrends: MonthlyTrendMetric[];
  categoryBreakdown: CategoryMetric[];
  currencySymbol: string;
  onSelectCategory?: (category: string) => void;
}

function formatMonthLabel(ym: string): string {
  const [year, month] = ym.split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  if (Number.isNaN(date.getTime())) return ym;
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export const CashFlowCharts: React.FC<CashFlowChartsProps> = ({
  monthlyTrends,
  categoryBreakdown,
  currencySymbol,
  onSelectCategory,
}) => {
  const expenseCategories = categoryBreakdown
    .filter((c) => c.transactionType === 'expense')
    .slice(0, 7);

  const chartData = monthlyTrends.map((m) => ({
    ...m,
    label: formatMonthLabel(m.month),
  }));

  return (
    <section className="charts-grid" aria-label="Cash flow and category visualizations">
      {/* Monthly Cash Flow Bar Chart */}
      <div className="surface-card">
        <div className="card-header">
          <div>
            <h2 className="card-title">
              <BarChart3 size={17} />
              Monthly Cash Flow
            </h2>
            <p className="card-subtitle">
              Inflow vs. Outflow progression across statement periods
            </p>
          </div>
        </div>
        <div className="card-body" style={{ height: 310 }}>
          {chartData.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No monthly trend data available for this statement.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="hsl(38, 16%, 88%)"
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: 'hsl(215, 16%, 38%)' }}
                  axisLine={{ stroke: 'hsl(38, 16%, 88%)' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: 'hsl(215, 16%, 38%)' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) =>
                    `${currencySymbol}${Number(v).toLocaleString()}`
                  }
                />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    `${currencySymbol}${Number(value).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`,
                    name,
                  ]}
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    borderRadius: '8px',
                    border: '1px solid hsl(38, 16%, 84%)',
                    fontSize: '0.82rem',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '0.8rem', paddingTop: '8px' }} />
                <Bar
                  dataKey="income"
                  name="Income"
                  fill="hsl(158, 68%, 28%)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={42}
                />
                <Bar
                  dataKey="expenses"
                  name="Expenses"
                  fill="hsl(14, 72%, 44%)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={42}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Expense Allocation Breakdown */}
      <div className="surface-card">
        <div className="card-header">
          <div>
            <h2 className="card-title">
              <PieChartIcon size={17} />
              Expense Allocation by Category
            </h2>
            <p className="card-subtitle">
              Click any category to filter the transaction ledger
            </p>
          </div>
        </div>
        <div className="card-body">
          {expenseCategories.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No categorized expenses recorded in this upload.
            </p>
          ) : (
            <div className="category-list">
              {expenseCategories.map((item) => {
                const catKey = item.category as TransactionCategoryValue;
                const label = CATEGORY_LABELS[catKey] || item.category;
                const color = CATEGORY_COLORS[catKey] || '#475569';
                return (
                  <div
                    key={item.category}
                    className="category-row"
                    style={{ cursor: onSelectCategory ? 'pointer' : 'default' }}
                    onClick={() => onSelectCategory?.(item.category)}
                    title={`Filter ledger by ${label}`}
                  >
                    <div className="category-row-header">
                      <span
                        style={{
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                        }}
                      >
                        <span
                          style={{
                            width: 9,
                            height: 9,
                            borderRadius: '50%',
                            backgroundColor: color,
                            display: 'inline-block',
                          }}
                        />
                        {label}
                        <span
                          style={{
                            fontSize: '0.73rem',
                            color: 'var(--text-muted)',
                            fontWeight: 400,
                          }}
                        >
                          ({item.count})
                        </span>
                      </span>
                      <span className="mono-cell" style={{ fontWeight: 600 }}>
                        {currencySymbol}
                        {Number(item.total).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        <span
                          style={{
                            color: 'var(--text-muted)',
                            fontWeight: 400,
                            fontSize: '0.75rem',
                          }}
                        >
                          ({item.percentage}%)
                        </span>
                      </span>
                    </div>
                    <div className="category-bar-track">
                      <div
                        className="category-bar-fill"
                        style={{
                          width: `${Math.max(item.percentage, 3)}%`,
                          backgroundColor: color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
