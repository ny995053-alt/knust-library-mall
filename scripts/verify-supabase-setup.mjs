#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceRoleKey) {
  process.stderr.write(
    "Supabase verification needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY in .env.local.\n",
  );
  process.exit(1);
}

const clientOptions = {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: WebSocket },
};
const anonymous = createClient(url, anonKey, clientOptions);
const service = createClient(url, serviceRoleKey, clientOptions);

const checks = [];
let postgrestSchemaPromise;

function safeMessage(error) {
  const raw = error instanceof Error ? error.message : String(error ?? "Unknown verification failure");
  return raw
    .replaceAll(serviceRoleKey, "[redacted]")
    .replaceAll(anonKey, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]")
    .slice(0, 500);
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function check(label, verification) {
  try {
    await verification();
    checks.push({ label, passed: true });
    process.stdout.write(`✓ ${label}\n`);
  } catch (error) {
    checks.push({ label, passed: false });
    process.stdout.write(`✗ ${label}: ${safeMessage(error)}\n`);
  }
}

function querySucceeded(result, label) {
  if (result.error) {
    const code = result.error.code ? ` (${result.error.code})` : "";
    throw new Error(`${label}${code}: ${result.error.message}`);
  }
  return result.data ?? [];
}

async function getPostgrestSchema() {
  if (!postgrestSchemaPromise) {
    postgrestSchemaPromise = fetch(new URL("/rest/v1/", url), {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: "application/openapi+json",
      },
    }).then(async (response) => {
      if (!response.ok) throw new Error(`PostgREST schema could not be read (HTTP ${response.status}).`);
      return response.json();
    });
  }
  return postgrestSchemaPromise;
}

function rpcParameterNames(schema, functionName) {
  const operation = schema.paths?.[`/rpc/${functionName}`]?.post;
  const properties = operation?.parameters?.find((parameter) => parameter?.in === "body")?.schema?.properties
    ?? operation?.requestBody?.content?.["application/json"]?.schema?.properties;
  return properties ? Object.keys(properties).sort() : [];
}

process.stdout.write("KNUST Library Mall Supabase verification (read-only)\n\n");

await check("anonymous published catalogue RPC", async () => {
  const result = await anonymous.rpc("get_public_catalog");
  const rows = querySucceeded(result, "get_public_catalog failed");
  expect(Array.isArray(rows) && rows.length > 0, "No published catalogue rows were returned.");
  const required = ["id", "slug", "title", "author", "category", "available_copies", "online_available"];
  expect(required.every((field) => Object.hasOwn(rows[0], field)), "The public catalogue RPC has an outdated result shape.");
});

await check("anonymous active-category RPC", async () => {
  const result = await anonymous.rpc("get_public_categories");
  const rows = querySucceeded(result, "get_public_categories failed");
  expect(Array.isArray(rows) && rows.length > 0, "No active categories were returned.");
  expect(["name", "slug", "published_title_count"].every((field) => Object.hasOwn(rows[0], field)), "The category RPC has an outdated result shape.");
});

await check("anonymous access is denied for private profiles", async () => {
  const result = await anonymous.from("student_private_profiles").select("profile_id").limit(1);
  const permissionDenied = Boolean(result.error) && (
    result.status === 401
    || result.status === 403
    || result.error?.code === "42501"
  );
  expect(permissionDenied, "Anonymous private-profile access was not explicitly denied, or the project could not be reached.");
});

await check("student ID bucket is private and cover bucket is public", async () => {
  const result = await service.storage.listBuckets();
  const buckets = querySucceeded(result, "Storage buckets could not be listed");
  const studentIds = buckets.find((bucket) => bucket.id === "student-ids");
  const covers = buckets.find((bucket) => bucket.id === "book-covers");
  expect(studentIds && studentIds.public === false, "student-ids is missing or not private.");
  expect(covers && covers.public === true, "book-covers is missing or not public.");

  const anonymousList = await anonymous.storage.from("student-ids").list("", { limit: 1 });
  expect(
    Boolean(anonymousList.error) || (Array.isArray(anonymousList.data) && anonymousList.data.length === 0),
    "Anonymous callers can list private student ID objects.",
  );
});

