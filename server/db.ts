import fs from "fs";
import path from "path";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  User,
  users,
  transactions,
  fileUploads,
  analyses,
  InsertTransaction,
  Transaction,
  InsertFileUpload,
  FileUpload,
  InsertAnalysis,
  Analysis,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

interface LocalDatabaseState {
  nextIds: {
    users: number;
    fileUploads: number;
    transactions: number;
    analyses: number;
  };
  users: User[];
  fileUploads: FileUpload[];
  transactions: Transaction[];
  analyses: Analysis[];
}

const LOCAL_DB_PATH = process.env.VERCEL
  ? "/tmp/finance-agent-data/local-db.json"
  : path.resolve(process.cwd(), ".data/local-db.json");

function createSeedState(): LocalDatabaseState {
  const now = new Date("2026-11-14T10:00:00Z");
  const sampleTransactions: Array<
    Omit<Transaction, "id" | "userId" | "fileUploadId" | "createdAt" | "updatedAt">
  > = [
    {
      date: new Date("2026-09-01T09:00:00Z"),
      description: "GUSTO PAYROLL - SAVDEV TECH DIRECT DEP",
      amount: "6450.00",
      category: "salary",
      transactionType: "income",
      account: "Chase Sapphire Checking",
      tags: JSON.stringify(["type:income", "category:salary"]),
      notes: "Monthly base salary deposit",
    },
    {
      date: new Date("2026-09-02T14:20:00Z"),
      description: "AVALON BAY COMMUNITIES RENT",
      amount: "-2350.00",
      category: "rent",
      transactionType: "expense",
      account: "Chase Sapphire Checking",
      tags: JSON.stringify(["type:expense", "category:rent"]),
      notes: null,
    },
    {
      date: new Date("2026-09-05T18:10:00Z"),
      description: "WHOLE FOODS MARKET #1042",
      amount: "-184.65",
      category: "groceries",
      transactionType: "expense",
      account: "Amex Gold",
      tags: JSON.stringify(["type:expense", "category:groceries"]),
      notes: null,
    },
    {
      date: new Date("2026-09-09T11:30:00Z"),
      description: "CON EDISON ELECTRIC UTILITY BILL",
      amount: "-142.80",
      category: "utilities",
      transactionType: "expense",
      account: "Chase Sapphire Checking",
      tags: JSON.stringify(["type:expense", "category:utilities"]),
      notes: null,
    },
    {
      date: new Date("2026-09-14T20:15:00Z"),
      description: "SWEETGREEN UNION SQUARE DINING",
      amount: "-46.20",
      category: "dining",
      transactionType: "expense",
      account: "Amex Gold",
      tags: JSON.stringify(["type:expense", "category:dining"]),
      notes: null,
    },
    {
      date: new Date("2026-09-18T08:00:00Z"),
      description: "FIDELITY BROKERAGE DIVIDEND DISTRIBUTION",
      amount: "420.50",
      category: "investment",
      transactionType: "income",
      account: "Fidelity Cash Management",
      tags: JSON.stringify(["type:income", "category:investment"]),
      notes: null,
    },
    {
      date: new Date("2026-09-22T15:40:00Z"),
      description: "TRADER JOE'S #541 GROCERY",
      amount: "-129.40",
      category: "groceries",
      transactionType: "expense",
      account: "Amex Gold",
      tags: JSON.stringify(["type:expense", "category:groceries"]),
      notes: null,
    },
    {
      date: new Date("2026-10-01T09:00:00Z"),
      description: "GUSTO PAYROLL - SAVDEV TECH DIRECT DEP",
      amount: "6450.00",
      category: "salary",
      transactionType: "income",
      account: "Chase Sapphire Checking",
      tags: JSON.stringify(["type:income", "category:salary"]),
      notes: null,
    },
    {
      date: new Date("2026-10-02T12:00:00Z"),
      description: "AVALON BAY COMMUNITIES RENT",
      amount: "-2350.00",
      category: "rent",
      transactionType: "expense",
      account: "Chase Sapphire Checking",
      tags: JSON.stringify(["type:expense", "category:rent"]),
      notes: null,
    },
    {
      date: new Date("2026-10-06T09:45:00Z"),
      description: "VERIZON FIOS FIBER INTERNET",
      amount: "-89.99",
      category: "utilities",
      transactionType: "expense",
      account: "Chase Sapphire Checking",
      tags: JSON.stringify(["type:expense", "category:utilities"]),
      notes: null,
    },
    {
      date: new Date("2026-10-10T16:25:00Z"),
      description: "APPLE STORE FIFTH AVE RETAIL",
      amount: "-349.00",
      category: "shopping",
      transactionType: "expense",
      account: "Amex Gold",
      tags: JSON.stringify(["type:expense", "category:shopping"]),
      notes: null,
    },
    {
      date: new Date("2026-10-15T19:00:00Z"),
      description: "OPENAI *CHATGPT PLUS SUBSCRIPTION",
      amount: "-20.00",
      category: "subscriptions",
      transactionType: "expense",
      account: "Amex Gold",
      tags: JSON.stringify(["type:expense", "category:subscriptions"]),
      notes: null,
    },
    {
      date: new Date("2026-10-19T13:10:00Z"),
      description: "UBER TRIP AIRPORT TRANSIT",
      amount: "-68.45",
      category: "transportation",
      transactionType: "expense",
      account: "Amex Gold",
      tags: JSON.stringify(["type:expense", "category:transportation"]),
      notes: null,
    },
    {
      date: new Date("2026-10-25T17:50:00Z"),
      description: "WHOLE FOODS MARKET #1042",
      amount: "-212.30",
      category: "groceries",
      transactionType: "expense",
      account: "Amex Gold",
      tags: JSON.stringify(["type:expense", "category:groceries"]),
      notes: null,
    },
    {
      date: new Date("2026-11-01T09:00:00Z"),
      description: "GUSTO PAYROLL - SAVDEV TECH DIRECT DEP",
      amount: "6450.00",
      category: "salary",
      transactionType: "income",
      account: "Chase Sapphire Checking",
      tags: JSON.stringify(["type:income", "category:salary"]),
      notes: null,
    },
    {
      date: new Date("2026-11-02T12:00:00Z"),
      description: "AVALON BAY COMMUNITIES RENT",
      amount: "-2350.00",
      category: "rent",
      transactionType: "expense",
      account: "Chase Sapphire Checking",
      tags: JSON.stringify(["type:expense", "category:rent"]),
      notes: null,
    },
    {
      date: new Date("2026-11-06T10:30:00Z"),
      description: "PERFORMANCE Q4 ENGINEERING BONUS",
      amount: "1850.00",
      category: "bonus",
      transactionType: "income",
      account: "Chase Sapphire Checking",
      tags: JSON.stringify(["type:income", "category:bonus"]),
      notes: null,
    },
    {
      date: new Date("2026-11-08T15:15:00Z"),
      description: "ONE MEDICAL ANNUAL HEALTHCARE MEMBERSHIP",
      amount: "-199.00",
      category: "healthcare",
      transactionType: "expense",
      account: "Amex Gold",
      tags: JSON.stringify(["type:expense", "category:healthcare"]),
      notes: null,
    },
    {
      date: new Date("2026-11-10T21:00:00Z"),
      description: "BALTHAZAR SOHO RESTAURANT DINING",
      amount: "-164.50",
      category: "dining",
      transactionType: "expense",
      account: "Amex Gold",
      tags: JSON.stringify(["type:expense", "category:dining"]),
      notes: null,
    },
    {
      date: new Date("2026-11-12T08:30:00Z"),
      description: "SPOTIFY DUO & NETFLIX RECURRING SUBSCRIPTION",
      amount: "-38.98",
      category: "subscriptions",
      transactionType: "expense",
      account: "Amex Gold",
      tags: JSON.stringify(["type:expense", "category:subscriptions"]),
      notes: null,
    },
  ];

  const txRecords: Transaction[] = sampleTransactions.map((t, idx) => ({
    id: idx + 1,
    userId: 1,
    fileUploadId: 1,
    ...t,
    createdAt: now,
    updatedAt: now,
  }));

  return {
    nextIds: {
      users: 2,
      fileUploads: 2,
      transactions: txRecords.length + 1,
      analyses: 2,
    },
    users: [
      {
        id: 1,
        openId: "local-owner-openid",
        name: "Alex Morgan",
        email: "alex.morgan@savdev.tech",
        loginMethod: "session",
        role: "admin",
        createdAt: new Date("2026-01-15T09:00:00Z"),
        updatedAt: now,
        lastSignedIn: now,
      },
    ],
    fileUploads: [
      {
        id: 1,
        userId: 1,
        fileName: "Sep-Nov-2026-Consolidated-Statement.csv",
        fileKey: "1-files/seed-Sep-Nov-2026-Consolidated-Statement.csv",
        fileSize: 4820,
        fileType: "csv",
        transactionCount: txRecords.length,
        createdAt: now,
      },
    ],
    transactions: txRecords,
    analyses: [
      {
        id: 1,
        userId: 1,
        fileUploadId: 1,
        totalIncome: "21620.50",
        totalExpenses: "8845.27",
        netCashFlow: "12775.23",
        topCategories: JSON.stringify([
          { category: "salary", count: 3, total: "19350.00" },
          { category: "rent", count: 3, total: "-7050.00" },
          { category: "bonus", count: 1, total: "1850.00" },
          { category: "groceries", count: 3, total: "-526.35" },
          { category: "investment", count: 1, total: "420.50" },
        ]),
        insights: [
          "1. **Cash Flow & Savings Health:** You maintained a **positive net cash flow of $12,775.23** across 20 transactions from September through November 2026, achieving an exceptional **59.1% savings rate** ($21,620.50 total inflow vs. $8,845.27 total outflow).",
          "2. **Fixed vs. Variable Expense Ratio:** Housing (`rent` at $7,050.00 across 3 months, or $2,350/mo) accounts for **79.7% of total expenses**, while variable lifestyle spending (`groceries` at $526.35, `shopping` at $349.00, and `dining` at $210.70) remains tightly controlled.",
          "3. **Capital Allocation Opportunity:** Your Q4 engineering bonus ($1,850.00) and Fidelity dividend yield ($420.50) added $2,270.50 in non-salary income. Directing 80% of this surplus into your Fidelity investment account can compound passive income without affecting monthly liquidity.",
        ].join("\n\n"),
        reportUrl: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}

let _localState: LocalDatabaseState | null = null;

function hydrateDates(state: LocalDatabaseState): LocalDatabaseState {
  state.users = state.users.map((u) => ({
    ...u,
    createdAt: new Date(u.createdAt),
    updatedAt: new Date(u.updatedAt),
    lastSignedIn: new Date(u.lastSignedIn),
  }));
  state.fileUploads = state.fileUploads.map((f) => ({
    ...f,
    createdAt: new Date(f.createdAt),
  }));
  state.transactions = state.transactions.map((t) => ({
    ...t,
    date: new Date(t.date),
    createdAt: new Date(t.createdAt),
    updatedAt: new Date(t.updatedAt),
  }));
  state.analyses = state.analyses.map((a) => ({
    ...a,
    createdAt: new Date(a.createdAt),
    updatedAt: new Date(a.updatedAt),
  }));
  return state;
}

function getLocalStore(): LocalDatabaseState {
  if (_localState) return _localState;
  try {
    if (fs.existsSync(LOCAL_DB_PATH)) {
      const raw = fs.readFileSync(LOCAL_DB_PATH, "utf-8");
      _localState = hydrateDates(JSON.parse(raw) as LocalDatabaseState);
      return _localState;
    }
  } catch (err) {
    console.warn("[LocalStore] Reinitializing store:", err);
  }
  _localState = createSeedState();
  saveLocalStore(_localState);
  return _localState;
}

function saveLocalStore(state: LocalDatabaseState): void {
  try {
    fs.mkdirSync(path.dirname(LOCAL_DB_PATH), { recursive: true });
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    console.warn("[LocalStore] Failed to persist local state:", err);
  }
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    const now = new Date();
    const existing = store.users.find((u) => u.openId === user.openId);
    if (existing) {
      if (user.name !== undefined) existing.name = user.name ?? null;
      if (user.email !== undefined) existing.email = user.email ?? null;
      if (user.loginMethod !== undefined)
        existing.loginMethod = user.loginMethod ?? null;
      if (user.role !== undefined) existing.role = user.role;
      existing.lastSignedIn = user.lastSignedIn ?? now;
      existing.updatedAt = now;
    } else {
      store.users.push({
        id: store.nextIds.users++,
        openId: user.openId,
        name: user.name ?? null,
        email: user.email ?? null,
        loginMethod: user.loginMethod ?? null,
        role:
          user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user"),
        createdAt: now,
        updatedAt: now,
        lastSignedIn: user.lastSignedIn ?? now,
      });
    }
    saveLocalStore(store);
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    return store.users.find((u) => u.openId === openId);
  }

  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * File Upload Helpers
 */
export async function createFileUpload(data: InsertFileUpload): Promise<number> {
  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    const id = store.nextIds.fileUploads++;
    store.fileUploads.push({
      id,
      userId: data.userId,
      fileName: data.fileName,
      fileKey: data.fileKey,
      fileSize: data.fileSize,
      fileType: data.fileType,
      transactionCount: data.transactionCount ?? 0,
      createdAt: data.createdAt ?? new Date(),
    });
    saveLocalStore(store);
    return id;
  }
  await db.insert(fileUploads).values(data);
  const [row] = await db.execute(sql`SELECT LAST_INSERT_ID() as id`);
  const id = (row as any)?.[0]?.id ?? (row as any)?.id;
  if (!id) throw new Error("Failed to retrieve fileUpload id after insert");
  return Number(id);
}

export async function getFileUploadsByUser(userId: number) {
  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    return store.fileUploads
      .filter((f) => f.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return db
    .select()
    .from(fileUploads)
    .where(eq(fileUploads.userId, userId))
    .orderBy(desc(fileUploads.createdAt));
}

/**
 * Transaction Helpers
 */
export async function createTransactions(data: InsertTransaction[]) {
  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    const now = new Date();
    for (const item of data) {
      store.transactions.push({
        id: store.nextIds.transactions++,
        userId: item.userId,
        fileUploadId: item.fileUploadId,
        date: item.date instanceof Date ? item.date : new Date(item.date),
        description: item.description,
        amount: String(item.amount),
        category: item.category ?? "uncategorized",
        transactionType: item.transactionType,
        account: item.account ?? "default",
        tags: item.tags ?? null,
        notes: item.notes ?? null,
        createdAt: item.createdAt ?? now,
        updatedAt: item.updatedAt ?? now,
      });
    }
    saveLocalStore(store);
    return;
  }
  return db.insert(transactions).values(data);
}

export async function getTransactionsByFileUpload(
  fileUploadId: number,
  userId?: number
) {
  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    return store.transactions
      .filter(
        (t) =>
          t.fileUploadId === fileUploadId &&
          (userId === undefined || t.userId === userId)
      )
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }
  const predicate =
    userId === undefined
      ? eq(transactions.fileUploadId, fileUploadId)
      : and(
          eq(transactions.fileUploadId, fileUploadId),
          eq(transactions.userId, userId)
        );
  return db
    .select()
    .from(transactions)
    .where(predicate)
    .orderBy(desc(transactions.date));
}

export async function updateTransaction(
  transactionId: number,
  userId: number,
  data: Partial<InsertTransaction>
) {
  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    const tx = store.transactions.find(
      (t) => t.id === transactionId && t.userId === userId
    );
    if (tx) {
      if (data.category !== undefined) tx.category = data.category;
      if (data.transactionType !== undefined)
        tx.transactionType = data.transactionType;
      if (data.tags !== undefined) tx.tags = data.tags ?? null;
      if (data.notes !== undefined) tx.notes = data.notes ?? null;
      if (data.amount !== undefined) tx.amount = String(data.amount);
      if (data.description !== undefined) tx.description = data.description;
      tx.updatedAt = new Date();
      saveLocalStore(store);
    }
    return;
  }
  return db
    .update(transactions)
    .set(data)
    .where(
      and(eq(transactions.id, transactionId), eq(transactions.userId, userId))
    );
}

