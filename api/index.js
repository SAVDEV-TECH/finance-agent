// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// server/_core/oauth.ts
import { SignJWT } from "jose";
import { serialize as serializeCookie } from "cookie";

// server/_core/env.ts
var ENV = {
  ownerOpenId: process.env.OWNER_OPEN_ID || "local-owner-openid",
  databaseUrl: process.env.DATABASE_URL || "",
  jwtSecret: process.env.JWT_SECRET || "finance-agent-dev-secret-key-2026",
  llmApiKey: process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || process.env.BUILT_IN_FORGE_API_KEY || "",
  llmBaseUrl: process.env.LLM_BASE_URL || process.env.BUILT_IN_FORGE_API_URL || "https://api.openai.com/v1",
  llmModel: process.env.LLM_MODEL || "gpt-4o-mini",
  s3Bucket: process.env.S3_BUCKET || "",
  s3Region: process.env.S3_REGION || "auto",
  s3Endpoint: process.env.S3_ENDPOINT || "",
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID || "",
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY || ""
};

// server/_core/context.ts
import { parse as parseCookie } from "cookie";
import { jwtVerify } from "jose";

// server/db.ts
import fs from "fs";
import path from "path";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// drizzle/schema.ts
import { decimal, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var fileUploads = mysqlTable("fileUploads", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileKey: varchar("fileKey", { length: 255 }).notNull(),
  fileSize: int("fileSize").notNull(),
  fileType: varchar("fileType", { length: 50 }).notNull(),
  transactionCount: int("transactionCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var transactions = mysqlTable("transactions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  fileUploadId: int("fileUploadId").notNull(),
  date: timestamp("date").notNull(),
  description: text("description").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  category: mysqlEnum("category", [
    "income",
    "salary",
    "bonus",
    "investment",
    "other_income",
    "expense",
    "groceries",
    "utilities",
    "rent",
    "transportation",
    "entertainment",
    "dining",
    "shopping",
    "healthcare",
    "insurance",
    "education",
    "subscriptions",
    "other_expense",
    "transfer",
    "uncategorized"
  ]).default("uncategorized").notNull(),
  transactionType: mysqlEnum("transactionType", [
    "income",
    "expense",
    "transfer"
  ]).notNull(),
  account: varchar("account", { length: 100 }).default("default").notNull(),
  tags: text("tags"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var analyses = mysqlTable("analyses", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  fileUploadId: int("fileUploadId").notNull(),
  totalIncome: decimal("totalIncome", { precision: 15, scale: 2 }).notNull(),
  totalExpenses: decimal("totalExpenses", { precision: 15, scale: 2 }).notNull(),
  netCashFlow: decimal("netCashFlow", { precision: 15, scale: 2 }).notNull(),
  topCategories: text("topCategories"),
  insights: text("insights"),
  reportUrl: varchar("reportUrl", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});

// server/db.ts
var _db = null;
async function getDb() {
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
var LOCAL_DB_PATH = process.env.VERCEL ? "/tmp/finance-agent-data/local-db.json" : path.resolve(process.cwd(), ".data/local-db.json");
function createSeedState() {
  const now = /* @__PURE__ */ new Date("2026-11-14T10:00:00Z");
  const sampleTransactions = [
    {
      date: /* @__PURE__ */ new Date("2026-09-01T09:00:00Z"),
      description: "GUSTO PAYROLL - SAVDEV TECH DIRECT DEP",
      amount: "6450.00",
      category: "salary",
      transactionType: "income",
      account: "Chase Sapphire Checking",
      tags: JSON.stringify(["type:income", "category:salary"]),
      notes: "Monthly base salary deposit"
    },
    {
      date: /* @__PURE__ */ new Date("2026-09-02T14:20:00Z"),
      description: "AVALON BAY COMMUNITIES RENT",
      amount: "-2350.00",
      category: "rent",
      transactionType: "expense",
      account: "Chase Sapphire Checking",
      tags: JSON.stringify(["type:expense", "category:rent"]),
      notes: null
    },
    {
      date: /* @__PURE__ */ new Date("2026-09-05T18:10:00Z"),
      description: "WHOLE FOODS MARKET #1042",
      amount: "-184.65",
      category: "groceries",
      transactionType: "expense",
      account: "Amex Gold",
      tags: JSON.stringify(["type:expense", "category:groceries"]),
      notes: null
    },
    {
      date: /* @__PURE__ */ new Date("2026-09-09T11:30:00Z"),
      description: "CON EDISON ELECTRIC UTILITY BILL",
      amount: "-142.80",
      category: "utilities",
      transactionType: "expense",
      account: "Chase Sapphire Checking",
      tags: JSON.stringify(["type:expense", "category:utilities"]),
      notes: null
    },
    {
      date: /* @__PURE__ */ new Date("2026-09-14T20:15:00Z"),
      description: "SWEETGREEN UNION SQUARE DINING",
      amount: "-46.20",
      category: "dining",
      transactionType: "expense",
      account: "Amex Gold",
      tags: JSON.stringify(["type:expense", "category:dining"]),
      notes: null
    },
    {
      date: /* @__PURE__ */ new Date("2026-09-18T08:00:00Z"),
      description: "FIDELITY BROKERAGE DIVIDEND DISTRIBUTION",
      amount: "420.50",
      category: "investment",
      transactionType: "income",
      account: "Fidelity Cash Management",
      tags: JSON.stringify(["type:income", "category:investment"]),
      notes: null
    },
    {
      date: /* @__PURE__ */ new Date("2026-09-22T15:40:00Z"),
      description: "TRADER JOE'S #541 GROCERY",
      amount: "-129.40",
      category: "groceries",
      transactionType: "expense",
      account: "Amex Gold",
      tags: JSON.stringify(["type:expense", "category:groceries"]),
      notes: null
    },
    {
      date: /* @__PURE__ */ new Date("2026-10-01T09:00:00Z"),
      description: "GUSTO PAYROLL - SAVDEV TECH DIRECT DEP",
      amount: "6450.00",
      category: "salary",
      transactionType: "income",
      account: "Chase Sapphire Checking",
      tags: JSON.stringify(["type:income", "category:salary"]),
      notes: null
    },
    {
      date: /* @__PURE__ */ new Date("2026-10-02T12:00:00Z"),
      description: "AVALON BAY COMMUNITIES RENT",
      amount: "-2350.00",
      category: "rent",
      transactionType: "expense",
      account: "Chase Sapphire Checking",
      tags: JSON.stringify(["type:expense", "category:rent"]),
      notes: null
    },
    {
      date: /* @__PURE__ */ new Date("2026-10-06T09:45:00Z"),
      description: "VERIZON FIOS FIBER INTERNET",
      amount: "-89.99",
      category: "utilities",
      transactionType: "expense",
      account: "Chase Sapphire Checking",
      tags: JSON.stringify(["type:expense", "category:utilities"]),
      notes: null
    },
    {
      date: /* @__PURE__ */ new Date("2026-10-10T16:25:00Z"),
      description: "APPLE STORE FIFTH AVE RETAIL",
      amount: "-349.00",
      category: "shopping",
      transactionType: "expense",
      account: "Amex Gold",
      tags: JSON.stringify(["type:expense", "category:shopping"]),
      notes: null
    },
    {
      date: /* @__PURE__ */ new Date("2026-10-15T19:00:00Z"),
      description: "OPENAI *CHATGPT PLUS SUBSCRIPTION",
      amount: "-20.00",
      category: "subscriptions",
      transactionType: "expense",
      account: "Amex Gold",
      tags: JSON.stringify(["type:expense", "category:subscriptions"]),
      notes: null
    },
    {
      date: /* @__PURE__ */ new Date("2026-10-19T13:10:00Z"),
      description: "UBER TRIP AIRPORT TRANSIT",
      amount: "-68.45",
      category: "transportation",
      transactionType: "expense",
      account: "Amex Gold",
      tags: JSON.stringify(["type:expense", "category:transportation"]),
      notes: null
    },
    {
      date: /* @__PURE__ */ new Date("2026-10-25T17:50:00Z"),
      description: "WHOLE FOODS MARKET #1042",
      amount: "-212.30",
      category: "groceries",
      transactionType: "expense",
      account: "Amex Gold",
      tags: JSON.stringify(["type:expense", "category:groceries"]),
      notes: null
    },
    {
      date: /* @__PURE__ */ new Date("2026-11-01T09:00:00Z"),
      description: "GUSTO PAYROLL - SAVDEV TECH DIRECT DEP",
      amount: "6450.00",
      category: "salary",
      transactionType: "income",
      account: "Chase Sapphire Checking",
      tags: JSON.stringify(["type:income", "category:salary"]),
      notes: null
    },
    {
      date: /* @__PURE__ */ new Date("2026-11-02T12:00:00Z"),
      description: "AVALON BAY COMMUNITIES RENT",
      amount: "-2350.00",
      category: "rent",
      transactionType: "expense",
      account: "Chase Sapphire Checking",
      tags: JSON.stringify(["type:expense", "category:rent"]),
      notes: null
    },
    {
      date: /* @__PURE__ */ new Date("2026-11-06T10:30:00Z"),
      description: "PERFORMANCE Q4 ENGINEERING BONUS",
      amount: "1850.00",
      category: "bonus",
      transactionType: "income",
      account: "Chase Sapphire Checking",
      tags: JSON.stringify(["type:income", "category:bonus"]),
      notes: null
    },
    {
      date: /* @__PURE__ */ new Date("2026-11-08T15:15:00Z"),
      description: "ONE MEDICAL ANNUAL HEALTHCARE MEMBERSHIP",
      amount: "-199.00",
      category: "healthcare",
      transactionType: "expense",
      account: "Amex Gold",
      tags: JSON.stringify(["type:expense", "category:healthcare"]),
      notes: null
    },
    {
      date: /* @__PURE__ */ new Date("2026-11-10T21:00:00Z"),
      description: "BALTHAZAR SOHO RESTAURANT DINING",
      amount: "-164.50",
      category: "dining",
      transactionType: "expense",
      account: "Amex Gold",
      tags: JSON.stringify(["type:expense", "category:dining"]),
      notes: null
    },
    {
      date: /* @__PURE__ */ new Date("2026-11-12T08:30:00Z"),
      description: "SPOTIFY DUO & NETFLIX RECURRING SUBSCRIPTION",
      amount: "-38.98",
      category: "subscriptions",
      transactionType: "expense",
      account: "Amex Gold",
      tags: JSON.stringify(["type:expense", "category:subscriptions"]),
      notes: null
    }
  ];
  const txRecords = sampleTransactions.map((t2, idx) => ({
    id: idx + 1,
    userId: 1,
    fileUploadId: 1,
    ...t2,
    createdAt: now,
    updatedAt: now
  }));
  return {
    nextIds: {
      users: 2,
      fileUploads: 2,
      transactions: txRecords.length + 1,
      analyses: 2
    },
    users: [
      {
        id: 1,
        openId: "local-owner-openid",
        name: "Alex Morgan",
        email: "alex.morgan@savdev.tech",
        loginMethod: "session",
        role: "admin",
        createdAt: /* @__PURE__ */ new Date("2026-01-15T09:00:00Z"),
        updatedAt: now,
        lastSignedIn: now
      }
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
        createdAt: now
      }
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
          { category: "investment", count: 1, total: "420.50" }
        ]),
        insights: [
          "1. **Cash Flow & Savings Health:** You maintained a **positive net cash flow of $12,775.23** across 20 transactions from September through November 2026, achieving an exceptional **59.1% savings rate** ($21,620.50 total inflow vs. $8,845.27 total outflow).",
          "2. **Fixed vs. Variable Expense Ratio:** Housing (`rent` at $7,050.00 across 3 months, or $2,350/mo) accounts for **79.7% of total expenses**, while variable lifestyle spending (`groceries` at $526.35, `shopping` at $349.00, and `dining` at $210.70) remains tightly controlled.",
          "3. **Capital Allocation Opportunity:** Your Q4 engineering bonus ($1,850.00) and Fidelity dividend yield ($420.50) added $2,270.50 in non-salary income. Directing 80% of this surplus into your Fidelity investment account can compound passive income without affecting monthly liquidity."
        ].join("\n\n"),
        reportUrl: null,
        createdAt: now,
        updatedAt: now
      }
    ]
  };
}
var _localState = null;
function hydrateDates(state) {
  state.users = state.users.map((u) => ({
    ...u,
    createdAt: new Date(u.createdAt),
    updatedAt: new Date(u.updatedAt),
    lastSignedIn: new Date(u.lastSignedIn)
  }));
  state.fileUploads = state.fileUploads.map((f) => ({
    ...f,
    createdAt: new Date(f.createdAt)
  }));
  state.transactions = state.transactions.map((t2) => ({
    ...t2,
    date: new Date(t2.date),
    createdAt: new Date(t2.createdAt),
    updatedAt: new Date(t2.updatedAt)
  }));
  state.analyses = state.analyses.map((a) => ({
    ...a,
    createdAt: new Date(a.createdAt),
    updatedAt: new Date(a.updatedAt)
  }));
  return state;
}
function getLocalStore() {
  if (_localState) return _localState;
  try {
    if (fs.existsSync(LOCAL_DB_PATH)) {
      const raw = fs.readFileSync(LOCAL_DB_PATH, "utf-8");
      _localState = hydrateDates(JSON.parse(raw));
      return _localState;
    }
  } catch (err) {
    console.warn("[LocalStore] Reinitializing store:", err);
  }
  _localState = createSeedState();
  saveLocalStore(_localState);
  return _localState;
}
function saveLocalStore(state) {
  try {
    fs.mkdirSync(path.dirname(LOCAL_DB_PATH), { recursive: true });
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    console.warn("[LocalStore] Failed to persist local state:", err);
  }
}
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    const now = /* @__PURE__ */ new Date();
    const existing = store.users.find((u) => u.openId === user.openId);
    if (existing) {
      if (user.name !== void 0) existing.name = user.name ?? null;
      if (user.email !== void 0) existing.email = user.email ?? null;
      if (user.loginMethod !== void 0)
        existing.loginMethod = user.loginMethod ?? null;
      if (user.role !== void 0) existing.role = user.role;
      existing.lastSignedIn = user.lastSignedIn ?? now;
      existing.updatedAt = now;
    } else {
      store.users.push({
        id: store.nextIds.users++,
        openId: user.openId,
        name: user.name ?? null,
        email: user.email ?? null,
        loginMethod: user.loginMethod ?? null,
        role: user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user"),
        createdAt: now,
        updatedAt: now,
        lastSignedIn: user.lastSignedIn ?? now
      });
    }
    saveLocalStore(store);
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    return store.users.find((u) => u.openId === openId);
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function createFileUpload(data) {
  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    const id2 = store.nextIds.fileUploads++;
    store.fileUploads.push({
      id: id2,
      userId: data.userId,
      fileName: data.fileName,
      fileKey: data.fileKey,
      fileSize: data.fileSize,
      fileType: data.fileType,
      transactionCount: data.transactionCount ?? 0,
      createdAt: data.createdAt ?? /* @__PURE__ */ new Date()
    });
    saveLocalStore(store);
    return id2;
  }
  await db.insert(fileUploads).values(data);
  const [row] = await db.execute(sql`SELECT LAST_INSERT_ID() as id`);
  const id = row?.[0]?.id ?? row?.id;
  if (!id) throw new Error("Failed to retrieve fileUpload id after insert");
  return Number(id);
}
async function getFileUploadsByUser(userId) {
  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    return store.fileUploads.filter((f) => f.userId === userId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return db.select().from(fileUploads).where(eq(fileUploads.userId, userId)).orderBy(desc(fileUploads.createdAt));
}
async function createTransactions(data) {
  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    const now = /* @__PURE__ */ new Date();
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
        updatedAt: item.updatedAt ?? now
      });
    }
    saveLocalStore(store);
    return;
  }
  return db.insert(transactions).values(data);
}
async function getTransactionsByFileUpload(fileUploadId, userId) {
  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    return store.transactions.filter(
      (t2) => t2.fileUploadId === fileUploadId && (userId === void 0 || t2.userId === userId)
    ).sort((a, b) => b.date.getTime() - a.date.getTime());
  }
  const predicate = userId === void 0 ? eq(transactions.fileUploadId, fileUploadId) : and(
    eq(transactions.fileUploadId, fileUploadId),
    eq(transactions.userId, userId)
  );
  return db.select().from(transactions).where(predicate).orderBy(desc(transactions.date));
}
async function updateTransaction(transactionId, userId, data) {
  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    const tx = store.transactions.find(
      (t2) => t2.id === transactionId && t2.userId === userId
    );
    if (tx) {
      if (data.category !== void 0) tx.category = data.category;
      if (data.transactionType !== void 0)
        tx.transactionType = data.transactionType;
      if (data.tags !== void 0) tx.tags = data.tags ?? null;
      if (data.notes !== void 0) tx.notes = data.notes ?? null;
      if (data.amount !== void 0) tx.amount = String(data.amount);
      if (data.description !== void 0) tx.description = data.description;
      tx.updatedAt = /* @__PURE__ */ new Date();
      saveLocalStore(store);
    }
    return;
  }
  return db.update(transactions).set(data).where(
    and(eq(transactions.id, transactionId), eq(transactions.userId, userId))
  );
}
async function createAnalysis(data) {
  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    const now = /* @__PURE__ */ new Date();
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
      updatedAt: data.updatedAt ?? now
    });
    saveLocalStore(store);
    return;
  }
  return db.insert(analyses).values(data);
}
async function getAnalysisByFileUpload(fileUploadId, userId) {
  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    return store.analyses.find(
      (a) => a.fileUploadId === fileUploadId && (userId === void 0 || a.userId === userId)
    ) ?? null;
  }
  const predicate = userId === void 0 ? eq(analyses.fileUploadId, fileUploadId) : and(
    eq(analyses.fileUploadId, fileUploadId),
    eq(analyses.userId, userId)
  );
  const result = await db.select().from(analyses).where(predicate).limit(1);
  return result.length > 0 ? result[0] : null;
}
async function updateAnalysis(fileUploadId, data) {
  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    const analysis = store.analyses.find(
      (a) => a.fileUploadId === fileUploadId
    );
    if (analysis) {
      if (data.totalIncome !== void 0)
        analysis.totalIncome = String(data.totalIncome);
      if (data.totalExpenses !== void 0)
        analysis.totalExpenses = String(data.totalExpenses);
      if (data.netCashFlow !== void 0)
        analysis.netCashFlow = String(data.netCashFlow);
      if (data.topCategories !== void 0)
        analysis.topCategories = data.topCategories ?? null;
      if (data.insights !== void 0) analysis.insights = data.insights ?? null;
      if (data.reportUrl !== void 0)
        analysis.reportUrl = data.reportUrl ?? null;
      analysis.updatedAt = /* @__PURE__ */ new Date();
      saveLocalStore(store);
    }
    return;
  }
  return db.update(analyses).set(data).where(eq(analyses.fileUploadId, fileUploadId));
}
async function deleteFileUpload(fileUploadId, userId) {
  const db = await getDb();
  if (!db) {
    const store = getLocalStore();
    store.transactions = store.transactions.filter(
      (t2) => !(t2.fileUploadId === fileUploadId && t2.userId === userId)
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
  await db.delete(transactions).where(
    and(
      eq(transactions.fileUploadId, fileUploadId),
      eq(transactions.userId, userId)
    )
  );
  await db.delete(analyses).where(
    and(
      eq(analyses.fileUploadId, fileUploadId),
      eq(analyses.userId, userId)
    )
  );
  await db.delete(fileUploads).where(
    and(eq(fileUploads.id, fileUploadId), eq(fileUploads.userId, userId))
  );
}

// server/_core/context.ts
var SESSION_COOKIE_NAME = "fa_session";
var DEFAULT_DEMO_USER = {
  id: 1,
  openId: "local-owner-openid",
  name: "Alex Morgan",
  email: "alex.morgan@savdev.tech",
  loginMethod: "session",
  role: "admin",
  createdAt: /* @__PURE__ */ new Date("2026-01-15T09:00:00Z"),
  updatedAt: /* @__PURE__ */ new Date("2026-11-14T09:00:00Z"),
  lastSignedIn: /* @__PURE__ */ new Date()
};
async function createContext({
  req,
  res
}) {
  try {
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
      const cookies = parseCookie(cookieHeader);
      const token = cookies[SESSION_COOKIE_NAME];
      if (token) {
        const secret = new TextEncoder().encode(ENV.jwtSecret);
        const { payload } = await jwtVerify(token, secret);
        if (payload.openId && typeof payload.openId === "string") {
          const dbUser = await getUserByOpenId(payload.openId);
          if (dbUser) {
            return { req, res, user: dbUser };
          }
        }
      }
    }
    const existing = await getUserByOpenId(DEFAULT_DEMO_USER.openId);
    if (existing) {
      return { req, res, user: existing };
    }
    await upsertUser({
      openId: DEFAULT_DEMO_USER.openId,
      name: DEFAULT_DEMO_USER.name,
      email: DEFAULT_DEMO_USER.email,
      loginMethod: DEFAULT_DEMO_USER.loginMethod,
      role: DEFAULT_DEMO_USER.role
    });
    const created = await getUserByOpenId(DEFAULT_DEMO_USER.openId);
    return { req, res, user: created ?? DEFAULT_DEMO_USER };
  } catch {
    return { req, res, user: DEFAULT_DEMO_USER };
  }
}

// server/_core/oauth.ts
function registerOAuthRoutes(app) {
  app.post("/api/auth/login", async (req, res) => {
    try {
      const name = String(req.body?.name || "Alex Morgan").trim();
      const email = String(req.body?.email || "alex.morgan@savdev.tech").trim();
      const openId = `user-${email.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
      await upsertUser({
        openId,
        name,
        email,
        loginMethod: "session",
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const user = await getUserByOpenId(openId);
      const secret = new TextEncoder().encode(ENV.jwtSecret);
      const token = await new SignJWT({ openId, email, name }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(secret);
      res.setHeader(
        "Set-Cookie",
        serializeCookie(SESSION_COOKIE_NAME, token, {
          httpOnly: true,
          path: "/",
          sameSite: "lax",
          maxAge: 60 * 60 * 24 * 30
        })
      );
      res.json({ success: true, user });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app.post("/api/auth/logout", (_req, res) => {
    res.setHeader(
      "Set-Cookie",
      serializeCookie(SESSION_COOKIE_NAME, "", {
        httpOnly: true,
        path: "/",
        maxAge: 0
      })
    );
    res.json({ success: true });
  });
}

// server/_core/storageProxy.ts
import fs3 from "fs/promises";

// server/storage.ts
import fs2 from "fs/promises";
import path2 from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
var LOCAL_STORAGE_DIR = process.env.VERCEL ? "/tmp/finance-agent-data/storage" : path2.resolve(process.cwd(), ".data/storage");
function getS3Client() {
  if (ENV.s3Bucket && ENV.s3AccessKeyId && ENV.s3SecretAccessKey) {
    return new S3Client({
      region: ENV.s3Region,
      endpoint: ENV.s3Endpoint || void 0,
      credentials: {
        accessKeyId: ENV.s3AccessKeyId,
        secretAccessKey: ENV.s3SecretAccessKey
      },
      forcePathStyle: Boolean(ENV.s3Endpoint)
    });
  }
  return null;
}
async function storagePut(fileKey, buffer, contentType) {
  const sanitizedKey = fileKey.replace(/[^a-zA-Z0-9._/-]/g, "_");
  const s3 = getS3Client();
  if (s3 && ENV.s3Bucket) {
    await s3.send(
      new PutObjectCommand({
        Bucket: ENV.s3Bucket,
        Key: sanitizedKey,
        Body: buffer,
        ContentType: contentType
      })
    );
    return {
      key: sanitizedKey,
      url: `/api/storage/${encodeURIComponent(sanitizedKey)}`
    };
  }
  const targetPath = path2.join(LOCAL_STORAGE_DIR, sanitizedKey);
  await fs2.mkdir(path2.dirname(targetPath), { recursive: true });
  await fs2.writeFile(targetPath, buffer);
  return {
    key: sanitizedKey,
    url: `/api/storage/${encodeURIComponent(sanitizedKey)}`
  };
}
async function storageGetLocalPath(fileKey) {
  const sanitizedKey = fileKey.replace(/[^a-zA-Z0-9._/-]/g, "_");
  const resolved = path2.resolve(LOCAL_STORAGE_DIR, sanitizedKey);
  if (!resolved.startsWith(LOCAL_STORAGE_DIR)) {
    throw new Error("Invalid storage path");
  }
  return resolved;
}

// server/_core/storageProxy.ts
function registerStorageProxy(app) {
  app.get("/api/storage/:key(*)", async (req, res) => {
    try {
      const rawKey = decodeURIComponent(req.params.key || "");
      if (!rawKey) {
        res.status(400).json({ error: "Missing file key" });
        return;
      }
      const filePath = await storageGetLocalPath(rawKey);
      const content = await fs3.readFile(filePath);
      const ext = filePath.split(".").pop()?.toLowerCase();
      const contentType = ext === "pdf" ? "application/pdf" : ext === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : ext === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "text/csv; charset=utf-8";
      res.setHeader("Content-Type", contentType);
      res.send(content);
    } catch {
      res.status(404).json({ error: "Stored file not found" });
    }
  });
}

// server/_core/trpc.ts
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required to access financial data."
    });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});

// server/routers/finance.ts
import { z as z3 } from "zod";

// server/transactionParser.ts
import Papa from "papaparse";
import * as XLSX from "xlsx";
function parseCSV(fileContent) {
  return new Promise((resolve, reject) => {
    Papa.parse(fileContent, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const transactions2 = results.data.map((row) => parseTransactionRow(row)).filter((t2) => t2 !== null);
          resolve(transactions2);
        } catch (error) {
          reject(error);
        }
      },
      error: (error) => {
        reject(new Error(`CSV parsing error: ${error.message}`));
      }
    });
  });
}
function parseExcel(buffer) {
  try {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new Error("No sheets found in Excel file");
    }
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet);
    return rows.map((row) => parseTransactionRow(row)).filter((t2) => t2 !== null);
  } catch (error) {
    throw new Error(`Excel parsing error: ${error.message}`);
  }
}
function parseTransactionRow(row) {
  const dateValue = findColumnValue(row, ["date", "Date", "transaction date", "Transaction Date", "posted date", "Posted Date"]);
  if (!dateValue) return null;
  const date = parseDate(dateValue);
  if (!date) return null;
  const description = findColumnValue(row, ["description", "Description", "memo", "Memo", "transaction", "Transaction", "details", "Details"]);
  if (!description) return null;
  let amount = null;
  let originalAmount = "";
  const amountValue = findColumnValue(row, ["amount", "Amount", "value", "Value"]);
  if (amountValue) {
    const parsed = parseAmount(amountValue);
    if (parsed !== null) {
      amount = parsed.value;
      originalAmount = parsed.original;
    }
  }
  if (amount === null) {
    const debitValue = findColumnValue(row, ["debit", "Debit", "withdrawal", "Withdrawal"]);
    const creditValue = findColumnValue(row, ["credit", "Credit", "deposit", "Deposit"]);
    const debitParsed = debitValue ? parseAmount(debitValue) : null;
    const creditParsed = creditValue ? parseAmount(creditValue) : null;
    const hasDebit = debitParsed !== null && debitParsed.value !== 0;
    const hasCredit = creditParsed !== null && creditParsed.value !== 0;
    if (hasDebit) {
      amount = -Math.abs(debitParsed.value);
      originalAmount = debitParsed.original;
    } else if (hasCredit) {
      amount = Math.abs(creditParsed.value);
      originalAmount = creditParsed.original;
    }
  }
  if (amount === null) return null;
  const account = findColumnValue(row, ["account", "Account", "account name", "Account Name", "source account", "Source Account"]);
  return {
    date,
    description: String(description).trim(),
    amount,
    originalAmount,
    account: account ? String(account).trim() : void 0
  };
}
function findColumnValue(row, columnNames) {
  const lowercaseRow = {};
  for (const key of Object.keys(row)) {
    lowercaseRow[key.toLowerCase().trim()] = row[key];
  }
  for (const name of columnNames) {
    const val = lowercaseRow[name.toLowerCase().trim()];
    if (val !== void 0 && val !== null && val !== "") {
      return val;
    }
  }
  return null;
}
function parseDate(dateStr) {
  if (dateStr === null || dateStr === void 0 || dateStr === "") return null;
  if (dateStr instanceof Date) return dateStr;
  if (typeof dateStr === "number" && dateStr > 1 && dateStr < 1e5) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date2 = new Date(excelEpoch + dateStr * 24 * 60 * 60 * 1e3);
    return Number.isNaN(date2.getTime()) ? null : date2;
  }
  const str = String(dateStr).trim();
  const date = new Date(str);
  if (isNaN(date.getTime())) {
    return null;
  }
  return date;
}
function parseAmount(amountStr) {
  if (!amountStr) return null;
  const original = String(amountStr).trim();
  let cleaned = original.replace(/[$€£¥₹]/g, "").replace(/\s/g, "").replace(/,/g, "");
  if (cleaned.startsWith("(") && cleaned.endsWith(")")) {
    cleaned = "-" + cleaned.slice(1, -1);
  }
  const value = parseFloat(cleaned);
  if (isNaN(value)) {
    return null;
  }
  return { value, original };
}
function categorizeTransaction(description, amount) {
  const desc2 = description.toLowerCase();
  if (desc2.includes("transfer") || desc2.includes("move between") || desc2.includes("account to account")) {
    return { transactionType: "transfer", category: "transfer" };
  }
  if (amount > 0) {
    if (desc2.includes("dividend") || desc2.includes("interest") || desc2.includes("investment")) {
      return { transactionType: "income", category: "investment" };
    }
    if (desc2.includes("bonus") || desc2.includes("refund")) {
      return { transactionType: "income", category: "bonus" };
    }
    if (desc2.includes("salary") || desc2.includes("paycheck") || desc2.includes("pay")) {
      return { transactionType: "income", category: "salary" };
    }
    return { transactionType: "income", category: "other_income" };
  }
  if (amount < 0) {
    const absDesc = desc2;
    if (absDesc.includes("grocery") || absDesc.includes("whole foods") || absDesc.includes("trader joe") || absDesc.includes("safeway") || absDesc.includes("kroger") || absDesc.includes("costco") || absDesc.includes("food market")) {
      return { transactionType: "expense", category: "groceries" };
    }
    if (absDesc.includes("electric") || absDesc.includes("water") || absDesc.includes("gas") || absDesc.includes("utility") || absDesc.includes("internet") || absDesc.includes("phone bill")) {
      return { transactionType: "expense", category: "utilities" };
    }
    if (absDesc.includes("rent") || absDesc.includes("mortgage") || absDesc.includes("landlord")) {
      return { transactionType: "expense", category: "rent" };
    }
    if (absDesc.includes("gas") || absDesc.includes("uber") || absDesc.includes("lyft") || absDesc.includes("parking") || absDesc.includes("transit") || absDesc.includes("car") || absDesc.includes("fuel")) {
      return { transactionType: "expense", category: "transportation" };
    }
    if (absDesc.includes("restaurant") || absDesc.includes("cafe") || absDesc.includes("coffee") || absDesc.includes("pizza") || absDesc.includes("burger") || absDesc.includes("sushi") || absDesc.includes("dining")) {
      return { transactionType: "expense", category: "dining" };
    }
    if (absDesc.includes("subscription") || absDesc.includes("monthly") || absDesc.includes("recurring") || absDesc.includes("membership") || absDesc.includes("netflix") || absDesc.includes("spotify")) {
      return { transactionType: "expense", category: "subscriptions" };
    }
    if (absDesc.includes("movie") || absDesc.includes("gaming") || absDesc.includes("concert") || absDesc.includes("entertainment")) {
      return { transactionType: "expense", category: "entertainment" };
    }
    if (absDesc.includes("amazon") || absDesc.includes("target") || absDesc.includes("walmart") || absDesc.includes("mall") || absDesc.includes("store") || absDesc.includes("retail")) {
      return { transactionType: "expense", category: "shopping" };
    }
    if (absDesc.includes("pharmacy") || absDesc.includes("doctor") || absDesc.includes("hospital") || absDesc.includes("medical") || absDesc.includes("cvs") || absDesc.includes("walgreens")) {
      return { transactionType: "expense", category: "healthcare" };
    }
    if (absDesc.includes("insurance") || absDesc.includes("premium")) {
      return { transactionType: "expense", category: "insurance" };
    }
    if (absDesc.includes("tuition") || absDesc.includes("school") || absDesc.includes("university") || absDesc.includes("course") || absDesc.includes("education")) {
      return { transactionType: "expense", category: "education" };
    }
    return { transactionType: "expense", category: "other_expense" };
  }
  return { transactionType: "expense", category: "uncategorized" };
}

// server/_core/llm.ts
import { generateText, generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
function getLanguageModel() {
  if (process.env.GEMINI_API_KEY) {
    const google = createGoogleGenerativeAI({
      apiKey: process.env.GEMINI_API_KEY
    });
    return google(process.env.GEMINI_MODEL || "gemini-2.5-flash");
  }
  if (ENV.llmApiKey) {
    const openai = createOpenAI({
      apiKey: ENV.llmApiKey,
      baseURL: ENV.llmBaseUrl
    });
    return openai(ENV.llmModel);
  }
  return null;
}
async function invokeStructuredLLM(options) {
  const model = getLanguageModel();
  if (!model) {
    return null;
  }
  try {
    const { object } = await generateObject({
      model,
      schema: options.schema,
      system: options.system,
      prompt: options.prompt,
      temperature: 0.1
    });
    return object;
  } catch (error) {
    console.warn("[LLM] Structured generation failed, using deterministic fallback:", error);
    return null;
  }
}
function buildDeterministicFinancialInsights(userPrompt) {
  const incomeMatch = userPrompt.match(/Total Income:\s*([^\n]+)/i);
  const expenseMatch = userPrompt.match(/Total Expenses:\s*([^\n]+)/i);
  const netMatch = userPrompt.match(/Net Cash Flow:\s*([^\n]+)/i);
  const countMatch = userPrompt.match(/Transaction Count:\s*(\d+)/i);
  const topSection = userPrompt.split(/Top Categories:/i)[1] || "";
  const incomeStr = incomeMatch?.[1]?.trim() || "$0.00";
  const expenseStr = expenseMatch?.[1]?.trim() || "$0.00";
  const netStr = netMatch?.[1]?.trim() || "$0.00";
  const txCount = countMatch?.[1] || "0";
  const parseNum = (s) => parseFloat(s.replace(/[^0-9.-]/g, "")) || 0;
  const income = parseNum(incomeStr);
  const expenses = parseNum(expenseStr);
  const net2 = parseNum(netStr);
  const savingsRate = income > 0 ? (net2 / income * 100).toFixed(1) : "0.0";
  const categoryLines = topSection.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("-")).slice(0, 3).map((l) => l.replace(/^-\s*/, ""));
  const healthAssessment = net2 > 0 ? `You maintained a **positive net cash flow of ${netStr}** across ${txCount} transactions, achieving a **${savingsRate}% savings rate** (${incomeStr} income vs. ${expenseStr} expenses).` : net2 < 0 ? `Your expenses (${expenseStr}) exceeded income (${incomeStr}) across ${txCount} transactions, resulting in a **net cash flow deficit of ${netStr}**.` : `Your cash flow broke even across ${txCount} transactions (${incomeStr} income vs. ${expenseStr} expenses).`;
  const categoryInsight = categoryLines.length > 0 ? `Your highest-activity categories were **${categoryLines.join("**, **")}**. Auditing discretionary outflow in your top expense drivers is the fastest lever to improve monthly margin.` : `Categorizing any remaining uncategorized transactions will sharpen visibility into your largest spending drivers.`;
  const recommendation = Number(savingsRate) >= 20 ? `With a strong ${savingsRate}% savings rate, consider automating surplus cash flow (${netStr}) into low-cost index investments or a high-yield reserve account.` : Number(savingsRate) > 0 ? `Aim to lift your current ${savingsRate}% savings rate toward the 20% benchmark by setting a monthly cap on variable dining, shopping, and subscription charges.` : `Prioritize trimming recurring subscriptions and non-essential discretionary categories to restore positive monthly cash flow.`;
  return [
    `1. **Cash Flow & Savings Health:** ${healthAssessment}`,
    `2. **Concentration & Spending Drivers:** ${categoryInsight}`,
    `3. **Actionable Next Step:** ${recommendation}`
  ].join("\n\n");
}
async function invokeLLM(options) {
  const model = getLanguageModel();
  const systemMsg = options.messages.find((m) => m.role === "system")?.content || "You are a financial analyst providing insights on personal spending patterns.";
  const userMsg = options.messages.filter((m) => m.role !== "system").map((m) => m.content).join("\n\n") || "";
  if (model) {
    try {
      const { text: text2 } = await generateText({
        model,
        system: systemMsg,
        prompt: userMsg,
        temperature: options.temperature ?? 0.3
      });
      if (text2 && text2.trim().length > 0) {
        return {
          choices: [
            {
              message: {
                role: "assistant",
                content: text2.trim()
              }
            }
          ]
        };
      }
    } catch (error) {
      console.warn("[LLM] Text generation failed, falling back to local analyzer:", error);
    }
  }
  return {
    choices: [
      {
        message: {
          role: "assistant",
          content: buildDeterministicFinancialInsights(userMsg)
        }
      }
    ]
  };
}

// server/aiCategorization.ts
import { z } from "zod";
var VALID_CATEGORIES = [
  "income",
  "salary",
  "bonus",
  "investment",
  "other_income",
  "expense",
  "groceries",
  "utilities",
  "rent",
  "transportation",
  "entertainment",
  "dining",
  "shopping",
  "healthcare",
  "insurance",
  "education",
  "subscriptions",
  "other_expense",
  "transfer",
  "uncategorized"
];
var CategorizationSchema = z.object({
  classifications: z.array(
    z.object({
      index: z.number(),
      category: z.enum(VALID_CATEGORIES)
    })
  )
});
function inferCategoryHeuristically(description, amount) {
  const d = description.toLowerCase();
  if (d.includes("zelle") || d.includes("venmo") || d.includes("wire") || d.includes("ach transfer") || d.includes("internal xfer")) {
    return "transfer";
  }
  if (amount > 0) {
    if (d.includes("direct dep") || d.includes("payroll") || d.includes("gusto") || d.includes("adp") || d.includes("rippling") || d.includes("employer")) {
      return "salary";
    }
    if (d.includes("vanguard") || d.includes("fidelity") || d.includes("schwab") || d.includes("robinhood") || d.includes("yield") || d.includes("staking") || d.includes("capital gain")) {
      return "investment";
    }
    if (d.includes("cashback") || d.includes("reward") || d.includes("rebate") || d.includes("reimbursement") || d.includes("tax refund")) {
      return "bonus";
    }
    if (d.includes("freelance") || d.includes("stripe") || d.includes("invoice") || d.includes("client")) {
      return "income";
    }
    return null;
  }
  if (d.includes("aldi") || d.includes("publix") || d.includes("wegmans") || d.includes("sprouts") || d.includes("heb") || d.includes("instacart") || d.includes("supermarket") || d.includes("mart")) {
    return "groceries";
  }
  if (d.includes("comcast") || d.includes("xfinity") || d.includes("verizon") || d.includes("at&t") || d.includes("t-mobile") || d.includes("con ed") || d.includes("pg&e") || d.includes("spectrum") || d.includes("fiber") || d.includes("sewer") || d.includes("trash")) {
    return "utilities";
  }
  if (d.includes("hoa") || d.includes("property") || d.includes("apartments") || d.includes("leasing") || d.includes("bilt")) {
    return "rent";
  }
  if (d.includes("shell") || d.includes("chevron") || d.includes("exxon") || d.includes("bp ") || d.includes("mobil") || d.includes("metro") || d.includes("mta") || d.includes("bart") || d.includes("airline") || d.includes("delta") || d.includes("united") || d.includes("waymo") || d.includes("toll") || d.includes("ezpass")) {
    return "transportation";
  }
  if (d.includes("starbucks") || d.includes("chipotle") || d.includes("doordash") || d.includes("ubereats") || d.includes("grubhub") || d.includes("sweetgreen") || d.includes("panera") || d.includes("mcdonald") || d.includes("taco") || d.includes("bakery") || d.includes("bistro") || d.includes("grill") || d.includes("kitchen") || d.includes("bar ")) {
    return "dining";
  }
  if (d.includes("hulu") || d.includes("disney") || d.includes("apple.com/bill") || d.includes("icloud") || d.includes("youtube") || d.includes("openai") || d.includes("anthropic") || d.includes("github") || d.includes("adobe") || d.includes("notion") || d.includes("claude") || d.includes("chatgpt") || d.includes("gym") || d.includes("equinox") || d.includes("planet fitness")) {
    return "subscriptions";
  }
  if (d.includes("steam") || d.includes("playstation") || d.includes("nintendo") || d.includes("xbox") || d.includes("ticketmaster") || d.includes("stubhub") || d.includes("amc") || d.includes("regal") || d.includes("bowling") || d.includes("museum")) {
    return "entertainment";
  }
  if (d.includes("apple store") || d.includes("best buy") || d.includes("ikea") || d.includes("home depot") || d.includes("lowe") || d.includes("nike") || d.includes("uniqlo") || d.includes("zara") || d.includes("sephora") || d.includes("etsy") || d.includes("ebay") || d.includes("shopify")) {
    return "shopping";
  }
  if (d.includes("dental") || d.includes("dentist") || d.includes("optometry") || d.includes("vision") || d.includes("clinic") || d.includes("labcorp") || d.includes("quest") || d.includes("therapy") || d.includes("rite aid") || d.includes("health")) {
    return "healthcare";
  }
  if (d.includes("geico") || d.includes("state farm") || d.includes("progressive") || d.includes("allstate") || d.includes("lemonade") || d.includes("usaa") || d.includes("policy")) {
    return "insurance";
  }
  if (d.includes("coursera") || d.includes("udemy") || d.includes("college") || d.includes("books") || d.includes("student loan") || d.includes("nelnet") || d.includes("aidvantage")) {
    return "education";
  }
  return null;
}
async function classifyAmbiguousTransactions(ambiguous) {
  const result = /* @__PURE__ */ new Map();
  if (ambiguous.length === 0) {
    return result;
  }
  const remainingForLLM = [];
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
  const batch = remainingForLLM.slice(0, 100);
  const structured = await invokeStructuredLLM({
    schema: CategorizationSchema,
    system: "You are a precision financial transaction classifier. Classify each bank transaction into the single most accurate category based on its merchant description and signed amount (positive = inflow, negative = outflow).",
    prompt: `Classify these transactions:
${JSON.stringify(batch, null, 2)}`
  });
  if (structured?.classifications) {
    for (const item of structured.classifications) {
      result.set(item.index, item.category);
    }
  }
  return result;
}

// server/financeMetrics.ts
import Decimal from "decimal.js";
function calculateFinancialMetrics(rows) {
  let totalIncome = new Decimal(0);
  let totalExpenses = new Decimal(0);
  let totalTransfers = new Decimal(0);
  let expenseCount = 0;
  let largestExpense = new Decimal(0);
  const categoryMap = /* @__PURE__ */ new Map();
  const monthlyMap = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const rawAmount = new Decimal(row.amount || 0);
    const absAmount = rawAmount.abs();
    const isTransfer = row.transactionType === "transfer" || row.category === "transfer";
    const isIncome = !isTransfer && (row.transactionType === "income" || row.transactionType !== "expense" && rawAmount.gt(0));
    if (isTransfer) {
      totalTransfers = totalTransfers.plus(absAmount);
    } else if (isIncome) {
      totalIncome = totalIncome.plus(absAmount);
    } else {
      totalExpenses = totalExpenses.plus(absAmount);
      expenseCount += 1;
      if (absAmount.gt(largestExpense)) {
        largestExpense = absAmount;
      }
    }
    const effectiveType = isTransfer ? "transfer" : isIncome ? "income" : "expense";
    const key = `${effectiveType}:${row.category}`;
    const existingCat = categoryMap.get(key);
    if (existingCat) {
      existingCat.total = existingCat.total.plus(absAmount);
      existingCat.count += 1;
    } else {
      categoryMap.set(key, {
        category: row.category,
        transactionType: effectiveType,
        total: absAmount,
        count: 1
      });
    }
    if (row.date) {
      const parsedDate = row.date instanceof Date ? row.date : new Date(row.date);
      if (!Number.isNaN(parsedDate.getTime())) {
        const year = parsedDate.getUTCFullYear();
        const month = String(parsedDate.getUTCMonth() + 1).padStart(2, "0");
        const monthKey = `${year}-${month}`;
        const existingMonth = monthlyMap.get(monthKey) ?? {
          income: new Decimal(0),
          expenses: new Decimal(0),
          transactionCount: 0
        };
        if (isIncome) {
          existingMonth.income = existingMonth.income.plus(absAmount);
        } else if (!isTransfer) {
          existingMonth.expenses = existingMonth.expenses.plus(absAmount);
        }
        existingMonth.transactionCount += 1;
        monthlyMap.set(monthKey, existingMonth);
      }
    }
  }
  const netCashFlow = totalIncome.minus(totalExpenses);
  const savingsRate = totalIncome.gt(0) ? Number(netCashFlow.div(totalIncome).times(100).toDecimalPlaces(1)) : 0;
  const averageExpense = expenseCount > 0 ? totalExpenses.div(expenseCount).toFixed(2) : new Decimal(0).toFixed(2);
  const categoryBreakdown = Array.from(categoryMap.values()).map((item) => {
    const denominator = item.transactionType === "income" ? totalIncome : item.transactionType === "expense" ? totalExpenses : totalTransfers;
    const percentage = denominator.gt(0) ? Number(item.total.div(denominator).times(100).toDecimalPlaces(1)) : 0;
    return {
      category: item.category,
      transactionType: item.transactionType,
      total: item.total.toFixed(2),
      count: item.count,
      percentage
    };
  }).sort((a, b) => Number(b.total) - Number(a.total));
  const monthlyTrends = Array.from(monthlyMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([month, data]) => {
    const inc = Number(data.income.toFixed(2));
    const exp = Number(data.expenses.toFixed(2));
    return {
      month,
      income: inc,
      expenses: exp,
      net: Number(data.income.minus(data.expenses).toFixed(2)),
      transactionCount: data.transactionCount
    };
  });
  return {
    totalIncome: totalIncome.toFixed(2),
    totalExpenses: totalExpenses.toFixed(2),
    netCashFlow: netCashFlow.toFixed(2),
    totalTransfers: totalTransfers.toFixed(2),
    savingsRate,
    transactionCount: rows.length,
    averageExpense,
    largestExpense: largestExpense.toFixed(2),
    categoryBreakdown,
    monthlyTrends
  };
}

// server/routers/finance.ts
import Decimal2 from "decimal.js";

// server/fileValidation.ts
var ZIP_MAGIC = [80, 75, 3, 4];
var PDF_MAGIC = [37, 80, 68, 70];
function startsWithBytes(buffer, signature) {
  if (buffer.length < signature.length) return false;
  return signature.every((byte, idx) => buffer[idx] === byte);
}
function validateUploadedFile(fileType, fileBuffer) {
  if (!fileBuffer || fileBuffer.length === 0) {
    throw new Error("Uploaded file is empty.");
  }
  if (fileBuffer.length > 10 * 1024 * 1024) {
    throw new Error("File exceeds the 10MB maximum size limit.");
  }
  switch (fileType) {
    case "pdf": {
      if (!startsWithBytes(fileBuffer, PDF_MAGIC)) {
        throw new Error("Invalid PDF file: missing %PDF header signature.");
      }
      break;
    }
    case "xlsx":
    case "docx": {
      const isZip = startsWithBytes(fileBuffer, ZIP_MAGIC);
      const isOle2 = fileType === "xlsx" && startsWithBytes(fileBuffer, [208, 207, 17, 224]);
      if (!isZip && !isOle2) {
        throw new Error(
          `Invalid ${fileType.toUpperCase()} file: file signature does not match an Office OpenXML document.`
        );
      }
      break;
    }
    case "csv": {
      const sample = fileBuffer.subarray(0, Math.min(fileBuffer.length, 4096));
      for (let i = 0; i < sample.length; i++) {
        if (sample[i] === 0) {
          throw new Error("Invalid CSV file: binary content detected.");
        }
      }
      const text2 = fileBuffer.toString("utf8").trim();
      if (text2.length === 0) {
        throw new Error("CSV file contains no readable text.");
      }
      break;
    }
    default:
      throw new Error(`Unsupported file type: ${String(fileType)}`);
  }
}

// server/batching.ts
function chunkArray(items, chunkSize) {
  if (chunkSize <= 0) {
    throw new Error("chunkSize must be greater than 0");
  }
  const chunks = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

// server/documentParser.ts
import mammoth from "mammoth";
import { extractText } from "unpdf";
import { z as z2 } from "zod";
var ExtractedDocumentTransactionsSchema = z2.object({
  transactions: z2.array(
    z2.object({
      date: z2.string().describe("ISO date string YYYY-MM-DD"),
      description: z2.string().describe("Merchant or transaction description"),
      amount: z2.number().describe("Signed amount: positive for income/deposits, negative for expenses/withdrawals"),
      account: z2.string().optional()
    })
  )
});
async function extractTextFromDocx(buffer) {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return (result.value || "").trim();
  } catch (error) {
    throw new Error(
      `DOCX text extraction failed: ${error.message}`
    );
  }
}
async function extractTextFromPdf(buffer) {
  try {
    const uint8 = new Uint8Array(buffer);
    const { text: text2 } = await extractText(uint8, { mergePages: true });
    return (Array.isArray(text2) ? text2.join("\n") : text2 || "").trim();
  } catch (error) {
    throw new Error(`PDF text extraction failed: ${error.message}`);
  }
}
async function parseDocumentText(text2) {
  if (!text2 || text2.trim().length === 0) {
    return [];
  }
  const deterministicRows = parseLinesDeterministically(text2);
  if (deterministicRows.length > 0) {
    return deterministicRows;
  }
  const llmResult = await invokeStructuredLLM({
    schema: ExtractedDocumentTransactionsSchema,
    system: "Extract all financial transactions from the provided bank statement text. Convert dates to YYYY-MM-DD, preserve merchant descriptions, and use negative numbers for expenses/withdrawals and positive numbers for deposits/income.",
    prompt: text2.slice(0, 24e3)
  });
  if (!llmResult?.transactions) {
    return [];
  }
  const parsed = [];
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
      account: tx.account || void 0
    });
  }
  return parsed;
}
function parseLinesDeterministically(text2) {
  const lines = text2.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const transactions2 = [];
  const lineRegex = /^(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})\s+(.+?)\s+([+-]?[$€£¥₹]?[0-9,]+(?:\.\d{2})?|\([$€£¥₹]?[0-9,]+(?:\.\d{2})?\))$/i;
  for (const line of lines) {
    const match = line.match(lineRegex);
    if (!match) continue;
    const [, rawDate, rawDesc, rawAmount] = match;
    const date = new Date(rawDate);
    if (Number.isNaN(date.getTime())) continue;
    let cleanedAmount = rawAmount.replace(/[$€£¥₹,\s]/g, "").trim();
    if (cleanedAmount.startsWith("(") && cleanedAmount.endsWith(")")) {
      cleanedAmount = "-" + cleanedAmount.slice(1, -1);
    }
    const amount = parseFloat(cleanedAmount);
    if (Number.isNaN(amount)) continue;
    transactions2.push({
      date,
      description: rawDesc.replace(/\s+/g, " ").trim(),
      amount,
      originalAmount: rawAmount.trim()
    });
  }
  return transactions2;
}

// server/routers/finance.ts
var financeRouter = router({
  /**
   * Upload and process a financial file (CSV, Excel, Word DOCX, or PDF)
   */
  uploadFile: protectedProcedure.input(
    z3.object({
      fileName: z3.string().min(1).max(255),
      fileContent: z3.string().min(1),
      fileType: z3.enum(["csv", "xlsx", "docx", "pdf"]),
      fileEncoding: z3.enum(["base64"]).default("base64")
    })
  ).mutation(async ({ ctx, input }) => {
    const userId = ctx.user.id;
    try {
      const base64Payload = input.fileContent.includes(",") ? input.fileContent.split(",").pop() ?? "" : input.fileContent;
      const fileBuffer = Buffer.from(base64Payload, "base64");
      if (fileBuffer.length === 0 || fileBuffer.length > 10 * 1024 * 1024) {
        throw new Error("File must be between 1 byte and 10MB");
      }
      validateUploadedFile(input.fileType, fileBuffer);
      let parsedTransactions;
      if (input.fileType === "csv") {
        parsedTransactions = await parseCSV(fileBuffer.toString("utf8"));
      } else if (input.fileType === "xlsx") {
        parsedTransactions = parseExcel(fileBuffer);
      } else {
        const extractedText = input.fileType === "docx" ? await extractTextFromDocx(fileBuffer) : await extractTextFromPdf(fileBuffer);
        parsedTransactions = await parseDocumentText(extractedText);
      }
      if (parsedTransactions.length === 0) {
        throw new Error("No valid transactions found in file. Expected columns such as Date, Description, and Amount.");
      }
      const fileKey = `${userId}-files/${Date.now()}-${input.fileName}`;
      const contentType = input.fileType === "pdf" ? "application/pdf" : input.fileType === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : input.fileType === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv";
      const { url: fileUrl } = await storagePut(fileKey, fileBuffer, contentType);
      const fileUploadId = await createFileUpload({
        userId,
        fileName: input.fileName,
        fileKey,
        fileSize: fileBuffer.length,
        fileType: input.fileType,
        transactionCount: parsedTransactions.length
      });
      const deterministic = parsedTransactions.map((tx) => categorizeTransaction(tx.description, tx.amount));
      const ambiguous = parsedTransactions.map((tx, index) => ({ tx, index, categorized: deterministic[index] })).filter(({ categorized }) => categorized.category === "other_income" || categorized.category === "other_expense" || categorized.category === "uncategorized").map(({ tx, index }) => ({ index, description: tx.description, amount: tx.amount }));
      const aiCategories = await classifyAmbiguousTransactions(ambiguous);
      const transactionsToInsert = parsedTransactions.map((tx, index) => {
        const fallback = deterministic[index];
        const category = aiCategories.get(index) ?? fallback.category;
        const transactionType = category === "transfer" ? "transfer" : category === "income" || category === "salary" || category === "bonus" || category === "investment" || category === "other_income" ? "income" : "expense";
        return {
          userId,
          fileUploadId,
          date: tx.date,
          description: tx.description,
          amount: new Decimal2(tx.amount).toFixed(2),
          category,
          transactionType,
          account: tx.account || "default",
          tags: JSON.stringify([`type:${transactionType}`, `category:${category}`]),
          notes: null
        };
      });
      for (const batch of chunkArray(transactionsToInsert, 500)) {
        await createTransactions(batch);
      }
      const totalIncome = parsedTransactions.filter((tx) => tx.amount > 0).reduce((sum, tx) => sum.plus(tx.amount), new Decimal2(0));
      const totalExpenses = parsedTransactions.filter((tx) => tx.amount < 0).reduce((sum, tx) => sum.plus(tx.amount), new Decimal2(0));
      const netCashFlow = totalIncome.plus(totalExpenses);
      await createAnalysis({
        userId,
        fileUploadId,
        totalIncome: totalIncome.toFixed(2),
        totalExpenses: totalExpenses.abs().toFixed(2),
        netCashFlow: netCashFlow.toFixed(2),
        topCategories: JSON.stringify([]),
        insights: null,
        reportUrl: null
      });
      return {
        fileUploadId,
        fileUrl,
        transactionCount: parsedTransactions.length,
        totalIncome: totalIncome.toFixed(2),
        totalExpenses: totalExpenses.abs().toFixed(2),
        netCashFlow: netCashFlow.toFixed(2)
      };
    } catch (error) {
      throw new Error(`File processing failed: ${error.message}`);
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
  getTransactions: protectedProcedure.input(z3.object({ fileUploadId: z3.number() })).query(async ({ ctx, input }) => {
    return getTransactionsByFileUpload(input.fileUploadId, ctx.user.id);
  }),
  getMetrics: protectedProcedure.input(z3.object({ fileUploadId: z3.number() })).query(async ({ ctx, input }) => {
    const rows = await getTransactionsByFileUpload(input.fileUploadId, ctx.user.id);
    return calculateFinancialMetrics(rows.map((row) => ({
      amount: String(row.amount),
      category: row.category,
      transactionType: row.transactionType,
      date: row.date
    })));
  }),
  recategorize: protectedProcedure.input(z3.object({
    transactionId: z3.number(),
    fileUploadId: z3.number(),
    category: z3.enum([
      "income",
      "salary",
      "bonus",
      "investment",
      "other_income",
      "expense",
      "groceries",
      "utilities",
      "rent",
      "transportation",
      "entertainment",
      "dining",
      "shopping",
      "healthcare",
      "insurance",
      "education",
      "subscriptions",
      "other_expense",
      "transfer",
      "uncategorized"
    ])
  })).mutation(async ({ ctx, input }) => {
    const transactionType = input.category === "transfer" ? "transfer" : ["income", "salary", "bonus", "investment", "other_income"].includes(input.category) ? "income" : "expense";
    await updateTransaction(input.transactionId, ctx.user.id, {
      category: input.category,
      transactionType,
      tags: JSON.stringify([`type:${transactionType}`, `category:${input.category}`, "manually-reviewed"])
    });
    const allRows = await getTransactionsByFileUpload(input.fileUploadId, ctx.user.id);
    const freshMetrics = calculateFinancialMetrics(allRows.map((row) => ({
      amount: String(row.amount),
      category: row.category,
      transactionType: row.transactionType,
      date: row.date
    })));
    await updateAnalysis(input.fileUploadId, {
      totalIncome: freshMetrics.totalIncome,
      totalExpenses: freshMetrics.totalExpenses,
      netCashFlow: freshMetrics.netCashFlow
    });
    return { success: true, transactionId: input.transactionId, category: input.category, transactionType };
  }),
  getAnalysis: protectedProcedure.input(z3.object({ fileUploadId: z3.number() })).query(async ({ ctx, input }) => {
    const analysis = await getAnalysisByFileUpload(input.fileUploadId, ctx.user.id);
    return analysis;
  }),
  generateInsights: protectedProcedure.input(z3.object({
    fileUploadId: z3.number(),
    currencySymbol: z3.string().max(4).default("$")
  })).mutation(async ({ ctx, input }) => {
    const analysis = await getAnalysisByFileUpload(input.fileUploadId, ctx.user.id);
    if (!analysis) {
      throw new Error("Analysis not found");
    }
    const transactions2 = await getTransactionsByFileUpload(input.fileUploadId, ctx.user.id);
    const sym = input.currencySymbol;
    const summary = {
      totalIncome: analysis.totalIncome,
      totalExpenses: analysis.totalExpenses,
      netCashFlow: analysis.netCashFlow,
      transactionCount: transactions2.length,
      dateRange: {
        oldest: transactions2[transactions2.length - 1]?.date,
        newest: transactions2[0]?.date
      },
      topCategories: transactions2.reduce((acc, tx) => {
        const existing = acc.find((c) => c.category === tx.category);
        if (existing) {
          existing.count += 1;
          existing.total = new Decimal2(existing.total).plus(tx.amount).toFixed(2);
        } else {
          acc.push({ category: tx.category, count: 1, total: tx.amount });
        }
        return acc;
      }, []).sort((a, b) => Math.abs(Number(b.total)) - Math.abs(Number(a.total))).slice(0, 5)
    };
    const prompt = `Analyze the following financial transaction data and provide 2-3 key insights about spending patterns, income sources, and financial health. Be concise and actionable.

Financial Summary:
- Total Income: ${sym}${summary.totalIncome}
- Total Expenses: ${sym}${summary.totalExpenses}
- Net Cash Flow: ${sym}${summary.netCashFlow}
- Transaction Count: ${summary.transactionCount}
- Date Range: ${new Date(summary.dateRange.oldest).toLocaleDateString()} to ${new Date(summary.dateRange.newest).toLocaleDateString()}

Top Categories:
${summary.topCategories.map((c) => `- ${c.category}: ${c.count} transactions, ${sym}${Math.abs(Number(c.total))}`).join("\n")}

Provide insights in a professional, conversational tone.`;
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "You are a financial analyst providing insights on personal spending patterns."
        },
        {
          role: "user",
          content: prompt
        }
      ]
    });
    const content = response.choices[0]?.message?.content;
    const insights = typeof content === "string" ? content : "";
    await updateAnalysis(input.fileUploadId, {
      topCategories: JSON.stringify(summary.topCategories),
      insights
    });
    return { insights, topCategories: summary.topCategories };
  }),
  deleteUpload: protectedProcedure.input(z3.object({ fileUploadId: z3.number() })).mutation(async ({ ctx, input }) => {
    await deleteFileUpload(input.fileUploadId, ctx.user.id);
    return { success: true };
  })
});

// server/routers/index.ts
var appRouter = router({
  auth: router({
    me: publicProcedure.query(({ ctx }) => ctx.user)
  }),
  finance: financeRouter
});

// server/_core/vite.ts
import express from "express";
import fs4 from "fs";
import path3 from "path";
async function setupVite(app, server) {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: {
      middlewareMode: true,
      hmr: { server }
    },
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    if (url.startsWith("/api/")) {
      return next();
    }
    try {
      const clientTemplate = path3.resolve(
        process.cwd(),
        "client",
        "index.html"
      );
      let template = await fs4.promises.readFile(clientTemplate, "utf-8");
      template = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(template);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app) {
  const distPath = path3.resolve(process.cwd(), "dist", "public");
  if (!fs4.existsSync(distPath)) {
    throw new Error(
      `Build directory not found at ${distPath}. Run 'pnpm build' first.`
    );
  }
  app.use(express.static(distPath));
  app.use("*", (req, res, next) => {
    if (req.originalUrl.startsWith("/api/")) {
      return next();
    }
    res.sendFile(path3.resolve(distPath, "index.html"));
  });
}

// server/_core/index.ts
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
function createApp() {
  const app = express2();
  app.use(express2.json({ limit: "50mb" }));
  app.use(express2.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  return app;
}
async function startServer() {
  const app = createApp();
  const server = createServer(app);
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
if (!process.env.VERCEL) {
  startServer().catch(console.error);
}
var index_default = createApp();
export {
  createApp,
  index_default as default
};
