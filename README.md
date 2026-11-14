# LedgerPulse — AI Finance Agent (`SAVDEV-TECH/finance-agent`)

An end-to-end AI-assisted personal finance and statement intelligence application. Upload bank statements in **CSV, Excel (`.xlsx`), Word (`.docx`), or PDF** format to automatically parse transactions, classify spending using hybrid deterministic + LLM rules, visualize monthly cash flow, and generate executive financial health insights.

---

## Core Architecture & Tooling

- **AI & Structured Classification (`ai`, `@ai-sdk/openai`, `@ai-sdk/google`, `zod`)**
  - [`server/_core/llm.ts`](server/_core/llm.ts): Unified Vercel AI SDK layer supporting OpenAI (`gpt-4o-mini`) and Google Gemini (`gemini-2.5-flash`) with Zod schema validation (`generateObject`), plus an automatic analytical fallback when running offline or without API keys.
  - [`server/aiCategorization.ts`](server/aiCategorization.ts): Extended merchant heuristics paired with batched LLM structured classification for ambiguous transactions.
- **Multi-Format Statement Parsing (`papaparse`, `xlsx`, `unpdf`, `mammoth`, `decimal.js`)**
  - [`server/transactionParser.ts`](server/transactionParser.ts): Case-insensitive column normalization, debit/credit split handling, parenthesized negative amounts, and Excel serial dates.
  - [`server/documentParser.ts`](server/documentParser.ts): Serverless-ready PDF (`unpdf`) and DOCX (`mammoth`) text extraction with deterministic + LLM fallback parsing.
  - [`server/financeMetrics.ts`](server/financeMetrics.ts): Exact currency math via `decimal.js` for inflow, outflow, net cash flow, savings rate, category share, and monthly trends.
- **End-to-End Type-Safe API & Persistence (`@trpc/server`, `@trpc/react-query`, `drizzle-orm`, `superjson`)**
  - [`server/routers/finance.ts`](server/routers/finance.ts): Full tRPC router for file ingestion, metric computation, inline recategorization, and AI insight synthesis.
  - [`server/db.ts`](server/db.ts): Drizzle ORM (MySQL) with an automatic persistent local JSON store fallback (`.data/local-db.json`) pre-seeded with sample statement data when `DATABASE_URL` is not set.
- **Interactive Frontend (`react`, `@tanstack/react-table`, `recharts`)**
  - [`client/src/components/TransactionTable.tsx`](client/src/components/TransactionTable.tsx): High-speed TanStack Table ledger with search, flow/category filters, sorting, inline category editing, and CSV export.
  - [`client/src/components/CashFlowCharts.tsx`](client/src/components/CashFlowCharts.tsx): Recharts monthly inflow/outflow bar chart and interactive category progress allocation.

---

## Getting Started

```bash
# Install dependencies
pnpm install

# Start development server (Express + Vite HMR + tRPC)
pnpm dev

# Run TypeScript check & Vitest unit test suite
pnpm check
pnpm test
```