export async function getTransactionsByUser(
  userId: number,
  limit = 100,
  offset = 0
) {
  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    return store.transactions
      .filter((t) => t.userId === userId)
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(offset, offset + limit);
  }
  return db
    .select()
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(desc(transactions.date))
    .limit(limit)
    .offset(offset);
}

export async function getTransactionsByDateRange(
  userId: number,
  startDate: Date,
  endDate: Date
) {
  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    return store.transactions
      .filter(
        (t) =>
          t.userId === userId &&
          t.date.getTime() >= startDate.getTime() &&
          t.date.getTime() <= endDate.getTime()
      )
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }
  return db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        gte(transactions.date, startDate),
        lte(transactions.date, endDate)
      )
    )
    .orderBy(desc(transactions.date));
}

/**
 * Analysis Helpers
 */
export async function createAnalysis(data: InsertAnalysis) {
  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    const now = new Date();
    store.analyses.push({
      id: store.nextIds.analyses++,
      userId: data.userId,
      fileUploadId: data.fileUploadId,
      totalIncome: String(data.totalIncome),
      totalExpenses: String(data.totalExpenses),
      netCashFlow: String(data.netCashFlow),
      topCategories: data.topCategories ?? null,
      insights: data.insights ?? null,
      reportUrl: data.reportUrl ?? null,
      createdAt: data.createdAt ?? now,
      updatedAt: data.updatedAt ?? now,
    });
    saveLocalStore(store);
    return;
  }
  return db.insert(analyses).values(data);
}