await check("borrowing settings enforce 1-7 days and fixed GHS 5 delivery", async () => {
  const result = await service
    .from("library_settings")
    .select("max_loan_days,delivery_fee_pesewas")
    .eq("id", true)
    .single();
  const settings = querySucceeded(result, "Library settings could not be read");
  expect(settings.max_loan_days === 7, `Expected max_loan_days 7; found ${settings.max_loan_days}.`);
  expect(settings.delivery_fee_pesewas === 500, `Expected delivery fee 500 pesewas; found ${settings.delivery_fee_pesewas}.`);
});

await check("signup lock column and anonymous status RPC", async () => {
  const settingsResult = await service
    .from("library_settings")
    .select("signup_locked")
    .eq("id", true)
    .single();
  const settings = querySucceeded(settingsResult, "Signup-lock setting could not be read");
  expect(typeof settings.signup_locked === "boolean", "library_settings.signup_locked is missing or is not boolean.");

  const publicResult = await anonymous.rpc("get_public_signup_status");
  if (publicResult.error) {
    const code = publicResult.error.code ? ` (${publicResult.error.code})` : "";
    throw new Error(`get_public_signup_status failed${code}: ${publicResult.error.message}`);
  }
  expect(typeof publicResult.data === "boolean", "The public signup-status RPC did not return one boolean.");
  expect(publicResult.data === settings.signup_locked, "The public signup status does not match the authoritative setting.");
});

await check("exactly 19 private student signup identities", async () => {
  const result = await service
    .from("student_signup_allowlist")
    .select("allow_number,student_email,index_number,is_active,claimed_by,claimed_at", { count: "exact" })
    .order("allow_number");
  const rows = querySucceeded(result, "Student signup allow-list could not be read");
  expect(result.count === 19 && rows.length === 19, `Expected 19 signup identities; found ${result.count ?? rows.length}.`);
  expect(rows.every((row, index) => row.allow_number === index + 1), "Signup identity numbers are not the complete 1-19 sequence.");
  expect(rows.every((row) => row.is_active === true), "One or more seeded signup identities are inactive.");
  expect(
    rows.every((row) => /^[^\s@]+@st\.knust\.edu\.gh$/.test(row.student_email ?? "")),
    "One or more signup identities has an invalid KNUST student email.",
  );
  expect(
    rows.every((row) => /^\d{8}$/.test(row.index_number ?? "") && row.student_email === `${row.index_number}@st.knust.edu.gh`),
    "Every signup email must use its matching eight-digit KNUST index number.",
  );
  expect(
    rows.every((row) => (row.claimed_by === null) === (row.claimed_at === null)),
    "A signup identity has an inconsistent claim state.",
  );
});

await check("staff credential provisioning dependencies are installed", async () => {
  const schema = await getPostgrestSchema();
  const definitions = schema.definitions ?? schema.components?.schemas ?? {};
  const intentColumns = definitions.librarian_provisioning_intents?.properties;
  expect(intentColumns, "librarian_provisioning_intents is missing from the service-role PostgREST schema.");
  expect(
    ["token_hash", "personal_email", "staff_id", "provisioned_role", "actor_id", "expires_at"]
      .every((column) => Object.hasOwn(intentColumns, column)),
    "The staff provisioning-intent table has an outdated shape.",
  );

  const librarianParameters = rpcParameterNames(schema, "service_provision_librarian_profile");
  const administratorParameters = rpcParameterNames(schema, "service_provision_administrator_profile");
  expect(
    JSON.stringify(librarianParameters) === JSON.stringify([
      "p_auth_user_id", "p_full_name", "p_personal_email", "p_staff_id",
    ]),
    "service_provision_librarian_profile has an outdated signature.",
  );
  expect(
    JSON.stringify(administratorParameters) === JSON.stringify([
      "p_actor_id", "p_auth_user_id", "p_full_name", "p_personal_email", "p_staff_id",
    ]),
    "service_provision_administrator_profile has an outdated signature.",
  );
});

