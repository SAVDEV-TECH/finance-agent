import { generateText, generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { z } from 'zod';
import { ENV } from './env';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface InvokeLLMOptions {
  messages: LLMMessage[];
  temperature?: number;
}

export interface InvokeLLMResponse {
  choices: Array<{
    message: {
      role: 'assistant';
      content: string;
    };
  }>;
}

function getLanguageModel() {
  if (process.env.GEMINI_API_KEY) {
    const google = createGoogleGenerativeAI({
      apiKey: process.env.GEMINI_API_KEY,
    });
    return google(process.env.GEMINI_MODEL || 'gemini-2.5-flash');
  }

  if (ENV.llmApiKey) {
    const openai = createOpenAI({
      apiKey: ENV.llmApiKey,
      baseURL: ENV.llmBaseUrl,
    });
    return openai(ENV.llmModel);
  }

  return null;
}

/**
 * Generates structured output validated against a Zod schema using the Vercel AI SDK.
 * Falls back gracefully if no LLM API key is configured.
 */
export async function invokeStructuredLLM<T extends z.ZodTypeAny>(options: {
  schema: T;
  system: string;
  prompt: string;
}): Promise<z.infer<T> | null> {
  const model = getLanguageModel();
  if (!model) {
    return null;
  }

  try {
    const { object } = await generateObject({
      model,
      schema: options.schema as any,
      system: options.system,
      prompt: options.prompt,
      temperature: 0.1,
    });
    return object as z.infer<T>;
  } catch (error) {
    console.warn('[LLM] Structured generation failed, using deterministic fallback:', error);
    return null;
  }
}

/**
 * Synthesizes actionable financial insights when no external LLM key is configured,
 * ensuring the app works out-of-the-box in local and demo environments.
 */
function buildDeterministicFinancialInsights(userPrompt: string): string {
  const questionMatch = userPrompt.match(/User Question:\s*([^\n]+)/i);
  const incomeMatch = userPrompt.match(/Total Income:\s*([^\n]+)/i);
  const expenseMatch = userPrompt.match(/Total Expenses:\s*([^\n]+)/i);
  const netMatch = userPrompt.match(/Net Cash Flow:\s*([^\n]+)/i);
  const countMatch = userPrompt.match(/Transaction Count:\s*(\d+)/i);
  const avgExpMatch = userPrompt.match(/Average Expense:\s*([^\n]+)/i);
  const maxExpMatch = userPrompt.match(/Largest Expense:\s*([^\n]+)/i);
  const topSection =
    userPrompt.split(/Top Categories:/i)[1]?.split(/Recent Transactions:/i)[0] ||
    '';
  const txSection = userPrompt.split(/Recent Transactions:/i)[1] || '';

  const incomeStr = incomeMatch?.[1]?.trim() || '$0.00';
  const expenseStr = expenseMatch?.[1]?.trim() || '$0.00';
  const netStr = netMatch?.[1]?.trim() || '$0.00';
  const txCount = countMatch?.[1] || '0';
  const avgExpStr = avgExpMatch?.[1]?.trim() || '$0.00';
  const maxExpStr = maxExpMatch?.[1]?.trim() || '$0.00';

  const parseNum = (s: string) =>
    parseFloat(s.replace(/[^0-9.-]/g, '')) || 0;
  const income = parseNum(incomeStr);
  const expenses = parseNum(expenseStr);
  const net = parseNum(netStr);
  const savingsRate = income > 0 ? ((net / income) * 100).toFixed(1) : '0.0';

  const categoryLines = topSection
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('-'))
    .map((l) => l.replace(/^-\s*/, ''));

  if (questionMatch) {
    const q = questionMatch[1].trim().toLowerCase();
    const txLines = txSection
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    // Check if the user asked about a specific category or merchant keyword
    const matchedCategory = categoryLines.find((line) => {
      const catName = line.split(/[(:]/)[0].trim().toLowerCase();
      return q.includes(catName);
    });

    const matchedTx = txLines.filter((line) => {
      const parts = line.split('|').map((p) => p.trim());
      const desc = (parts[1] || '').toLowerCase();
      const cat = (parts[3] || '').toLowerCase();
      return q
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .some((word) => desc.includes(word) || cat.includes(word));
    });

    if (matchedCategory || matchedTx.length > 0) {
      const details: string[] = [];
      if (matchedCategory) {
        details.push(`**Category Breakdown:** ${matchedCategory}.`);
      }
      if (matchedTx.length > 0) {
        details.push(
          `**Matching Transactions (${matchedTx.length}):** ${matchedTx
            .slice(0, 4)
            .join(' • ')}`
        );
      }
      details.push(
        `**Context vs. Overall Budget:** Out of **${expenseStr}** total expenses and **${incomeStr}** total income (**${savingsRate}% savings rate**), net cash flow stands at **${netStr}**.`
      );
      return details.join('\n\n');
    }

    if (q.includes('afford') || q.includes('buy') || q.includes('spend')) {
      const numInQ = parseNum(q);
      if (numInQ > 0) {
        const remainingAfter = net - numInQ;
        return remainingAfter >= 0
          ? `**Yes — Covered by Current Surplus:** Your current net cash flow is **${netStr}** (${incomeStr} income vs. ${expenseStr} expenses, **${savingsRate}% savings rate**). A purchase of **${numInQ.toLocaleString()}** leaves you with a positive surplus of **${remainingAfter.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}**.`
          : `**Caution — Exceeds Current Net Surplus:** Your current net cash flow is **${netStr}**. Spending **${numInQ.toLocaleString()}** would create a net deficit of **${remainingAfter.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}** unless offset by reducing discretionary categories.`;
      }
    }

    return [
      `**Ledger Snapshot (${txCount} transactions):** Total Income is **${incomeStr}**, Total Expenses are **${expenseStr}** (avg expense **${avgExpStr}**, largest single expense **${maxExpStr}**), yielding a **Net Cash Flow of ${netStr}** (**${savingsRate}% savings rate**).`,
      categoryLines.length > 0
        ? `**Top Drivers:** ${categoryLines.slice(0, 4).join(' • ')}.`
        : `**Tip:** Add or recategorize transactions in the table below to see updated breakdowns immediately.`,
    ].join('\n\n');
  }

  const healthAssessment =
    net > 0
      ? `You maintained a **positive net cash flow of ${netStr}** across ${txCount} transactions, achieving a **${savingsRate}% savings rate** (${incomeStr} income vs. ${expenseStr} expenses).`
      : net < 0
        ? `Your expenses (${expenseStr}) exceeded income (${incomeStr}) across ${txCount} transactions, resulting in a **net cash flow deficit of ${netStr}**.`
        : `Your cash flow broke even across ${txCount} transactions (${incomeStr} income vs. ${expenseStr} expenses).`;

  const categoryInsight =
    categoryLines.length > 0
      ? `Your highest-activity categories were **${categoryLines.slice(0, 3).join('**, **')}**. Auditing discretionary outflow in your top expense drivers is the fastest lever to improve monthly margin.`
      : `Categorizing any remaining uncategorized transactions will sharpen visibility into your largest spending drivers.`;

  const recommendation =
    Number(savingsRate) >= 20
      ? `With a strong ${savingsRate}% savings rate, consider automating surplus cash flow (${netStr}) into low-cost index investments or a high-yield reserve account.`
      : Number(savingsRate) > 0
        ? `Aim to lift your current ${savingsRate}% savings rate toward the 20% benchmark by setting a monthly cap on variable dining, shopping, and subscription charges.`
        : `Prioritize trimming recurring subscriptions and non-essential discretionary categories to restore positive monthly cash flow.`;

  return [
    `1. **Cash Flow & Savings Health:** ${healthAssessment}`,
    `2. **Concentration & Spending Drivers:** ${categoryInsight}`,
    `3. **Actionable Next Step:** ${recommendation}`,
  ].join('\n\n');
}

/**
 * Invokes the configured LLM via the Vercel AI SDK, with an automatic
 * deterministic analytical fallback when no API key is present.
 */
export async function invokeLLM(
  options: InvokeLLMOptions
): Promise<InvokeLLMResponse> {
  const model = getLanguageModel();
  const systemMsg =
    options.messages.find((m) => m.role === 'system')?.content ||
    'You are a financial analyst providing insights on personal spending patterns.';
  const userMsg =
    options.messages
      .filter((m) => m.role !== 'system')
      .map((m) => m.content)
      .join('\n\n') || '';

  if (model) {
    try {
      const { text } = await generateText({
        model,
        system: systemMsg,
        prompt: userMsg,
        temperature: options.temperature ?? 0.3,
      });

      if (text && text.trim().length > 0) {
        return {
          choices: [
            {
              message: {
                role: 'assistant',
                content: text.trim(),
              },
            },
          ],
        };
      }
    } catch (error) {
      console.warn('[LLM] Text generation failed, falling back to local analyzer:', error);
    }
  }

  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: buildDeterministicFinancialInsights(userMsg),
        },
      },
    ],
  };
}
