import { z } from 'zod';
import { type TransactionCategory } from './transactionParser';
import { invokeStructuredLLM } from './_core/llm';

export interface AmbiguousTransactionInput {
  index: number;
  description: string;
  amount: number;
}

const VALID_CATEGORIES = [
  'income',
  'salary',
  'bonus',
  'investment',
  'other_income',
  'expense',
  'groceries',
  'utilities',
  'rent',
  'transportation',
  'entertainment',
  'dining',
  'shopping',
  'healthcare',
  'insurance',
  'education',
  'subscriptions',
  'other_expense',
  'transfer',
  'uncategorized',
] as const;

const CategorizationSchema = z.object({
  classifications: z.array(
    z.object({
      index: z.number(),
      category: z.enum(VALID_CATEGORIES),
    })
  ),
});

/**
 * Extended heuristic rules for merchants and banking descriptions that
 * the basic keyword matcher in transactionParser.ts leaves as other_expense / other_income.
 */
function inferCategoryHeuristically(
  description: string,
  amount: number
): TransactionCategory | null {
  const d = description.toLowerCase();

  if (
    d.includes('zelle') ||
    d.includes('venmo') ||
    d.includes('wire') ||
    d.includes('ach transfer') ||
    d.includes('internal xfer')
  ) {
    return 'transfer';
  }

  if (amount > 0) {
    if (
      d.includes('direct dep') ||
      d.includes('payroll') ||
      d.includes('gusto') ||
      d.includes('adp') ||
      d.includes('rippling') ||
      d.includes('employer')
    ) {
      return 'salary';
    }
    if (
      d.includes('vanguard') ||
      d.includes('fidelity') ||
      d.includes('schwab') ||
      d.includes('robinhood') ||
      d.includes('yield') ||
      d.includes('staking') ||
      d.includes('capital gain')
    ) {
      return 'investment';
    }
    if (
      d.includes('cashback') ||
      d.includes('reward') ||
      d.includes('rebate') ||
      d.includes('reimbursement') ||
      d.includes('tax refund')
    ) {
      return 'bonus';
    }
    if (d.includes('freelance') || d.includes('stripe') || d.includes('invoice') || d.includes('client')) {
      return 'income';
    }
    return null;
  }

  // Expense heuristics
  if (
    d.includes('aldi') ||
    d.includes('publix') ||
    d.includes('wegmans') ||
    d.includes('sprouts') ||
    d.includes('heb') ||
    d.includes('instacart') ||
    d.includes('supermarket') ||
    d.includes('mart')
  ) {
    return 'groceries';
  }

  if (
    d.includes('comcast') ||
    d.includes('xfinity') ||
    d.includes('verizon') ||
    d.includes('at&t') ||
    d.includes('t-mobile') ||
    d.includes('con ed') ||
    d.includes('pg&e') ||
    d.includes('spectrum') ||
    d.includes('fiber') ||
    d.includes('sewer') ||
    d.includes('trash')
  ) {
    return 'utilities';
  }

  if (
    d.includes('hoa') ||
    d.includes('property') ||
    d.includes('apartments') ||
    d.includes('leasing') ||
    d.includes('bilt')
  ) {
    return 'rent';
  }

  if (
    d.includes('shell') ||
    d.includes('chevron') ||
    d.includes('exxon') ||
    d.includes('bp ') ||
    d.includes('mobil') ||
    d.includes('metro') ||
    d.includes('mta') ||
    d.includes('bart') ||
    d.includes('airline') ||
    d.includes('delta') ||
    d.includes('united') ||
    d.includes('waymo') ||
    d.includes('toll') ||
    d.includes('ezpass')
  ) {
    return 'transportation';
  }

  if (
    d.includes('starbucks') ||
    d.includes('chipotle') ||
    d.includes('doordash') ||
    d.includes('ubereats') ||
    d.includes('grubhub') ||
    d.includes('sweetgreen') ||
    d.includes('panera') ||
    d.includes('mcdonald') ||
    d.includes('taco') ||
    d.includes('bakery') ||
    d.includes('bistro') ||
    d.includes('grill') ||
    d.includes('kitchen') ||
    d.includes('bar ')
  ) {
    return 'dining';
  }

  if (
    d.includes('hulu') ||
    d.includes('disney') ||
    d.includes('apple.com/bill') ||
    d.includes('icloud') ||
    d.includes('youtube') ||
    d.includes('openai') ||
    d.includes('anthropic') ||
    d.includes('github') ||
    d.includes('adobe') ||
    d.includes('notion') ||
    d.includes('claude') ||
    d.includes('chatgpt') ||
    d.includes('gym') ||
    d.includes('equinox') ||
    d.includes('planet fitness')
  ) {
    return 'subscriptions';
  }

  if (
    d.includes('steam') ||
    d.includes('playstation') ||
    d.includes('nintendo') ||
    d.includes('xbox') ||
    d.includes('ticketmaster') ||
    d.includes('stubhub') ||
    d.includes('amc') ||
    d.includes('regal') ||
    d.includes('bowling') ||
    d.includes('museum')
  ) {
    return 'entertainment';
  }

  if (
    d.includes('apple store') ||
    d.includes('best buy') ||
    d.includes('ikea') ||
    d.includes('home depot') ||
    d.includes('lowe') ||
    d.includes('nike') ||
    d.includes('uniqlo') ||
    d.includes('zara') ||
    d.includes('sephora') ||
    d.includes('etsy') ||
    d.includes('ebay') ||
    d.includes('shopify')
  ) {
    return 'shopping';
  }

  if (
    d.includes('dental') ||
    d.includes('dentist') ||
    d.includes('optometry') ||
    d.includes('vision') ||
    d.includes('clinic') ||
    d.includes('labcorp') ||
    d.includes('quest') ||
    d.includes('therapy') ||
    d.includes('rite aid') ||
    d.includes('health')
  ) {
    return 'healthcare';
  }

  if (
    d.includes('geico') ||
    d.includes('state farm') ||
    d.includes('progressive') ||
    d.includes('allstate') ||
    d.includes('lemonade') ||
    d.includes('usaa') ||
    d.includes('policy')
  ) {
    return 'insurance';
  }

  if (
    d.includes('coursera') ||
    d.includes('udemy') ||
    d.includes('college') ||
    d.includes('books') ||
    d.includes('student loan') ||
    d.includes('nelnet') ||
    d.includes('aidvantage')
  ) {
    return 'education';
  }

  return null;
}

