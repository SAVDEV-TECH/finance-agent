import { describe, it, expect } from 'vitest';
import { parseCSV, categorizeTransaction } from '../transactionParser';
import { calculateFinancialMetrics } from '../financeMetrics';
import { classifyAmbiguousTransactions } from '../aiCategorization';
import { validateUploadedFile } from '../fileValidation';
import { parseDocumentText } from '../documentParser';
import { chunkArray } from '../batching';

describe('Finance Agent Core Suite', () => {
  it('parses CSV bank statements with varied headers and parenthesized negative amounts', async () => {
    const csv = `Transaction Date,Description,Amount,Account Name
2026-10-01,GUSTO PAYROLL,5000.00,Checking
2026-10-02,WHOLE FOODS MARKET,(145.50),Amex`;

    const parsed = await parseCSV(csv);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].amount).toBe(5000);
    expect(parsed[1].amount).toBe(-145.5);
    expect(parsed[1].account).toBe('Amex');
  });

  it('categorizes known and ambiguous transactions using deterministic + heuristic AI rules', async () => {
    const basic = categorizeTransaction('WHOLE FOODS MARKET', -82.1);
    expect(basic.category).toBe('groceries');

    const ambiguous = await classifyAmbiguousTransactions([
      { index: 0, description: 'VERIZON FIOS FIBER', amount: -79.99 },
      { index: 1, description: 'CHIPOTLE MEXICAN GRILL', amount: -16.45 },
      { index: 2, description: 'FIDELITY DIVIDEND YIELD', amount: 210.0 },
    ]);

    expect(ambiguous.get(0)).toBe('utilities');
    expect(ambiguous.get(1)).toBe('dining');
    expect(ambiguous.get(2)).toBe('investment');
  });

  it('computes exact Decimal.js financial metrics and monthly trends', () => {
    const metrics = calculateFinancialMetrics([
      {
        amount: '5000.00',
        category: 'salary',
        transactionType: 'income',
        date: '2026-10-01',
      },
      {
        amount: '-1500.25',
        category: 'rent',
        transactionType: 'expense',
        date: '2026-10-02',
      },
      {
        amount: '-499.75',
        category: 'groceries',
        transactionType: 'expense',
        date: '2026-10-10',
      },
    ]);

    expect(metrics.totalIncome).toBe('5000.00');
    expect(metrics.totalExpenses).toBe('2000.00');
    expect(metrics.netCashFlow).toBe('3000.00');
    expect(metrics.savingsRate).toBe(60);
    expect(metrics.monthlyTrends).toHaveLength(1);
    expect(metrics.monthlyTrends[0].month).toBe('2026-10');
  });

  it('validates uploaded file magic bytes and rejects malformed PDFs', () => {
    expect(() =>
      validateUploadedFile('csv', Buffer.from('Date,Description,Amount\n2026-01-01,Test,10'))
    ).not.toThrow();

    expect(() =>
      validateUploadedFile('pdf', Buffer.from('not-a-valid-pdf'))
    ).toThrow(/Invalid PDF file/);
  });

  it('extracts structured transactions from raw document statement lines', async () => {
    const docText = `Statement Period: Oct 2026
2026-10-05 STARBUCKS COFFEE #412 -$6.75
2026-10-12 STRIPE CLIENT DEPOSIT $2,400.00`;

    const rows = await parseDocumentText(docText);
    expect(rows).toHaveLength(2);
    expect(rows[0].amount).toBe(-6.75);
    expect(rows[1].amount).toBe(2400);
  });

  it('chunks arrays accurately for batched inserts', () => {
    const chunks = chunkArray([1, 2, 3, 4, 5], 2);
    expect(chunks).toEqual([[1, 2], [3, 4], [5]]);
  });
});