await check("borrow-request audit columns and staff views are installed", async () => {
  const requestResult = await service
    .from("borrow_requests")
    .select("id,loan_days,fulfilment_method,payment_status,reviewed_by,dispatched_by,dispatched_at,student_received_at,receipt_confirmed_by,recalled_at,recalled_by,recall_reason,recall_returned_at,recall_returned_by,loan_id")
    .limit(1);
  querySucceeded(requestResult, "Borrow-request columns are incomplete");

  // Security-invoker staff views intentionally call user-only role helpers, so
  // a service-role row query should not impersonate a staff member. Inspect
  // PostgREST's read-only OpenAPI shape instead of executing those predicates.
  const schema = await getPostgrestSchema();
  const definitions = schema.definitions ?? schema.components?.schemas ?? {};
  const requiredViews = {
    staff_borrow_requests: ["id", "loan_days", "reviewed_by", "dispatched_by", "student_received_at", "recalled_by", "recall_returned_by"],
    admin_borrow_requests: ["id", "student_name", "reviewer_name", "dispatcher_name", "receipt_confirmed_by", "recaller_name", "recall_returner_name"],
    admin_librarian_performance: ["rank", "librarian_id", "approved_requests", "dispatched_deliveries", "student_confirmed_deliveries", "safe_confirmation_rate"],
  };
  for (const [view, columns] of Object.entries(requiredViews)) {
    const properties = definitions[view]?.properties;
    expect(properties, `${view} is missing from the PostgREST schema.`);
    expect(columns.every((column) => Object.hasOwn(properties, column)), `${view} has an outdated audit shape.`);
  }
});

await check("exactly 19 fictional presentation registry records", async () => {
  const result = await service
    .from("presentation_student_registry")
    .select("demo_number", { count: "exact" })
    .order("demo_number");
  const rows = querySucceeded(result, "Presentation registry could not be read");
  expect(result.count === 19 && rows.length === 19, `Expected 19 registry records; found ${result.count ?? rows.length}.`);
  expect(rows.every((row, index) => row.demo_number === index + 1), "Presentation registry numbers are not the complete 1-19 sequence.");
});

await check("all 19 fictional presentation Auth users are provisioned", async () => {
  const matching = [];
  for (let page = 1; ; page += 1) {
    const endpoint = new URL("/auth/v1/admin/users", url);
    endpoint.searchParams.set("page", String(page));
    endpoint.searchParams.set("per_page", "1000");
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    });
    if (!response.ok) throw new Error(`Auth users could not be listed (HTTP ${response.status}).`);
    const payload = await response.json();
    const users = Array.isArray(payload?.users) ? payload.users : [];
    for (const user of users) {
      if (/^presentation\.student\d{2}@example\.com$/i.test(user.email ?? "")) matching.push(user);
    }
    if (users.length < 1000) break;
  }
  expect(matching.length === 19, `Expected 19 presentation Auth users; found ${matching.length}. Run npm run seed:presentation.`);
  expect(matching.every((user) => user.user_metadata?.presentation_account === true), "One or more presentation users are missing the presentation marker.");
});

await check("presentation profiles are active students with private intake rows", async () => {
  const registryResult = await service
    .from("presentation_student_registry")
    .select("auth_user_id")
    .not("auth_user_id", "is", null);
  const registry = querySucceeded(registryResult, "Provisioned registry links could not be read");
  expect(registry.length === 19, `Expected 19 provisioned registry links; found ${registry.length}.`);
  const ids = registry.map((row) => row.auth_user_id);

  const [profilesResult, privateResult] = await Promise.all([
    service.from("profiles").select("id,role,status").in("id", ids),
    service.from("student_private_profiles").select("profile_id,verification_status").in("profile_id", ids),
  ]);
  const profiles = querySucceeded(profilesResult, "Presentation profiles could not be read");
  const privateProfiles = querySucceeded(privateResult, "Presentation private intake rows could not be read");
  expect(profiles.length === 19 && profiles.every((profile) => profile.role === "student" && profile.status === "active"), "Presentation profiles are incomplete or not active students.");
  expect(privateProfiles.length === 19 && privateProfiles.every((profile) => profile.verification_status === "verified"), "Presentation private intake rows are incomplete or unverified.");
});

const failed = checks.filter((item) => !item.passed);
process.stdout.write(`\n${checks.length - failed.length}/${checks.length} checks passed. No database writes were performed.\n`);
if (failed.length > 0) {
  process.stderr.write("Supabase setup is incomplete. Apply the current SQL schema, run the presentation seeder if needed, and verify again.\n");
  process.exit(1);
}
