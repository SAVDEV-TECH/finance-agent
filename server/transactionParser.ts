import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export interface ParsedTransaction {
  date: Date;
  description: string;
  amount: number;
  originalAmount: string;
  account?: string;
}

const xlsxLib: typeof XLSX = (XLSX as any).default ?? XLSX;

/**
 * Parse CSV file content into transactions
 */
export function parseCSV(fileContent: string): Promise<ParsedTransaction[]> {
  return new Promise((resolve, reject) => {
    // Strip leading metadata lines if the CSV has a preamble before the actual header row
    const lines = fileContent.split(/\r?\n/);
    let headerIdx = 0;
    for (let i = 0; i < Math.min(lines.length, 25); i++) {
      const l = lines[i].toLowerCase();
      if (
        l.includes('date') &&
        (l.includes('desc') ||
          l.includes('narrat') ||
          l.includes('memo') ||
          l.includes('amount') ||
          l.includes('debit') ||
          l.includes('credit'))
      ) {
        headerIdx = i;
        break;
      }
    }
    const normalizedCsv = lines.slice(headerIdx).join('\n');

    Papa.parse(normalizedCsv, {
      header: true,
      skipEmptyLines: true,
      complete: (results: any) => {
        try {
          const transactions = results.data
            .map((row: any) => parseTransactionRow(row))
            .filter(
              (t: ParsedTransaction | null): t is ParsedTransaction =>
                t !== null
            );
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
 * Repairs worksheet['!ref'] when bank Excel exports (such as OPay) emit a truncated
 * dimension tag (e.g. A10:H163) that omits header rows in A1:H9.
 */
function repairWorksheetRange(worksheet: XLSX.WorkSheet): void {
  let maxRow = 0;
  let maxCol = 0;
  let hasCells = false;

  for (const key of Object.keys(worksheet)) {
    if (key.startsWith('!')) continue;
    const cell = xlsxLib.utils.decode_cell(key);
    if (cell.r > maxRow) maxRow = cell.r;
    if (cell.c > maxCol) maxCol = cell.c;
    hasCells = true;
  }

  if (hasCells) {
    worksheet['!ref'] = xlsxLib.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: maxRow, c: maxCol },
    });
  }
}

/**
 * Finds the index of the header row in a 2D array of worksheet rows,
 * skipping bank statement title/summary metadata rows at the top of the sheet.
 */
function findHeaderRowIndex(rawRows: any[][]): number {
  for (let i = 0; i < Math.min(rawRows.length, 30); i++) {
    const row = rawRows[i];
    if (!Array.isArray(row)) continue;
    const nonEmptyCells = row
      .map((c) => String(c ?? '').toLowerCase().trim())
      .filter(Boolean);
    if (nonEmptyCells.length < 2) continue;

    // A row whose first non-empty cell is already a parseable date is a data row, not a header row
    if (parseDate(nonEmptyCells[0]) !== null) continue;

    const joined = nonEmptyCells.join(' | ');

    const hasDateCol = /\b(date|trans\.?\s*date|value\s*date|posted|time)\b/i.test(
      joined
    );
    const hasValueOrDescCol =
      /\b(description|narration|memo|details|particulars|remarks|amount|debit|credit|withdrawal|deposit)\b/i.test(
        joined
      );

    if (hasDateCol && hasValueOrDescCol) {
      return i;
    }
  }
  return -1;
}

/**
 * Parse Excel file buffer into transactions across one or more sheets.
 * Handles multi-row statement headers, repaired cell ranges, currency-suffixed
 * columns like Debit(₦)/Credit(₦), and deduplication across linked sheets.
 */
export function parseExcel(buffer: Buffer): ParsedTransaction[] {
  try {
    const workbook = xlsxLib.read(buffer, { type: 'buffer' });
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error('No sheets found in Excel file');
    }

    const allTransactions: ParsedTransaction[] = [];
    const seenReferences = new Set<string>();

    // Extract account holder name if present in metadata rows (e.g. Row 2: Account Name | SAVIOUR HENRY SAMUEL)
    let statementOwnerName = '';

    for (let sIdx = 0; sIdx < workbook.SheetNames.length; sIdx++) {
      const sheetName = workbook.SheetNames[sIdx];
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) continue;

      repairWorksheetRange(worksheet);

      const rawRows: any[][] = xlsxLib.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: '',
      });
      if (rawRows.length === 0) continue;

      // Scan metadata rows (before header) for Account Name & Account Type
      let sheetAccountLabel = sheetName.replace(/\s*Transactions$/i, '').trim();
      const detectedHeaderIdx = findHeaderRowIndex(rawRows);
      const metaLimit = detectedHeaderIdx >= 0 ? detectedHeaderIdx : 0;

      for (let m = 0; m < metaLimit; m++) {
        const metaRow = rawRows[m];
        if (!Array.isArray(metaRow)) continue;
        for (let c = 0; c < metaRow.length - 1; c++) {
          const k = String(metaRow[c] ?? '').toLowerCase().trim();
          const v = String(metaRow[c + 1] ?? '').trim();
          if (k === 'account name' && v) {
            statementOwnerName = v;
          } else if (k === 'account type' && v) {
            sheetAccountLabel = v;
          }
        }
      }

      let headers: string[];
      let dataRows: any[][];

      if (detectedHeaderIdx >= 0) {
        const headerRow = rawRows[detectedHeaderIdx];
        headers = headerRow.map((h, idx) => {
          const clean = String(h ?? '').trim();
          return clean || `col_${idx}`;
        });
        dataRows = rawRows.slice(detectedHeaderIdx + 1);
      } else {
        // Fallback for headerless sheets where the first non-empty row is already transaction data
        const firstNonEmptyIdx = rawRows.findIndex(
          (r) =>
            Array.isArray(r) &&
            r.some((cell) => String(cell ?? '').trim() !== '')
        );
        const firstRow =
          firstNonEmptyIdx >= 0 ? rawRows[firstNonEmptyIdx] : [];
        if (
          firstRow.length >= 6 &&
          parseDate(firstRow[0]) &&
          parseDate(firstRow[1])
        ) {
          headers = [
            'Trans. Date',
            'Value Date',
            'Description',
            'Debit',
            'Credit',
            'Balance After',
            'Channel',
            'Transaction Reference',
          ];
        } else {
          headers = ['Date', 'Description', 'Amount', 'Account'];
        }
        dataRows =
          firstNonEmptyIdx >= 0 ? rawRows.slice(firstNonEmptyIdx) : [];
      }
      for (const arrRow of dataRows) {
        if (!Array.isArray(arrRow)) continue;
        const rowObj: Record<string, any> = {};
        let hasNonEmpty = false;
        for (let c = 0; c < headers.length; c++) {
          const val = arrRow[c];
          if (val !== undefined && val !== null && String(val).trim() !== '') {
            hasNonEmpty = true;
          }
          rowObj[headers[c]] = val;
        }
        if (!hasNonEmpty) continue;

        // Deduplicate mirror OWealth sweep rows across Wallet and Savings sheets by Transaction Reference
        const txRef = findColumnValue(rowObj, [
          'transaction reference',
          'reference',
          'ref',
          'trans ref',
        ]);
        if (sIdx > 0 && txRef && seenReferences.has(String(txRef).trim())) {
          continue;
        }

        const parsed = parseTransactionRow(
          rowObj,
          sheetAccountLabel,
          statementOwnerName
        );
        if (parsed) {
          if (txRef) {
            seenReferences.add(String(txRef).trim());
          }
          allTransactions.push(parsed);
        }
      }
    }

    return allTransactions;
  } catch (error) {
    throw new Error(`Excel parsing error: ${(error as Error).message}`);
  }
}