/**
 * Classifies ambiguous transactions using extended merchant heuristics
 * combined with structured LLM classification via the Vercel AI SDK.
 */
export async function classifyAmbiguousTransactions(
  ambiguous: AmbiguousTransactionInput[]
): Promise<Map<number, TransactionCategory>> {
  const result = new Map<number, TransactionCategory>();
  if (ambiguous.length === 0) {
    return result;
  }

  const remainingForLLM: AmbiguousTransactionInput[] = [];

  for (const item of ambiguous) {
    const heuristicMatch = inferCategoryHeuristically(
      item.description,
      item.amount
    );
    if (heuristicMatch) {
      result.set(item.index, heuristicMatch);
    } else {
      remainingForLLM.push(item);
    }
  }

  if (remainingForLLM.length === 0) {
    return result;
  }

  // Batch up to 100 ambiguous items for structured LLM categorization
  const batch = remainingForLLM.slice(0, 100);
  const structured = await invokeStructuredLLM({
    schema: CategorizationSchema,
    system:
      'You are a precision financial transaction classifier. Classify each bank transaction into the single most accurate category based on its merchant description and signed amount (positive = inflow, negative = outflow).',
    prompt: `Classify these transactions:\n${JSON.stringify(batch, null, 2)}`,
  });

  if (structured?.classifications) {
    for (const item of structured.classifications) {
      result.set(item.index, item.category);
    }
  }

  return result;
}
