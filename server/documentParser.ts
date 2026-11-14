import mammoth from 'mammoth';
import { extractText } from 'unpdf';
import { z } from 'zod';
import { type ParsedTransaction } from './transactionParser';
import { invokeStructuredLLM } from './_core/llm';

const ExtractedDocumentTransactionsSchema = z.object({
  transactions: z.array(
    z.object({
      date: z.string().describe('ISO date string YYYY-MM-DD'),
      description: z.string().describe('Merchant or transaction description'),
      amount: z
        .number()
        .describe('Signed amount: positive for income/deposits, negative for expenses/withdrawals'),
      account: z.string().optional(),
    })
  ),
});

/**
 * Extracts plain text from a Word (.docx) buffer using mammoth.
 */
export async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return (result.value || '').trim();
  } catch (error) {
    throw new Error(
      `DOCX text extraction failed: ${(error as Error).message}`
    );
  }
}

/**
 * Extracts plain text from a PDF buffer using serverless-ready unpdf.
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    const uint8 = new Uint8Array(buffer);
    const { text } = await extractText(uint8, { mergePages: true });
    return (Array.isArray(text) ? text.join('\n') : text || '').trim();
  } catch (error) {
    throw new Error(`PDF text extraction failed: ${(error as Error).message}`);
  }
}

/**
 * Parses extracted document text (from PDF or DOCX bank statements) into structured transactions.
 * Uses deterministic regex line parsing first, and falls back to LLM structured extraction
 * for complex multi-column or unstructured statement layouts.
 */
export async function parseDocumentText(
  text: string
): Promise<ParsedTransaction[]> {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const deterministicRows = parseLinesDeterministically(text);
  if (deterministicRows.length > 0) {
    return deterministicRows;
  }

  // Fallback to structured LLM extraction for free-form document layouts
  const llmResult = await invokeStructuredLLM({
    schema: ExtractedDocumentTransactionsSchema,
    system:
      'Extract all financial transactions from the provided bank statement text. Convert dates to YYYY-MM-DD, preserve merchant descriptions, and use negative numbers for expenses/withdrawals and positive numbers for deposits/income.',
    prompt: text.slice(0, 24000),
  });

  if (!llmResult?.transactions) {
    return [];
  }

  const parsed: ParsedTransaction[] = [];
  for (const tx of llmResult.transactions) {
    const date = new Date(tx.date);
    if (Number.isNaN(date.getTime()) || !tx.description || Number.isNaN(tx.amount)) {
      continue;
    }
    parsed.push({
      date,
      description: tx.description.trim(),
      amount: tx.amount,
      originalAmount: String(tx.amount),
      account: tx.account || undefined,
    });
  }
  return parsed;
}

function parseLinesDeterministically(text: string): ParsedTransaction[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const transactions: ParsedTransaction[] = [];

  // Matches lines starting with a date (YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY, or Month DD, YYYY)
  // followed by a description and ending with a currency amount like -123.45, $1,234.56, or (45.00)
  const lineRegex =
    /^(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})\s+(.+?)\s+([+-]?[$€£¥₹]?[0-9,]+(?:\.\d{2})?|\([$€£¥₹]?[0-9,]+(?:\.\d{2})?\))$/i;

  for (const line of lines) {
    const match = line.match(lineRegex);
    if (!match) continue;

    const [, rawDate, rawDesc, rawAmount] = match;
    const date = new Date(rawDate);
    if (Number.isNaN(date.getTime())) continue;

    let cleanedAmount = rawAmount
      .replace(/[$€£¥₹,\s]/g, '')
      .trim();
    if (cleanedAmount.startsWith('(') && cleanedAmount.endsWith(')')) {
      cleanedAmount = '-' + cleanedAmount.slice(1, -1);
    }

    const amount = parseFloat(cleanedAmount);
    if (Number.isNaN(amount)) continue;

    transactions.push({
      date,
      description: rawDesc.replace(/\s+/g, ' ').trim(),
      amount,
      originalAmount: rawAmount.trim(),
    });
  }

  return transactions;
}
