import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export interface ParsedTransaction {
  date: Date;
  description: string;
  amount: number;
  originalAmount: string;
  account?: string;
}

/**
 * Parse CSV file content into transactions
 */
export function parseCSV(fileContent: string): Promise<ParsedTransaction[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(fileContent, {
      header: true,
      skipEmptyLines: true,
      complete: (results: any) => {
        try {
          const transactions = results.data
            .map((row: any) => parseTransactionRow(row))
            .filter((t: ParsedTransaction | null): t is ParsedTransaction => t !== null);
          resolve(transactions);
        } catch (error) {
          reject(error);
        }
      },
      error: (error: any) => {
        reject(new Error(`CSV parsing error: ${error.message}`));
      },
    });
  });
}

/**
 * Parse Excel file buffer into transactions
 */
export function parseExcel(buffer: Buffer): ParsedTransaction[] {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new Error('No sheets found in Excel file');
    }

    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet);

    return rows
      .map((row: any) => parseTransactionRow(row))
      .filter((t): t is ParsedTransaction => t !== null);
  } catch (error) {
    throw new Error(`Excel parsing error: ${(error as Error).message}`);
  }
}

/**
 * Parse a single transaction row from CSV/Excel
 * Handles common column name variations
 */
function parseTransactionRow(row: any): ParsedTransaction | null {
  // Find date column
  const dateValue = findColumnValue(row, ['date', 'Date', 'transaction date', 'Transaction Date', 'posted date', 'Posted Date']);
  if (!dateValue) return null;

  const date = parseDate(dateValue);
  if (!date) return null;

  // Find description column
  const description = findColumnValue(row, ['description', 'Description', 'memo', 'Memo', 'transaction', 'Transaction', 'details', 'Details']);
  if (!description) return null;

  // Find amount column
  let amount: number | null = null;
  let originalAmount = '';

  const amountValue = findColumnValue(row, ['amount', 'Amount', 'value', 'Value']);
  if (amountValue) {
    const parsed = parseAmount(amountValue);
    if (parsed !== null) {
      amount = parsed.value;
      originalAmount = parsed.original;
    }
  }

  // If no amount found, try debit/credit columns
  if (amount === null) {
    const debitValue = findColumnValue(row, ['debit', 'Debit', 'withdrawal', 'Withdrawal']);
    const creditValue = findColumnValue(row, ['credit', 'Credit', 'deposit', 'Deposit']);

    const debitParsed = debitValue ? parseAmount(debitValue) : null;
    const creditParsed = creditValue ? parseAmount(creditValue) : null;

    const hasDebit = debitParsed !== null && debitParsed.value !== 0;
    const hasCredit = creditParsed !== null && creditParsed.value !== 0;

    if (hasDebit) {
      amount = -Math.abs(debitParsed!.value);
      originalAmount = debitParsed!.original;
    } else if (hasCredit) {
      amount = Math.abs(creditParsed!.value);
      originalAmount = creditParsed!.original;
    }
  }

  if (amount === null) return null;

  const account = findColumnValue(row, ['account', 'Account', 'account name', 'Account Name', 'source account', 'Source Account']);

  return {
    date,
    description: String(description).trim(),
    amount,
    originalAmount,
    account: account ? String(account).trim() : undefined,
  };
}

/**
 * Find a column value by trying multiple column name variations.
 * Matching is case-insensitive: bank exports often use ALL-CAPS headers.
 */
function findColumnValue(row: any, columnNames: string[]): any {
  const lowercaseRow: Record<string, any> = {};
  for (const key of Object.keys(row)) {
    lowercaseRow[key.toLowerCase().trim()] = row[key];
  }
  for (const name of columnNames) {
    const val = lowercaseRow[name.toLowerCase().trim()];
    if (val !== undefined && val !== null && val !== '') {
      return val;
    }
  }
  return null;
}

/**
 * Parse a date string into a Date object
 */
function parseDate(dateStr: any): Date | null {
  if (dateStr === null || dateStr === undefined || dateStr === '') return null;

  if (dateStr instanceof Date) return dateStr;

  if (typeof dateStr === 'number' && dateStr > 1 && dateStr < 100000) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + dateStr * 24 * 60 * 60 * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const str = String(dateStr).trim();
  const date = new Date(str);

  if (isNaN(date.getTime())) {
    return null;
  }

  return date;
}

/**
 * Parse an amount string into a number
 */
function parseAmount(amountStr: any): { value: number; original: string } | null {
  if (!amountStr) return null;

  const original = String(amountStr).trim();

  let cleaned = original
    .replace(/[$€£¥₹]/g, '')
    .replace(/\s/g, '')
    .replace(/,/g, '');

  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    cleaned = '-' + cleaned.slice(1, -1);
  }

  const value = parseFloat(cleaned);

  if (isNaN(value)) {
    return null;
  }

  return { value, original };
}

