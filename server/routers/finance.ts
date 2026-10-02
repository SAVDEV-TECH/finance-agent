import { z } from 'zod';
import { protectedProcedure, router } from '../_core/trpc';
import { storagePut } from '../storage';
import { parseCSV, parseExcel, categorizeTransaction, type ParsedTransaction, type TransactionCategory, type TransactionType } from '../transactionParser';
import { createFileUpload, createTransactions, getFileUploadsByUser, getTransactionsByFileUpload, getAnalysisByFileUpload, createAnalysis, updateAnalysis, updateTransaction, deleteFileUpload } from '../db';
import { invokeLLM } from '../_core/llm';
import { classifyAmbiguousTransactions } from '../aiCategorization';
import { calculateFinancialMetrics } from '../financeMetrics';
import Decimal from 'decimal.js';
import { validateUploadedFile } from '../fileValidation';
import { chunkArray } from '../batching';
import { extractTextFromDocx, extractTextFromPdf, parseDocumentText } from '../documentParser';

export const financeRouter = router({
  /**
   * Upload and process a financial file (CSV, Excel, Word DOCX, or PDF)
   */
  uploadFile: protectedProcedure
    .input(
      z.object({
        fileName: z.string().min(1).max(255),
        fileContent: z.string().min(1),
        fileType: z.enum(['csv', 'xlsx', 'docx', 'pdf']),
        fileEncoding: z.enum(['base64']).default('base64'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      try {
        const base64Payload = input.fileContent.includes(',')
          ? input.fileContent.split(',').pop() ?? ''
          : input.fileContent;
        const fileBuffer = Buffer.from(base64Payload, 'base64');
        if (fileBuffer.length === 0 || fileBuffer.length > 10 * 1024 * 1024) {
          throw new Error('File must be between 1 byte and 10MB');
        }
        validateUploadedFile(input.fileType, fileBuffer);

        // Parse the file
        let parsedTransactions: ParsedTransaction[];
        if (input.fileType === 'csv') {
          parsedTransactions = await parseCSV(fileBuffer.toString('utf8'));
        } else if (input.fileType === 'xlsx') {
          parsedTransactions = parseExcel(fileBuffer);
        } else {
          const extractedText = input.fileType === 'docx'
            ? await extractTextFromDocx(fileBuffer)
            : await extractTextFromPdf(fileBuffer);
          parsedTransactions = await parseDocumentText(extractedText);
        }

        if (parsedTransactions.length === 0) {
          throw new Error('No valid transactions found in file. Expected columns such as Date, Description, and Amount.');
        }

        // Store the file
        const fileKey = `${userId}-files/${Date.now()}-${input.fileName}`;
        const contentType = input.fileType === 'pdf'
          ? 'application/pdf'
          : input.fileType === 'docx'
            ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            : input.fileType === 'xlsx'
              ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
              : 'text/csv';
        const { url: fileUrl } = await storagePut(fileKey, fileBuffer, contentType);

        const fileUploadId = await createFileUpload({
          userId,
          fileName: input.fileName,
          fileKey,
          fileSize: fileBuffer.length,
          fileType: input.fileType,
          transactionCount: parsedTransactions.length,
        });

        const deterministic = parsedTransactions.map((tx) => categorizeTransaction(tx.description, tx.amount));
        const ambiguous = parsedTransactions
          .map((tx, index) => ({ tx, index, categorized: deterministic[index] }))
          .filter(({ categorized }) => categorized.category === 'other_income' || categorized.category === 'other_expense' || categorized.category === 'uncategorized')
          .map(({ tx, index }) => ({ index, description: tx.description, amount: tx.amount }));
        const aiCategories = await classifyAmbiguousTransactions(ambiguous);

        const transactionsToInsert = parsedTransactions.map((tx, index) => {
          const fallback = deterministic[index];
          const category = aiCategories.get(index) ?? fallback.category;
          const transactionType: TransactionType = category === 'transfer'
            ? 'transfer'
            : category === 'income' || category === 'salary' || category === 'bonus' || category === 'investment' || category === 'other_income'
              ? 'income'
              : 'expense';
          return {
            userId,
            fileUploadId,
            date: tx.date,
            description: tx.description,
            amount: new Decimal(tx.amount).toFixed(2),
            category: category as TransactionCategory,
            transactionType,
            account: tx.account || 'default',
            tags: JSON.stringify([`type:${transactionType}`, `category:${category}`]),
            notes: null,
          };
        });

        for (const batch of chunkArray(transactionsToInsert, 500)) {
          await createTransactions(batch);
        }

        const totalIncome = parsedTransactions
          .filter((tx) => tx.amount > 0)
          .reduce((sum, tx) => sum.plus(tx.amount), new Decimal(0));

        const totalExpenses = parsedTransactions
          .filter((tx) => tx.amount < 0)
          .reduce((sum, tx) => sum.plus(tx.amount), new Decimal(0));

        const netCashFlow = totalIncome.plus(totalExpenses);

        await createAnalysis({
          userId,
          fileUploadId,
          totalIncome: totalIncome.toFixed(2),
          totalExpenses: totalExpenses.abs().toFixed(2),
          netCashFlow: netCashFlow.toFixed(2),
          topCategories: JSON.stringify([]),
          insights: null,
          reportUrl: null,
        });

        return {
          fileUploadId,
          fileUrl,
          transactionCount: parsedTransactions.length,
          totalIncome: totalIncome.toFixed(2),
          totalExpenses: totalExpenses.abs().toFixed(2),
          netCashFlow: netCashFlow.toFixed(2),
        };
      } catch (error) {
        throw new Error(`File processing failed: ${(error as Error).message}`);
      }
    }),

  /**
   * Get all file uploads for the current user
   */
  getFileUploads: protectedProcedure.query(async ({ ctx }) => {
    const uploads = await getFileUploadsByUser(ctx.user.id);
    return uploads;
  }),

  /**
   * Get transactions for a specific file upload
   */
  getTransactions: protectedProcedure
    .input(z.object({ fileUploadId: z.number() }))
    .query(async ({ ctx, input }) => {
      return getTransactionsByFileUpload(input.fileUploadId, ctx.user.id);
    }),

  getMetrics: protectedProcedure
    .input(z.object({ fileUploadId: z.number() }))
    .query(async ({ ctx, input }) => {
      const rows = await getTransactionsByFileUpload(input.fileUploadId, ctx.user.id);
      return calculateFinancialMetrics(rows.map((row) => ({
        amount: String(row.amount),
        category: row.category,
        transactionType: row.transactionType,
        date: row.date,
      })));
    }),

  recategorize: protectedProcedure
    .input(z.object({
      transactionId: z.number(),
      fileUploadId: z.number(),
      category: z.enum([
        'income', 'salary', 'bonus', 'investment', 'other_income', 'expense',
        'groceries', 'utilities', 'rent', 'transportation', 'entertainment',
        'dining', 'shopping', 'healthcare', 'insurance', 'education',
        'subscriptions', 'other_expense', 'transfer', 'uncategorized',
      ]),
    }))
    .mutation(async ({ ctx, input }) => {
      const transactionType: TransactionType = input.category === 'transfer'
        ? 'transfer'
        : ['income', 'salary', 'bonus', 'investment', 'other_income'].includes(input.category)
          ? 'income'
          : 'expense';
      await updateTransaction(input.transactionId, ctx.user.id, {
        category: input.category,
        transactionType,
        tags: JSON.stringify([`type:${transactionType}`, `category:${input.category}`, 'manually-reviewed']),
      });

      const allRows = await getTransactionsByFileUpload(input.fileUploadId, ctx.user.id);
      const freshMetrics = calculateFinancialMetrics(allRows.map((row) => ({
        amount: String(row.amount),
        category: row.category,
        transactionType: row.transactionType,
        date: row.date,
      })));
      await updateAnalysis(input.fileUploadId, {
        totalIncome: freshMetrics.totalIncome,
        totalExpenses: freshMetrics.totalExpenses,
        netCashFlow: freshMetrics.netCashFlow,
      });

      return { success: true, transactionId: input.transactionId, category: input.category, transactionType };
    }),

  getAnalysis: protectedProcedure
    .input(z.object({ fileUploadId: z.number() }))
    .query(async ({ ctx, input }) => {
      const analysis = await getAnalysisByFileUpload(input.fileUploadId, ctx.user.id);
      return analysis;
    }),

  generateInsights: protectedProcedure
    .input(z.object({
      fileUploadId: z.number(),
      currencySymbol: z.string().max(4).default('$'),
    }))
    .mutation(async ({ ctx, input }) => {
      const analysis = await getAnalysisByFileUpload(input.fileUploadId, ctx.user.id);
      if (!analysis) {
        throw new Error('Analysis not found');
      }

      const transactions = await getTransactionsByFileUpload(input.fileUploadId, ctx.user.id);
      const sym = input.currencySymbol;

      const summary = {
        totalIncome: analysis.totalIncome,
        totalExpenses: analysis.totalExpenses,
        netCashFlow: analysis.netCashFlow,
        transactionCount: transactions.length,
        dateRange: {
          oldest: transactions[transactions.length - 1]?.date,
          newest: transactions[0]?.date,
        },
        topCategories: transactions
          .reduce((acc: any, tx: any) => {
            const existing = acc.find((c: any) => c.category === tx.category);
            if (existing) {
              existing.count += 1;
              existing.total = new Decimal(existing.total).plus(tx.amount).toFixed(2);
            } else {
              acc.push({ category: tx.category, count: 1, total: tx.amount });
            }
            return acc;
          }, [])
          .sort((a: any, b: any) => Math.abs(Number(b.total)) - Math.abs(Number(a.total)))
          .slice(0, 5),
      };

      const prompt = `Analyze the following financial transaction data and provide 2-3 key insights about spending patterns, income sources, and financial health. Be concise and actionable.

Financial Summary:
- Total Income: ${sym}${summary.totalIncome}
- Total Expenses: ${sym}${summary.totalExpenses}
- Net Cash Flow: ${sym}${summary.netCashFlow}
- Transaction Count: ${summary.transactionCount}
- Date Range: ${new Date(summary.dateRange.oldest).toLocaleDateString()} to ${new Date(summary.dateRange.newest).toLocaleDateString()}

Top Categories:
${summary.topCategories.map((c: any) => `- ${c.category}: ${c.count} transactions, ${sym}${Math.abs(Number(c.total))}`).join('\n')}

Provide insights in a professional, conversational tone.`;

      const response = await invokeLLM({
        messages: [
          {
            role: 'system',
            content: 'You are a financial analyst providing insights on personal spending patterns.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = response.choices[0]?.message?.content;
      const insights = typeof content === 'string' ? content : '';

      await updateAnalysis(input.fileUploadId, {
        topCategories: JSON.stringify(summary.topCategories),
        insights,
      });

      return { insights, topCategories: summary.topCategories };
    }),

  deleteUpload: protectedProcedure
    .input(z.object({ fileUploadId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteFileUpload(input.fileUploadId, ctx.user.id);
      return { success: true };
    }),
});
