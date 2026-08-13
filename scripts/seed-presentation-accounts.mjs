#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY before running this script.",
  );
}

if (process.env.ALLOW_PRESENTATION_SEED !== "true") {
  throw new Error("Presentation seeding is disabled. Set ALLOW_PRESENTATION_SEED=true only for the intended demo project.");
}

function normalizeHostedProjectRef(value) {
  const configured = value?.trim().toLowerCase();
  if (!configured) return null;

  let hostname = configured;
  if (/^https?:\/\//.test(configured)) {
    const parsed = new URL(configured);
    if (parsed.username || parsed.password || (parsed.pathname !== "/" && parsed.pathname !== "") || parsed.search || parsed.hash) {
      return null;
    }
    hostname = parsed.hostname;
  }

  const ref = hostname.endsWith(".supabase.co")
    ? hostname.slice(0, -".supabase.co".length)
    : hostname;
  return /^[a-z0-9]{8,64}$/.test(ref) ? ref : null;
}

const connectedUrl = new URL(supabaseUrl);
const actualProjectRef = normalizeHostedProjectRef(connectedUrl.origin);
if (!actualProjectRef) {
  throw new Error("Presentation seeding requires a hosted https://<project-ref>.supabase.co project. No users were changed.");
}

const expectedProjectRef = normalizeHostedProjectRef(process.env.PRESENTATION_SUPABASE_PROJECT_REF);
if (!expectedProjectRef || expectedProjectRef !== actualProjectRef) {
  throw new Error(
    `PRESENTATION_SUPABASE_PROJECT_REF must match the connected Supabase project. Set PRESENTATION_SUPABASE_PROJECT_REF=${actualProjectRef}. No users were changed.`,
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: WebSocket },
});

const fail = (label, error) => {
  throw new Error(`${label}: ${error.message}`);
};

const { data: registry, error: registryError } = await supabase
  .from("presentation_student_registry")
  .select("*")
  .order("demo_number");

if (registryError) fail("Could not load presentation registry", registryError);
if (registry.length !== 19) {
  throw new Error(`Expected exactly 19 presentation records; found ${registry.length}. Run the SQL schema first.`);
}

const authUsersByEmail = new Map();
for (let page = 1; ; page += 1) {
  const { data: userPage, error: listError } = await supabase.auth.admin.listUsers({
    page,
    perPage: 1000,
  });
  if (listError) fail("Could not list Auth users", listError);
  for (const user of userPage.users) {
    if (user.email) authUsersByEmail.set(user.email.toLowerCase(), user);
  }
  if (userPage.users.length < 1000) break;
}

const credentials = [];
const now = new Date().toISOString();

for (const student of registry) {
  const number = String(student.demo_number).padStart(2, "0");
  const password = `KNUSTDemo#${number}2026!`;
  const email = student.personal_email.toLowerCase();
  const userMetadata = {
    presentation_account: true,
    presentation_number: student.demo_number,
    full_name: student.full_name,
    index_number: student.index_number,
    student_email: student.student_email,
    // Keep private intake and guardian data in student_private_profiles only.
    // Nulls also scrub values left by an earlier presentation-seeder version.
    department: null,
    programme: null,
    start_year: null,
    completion_year: null,
    gender: null,
    residence: null,
    location: null,
    phone: null,
    guardian_full_name: null,
    guardian_phone: null,
    guardian_relationship: null,
    student_record_check_status: "simulated_passed",
    facial_scan_status: "simulated_completed_no_biometric_match",
    identity_verification_mode: "simulation",
    identity_verification_completed_at: now,
    identity_consent_at: now,
    identity_consent_scope: "presentation identity simulation; no biometric data stored",
    privacy_notice_version: "presentation-2026-07",
    student_id_status: "verified",
  };

  let authUser = authUsersByEmail.get(email);
  if (authUser) {
    const linkedRegistryUser = student.auth_user_id && student.auth_user_id === authUser.id;
    if (authUser.user_metadata?.presentation_account !== true && !linkedRegistryUser) {
      throw new Error(
        `Refusing to overwrite an existing non-presentation Auth user for ${email}. Resolve that email collision manually.`,
      );
    }
    const { data, error } = await supabase.auth.admin.updateUserById(authUser.id, {
      email,
      password,
      email_confirm: true,
      user_metadata: userMetadata,
    });
    if (error) fail(`Could not update presentation account ${number}`, error);
    authUser = data.user;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: userMetadata,
    });
    if (error) fail(`Could not create presentation account ${number}`, error);
    authUser = data.user;
    authUsersByEmail.set(email, authUser);
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      full_name: student.full_name,
      index_number: student.index_number,
      email,
      personal_email: email,
      student_email: student.student_email.toLowerCase(),
      role: "student",
      status: "active",
    })
    .eq("id", authUser.id);
  if (profileError) fail(`Could not update profile ${number}`, profileError);

  const { error: privateError } = await supabase.from("student_private_profiles").upsert(
    {
      profile_id: authUser.id,
      department: student.department,
      programme: student.programme,
      start_year: student.start_year,
      completion_year: student.completion_year,
      gender: student.gender,
      residence_type: student.residence_type,
      residence_location: student.residence_location,
      phone: student.phone,
      guardian_full_name: student.guardian_full_name,
      guardian_phone: student.guardian_phone,
      guardian_relationship: student.guardian_relationship,
      student_id_object_path: null,
      student_id_uploaded_at: null,
      student_id_status: "verified",
      student_record_check_status: "simulated_passed",
      facial_scan_status: "simulated_completed_no_biometric_match",
      identity_verification_mode: "simulation",
      identity_verification_completed_at: now,
      identity_consent_at: now,
      identity_consent_scope: "presentation identity simulation; no biometric data stored",
      privacy_notice_version: "presentation-2026-07",
      verification_status: "verified",
      verification_notes: "Fictional presentation account provisioned by the service-role seeder.",
      verified_at: now,
      verified_by: null,
    },
    { onConflict: "profile_id" },
  );
  if (privateError) fail(`Could not populate private intake ${number}`, privateError);

  const { error: registryUpdateError } = await supabase
    .from("presentation_student_registry")
    .update({ auth_user_id: authUser.id, provisioned_at: now })
    .eq("demo_number", student.demo_number);
  if (registryUpdateError) fail(`Could not mark presentation account ${number}`, registryUpdateError);

  credentials.push({ number, email, password });
  process.stdout.write(`Provisioned ${number}/19: ${email}\n`);
}

process.stdout.write("\nPresentation logins (fictional):\n");
for (const credential of credentials) {
  process.stdout.write(`${credential.number} | ${credential.email} | ${credential.password}\n`);
}