export type TransactionType = 'income' | 'expense' | 'transfer';
export type TransactionCategory =
  | 'income'
  | 'salary'
  | 'bonus'
  | 'investment'
  | 'other_income'
  | 'expense'
  | 'groceries'
  | 'utilities'
  | 'rent'
  | 'transportation'
  | 'entertainment'
  | 'dining'
  | 'shopping'
  | 'healthcare'
  | 'insurance'
  | 'education'
  | 'subscriptions'
  | 'other_expense'
  | 'transfer'
  | 'uncategorized';

export interface CategorizedTransaction {
  transactionType: TransactionType;
  category: TransactionCategory;
}

export function categorizeTransaction(description: string, amount: number): CategorizedTransaction {
  const desc = description.toLowerCase();

  if (desc.includes('transfer') || desc.includes('move between') || desc.includes('account to account')) {
    return { transactionType: 'transfer', category: 'transfer' };
  }

  if (amount > 0) {
    if (desc.includes('dividend') || desc.includes('interest') || desc.includes('investment')) {
      return { transactionType: 'income', category: 'investment' };
    }
    if (desc.includes('bonus') || desc.includes('refund')) {
      return { transactionType: 'income', category: 'bonus' };
    }
    if (desc.includes('salary') || desc.includes('paycheck') || desc.includes('pay')) {
      return { transactionType: 'income', category: 'salary' };
    }
    return { transactionType: 'income', category: 'other_income' };
  }

  if (amount < 0) {
    const absDesc = desc;

    if (
      absDesc.includes('grocery') ||
      absDesc.includes('whole foods') ||
      absDesc.includes('trader joe') ||
      absDesc.includes('safeway') ||
      absDesc.includes('kroger') ||
      absDesc.includes('costco') ||
      absDesc.includes('food market')
    ) {
      return { transactionType: 'expense', category: 'groceries' };
    }

    if (
      absDesc.includes('electric') ||
      absDesc.includes('water') ||
      absDesc.includes('gas') ||
      absDesc.includes('utility') ||
      absDesc.includes('internet') ||
      absDesc.includes('phone bill')
    ) {
      return { transactionType: 'expense', category: 'utilities' };
    }

    if (absDesc.includes('rent') || absDesc.includes('mortgage') || absDesc.includes('landlord')) {
      return { transactionType: 'expense', category: 'rent' };
    }

    if (
      absDesc.includes('gas') ||
      absDesc.includes('uber') ||
      absDesc.includes('lyft') ||
      absDesc.includes('parking') ||
      absDesc.includes('transit') ||
      absDesc.includes('car') ||
      absDesc.includes('fuel')
    ) {
      return { transactionType: 'expense', category: 'transportation' };
    }

    if (
      absDesc.includes('restaurant') ||
      absDesc.includes('cafe') ||
      absDesc.includes('coffee') ||
      absDesc.includes('pizza') ||
      absDesc.includes('burger') ||
      absDesc.includes('sushi') ||
      absDesc.includes('dining')
    ) {
      return { transactionType: 'expense', category: 'dining' };
    }

    if (
      absDesc.includes('subscription') ||
      absDesc.includes('monthly') ||
      absDesc.includes('recurring') ||
      absDesc.includes('membership') ||
      absDesc.includes('netflix') ||
      absDesc.includes('spotify')
    ) {
      return { transactionType: 'expense', category: 'subscriptions' };
    }

    if (
      absDesc.includes('movie') ||
      absDesc.includes('gaming') ||
      absDesc.includes('concert') ||
      absDesc.includes('entertainment')
    ) {
      return { transactionType: 'expense', category: 'entertainment' };
    }

    if (
      absDesc.includes('amazon') ||
      absDesc.includes('target') ||
      absDesc.includes('walmart') ||
      absDesc.includes('mall') ||
      absDesc.includes('store') ||
      absDesc.includes('retail')
    ) {
      return { transactionType: 'expense', category: 'shopping' };
    }

    if (
      absDesc.includes('pharmacy') ||
      absDesc.includes('doctor') ||
      absDesc.includes('hospital') ||
      absDesc.includes('medical') ||
      absDesc.includes('cvs') ||
      absDesc.includes('walgreens')
    ) {
      return { transactionType: 'expense', category: 'healthcare' };
    }

    if (absDesc.includes('insurance') || absDesc.includes('premium')) {
      return { transactionType: 'expense', category: 'insurance' };
    }

    if (
      absDesc.includes('tuition') ||
      absDesc.includes('school') ||
      absDesc.includes('university') ||
      absDesc.includes('course') ||
      absDesc.includes('education')
    ) {
      return { transactionType: 'expense', category: 'education' };
    }

    return { transactionType: 'expense', category: 'other_expense' };
  }

  return { transactionType: 'expense', category: 'uncategorized' };
}
