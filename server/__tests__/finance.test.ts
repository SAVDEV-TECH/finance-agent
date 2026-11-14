import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseCSV, parseExcel, categorizeTransaction } from '../transactionParser';
import { calculateFinancialMetrics } from '../financeMetrics';
import { classifyAmbiguousTransactions } from '../aiCategorization';
import { validateUploadedFile } from '../fileValidation';
import { parseDocumentText } from '../documentParser';
import { chunkArray } from '../batching';
import { appRouter } from '../routers';
import type { TrpcContext } from '../_core/context';

function createTestCaller(): ReturnType<typeof appRouter.createCaller> {
  const mockContext: TrpcContext = {
    req: {} as any,
    res: {} as any,
    user: {
      id: 1,
      openId: 'local-owner-openid',
      name: 'Alex Morgan',
      email: 'alex.morgan@savdev.tech',
      loginMethod: 'session',
      role: 'admin',
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
  };
  return appRouter.createCaller(mockContext);
}

describe('Finance Agent Unit Suite', () => {
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

  it('parses Excel (.xlsx) workbooks with Debit and Credit columns', () => {
    const worksheet = XLSX.utils.json_to_sheet([
      {
        Date: '2026-10-05',
        Description: 'EMPLOYER PAYROLL',
        Debit: '',
        Credit: '4200.00',
        Account: 'Main Checking',
      },
      {
        Date: '2026-10-06',
        Description: 'TRADER JOES GROCERY',
        Debit: '112.40',
        Credit: '',
        Account: 'Main Checking',
      },
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Statement');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    validateUploadedFile('xlsx', buffer);
    const parsed = parseExcel(buffer);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].amount).toBe(4200);
    expect(parsed[1].amount).toBe(-112.4);
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

describe('Finance Agent End-to-End tRPC Router Integration', () => {
  it('completes full lifecycle: upload -> metrics -> recategorize -> AI insights -> delete', async () => {
    const caller = createTestCaller();

    // 1. Verify authenticated user
    const me = await caller.auth.me();
    expect(me?.email).toBe('alex.morgan@savdev.tech');

    // 2. Upload a CSV statement
    const csvContent = `Date,Description,Amount,Account
2026-11-01,GUSTO PAYROLL DEPOSIT,6000.00,Checking
2026-11-03,AVALON APARTMENT RENT,-2000.00,Checking
2026-11-05,VERIZON FIBER INTERNET,-100.00,Amex
2026-11-08,CHIPOTLE MEXICAN GRILL,-25.00,Amex`;

    const uploadResult = await caller.finance.uploadFile({
      fileName: 'e2e-test-statement.csv',
      fileContent: Buffer.from(csvContent, 'utf-8').toString('base64'),
      fileType: 'csv',
      fileEncoding: 'base64',
    });

    expect(uploadResult.transactionCount).toBe(4);
    expect(uploadResult.totalIncome).toBe('6000.00');
    expect(uploadResult.totalExpenses).toBe('2125.00');
    expect(uploadResult.netCashFlow).toBe('3875.00');

    const fileUploadId = uploadResult.fileUploadId;

    // 3. Fetch parsed & categorized transactions
    const txs = await caller.finance.getTransactions({ fileUploadId });
    expect(txs).toHaveLength(4);
    const verizonTx = txs.find((t) => t.description.includes('VERIZON'));
    expect(verizonTx?.category).toBe('utilities');

    // 4. Recategorize a transaction and verify metrics update
    const chipotleTx = txs.find((t) => t.description.includes('CHIPOTLE'))!;
    expect(chipotleTx.category).toBe('dining');

    const recatResult = await caller.finance.recategorize({
      transactionId: chipotleTx.id,
      fileUploadId,
      category: 'entertainment',
    });
    expect(recatResult.success).toBe(true);
    expect(recatResult.category).toBe('entertainment');

    const metrics = await caller.finance.getMetrics({ fileUploadId });
    expect(metrics.totalIncome).toBe('6000.00');
    expect(metrics.totalExpenses).toBe('2125.00');
    expect(
      metrics.categoryBreakdown.some((c) => c.category === 'entertainment')
    ).toBe(true);

    // 5. Generate AI insights
    const insightsResult = await caller.finance.generateInsights({
      fileUploadId,
      currencySymbol: '$',
    });
    expect(insightsResult.insights.length).toBeGreaterThan(30);
    expect(insightsResult.topCategories.length).toBeGreaterThan(0);

    // 6. Clean up test upload
    const deleteResult = await caller.finance.deleteUpload({ fileUploadId });
    expect(deleteResult.success).toBe(true);

    const remainingTxs = await caller.finance.getTransactions({ fileUploadId });
    expect(remainingTxs).toHaveLength(0);
  });
});
