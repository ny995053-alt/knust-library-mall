import "server-only";

import type { WebSocketLikeConstructor } from "@supabase/realtime-js";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const serverWebSocket = WebSocket as unknown as WebSocketLikeConstructor;

let adminClient: SupabaseClient | null = null;

function getRequiredEnvironment() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error("Supabase server credentials are not configured.");
  }

  return { url, anonKey, serviceRoleKey };
}

export function getSupabaseAdminClient() {
  if (adminClient) return adminClient;
  const { url, serviceRoleKey } = getRequiredEnvironment();
  adminClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: serverWebSocket },
  });
  return adminClient;
}

export function createSupabaseServerAuthClient() {
  const { url, anonKey } = getRequiredEnvironment();
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: serverWebSocket },
  });
}