/**
 * Parse a single transaction row from CSV/Excel
 * Handles common international and Nigerian bank column name variations
 */
function parseTransactionRow(
  row: any,
  defaultAccount?: string,
  ownerName?: string
): ParsedTransaction | null {
  // Find date column
  const dateValue = findColumnValue(row, [
    'trans. date',
    'trans date',
    'transaction date',
    'date',
    'value date',
    'posted date',
    'posting date',
    'booking date',
  ]);
  if (!dateValue) return null;

  const date = parseDate(dateValue);
  if (!date) return null;

  // Find description column
  const description = findColumnValue(row, [
    'description',
    'narration',
    'remarks',
    'particulars',
    'memo',
    'transaction',
    'details',
    'transaction details',
  ]);
  if (!description) return null;

  // Find amount column
  let amount: number | null = null;
  let originalAmount = '';

  const amountValue = findColumnValue(row, [
    'amount',
    'value',
    'transaction amount',
    'net amount',
  ]);
  if (amountValue !== null) {
    const parsed = parseAmount(amountValue);
    if (parsed !== null) {
      amount = parsed.value;
      originalAmount = parsed.original;
    }
  }

  // If no single amount column found, try debit/credit columns (including Debit(₦) / Credit(₦))
  if (amount === null) {
    const debitValue = findColumnValue(row, [
      'debit',
      'withdrawal',
      'paid out',
      'money out',
      'dr',
      'debit amount',
    ]);
    const creditValue = findColumnValue(row, [
      'credit',
      'deposit',
      'paid in',
      'money in',
      'cr',
      'credit amount',
    ]);

    const debitParsed = debitValue !== null ? parseAmount(debitValue) : null;
    const creditParsed = creditValue !== null ? parseAmount(creditValue) : null;

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

  const accountCol = findColumnValue(row, [
    'account',
    'account name',
    'source account',
    'channel',
  ]);

  let cleanDesc = String(description).replace(/\s+/g, ' ').trim();
  // Tag self-transfers if ownerName is known and recipient is the same person
  if (ownerName && cleanDesc.toLowerCase().startsWith('transfer to ')) {
    const ownerTokens = ownerName
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2);
    const descLower = cleanDesc.toLowerCase();
    const matchCount = ownerTokens.filter((t) => descLower.includes(t)).length;
    if (ownerTokens.length >= 2 && matchCount >= 2 && !cleanDesc.includes('[Self Transfer]')) {
      cleanDesc = `${cleanDesc} [Self Transfer]`;
    }
  }

  return {
    date,
    description: cleanDesc,
    amount,
    originalAmount,
    account: accountCol
      ? String(accountCol).trim()
      : defaultAccount || undefined,
  };
}

