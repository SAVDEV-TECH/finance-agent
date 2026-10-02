import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, transactions, fileUploads, analyses, InsertTransaction, InsertFileUpload, InsertAnalysis } from "../drizzle/schema";
import { ENV } from './_core/env';

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

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
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
      values.role = 'admin';
      updateSet.role = 'admin';
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
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * File Upload Helpers
 */
export async function createFileUpload(data: InsertFileUpload): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(fileUploads).values(data);
  const [row] = await db.execute(sql`SELECT LAST_INSERT_ID() as id`);
  const id = (row as any)?.[0]?.id ?? (row as any)?.id;
  if (!id) throw new Error("Failed to retrieve fileUpload id after insert");
  return Number(id);
}

export async function getFileUploadsByUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(fileUploads).where(eq(fileUploads.userId, userId)).orderBy(desc(fileUploads.createdAt));
}

/**
 * Transaction Helpers
 */
export async function createTransactions(data: InsertTransaction[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(transactions).values(data);
}

export async function getTransactionsByFileUpload(fileUploadId: number, userId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const predicate = userId === undefined
    ? eq(transactions.fileUploadId, fileUploadId)
    : and(eq(transactions.fileUploadId, fileUploadId), eq(transactions.userId, userId));
  return db.select().from(transactions).where(predicate).orderBy(desc(transactions.date));
}

export async function updateTransaction(transactionId: number, userId: number, data: Partial<InsertTransaction>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.update(transactions)
    .set(data)
    .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId)));
}

export async function getTransactionsByUser(userId: number, limit = 100, offset = 0) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(transactions).where(eq(transactions.userId, userId)).orderBy(desc(transactions.date)).limit(limit).offset(offset);
}

export async function getTransactionsByDateRange(userId: number, startDate: Date, endDate: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(transactions).where(and(eq(transactions.userId, userId), gte(transactions.date, startDate), lte(transactions.date, endDate))).orderBy(desc(transactions.date));
}

/**
 * Analysis Helpers
 */
export async function createAnalysis(data: InsertAnalysis) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(analyses).values(data);
}

export async function getAnalysisByFileUpload(fileUploadId: number, userId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const predicate = userId === undefined
    ? eq(analyses.fileUploadId, fileUploadId)
    : and(eq(analyses.fileUploadId, fileUploadId), eq(analyses.userId, userId));
  const result = await db.select().from(analyses).where(predicate).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function updateAnalysis(fileUploadId: number, data: Partial<InsertAnalysis>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.update(analyses).set(data).where(eq(analyses.fileUploadId, fileUploadId));
}

/**
 * Delete a file upload and all associated transactions and analyses.
 */
export async function deleteFileUpload(fileUploadId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(transactions).where(
    and(eq(transactions.fileUploadId, fileUploadId), eq(transactions.userId, userId))
  );
  await db.delete(analyses).where(
    and(eq(analyses.fileUploadId, fileUploadId), eq(analyses.userId, userId))
  );
  await db.delete(fileUploads).where(
    and(eq(fileUploads.id, fileUploadId), eq(fileUploads.userId, userId))
  );
}
