import Decimal from 'decimal.js';

export interface MetricTransactionInput {
  amount: string | number;
  category: string;
  transactionType: 'income' | 'expense' | 'transfer';
  date?: Date | string;
}

export interface CategoryMetric {
  category: string;
  transactionType: 'income' | 'expense' | 'transfer';
  total: string;
  count: number;
  percentage: number;
}

export interface MonthlyTrendMetric {
  month: string;
  income: number;
  expenses: number;
  net: number;
  transactionCount: number;
}

export interface FinancialMetricsResult {
  totalIncome: string;
  totalExpenses: string;
  netCashFlow: string;
  totalTransfers: string;
  savingsRate: number;
  transactionCount: number;
  averageExpense: string;
  largestExpense: string;
  categoryBreakdown: CategoryMetric[];
  monthlyTrends: MonthlyTrendMetric[];
}

/**
 * Computes exact financial metrics using Decimal.js to avoid floating-point errors.
 */
export function calculateFinancialMetrics(
  rows: MetricTransactionInput[]
): FinancialMetricsResult {
  let totalIncome = new Decimal(0);
  let totalExpenses = new Decimal(0);
  let totalTransfers = new Decimal(0);
  let expenseCount = 0;
  let largestExpense = new Decimal(0);

  const categoryMap = new Map<
    string,
    {
      category: string;
      transactionType: 'income' | 'expense' | 'transfer';
      total: Decimal;
      count: number;
    }
  >();

  const monthlyMap = new Map<
    string,
    {
      income: Decimal;
      expenses: Decimal;
      transactionCount: number;
    }
  >();

  for (const row of rows) {
    const rawAmount = new Decimal(row.amount || 0);
    const absAmount = rawAmount.abs();

    const isTransfer =
      row.transactionType === 'transfer' || row.category === 'transfer';
    const isIncome =
      !isTransfer &&
      (row.transactionType === 'income' ||
        (row.transactionType !== 'expense' && rawAmount.gt(0)));

    if (isTransfer) {
      totalTransfers = totalTransfers.plus(absAmount);
    } else if (isIncome) {
      totalIncome = totalIncome.plus(absAmount);
    } else {
      totalExpenses = totalExpenses.plus(absAmount);
      expenseCount += 1;
      if (absAmount.gt(largestExpense)) {
        largestExpense = absAmount;
      }
    }

    const effectiveType: 'income' | 'expense' | 'transfer' = isTransfer
      ? 'transfer'
      : isIncome
        ? 'income'
        : 'expense';

    const key = `${effectiveType}:${row.category}`;
    const existingCat = categoryMap.get(key);
    if (existingCat) {
      existingCat.total = existingCat.total.plus(absAmount);
      existingCat.count += 1;
    } else {
      categoryMap.set(key, {
        category: row.category,
        transactionType: effectiveType,
        total: absAmount,
        count: 1,
      });
    }

    if (row.date) {
      const parsedDate =
        row.date instanceof Date ? row.date : new Date(row.date);
      if (!Number.isNaN(parsedDate.getTime())) {
        const year = parsedDate.getUTCFullYear();
        const month = String(parsedDate.getUTCMonth() + 1).padStart(2, '0');
        const monthKey = `${year}-${month}`;
        const existingMonth = monthlyMap.get(monthKey) ?? {
          income: new Decimal(0),
          expenses: new Decimal(0),
          transactionCount: 0,
        };
        if (isIncome) {
          existingMonth.income = existingMonth.income.plus(absAmount);
        } else if (!isTransfer) {
          existingMonth.expenses = existingMonth.expenses.plus(absAmount);
        }
        existingMonth.transactionCount += 1;
        monthlyMap.set(monthKey, existingMonth);
      }
    }
  }

  const netCashFlow = totalIncome.minus(totalExpenses);
  const savingsRate = totalIncome.gt(0)
    ? Number(netCashFlow.div(totalIncome).times(100).toDecimalPlaces(1))
    : 0;

  const averageExpense =
    expenseCount > 0
      ? totalExpenses.div(expenseCount).toFixed(2)
      : new Decimal(0).toFixed(2);

  const categoryBreakdown: CategoryMetric[] = Array.from(categoryMap.values())
    .map((item) => {
      const denominator =
        item.transactionType === 'income'
          ? totalIncome
          : item.transactionType === 'expense'
            ? totalExpenses
            : totalTransfers;
      const percentage = denominator.gt(0)
        ? Number(item.total.div(denominator).times(100).toDecimalPlaces(1))
        : 0;
      return {
        category: item.category,
        transactionType: item.transactionType,
        total: item.total.toFixed(2),
        count: item.count,
        percentage,
      };
    })
    .sort((a, b) => Number(b.total) - Number(a.total));

  const monthlyTrends: MonthlyTrendMetric[] = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => {
      const inc = Number(data.income.toFixed(2));
      const exp = Number(data.expenses.toFixed(2));
      return {
        month,
        income: inc,
        expenses: exp,
        net: Number(data.income.minus(data.expenses).toFixed(2)),
        transactionCount: data.transactionCount,
      };
    });

  return {
    totalIncome: totalIncome.toFixed(2),
    totalExpenses: totalExpenses.toFixed(2),
    netCashFlow: netCashFlow.toFixed(2),
    totalTransfers: totalTransfers.toFixed(2),
    savingsRate,
    transactionCount: rows.length,
    averageExpense,
    largestExpense: largestExpense.toFixed(2),
    categoryBreakdown,
    monthlyTrends,
  };
}
