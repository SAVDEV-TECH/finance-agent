import { decimal, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * File uploads table for tracking CSV/Excel/PDF imports.
 */
export const fileUploads = mysqlTable("fileUploads", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileKey: varchar("fileKey", { length: 255 }).notNull(),
  fileSize: int("fileSize").notNull(),
  fileType: varchar("fileType", { length: 50 }).notNull(),
  transactionCount: int("transactionCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FileUpload = typeof fileUploads.$inferSelect;
export type InsertFileUpload = typeof fileUploads.$inferInsert;

/**
 * Transactions table for storing parsed financial transactions.
 */
export const transactions = mysqlTable("transactions", {
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
    "uncategorized",
  ]).default("uncategorized").notNull(),
  transactionType: mysqlEnum("transactionType", [
    "income",
    "expense",
    "transfer",
  ]).notNull(),
  account: varchar("account", { length: 100 }).default("default").notNull(),
  tags: text("tags"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;

/**
 * Analysis results table for storing AI-generated insights.
 */
export const analyses = mysqlTable("analyses", {
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Analysis = typeof analyses.$inferSelect;
export type InsertAnalysis = typeof analyses.$inferInsert;
