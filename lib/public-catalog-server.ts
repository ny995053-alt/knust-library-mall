import "server-only";

import type { WebSocketLikeConstructor } from "@supabase/realtime-js";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import WebSocket from "ws";
import { categoryAccents, demoBooks } from "@/lib/demo-data";
import { getSupabaseAdminClient } from "@/lib/supabase-server";
import type { Book } from "@/lib/types";

const serverWebSocket = WebSocket as unknown as WebSocketLikeConstructor;
const postgresUuidSchema = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "Invalid PostgreSQL UUID",
);

const publicCatalogRowSchema = z.object({
  // PostgreSQL's uuid type accepts all 128-bit UUID text values, including the
  // deterministic zero-version fixture IDs used by the starter catalogue.
  id: postgresUuidSchema,
  slug: z.string().min(1),
  title: z.string().min(1),
  isbn: z.string().nullable(),
  description: z.string().nullable(),
  format: z.enum(["physical", "digital", "both"]),
  pages: z.number().int().positive().nullable(),
  published_year: z.number().int().nullable(),
  language: z.string().min(1),
  cover_url: z.string().nullable(),
  featured: z.boolean(),
  new_arrival: z.boolean(),
  author: z.string().min(1),
  category: z.string().min(1),
  total_copies: z.number().int().nonnegative(),
  available_copies: z.number().int().nonnegative(),
  borrow_count: z.number().int().nonnegative(),
  shelf_location: z.string().nullable(),
  read_time: z.string().nullable(),
  online_available: z.boolean(),
});

const publicCatalogRowsSchema = z.array(publicCatalogRowSchema);
type PublicCatalogRow = z.infer<typeof publicCatalogRowSchema>;
const publicCategoryRowsSchema = z.array(z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  published_title_count: z.number().int().nonnegative(),
}));

export type PublicCatalogPayload = {
  books: Book[];
  categories: string[];
  source: "live" | "fallback";
  updatedAt: string;
};

let publicCatalogClient: SupabaseClient | null = null;

function getPublicCatalogClient() {
  if (publicCatalogClient) return publicCatalogClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Public Supabase credentials are not configured.");

  publicCatalogClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: serverWebSocket },
  });
  return publicCatalogClient;
}

function accentForCategory(category: string) {
  return categoryAccents[category] ?? "#0B1849";
}

export function mapPublicCatalogRow(row: PublicCatalogRow): Book {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    author: row.author,
    category: row.category,
    isbn: row.isbn ?? "",
    description: row.description ?? "",
    format: row.format,
    totalCopies: row.total_copies,
    availableCopies: row.available_copies,
    pages: row.pages ?? 0,
    publishedYear: row.published_year ?? 0,
    language: row.language,
    rating: 0,
    borrowCount: row.borrow_count,
    readTime: row.read_time ?? "",
    accent: accentForCategory(row.category),
    coverUrl: row.cover_url,
    onlineAvailable: row.online_available,
    shelfLocation: row.shelf_location,
    featured: row.featured,
    newArrival: row.new_arrival,
  };
}

export function sanitizeFallbackBook(book: Book): Book {
  return {
    id: book.id,
    slug: book.slug,
    title: book.title,
    author: book.author,
    category: book.category,
    isbn: book.isbn,
    description: book.description,
    format: book.format,
    totalCopies: book.totalCopies,
    availableCopies: book.availableCopies,
    pages: book.pages,
    publishedYear: book.publishedYear,
    language: book.language,
    rating: book.rating,
    borrowCount: book.borrowCount,
    readTime: book.readTime,
    accent: book.accent,
    coverUrl: book.coverUrl ?? null,
    onlineAvailable: Boolean(book.onlineAvailable || book.onlineContent),
    shelfLocation: book.shelfLocation ?? null,
    featured: Boolean(book.featured),
    newArrival: Boolean(book.newArrival),
  };
}

async function loadAllPublicCatalogRows(client: SupabaseClient) {
  const rows: PublicCatalogRow[] = [];
  const pageSize = 1000;
  for (let from = 0; from < 100_000; from += pageSize) {
    const { data, error } = await client.rpc("get_public_catalog").range(from, from + pageSize - 1);
    if (error) throw error;
    const page = publicCatalogRowsSchema.parse(data ?? []);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
  throw new Error("Public catalogue exceeded the safe pagination limit.");
}

async function loadAllAdminCatalogRows(client: SupabaseClient) {
  const rows: PublicCatalogRow[] = [];
  const pageSize = 1000;
  for (let from = 0; from < 100_000; from += pageSize) {
    const { data, error } = await client
      .from("catalog_books")
      .select("id, slug, title, isbn, description, format, pages, published_year, language, cover_url, featured, new_arrival, author, category, total_copies, available_copies, borrow_count, shelf_location, read_time, online_available")
      .order("featured", { ascending: false })
      .order("borrow_count", { ascending: false })
      .order("title", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const page = publicCatalogRowsSchema.parse(data ?? []);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
  throw new Error("Catalogue exceeded the safe pagination limit.");
}

async function loadPublicCategories(client: SupabaseClient) {
  const { data, error } = await client.rpc("get_public_categories");
  if (error) throw error;
  return publicCategoryRowsSchema.parse(data ?? []).map((row) => row.name);
}

async function loadAdminCategories(client: SupabaseClient) {
  const { data, error } = await client.from("categories").select("name").eq("is_active", true).order("name");
  if (error) throw error;
  return z.array(z.object({ name: z.string().min(1) })).parse(data ?? []).map((row) => row.name);
}

export async function getPublicCatalogPayload(): Promise<PublicCatalogPayload> {
  const updatedAt = new Date().toISOString();

  try {
    const client = getPublicCatalogClient();
    const rows = await loadAllPublicCatalogRows(client);
    let categories: string[];
    try {
      categories = await loadPublicCategories(client);
    } catch {
      // During a rolling schema upgrade the catalogue RPC may already exist
      // while the category RPC does not. Keep every active category visible
      // with a fixed, input-free server query instead of deriving only the
      // categories that currently contain a published title.
      try {
        categories = await loadAdminCategories(getSupabaseAdminClient());
      } catch {
        categories = Array.from(new Set(rows.map((row) => row.category))).sort((a, b) => a.localeCompare(b));
      }
    }
    return { books: rows.map(mapPublicCatalogRow), categories, source: "live", updatedAt };
  } catch {
    // The fixed server-side query keeps the public home live before the newest
    // RPC migration is deployed. The service key never leaves this server-only
    // module, no request input reaches the query, and Zod strips the response to
    // the same public catalogue DTO.
    try {
      const admin = getSupabaseAdminClient();
      const rows = await loadAllAdminCatalogRows(admin);
      let categories: string[];
      try {
        categories = await loadAdminCategories(admin);
      } catch {
        categories = Array.from(new Set(rows.map((row) => row.category))).sort((a, b) => a.localeCompare(b));
      }
      return { books: rows.map(mapPublicCatalogRow), categories, source: "live", updatedAt };
    } catch {
      return {
        books: demoBooks.map(sanitizeFallbackBook),
        categories: Array.from(new Set(demoBooks.map((book) => book.category))).sort((a, b) => a.localeCompare(b)),
        source: "fallback",
        updatedAt,
      };
    }
  }
}