export async function getAnalysisByFileUpload(
  fileUploadId: number,
  userId?: number
) {
  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    return (
      store.analyses.find(
        (a) =>
          a.fileUploadId === fileUploadId &&
          (userId === undefined || a.userId === userId)
      ) ?? null
    );
  }
  const predicate =
    userId === undefined
      ? eq(analyses.fileUploadId, fileUploadId)
      : and(
          eq(analyses.fileUploadId, fileUploadId),
          eq(analyses.userId, userId)
        );
  const result = await db.select().from(analyses).where(predicate).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function updateAnalysis(
  fileUploadId: number,
  data: Partial<InsertAnalysis>
) {
  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    const analysis = store.analyses.find(
      (a) => a.fileUploadId === fileUploadId
    );
    if (analysis) {
      if (data.totalIncome !== undefined)
        analysis.totalIncome = String(data.totalIncome);
      if (data.totalExpenses !== undefined)
        analysis.totalExpenses = String(data.totalExpenses);
      if (data.netCashFlow !== undefined)
        analysis.netCashFlow = String(data.netCashFlow);
      if (data.topCategories !== undefined)
        analysis.topCategories = data.topCategories ?? null;
      if (data.insights !== undefined) analysis.insights = data.insights ?? null;
      if (data.reportUrl !== undefined)
        analysis.reportUrl = data.reportUrl ?? null;
      analysis.updatedAt = new Date();
      saveLocalStore(store);
    }
    return;
  }
  return db
    .update(analyses)
    .set(data)
    .where(eq(analyses.fileUploadId, fileUploadId));
}

/**
 * Delete a file upload and all associated transactions and analyses.
 */
export async function deleteFileUpload(fileUploadId: number, userId: number) {
  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    store.transactions = store.transactions.filter(
      (t) => !(t.fileUploadId === fileUploadId && t.userId === userId)
    );
    store.analyses = store.analyses.filter(
      (a) => !(a.fileUploadId === fileUploadId && a.userId === userId)
    );
    store.fileUploads = store.fileUploads.filter(
      (f) => !(f.id === fileUploadId && f.userId === userId)
    );
    saveLocalStore(store);
    return;
  }
  await db
    .delete(transactions)
    .where(
      and(
        eq(transactions.fileUploadId, fileUploadId),
        eq(transactions.userId, userId)
      )
    );
  await db
    .delete(analyses)
    .where(
      and(
        eq(analyses.fileUploadId, fileUploadId),
        eq(analyses.userId, userId)
      )
    );
  await db
    .delete(fileUploads)
    .where(
      and(eq(fileUploads.id, fileUploadId), eq(fileUploads.userId, userId))
    );
}