/**
 * Normalizes a header key by lowercasing, stripping currency suffixes like (₦) or ($),
 * and collapsing punctuation.
 */
function normalizeHeaderKey(key: string): string {
  return key
    .toLowerCase()
    .replace(/\([^)]*\)/g, '') // strip (₦), ($), (NGN), etc.
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Find a column value by trying multiple column name variations.
 * Matching is case-insensitive and ignores currency suffixes like (₦).
 */
function findColumnValue(row: any, columnNames: string[]): any {
  const exactMap: Record<string, any> = {};
  const normalizedMap: Record<string, any> = {};

  for (const key of Object.keys(row)) {
    const val = row[key];
    exactMap[key.toLowerCase().trim()] = val;
    const norm = normalizeHeaderKey(key);
    if (norm && !(norm in normalizedMap)) {
      normalizedMap[norm] = val;
    }
  }

  for (const name of columnNames) {
    const lower = name.toLowerCase().trim();
    const norm = normalizeHeaderKey(name);
    const candidate = exactMap[lower] ?? normalizedMap[norm];
    if (
      candidate !== undefined &&
      candidate !== null &&
      String(candidate).trim() !== '' &&
      String(candidate).trim() !== '--'
    ) {
      return candidate;
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
  if (!str || str === '--') return null;

  const date = new Date(str);
  if (!isNaN(date.getTime())) {
    return date;
  }

  // Handle DD/MM/YYYY or DD-MM-YYYY formats common in UK/Nigeria/Europe
  const dmyMatch = str.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?$/
  );
  if (dmyMatch) {
    const [, day, month, year, timePart] = dmyMatch;
    const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}${
      timePart ? `T${timePart}` : ''
    }`;
    const parsedDmy = new Date(iso);
    if (!isNaN(parsedDmy.getTime())) {
      return parsedDmy;
    }
  }

  return null;
}

/**
 * Parse an amount string into a number (supports ₦, $, €, £, ¥, ₹, commas, and parentheses)
 */
function parseAmount(amountStr: any): { value: number; original: string } | null {
  if (amountStr === null || amountStr === undefined || amountStr === '') {
    return null;
  }

  const original = String(amountStr).trim();
  if (!original || original === '--' || original === '-' || original.toLowerCase() === 'nil') {
    return null;
  }

  let cleaned = original
    .replace(/[₦$€£¥₹]|NGN|USD|EUR|GBP/gi, '')
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

export function categorizeTransaction(
  description: string,
  amount: number
): CategorizedTransaction {
  const desc = description.toLowerCase();

  // 1. Internal wallet/savings sweeps (OPay OWealth, Spend & Save, SafeBox, or explicit self-transfers)
  if (
    desc.includes('auto-save to owealth') ||
    desc.includes('owealth withdrawal') ||
    desc.includes('spend & save') ||
    desc.includes('safebox deposit') ||
    desc.includes('safebox withdrawal') ||
    desc.includes('[self transfer]') ||
    desc.includes('move between') ||
    desc.includes('account to account') ||
    desc.includes('internal transfer')
  ) {
    return { transactionType: 'transfer', category: 'transfer' };
  }

  // 2. Positive amounts (Inflows / Credits)
  if (amount > 0) {
    if (
      desc.includes('dividend') ||
      desc.includes('interest') ||
      desc.includes('owealth interest') ||
      desc.includes('cowrywise') ||
      desc.includes('piggyvest') ||
      desc.includes('bamboo') ||
      desc.includes('investment')
    ) {
      return { transactionType: 'income', category: 'investment' };
    }
    if (desc.includes('bonus') || desc.includes('refund') || desc.includes('cashback') || desc.includes('reversal')) {
      return { transactionType: 'income', category: 'bonus' };
    }
    if (desc.includes('salary') || desc.includes('paycheck') || desc.includes('payroll') || desc.includes('stipend')) {
      return { transactionType: 'income', category: 'salary' };
    }
    if (desc.startsWith('transfer from ') || desc.includes('pos transfer') || desc.includes('payment from')) {
      return { transactionType: 'income', category: 'income' };
    }
    return { transactionType: 'income', category: 'other_income' };
  }

  // 3. Negative amounts (Outflows / Debits)
  if (amount < 0) {
    const absDesc = desc;

    if (
      absDesc.includes('grocery') ||
      absDesc.includes('whole foods') ||
      absDesc.includes('trader joe') ||
      absDesc.includes('safeway') ||
      absDesc.includes('kroger') ||
      absDesc.includes('costco') ||
      absDesc.includes('food market') ||
      absDesc.includes('supermarket') ||
      absDesc.includes('shoprite') ||
      absDesc.includes('spar ')
    ) {
      return { transactionType: 'expense', category: 'groceries' };
    }

    if (
      absDesc.includes('airtime') ||
      absDesc.includes('mobile data') ||
      absDesc.includes('mtn') ||
      absDesc.includes('airtel') ||
      absDesc.includes('glo ') ||
      absDesc.includes('9mobile') ||
      absDesc.includes('electric') ||
      absDesc.includes('prepaid') ||
      absDesc.includes('ikedc') ||
      absDesc.includes('ekedc') ||
      absDesc.includes('phed') ||
      absDesc.includes('aedc') ||
      absDesc.includes('water') ||
      absDesc.includes('utility') ||
      absDesc.includes('internet') ||
      absDesc.includes('phone bill') ||
      absDesc.includes('dstv') ||
      absDesc.includes('gotv') ||
      absDesc.includes('startimes')
    ) {
      return { transactionType: 'expense', category: 'utilities' };
    }

    if (
      absDesc.includes('rent') ||
      absDesc.includes('mortgage') ||
      absDesc.includes('landlord') ||
      absDesc.includes('hostel') ||
      absDesc.includes('accommodation')
    ) {
      return { transactionType: 'expense', category: 'rent' };
    }

    if (
      absDesc.includes('uber') ||
      absDesc.includes('lyft') ||
      absDesc.includes('bolt') ||
      absDesc.includes('indrive') ||
      absDesc.includes('parking') ||
      absDesc.includes('transit') ||
      absDesc.includes('transport') ||
      absDesc.includes('fuel') ||
      absDesc.includes('filling station') ||
      absDesc.includes('nnpc') ||
      absDesc.includes('totalenergies') ||
      absDesc.includes('conoil') ||
      absDesc.includes('oando')
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
      absDesc.includes('dining') ||
      absDesc.includes('eatery') ||
      absDesc.includes('chicken republic') ||
      absDesc.includes('kilimanjaro') ||
      absDesc.includes('crunches') ||
      absDesc.includes('shawarma') ||
      absDesc.includes('kitchen') ||
      absDesc.includes('food')
    ) {
      return { transactionType: 'expense', category: 'dining' };
    }

    if (
      absDesc.includes('subscription') ||
      absDesc.includes('monthly') ||
      absDesc.includes('recurring') ||
      absDesc.includes('membership') ||
      absDesc.includes('netflix') ||
      absDesc.includes('spotify') ||
      absDesc.includes('google play') ||
      absDesc.includes('apple.com') ||
      absDesc.includes('youtube') ||
      absDesc.includes('chatgpt') ||
      absDesc.includes('claude')
    ) {
      return { transactionType: 'expense', category: 'subscriptions' };
    }

    if (
      absDesc.includes('movie') ||
      absDesc.includes('gaming') ||
      absDesc.includes('concert') ||
      absDesc.includes('cinema') ||
      absDesc.includes('filmhouse') ||
      absDesc.includes('entertainment')
    ) {
      return { transactionType: 'expense', category: 'entertainment' };
    }

    if (
      absDesc.includes('amazon') ||
      absDesc.includes('target') ||
      absDesc.includes('walmart') ||
      absDesc.includes('jumia') ||
      absDesc.includes('konga') ||
      absDesc.includes('mall') ||
      absDesc.includes('store') ||
      absDesc.includes('stores') ||
      absDesc.includes('shop') ||
      absDesc.includes('enterprise') ||
      absDesc.includes('ventures') ||
      absDesc.includes('global services') ||
      absDesc.includes('retail') ||
      absDesc.includes('market')
    ) {
      return { transactionType: 'expense', category: 'shopping' };
    }

    if (
      absDesc.includes('pharmacy') ||
      absDesc.includes('doctor') ||
      absDesc.includes('hospital') ||
      absDesc.includes('medical') ||
      absDesc.includes('clinic') ||
      absDesc.includes('health') ||
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

    if (
      absDesc.includes('stamp duty') ||
      absDesc.includes('ussd charge') ||
      absDesc.includes('vat on transfer') ||
      absDesc.includes('card application fee') ||
      absDesc.includes('maintenance fee') ||
      absDesc.includes('sms charge')
    ) {
      return { transactionType: 'expense', category: 'other_expense' };
    }

    if (absDesc.startsWith('transfer to ')) {
      return { transactionType: 'expense', category: 'expense' };
    }

    return { transactionType: 'expense', category: 'other_expense' };
  }

  return { transactionType: 'expense', category: 'uncategorized' };
}
