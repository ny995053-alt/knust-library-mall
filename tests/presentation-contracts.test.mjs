import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import test from "node:test";
import Busboy from "busboy";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

const sql = read("supabase/knust_library_schema.sql");
const publicCatalogServer = read("lib/public-catalog-server.ts");
const catalogRoute = read("app/api/catalog/route.ts");
const basketPage = read("components/student/basket-page.tsx");
const libraryProvider = read("components/student/library-provider.tsx");
const loansPage = read("components/student/loans-page.tsx");
const signupRoute = read("app/api/auth/sign-up/route.ts");
const signupStatusRoute = read("app/api/auth/sign-up-status/route.ts");
const signupPrecheckRoute = read("app/api/auth/sign-up-precheck/route.ts");
const signupEligibility = read("lib/student-signup-eligibility.ts");
const signInRoute = read("app/api/auth/sign-in/route.ts");
const authScreen = read("components/auth/auth-screen.tsx");
const adminDashboard = read("components/admin/admin-dashboard.tsx");
const administratorsSettings = read("components/admin/administrators-settings.tsx");
const administratorsRoute = read("app/api/admin/administrators/route.ts");
const adminStudentsTab = read("components/admin/students-tab.tsx");
const librarianRoute = read("app/api/admin/librarians/route.ts");
const resetRoute = read("app/api/auth/reset-password/route.ts");
const appUrlHelper = read("lib/app-url.ts");
const authServer = read("lib/auth-server.ts");
const librarianDashboard = read("components/librarian/librarian-dashboard.tsx");
const presentationSeeder = read("scripts/seed-presentation-accounts.mjs");
const supabaseVerifier = read("scripts/verify-supabase-setup.mjs");

function listApiRouteFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return listApiRouteFiles(path);
    return entry.isFile() && entry.name === "route.ts" ? [path] : [];
  });
}

const apiRouteSources = listApiRouteFiles(resolve(root, "app/api")).map((path) => ({
  path: relative(root, path),
  source: readFileSync(path, "utf8"),
}));

test("bounded signup multipart limits accept the exact browser payload", async () => {
  const fieldNames = [
    "fullName", "indexNumber", "personalEmail", "studentEmail", "password",
    "department", "programme", "startYear", "completionYear", "gender",
    "residence", "location", "studentRecordCheck", "facialScanCheck",
    "identityConsent", "identityConsentAt",
  ];
  const form = new FormData();
  for (const name of fieldNames) form.set(name, name === "password" ? "Password1" : "test");
  form.set("studentIdFront", new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" }), "front.jpg");
  form.set("facePresenceSnapshot", new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" }), "face.jpg");

  const request = new Request("http://localhost/api/auth/sign-up", { method: "POST", body: form });
  let fields = 0;
  let files = 0;
  let partsLimitReached = false;
  const parser = Busboy({
    headers: { "content-type": request.headers.get("content-type") },
    limits: {
      fields: fieldNames.length,
      files: 2,
      parts: fieldNames.length + 2 + 1,
      fileSize: 5,
    },
  });
  parser.on("field", () => { fields += 1; });
  parser.on("file", (_name, stream) => {
    files += 1;
    stream.resume();
  });
  parser.on("partsLimit", () => { partsLimitReached = true; });

  await pipeline(Readable.fromWeb(request.body), parser);
  assert.equal(fields, fieldNames.length);
  assert.equal(files, 2);
  assert.equal(partsLimitReached, false);
});

function extractCalls(source, callee) {
  const calls = [];
  const marker = callee + "(";
  let from = 0;

  while (from < source.length) {
    const start = source.indexOf(marker, from);
    if (start === -1) break;
    let depth = 0;
    let quote = null;
    let escaped = false;
    let end = -1;

    for (let index = start + callee.length; index < source.length; index += 1) {
      const character = source[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === quote) quote = null;
        continue;
      }
      if (character === '"' || character === "'" || character === "`") {
        quote = character;
        continue;
      }
      if (character === "(") depth += 1;
      if (character === ")") {
        depth -= 1;
        if (depth === 0) {
          end = index + 1;
          break;
        }
      }
    }

    assert.notEqual(end, -1, `Unclosed ${callee} call`);
    calls.push(source.slice(start, end));
    from = end;
  }
  return calls;
}

function extractSqlFunction(name) {
  const expression = new RegExp(
    `create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
    "gi",
  );
  const matches = [...sql.matchAll(expression)];
  assert.ok(matches.length > 0, `SQL function public.${name} was not found`);
  return matches.at(-1)[0];
}

function extractSqlView(name) {
  const start = sql.toLowerCase().lastIndexOf(`create or replace view public.${name}`);
  assert.notEqual(start, -1, `SQL view public.${name} was not found`);
  const remainder = sql.slice(start);
  const nextObject = remainder.slice(1).search(/\n(?:create or replace (?:view|function)|-- Row-level security\.)/i);
  return nextObject === -1 ? remainder : remainder.slice(0, nextObject + 1);
}

test("anonymous catalogue and categories expose all published rows through narrow RPCs", () => {
  const catalogRpc = extractSqlFunction("get_public_catalog");
  const categoriesRpc = extractSqlFunction("get_public_categories");

  assert.match(catalogRpc, /security definer/i);
  assert.match(catalogRpc, /from public\.catalog_books cb/i);
  assert.match(catalogRpc, /available_copies/i);
  assert.match(catalogRpc, /online_available/i);
  assert.match(categoriesRpc, /where c\.is_active/i);
  assert.match(categoriesRpc, /b\.is_published and b\.archived_at is null/i);
  assert.match(categoriesRpc, /count\(b\.id\)::integer as published_title_count/i);
  assert.match(sql, /grant execute on function public\.get_public_catalog\(\) to anon;/i);
  assert.match(sql, /grant execute on function public\.get_public_categories\(\) to anon;/i);
  assert.match(sql, /revoke all privileges on[\s\S]*?public\.catalog_books[\s\S]*?from anon;/i);

  assert.match(publicCatalogServer, /client\.rpc\("get_public_catalog"\)\.range\(/);
  assert.match(publicCatalogServer, /client\.rpc\("get_public_categories"\)/);
  assert.match(publicCatalogServer, /categories = await loadAdminCategories\(getSupabaseAdminClient\(\)\)/);
  assert.match(publicCatalogServer, /for \(let from = 0; from < 100_000; from \+= pageSize\)/);
  assert.match(publicCatalogServer, /categories: string\[\]/);
  assert.match(publicCatalogServer, /const postgresUuidSchema = z\.string\(\)\.regex\(/);
  assert.match(publicCatalogServer, /id: postgresUuidSchema/);
  assert.doesNotMatch(publicCatalogServer, /id: z\.string\(\)\.uuid\(\)/);
  assert.match(catalogRoute, /"Cache-Control": "no-store, max-age=0"/);
});

test("student owns an exact integer 1-7 day request and submission starts no loan", () => {
  const submit = extractSqlFunction("submit_borrow_request");
  const checkoutCompatibility = extractSqlFunction("checkout_basket");

  assert.match(sql, /constraint borrow_requests_days_valid check \(loan_days between 1 and 7\)/i);
  assert.match(sql, /max_loan_days smallint not null default 7 check \(max_loan_days between 1 and 7\)/i);
  assert.match(submit, /if p_loan_days < 1 or p_loan_days > v_max_days then/i);
  assert.match(submit, /student_id, basket_id, fulfilment_method, loan_days/i);
  assert.match(submit, /auth\.uid\(\), v_basket_id, p_fulfilment_method, p_loan_days/i);
  assert.doesNotMatch(submit, /insert into public\.loans/i);
  assert.match(submit, /The loan period has not started/i);
  assert.match(checkoutCompatibility, /select public\.submit_borrow_request\(p_loan_days, 'pickup'::public\.fulfilment_method/i);
  assert.doesNotMatch(sql, /grant execute[^;]*public\.checkout_basket\(integer\)[^;]*to authenticated;/i);

  assert.match(basketPage, /Math\.min\(7, Math\.max\(1,/);
  assert.match(basketPage, /Array\.from\(\{ length: maxLoanDays \}, \(_, index\) => index \+ 1\)/);
  assert.match(libraryProvider, /Number\.isInteger\(days\)/);
  assert.match(libraryProvider, /p_loan_days: days/);
});

test("library use requires an administrator-verified private student record", () => {
  const canUseLibrary = extractSqlFunction("can_use_library");

  assert.match(canUseLibrary, /join public\.student_private_profiles spp on spp\.profile_id = p\.id/i);
  assert.match(canUseLibrary, /p\.role = 'student'/i);
  assert.match(canUseLibrary, /p\.status = 'active'/i);
  assert.match(canUseLibrary, /spp\.student_record_check_status in \('simulated_passed', 'verified'\)/i);
  assert.match(canUseLibrary, /spp\.facial_scan_status = 'simulated_completed_no_biometric_match'/i);
  assert.match(canUseLibrary, /spp\.identity_consent_at is not null/i);
  assert.match(canUseLibrary, /and spp\.verification_status = 'verified'/i);
  assert.doesNotMatch(canUseLibrary, /verification_status\s*(?:<>|!=)\s*'rejected'/i);
});

test("pickup begins at staff approval but staff cannot rewrite the selected period", () => {
  const approve = extractSqlFunction("approve_borrow_request");

  assert.match(approve, /if v_request\.fulfilment_method = 'pickup' then[\s\S]*?insert into public\.loans/i);
  assert.match(approve, /values \(v_request\.student_id, v_request\.basket_id, v_request\.loan_days, v_now\)/i);
  assert.match(approve, /v_now \+ make_interval\(days => v_request\.loan_days\)/i);
  assert.doesNotMatch(approve, /set loan_days\s*=/i);
  assert.match(approve, /reviewed_by = auth\.uid\(\)/i);
});

test("delivery requires saved on-campus location, room, GHS 5 simulation, and separate dispatch", () => {
  const submit = extractSqlFunction("submit_borrow_request");
  const approve = extractSqlFunction("approve_borrow_request");
  const dispatch = extractSqlFunction("staff_mark_delivery_dispatched");

  assert.match(sql, /delivery_fee_pesewas integer not null default 500 check \(delivery_fee_pesewas = 500\)/i);
  assert.match(submit, /v_private\.residence_type <> 'on-campus'/i);
  assert.match(submit, /Delivery location must match your saved residence location/i);
  assert.match(submit, /Enter a valid floor for delivery/i);
  assert.match(submit, /Enter a valid room number for delivery/i);
  assert.match(submit, /p_payment_method is null or p_payment_simulated is distinct from true/i);
  assert.match(submit, /'simulated_paid'::public\.simulated_payment_status/i);
  assert.match(submit, /v_payment_reference := 'SIM-'/i);

  assert.match(approve, /Delivery copies are allocated and held/i);
  assert.match(approve, /if v_request\.fulfilment_method = 'pickup' then[\s\S]*?insert into public\.loans/i);
  assert.match(approve, /else[\s\S]*?set allocated_copy_id = v_copy_id/i);
  assert.match(dispatch, /if not public\.is_staff\(\)/i);
  assert.match(dispatch, /payment_status <> 'simulated_paid'/i);
  assert.match(dispatch, /set dispatched_at = v_now, dispatched_by = auth\.uid\(\)/i);
  assert.doesNotMatch(dispatch, /insert into public\.loans/i);

  assert.match(basketPage, /No money is charged\./);
  assert.match(basketPage, /never sent to Supabase/);
  assert.match(libraryProvider, /p_delivery_floor:/);
  assert.match(libraryProvider, /p_delivery_room:/);
  assert.match(libraryProvider, /p_payment_simulated:/);
});

test("only the owning student receipt starts a delivery loan and due clock", () => {
  const receipt = extractSqlFunction("student_confirm_delivery_receipt");

  assert.match(receipt, /where id = p_request_id and student_id = auth\.uid\(\)/i);
  assert.match(receipt, /status <> 'approved' or v_request\.dispatched_at is null/i);
  assert.match(receipt, /if v_request\.student_received_at is not null then[\s\S]*?return v_request\.loan_id/i);
  assert.match(receipt, /insert into public\.loans\(borrower_id, basket_id, loan_days, checked_out_at\)/i);
  assert.match(receipt, /v_now \+ make_interval\(days => v_request\.loan_days\)/i);
  assert.match(receipt, /student_received_at = v_now,[\s\S]*?receipt_confirmed_by = auth\.uid\(\)/i);
  assert.match(receipt, /delivery_receipt_confirmed/i);
  assert.match(sql, /grant execute on function[^;]*public\.student_confirm_delivery_receipt\(uuid\)[^;]*to authenticated;/i);

  assert.match(libraryProvider, /rpc\("student_confirm_delivery_receipt"/);
  assert.match(loansPage, /Confirm only after you physically receive all/);
  assert.match(loansPage, /Yes, I have every book/);
  assert.match(loansPage, /starts the exact \{request\.loanDays\}-day loan period/);
});

test("delivery recall preserves exact custody until the correct return checkpoint", () => {
  const recall = extractSqlFunction("staff_recall_delivery_request");
  const confirmReturn = extractSqlFunction("staff_confirm_recalled_delivery_return");
  const myRequestsView = extractSqlView("my_borrow_requests");
  const staffRequestsView = extractSqlView("staff_borrow_requests");

  assert.match(recall, /if not public\.is_staff\(\)/i);
  assert.match(recall, /v_reason is null or char_length\(v_reason\) < 3 or char_length\(v_reason\) > 300/i);
  assert.match(recall, /v_request\.fulfilment_method <> 'delivery' or v_request\.status <> 'approved'/i);
  assert.match(recall, /v_request\.loan_id is not null or v_request\.student_received_at is not null/i);
  assert.match(recall, /set status = case[\s\S]*?when v_request\.dispatched_at is null then 'available'::public\.copy_status[\s\S]*?else 'maintenance'::public\.copy_status/i);
  assert.match(recall, /if v_request\.dispatched_at is null then[\s\S]*?update public\.borrow_request_items[\s\S]*?set allocated_copy_id = null/i);
  assert.match(recall, /set status = 'rejected',[\s\S]*?recalled_at = v_now,[\s\S]*?recalled_by = auth\.uid\(\),[\s\S]*?recall_reason = v_reason/i);
  assert.match(recall, /recall_returned_at = case when v_request\.dispatched_at is null then v_now else null end/i);
  assert.match(recall, /recall_returned_by = case when v_request\.dispatched_at is null then auth\.uid\(\) else null end/i);
  assert.match(recall, /insert into public\.notifications[\s\S]*?'delivery_recalled'/i);
  assert.match(recall, /insert into public\.audit_events[\s\S]*?'delivery_recalled'/i);
  assert.match(recall, /'reviewed_by', v_request\.reviewed_by/i);
  assert.match(recall, /'dispatched_by', v_request\.dispatched_by/i);
  assert.doesNotMatch(recall, /insert into public\.loans/i);

  assert.match(confirmReturn, /if not public\.is_staff\(\)/i);
  assert.match(confirmReturn, /v_request\.status <> 'rejected'[\s\S]*?v_request\.fulfilment_method <> 'delivery'[\s\S]*?v_request\.recalled_at is null[\s\S]*?v_request\.dispatched_at is null/i);
  assert.match(confirmReturn, /if v_request\.recall_returned_at is not null then return v_request\.recall_returned_at/i);
  assert.match(confirmReturn, /auth\.uid\(\) = v_request\.dispatched_by or auth\.uid\(\) = v_request\.recalled_by/i);
  assert.match(confirmReturn, /A different active staff member must confirm the physical return/i);
  assert.match(confirmReturn, /set status = 'available'[\s\S]*?id = v_item\.allocated_copy_id[\s\S]*?status = 'maintenance'/i);
  assert.match(confirmReturn, /update public\.borrow_request_items[\s\S]*?set allocated_copy_id = null/i);
  assert.match(confirmReturn, /set recall_returned_at = v_now,[\s\S]*?recall_returned_by = auth\.uid\(\)/i);
  assert.match(confirmReturn, /'recalled_delivery_returned'/i);
  assert.match(confirmReturn, /'recalled_delivery_return_confirmed'/i);
  assert.doesNotMatch(confirmReturn, /insert into public\.loans/i);

  assert.match(sql, /grant execute on function public\.staff_recall_delivery_request\(uuid, text\) to authenticated;/i);
  assert.match(sql, /grant execute on function public\.staff_confirm_recalled_delivery_return\(uuid\) to authenticated;/i);
  assert.match(myRequestsView, /br\.recall_returned_at/i);
  assert.match(myRequestsView, /br\.recall_returned_by as recall_returner_id/i);
  assert.match(myRequestsView, /recall_returner\.full_name as recall_returner_name/i);
  assert.match(staffRequestsView, /br\.recall_returned_at/i);
  assert.match(staffRequestsView, /br\.recall_returned_by as recall_returner_id/i);
  assert.match(staffRequestsView, /recall_returner\.full_name as recall_returner_name/i);
  assert.match(staffRequestsView, /coalesce\(recall_returner\.personal_email, recall_returner\.email\) as recall_returner_email/i);
});

test("student ID and face-presence evidence stay private while librarians receive operational data only", () => {
  const staffView = extractSqlView("staff_borrow_requests");
  const staffCriticalView = extractSqlView("staff_critical_fines").split("\n-- Admins receive")[0];
  const adminCriticalView = extractSqlView("admin_critical_fines");
  const studentProfileView = extractSqlView("my_student_profile");
  const publicUserMetadataUpdate = signupRoute.match(/const metadataUpdate = await admin\.auth\.admin\.updateUserById\([\s\S]*?\n\s*\}\);/)?.[0] ?? "";

  assert.match(sql, /'student-ids',[\s\S]*?'student-ids',[\s\S]*?false,[\s\S]*?5242880/i);
  assert.match(sql, /drop policy if exists "student_ids_owner_read"/i);
  assert.match(sql, /drop policy if exists "student_ids_owner_insert"/i);
  assert.match(sql, /drop policy if exists "student_ids_owner_update"/i);
  assert.match(sql, /create policy "student_ids_admin_read"[\s\S]*?bucket_id = 'student-ids' and public\.is_admin\(\)/i);
  assert.doesNotMatch(sql, /create policy "student_ids_owner_(?:read|insert|update)"/i);
  assert.match(sql, /using \(profile_id = auth\.uid\(\) or public\.is_admin\(\)\)/i);
  assert.doesNotMatch(sql, /grant select on public\.student_private_profiles to authenticated/i);
  assert.doesNotMatch(studentProfileView, /spp\.student_id_object_path\s*,/i);
  assert.match(studentProfileView, /as student_id_uploaded/i);

  assert.doesNotMatch(staffView, /guardian_full_name|guardian_phone|student_id_object_path|face_snapshot_object_path/i);
  assert.doesNotMatch(staffCriticalView, /guardian_|student_id_object_path|face_snapshot_object_path|facial_scan_status|identity_consent/i);
  assert.match(adminCriticalView, /spp\.student_id_object_path/i);
  assert.match(adminCriticalView, /spp\.face_snapshot_object_path/i);
  assert.match(adminCriticalView, /where public\.is_admin\(\)/i);
  assert.match(librarianDashboard, /never exposes guardian details, student ID images, or facial data/i);
  assert.match(signupRoute, /maxStudentIdSize = 5 \* 1024 \* 1024/);
  assert.match(signupRoute, /maxFaceSnapshotSize = 1024 \* 1024/);
  assert.match(signupRoute, /matchesStudentIdSignature/);
  assert.match(signupRoute, /admin\.storage\.from\("student-ids"\)\.upload/);
  assert.match(signupRoute, /multipart\.files\.get\("facePresenceSnapshot"\)/);
  assert.match(signupRoute, /facePresenceSnapshot\.type !== "image\/jpeg"/);
  assert.match(signupRoute, /faceSnapshotObjectPath = userId \+ "\/face-presence\.jpg"/);
  assert.match(signupRoute, /cacheControl: "0"/);
  assert.match(signupRoute, /face_snapshot_object_path: faceSnapshotObjectPath/i);
  assert.match(signupRoute, /storedPaths\.push\(faceSnapshotObjectPath\)/);
  assert.match(signupRoute, /admin\.auth\.admin\.deleteUser\(userId\)/);
  assert.doesNotMatch(signupRoute, /face_image|facial_embedding|biometric_template/i);
  assert.ok(publicUserMetadataUpdate, "the post-upload public user metadata update is missing");
  assert.doesNotMatch(publicUserMetadataUpdate, /student_id_object_path|face_snapshot_object_path/i);

  assert.match(adminStudentsTab, /createSignedUrl\(selected\.faceSnapshotObjectPath, 60\)/);
  assert.match(adminDashboard, /createSignedUrl\(objectPath, 60\)/);
  assert.match(adminDashboard, /Raw private object paths are never rendered/);
  assert.doesNotMatch(librarianDashboard, /createSignedUrl|face_snapshot_object_path/);
});

test("private student constraints are repaired and rebuilt on schema reruns", () => {
  const rebuiltConstraints = [
    "student_private_years_valid",
    "student_private_phone_length",
    "student_private_guardian_phone_length",
    "student_private_id_path_owned",
    "student_private_face_snapshot_path_owned",
    "student_private_face_snapshot_consistency",
    "student_private_id_status_valid",
    "student_private_id_upload_consistency",
    "student_private_record_status_valid",
    "student_private_face_status_valid",
    "student_private_verification_mode_valid",
    "student_private_verification_consistency",
  ];

  for (const name of rebuiltConstraints) {
    const drop = `alter table public.student_private_profiles drop constraint if exists ${name};`;
    const add = `alter table public.student_private_profiles add constraint ${name}`;
    const dropAt = sql.toLowerCase().indexOf(drop);
    const addAt = sql.toLowerCase().indexOf(add, dropAt + drop.length);
    assert.notEqual(dropAt, -1, `${name} is not dropped before rebuild`);
    assert.ok(addAt > dropAt, `${name} is not recreated after its drop`);
  }

  assert.match(sql, /set verified_at = coalesce\(verified_at, updated_at, created_at\)[\s\S]*?where verification_status = 'verified';/i);
  assert.match(sql, /student_id_status = 'pending_storage'[\s\S]*?where student_id_object_path is null[\s\S]*?student_id_status in \('uploaded_private', 'rejected'\)/i);
  assert.match(sql, /student_private_verification_consistency[\s\S]*?verification_status = 'verified' and verified_at is not null/i);

  const replayMarker = sql.indexOf("-- Replay non-role intake metadata for students created by an earlier app");
  const replayConstraintDrop = sql.indexOf(
    "alter table public.student_private_profiles drop constraint if exists student_private_years_valid;",
    replayMarker,
  );
  const replayUpdate = sql.indexOf("update public.student_private_profiles spp\nset department", replayConstraintDrop);
  const finalHardening = sql.indexOf("-- Final upgrade hardening.", replayUpdate);
  const finalNotNull = sql.indexOf(
    "alter table public.student_private_profiles alter column student_id_status set not null;",
    finalHardening,
  );
  const finalConstraintBuild = sql.indexOf(
    "alter table public.student_private_profiles add constraint student_private_years_valid",
    finalNotNull,
  );
  assert.ok(replayMarker >= 0, "legacy replay marker is missing");
  assert.ok(replayConstraintDrop > replayMarker, "legacy replay does not drop active constraints first");
  assert.ok(replayUpdate > replayConstraintDrop, "legacy metadata is not replayed after constraint removal");
  assert.ok(finalHardening > replayUpdate, "legacy replay does not finish before final normalization");
  assert.ok(finalNotNull > finalHardening, "NOT NULL hardening does not follow legacy normalization");
  assert.ok(finalConstraintBuild > finalNotNull, "final constraints are not rebuilt after NOT NULL hardening");
  assert.match(sql.slice(finalHardening, finalConstraintBuild), /verification_status = coalesce\(verification_status, 'pending'::public\.student_verification_status\)/i);
  assert.match(sql.slice(finalHardening, finalConstraintBuild), /alter column verification_status set not null/i);
});

test("students cannot rewrite verified identity and phone changes reset verification", () => {
  const updateProfile = extractSqlFunction("update_my_profile");

  assert.match(updateProfile, /v_profile\.full_name is not null and trim\(v_profile\.full_name\) <> v_full_name/i);
  assert.match(updateProfile, /Contact an administrator to correct your verified full name/i);
  assert.match(updateProfile, /v_profile\.index_number is not null and upper\(trim\(v_profile\.index_number\)\) <> v_index_number/i);
  assert.match(updateProfile, /Your KNUST student ID cannot be changed here/i);
  assert.match(updateProfile, /v_profile\.student_email is not null and lower\(trim\(v_profile\.student_email\)\) <> v_student_email/i);
  assert.match(updateProfile, /Your KNUST student email cannot be changed here/i);
  assert.match(updateProfile, /v_phone_changed := v_private\.phone is distinct from v_phone/i);
  assert.match(updateProfile, /when v_phone_changed and verification_status = 'verified' then 'pending'::public\.student_verification_status/i);
  assert.match(updateProfile, /verification_notes = case when v_phone_changed then null/i);
  assert.match(updateProfile, /verified_at = case when v_phone_changed then null/i);
  assert.match(updateProfile, /verified_by = case when v_phone_changed then null/i);
  assert.match(updateProfile, /'verification_reset', v_phone_changed and v_private\.verification_status = 'verified'/i);
  assert.doesNotMatch(updateProfile, /set\s+(?:email|personal_email)\s*=\s*v_/i);
});

test("admin verification safely recovers pathless manual records as simulation", () => {
  const adminVerification = extractSqlFunction("admin_set_student_verification");

  assert.match(adminVerification, /if not public\.is_admin\(\)/i);
  assert.match(adminVerification, /when p_status = 'verified' and spp\.student_id_object_path is null then 'simulation'/i);
  assert.match(adminVerification, /when p_status = 'verified' then coalesce\(spp\.identity_verification_mode, 'manual'\)/i);
  assert.match(adminVerification, /when p_status = 'verified' then 'simulated_completed_no_biometric_match'/i);
  assert.match(adminVerification, /when p_status = 'verified' then 'verified'/i);
  assert.match(adminVerification, /admin-approved legacy identity simulation; no biometric data stored/i);
  assert.doesNotMatch(adminVerification, /student_id_object_path\s*=/i);
});

test("trusted staff provisioning supports librarians and normal administrators without trusting user-editable roles", () => {
  const trigger = extractSqlFunction("handle_new_user");
  const provisionProfile = extractSqlFunction("service_provision_librarian_profile");
  const intentTable = sql.match(/create table if not exists public\.librarian_provisioning_intents \([\s\S]*?\n\);/i)?.[0] ?? "";
  const anonRevokes = [...sql.matchAll(/revoke all privileges on[\s\S]*?from anon;/gi)].map((match) => match[0]);
  const authenticatedRevokes = [...sql.matchAll(/revoke all privileges on[\s\S]*?from authenticated;/gi)].map((match) => match[0]);

  assert.match(intentTable, /token_hash text primary key/i);
  assert.match(intentTable, /actor_id uuid not null references public\.profiles\(id\)/i);
  assert.match(intentTable, /provisioned_role public\.app_role not null default 'librarian'/i);
  assert.match(intentTable, /expires_at timestamptz not null/i);
  assert.match(intentTable, /token_hash ~ '\^\[0-9a-f\]\{64\}\$'/i);
  assert.match(intentTable, /expires_at > created_at and expires_at <= created_at \+ interval '10 minutes'/i);
  assert.match(sql, /alter table public\.librarian_provisioning_intents enable row level security;/i);
  assert.ok(anonRevokes.some((block) => block.includes("public.librarian_provisioning_intents")), "anonymous intent-table privileges are not revoked");
  assert.ok(authenticatedRevokes.some((block) => block.includes("public.librarian_provisioning_intents")), "authenticated intent-table privileges are not revoked");
  assert.match(sql, /grant select, insert, update, delete on public\.librarian_provisioning_intents to service_role;/i);
  assert.match(sql, /librarian_intents_role_valid[\s\S]*?provisioned_role in \('librarian', 'admin'\)/i);
  assert.doesNotMatch(sql, /grant[^;]*on public\.librarian_provisioning_intents[^;]*to (?:anon|authenticated)\b/i);

  assert.match(librarianRoute, /randomBytes\(18\)\.toString\("base64url"\) \+ "Aa1!"/);
  assert.match(librarianRoute, /`LIB\/STAFF\/\$\{year\}\/\$\{randomInt\(100000, 1000000\)\}`/);
  assert.match(librarianRoute, /admin\.auth\.getUser\(token\)/);
  assert.match(librarianRoute, /export const dynamic = "force-dynamic"/);
  assert.match(librarianRoute, /export const revalidate = 0/);
  assert.match(librarianRoute, /actor\.role !== "admin" && actor\.role !== "super_admin"/);
  assert.match(librarianRoute, /admin\.auth\.admin\.createUser\(/);
  assert.match(librarianRoute, /student_email: transientStudentEmail/);
  assert.match(librarianRoute, /admin\.auth\.admin\.updateUserById\(createdUserId/);
  assert.match(librarianRoute, /provisioned_role: "librarian"/);
  assert.match(librarianRoute, /student_email: null/);
  assert.match(librarianRoute, /admin\.rpc\("service_provision_librarian_profile"/);
  assert.match(librarianRoute, /from\("student_private_profiles"\)\.delete\(\)\.eq\("profile_id", createdUserId\)/);
  assert.match(librarianRoute, /event_type: "librarian_credentials_issued"/);
  assert.match(librarianRoute, /admin\.auth\.admin\.deleteUser\(createdUserId\)/);
  assert.doesNotMatch(librarianRoute.match(/metadata: \{[\s\S]*?\n      \},/)?.[0] ?? "", /temporaryPassword|password/i);

  assert.match(librarianRoute, /import \{ createHash, randomBytes, randomInt \} from "node:crypto"/);
  assert.match(librarianRoute, /const provisioningToken = randomBytes\(32\)\.toString\("hex"\)/);
  assert.match(librarianRoute, /createHash\("sha256"\)\.update\(provisioningToken\)\.digest\("hex"\)/);
  assert.match(librarianRoute, /from\("librarian_provisioning_intents"\)\.insert\(\{[\s\S]*?token_hash: intentTokenHash,[\s\S]*?personal_email: personalEmail,[\s\S]*?staff_id: staffId,[\s\S]*?actor_id: actorId,[\s\S]*?Date\.now\(\) \+ 5 \* 60 \* 1000/i);
  const intentInsert = librarianRoute.match(/from\("librarian_provisioning_intents"\)\.insert\(\{[\s\S]*?\n\s*\}\);/)?.[0] ?? "";
  assert.doesNotMatch(intentInsert, /provisioningToken|provisioning_token/i);
  assert.match(librarianRoute, /user_metadata: \{[\s\S]*?provisioning_token: provisioningToken/i);
  assert.match(librarianRoute, /Object\.entries\(created\.data\.user\.user_metadata \?\? \{\}\)\.filter\(\(\[key\]\) => key !== "provisioning_token"\)/);
  assert.match(librarianRoute, /user_metadata: \{[\s\S]*?\.\.\.safeUserMetadata,[\s\S]*?student_email: null/i);
  const returnedCredentials = librarianRoute.match(/credentials: \{[\s\S]*?\n\s*\},\n\s*\}, \{ status: 201/)?.[0] ?? "";
  assert.doesNotMatch(returnedCredentials, /provisioningToken|provisioning_token|intentTokenHash/i);
  const intentCleanups = librarianRoute.match(/from\("librarian_provisioning_intents"\)\.delete\(\)\.eq\("token_hash", intentTokenHash\)/g) ?? [];
  assert.ok(intentCleanups.length >= 2, "provisioning intents are not cleaned after both Auth and finalisation failures");

  assert.doesNotMatch(trigger, /raw_app_meta_data ->> 'provisioned_role'/i);
  assert.doesNotMatch(trigger, /raw_user_meta_data ->> 'provisioned_role'/i);
  assert.match(trigger, /v_provisioning_token text := nullif\(trim\(coalesce\(new\.raw_user_meta_data ->> 'provisioning_token', ''\)\), ''\)/i);
  assert.match(trigger, /delete from public\.librarian_provisioning_intents intent[\s\S]*?using public\.profiles actor/i);
  assert.match(trigger, /actor\.status = 'active'[\s\S]*?actor\.admin_access_revoked_at is null/i);
  assert.match(trigger, /intent\.provisioned_role = 'librarian' and actor\.role in \('admin', 'super_admin'\)/i);
  assert.match(trigger, /intent\.provisioned_role = 'admin' and actor\.role = 'super_admin'/i);
  assert.match(trigger, /intent\.token_hash = encode\(extensions\.digest\(v_provisioning_token, 'sha256'\), 'hex'\)/i);
  assert.match(trigger, /intent\.personal_email = v_personal_email[\s\S]*?intent\.staff_id = v_index_number[\s\S]*?intent\.expires_at > now\(\)/i);
  assert.match(trigger, /returning intent\.actor_id, intent\.provisioned_role[\s\S]*?into v_provisioning_actor_id, v_provisioned_role/i);
  assert.match(trigger, /if v_provisioned_role in \('librarian', 'admin'\) then/i);
  assert.match(trigger, /role = v_provisioned_role/i);
  assert.match(trigger, /case when v_provisioned_role = 'admin' then 'administrator_auth_provisioned' else 'librarian_auth_provisioned' end/i);
  const consumeAt = trigger.indexOf("delete from public.librarian_provisioning_intents intent");
  const staffRoleAt = trigger.indexOf("if v_provisioned_role in ('librarian', 'admin')");
  const signupLockAt = trigger.indexOf("select ls.signup_locked");
  assert.ok(consumeAt >= 0 && staffRoleAt > consumeAt, "the Auth trigger does not atomically consume the intent before choosing a trusted staff role");
  assert.ok(signupLockAt > staffRoleAt, "a valid trusted staff intent is not handled before the public signup lock");
  assert.match(provisionProfile, /if auth\.role\(\) <> 'service_role'/i);
  assert.match(provisionProfile, /delete from public\.student_private_profiles where profile_id = p_auth_user_id/i);
  assert.match(sql, /grant execute on function public\.service_provision_librarian_profile\(uuid, text, text, text\) to service_role;/i);
  assert.match(supabaseVerifier, /staff credential provisioning dependencies are installed/i);
  assert.match(supabaseVerifier, /rpcParameterNames\(schema, "service_provision_librarian_profile"\)/);
  assert.match(supabaseVerifier, /rpcParameterNames\(schema, "service_provision_administrator_profile"\)/);
  assert.match(resetRoute, /resetPasswordForEmail\(profile\.email/);
  assert.match(resetRoute, /If those details match an account/);
});

test("super administrators generate normal-admin credentials once and preserve audited accounts when access is removed", () => {
  const provisionProfile = extractSqlFunction("service_provision_administrator_profile");
  const setStatus = extractSqlFunction("super_admin_set_administrator_status");
  const removeAccess = extractSqlFunction("super_admin_remove_administrator");
  const administratorsView = extractSqlView("super_admin_administrators");
  const responses = extractCalls(administratorsRoute, "NextResponse.json");
  const passwordResponses = responses.filter((response) => /\btemporaryPassword\b/.test(response));

  assert.match(administratorsRoute, /isSameOriginRequest\(request\)/);
  assert.match(administratorsRoute, /parseLimitedJsonRequest\(request, 8 \* 1024\)/);
  assert.match(administratorsRoute, /admin\.auth\.getUser\(token\)/);
  assert.match(administratorsRoute, /actor\.role !== "super_admin" \|\| actor\.status !== "active"/);
  assert.match(administratorsRoute, /randomBytes\(24\)\.toString\("base64url"\) \+ "Aa1!"/);
  assert.match(administratorsRoute, /`ADMIN\/STAFF\/\$\{year\}\/\$\{randomInt\(100000, 1000000\)\}`/);
  assert.match(administratorsRoute, /provisioned_role: "admin"/);
  assert.match(administratorsRoute, /admin\.auth\.admin\.createUser\(/);
  assert.match(administratorsRoute, /admin\.rpc\("service_provision_administrator_profile"/);
  assert.match(administratorsRoute, /p_actor_id: actorId/);
  assert.match(administratorsRoute, /event_type: "administrator_credentials_issued"/);
  assert.match(administratorsRoute, /admin\.auth\.admin\.deleteUser\(createdUserId\)/);
  assert.equal(passwordResponses.length, 1, "administrator temporary credentials must be returned exactly once");
  assert.match(passwordResponses[0], /credentials:\s*\{[\s\S]*?fullName:[\s\S]*?personalEmail,[\s\S]*?staffId,[\s\S]*?temporaryPassword/);
  assert.doesNotMatch(passwordResponses[0], /\b(?:createdUserId|actorId|provisioningToken|intentTokenHash|token_hash)\b/);
  const administratorAudit = administratorsRoute.match(/from\("audit_events"\)\.insert\(\{[\s\S]*?\n\s*\}\);/)?.[0] ?? "";
  const administratorFailureLog = administratorsRoute.match(/console\.error\("Administrator provisioning failed", \{[\s\S]*?\n\s*\}\);/)?.[0] ?? "";
  assert.ok(administratorAudit, "administrator provisioning audit write was not found");
  assert.ok(administratorFailureLog, "administrator provisioning failure log was not found");
  assert.doesNotMatch(administratorAudit, /temporaryPassword|provisioningToken|intentTokenHash|token_hash|password/i);
  assert.doesNotMatch(administratorFailureLog, /temporaryPassword|provisioningToken|intentTokenHash|token_hash|password|personalEmail|staffId|caughtError\.message/i);

  assert.match(provisionProfile, /if auth\.role\(\) <> 'service_role'/i);
  assert.match(provisionProfile, /actor\.id = p_actor_id[\s\S]*?actor\.role = 'super_admin'[\s\S]*?actor\.status = 'active'[\s\S]*?actor\.admin_access_revoked_at is null/i);
  assert.match(provisionProfile, /v_auth_email <> lower\(trim\(p_personal_email\)\)/i);
  assert.match(provisionProfile, /role, status, admin_access_revoked_at, admin_access_revoked_by/i);
  assert.match(provisionProfile, /'admin', 'active', null, null/i);
  assert.match(provisionProfile, /delete from public\.student_private_profiles where profile_id = p_auth_user_id/i);
  assert.match(setStatus, /if not public\.is_super_admin\(\)/i);
  assert.match(setStatus, /where id = p_admin_id[\s\S]*?role = 'admin'[\s\S]*?admin_access_revoked_at is null/i);
  assert.match(removeAccess, /if not public\.is_super_admin\(\)/i);
  assert.match(removeAccess, /set status = 'suspended',[\s\S]*?admin_access_revoked_at = now\(\),[\s\S]*?admin_access_revoked_by = auth\.uid\(\)/i);
  assert.match(removeAccess, /'account_preserved', true/i);
  assert.doesNotMatch(removeAccess, /delete from public\.profiles/i);
  assert.match(administratorsView, /where p\.role = 'admin'[\s\S]*?p\.admin_access_revoked_at is null[\s\S]*?public\.is_super_admin\(\)/i);
  assert.match(sql, /grant execute on function public\.service_provision_administrator_profile\(uuid, uuid, text, text, text\) to service_role;/i);
  assert.match(sql, /grant execute on function public\.super_admin_set_administrator_status\(uuid, public\.profile_status\), public\.super_admin_remove_administrator\(uuid\) to authenticated;/i);

  assert.match(administratorsSettings, /currentRole === "super_admin"/);
  assert.match(administratorsSettings, /fetch\("\/api\/admin\/administrators", \{[\s\S]*?cache: "no-store"/);
  assert.match(administratorsSettings, /Generate administrator credentials/);
  assert.match(administratorsSettings, /cannot be retrieved after this panel is dismissed/i);
  assert.match(administratorsSettings, /rpc\("super_admin_set_administrator_status"/);
  assert.match(administratorsSettings, /rpc\("super_admin_remove_administrator"/);
  assert.match(administratorsSettings, /account and audit history were preserved/i);
});

test("requested decorative sparkle icons are absent from staff credentials and student discovery", () => {
  const librariansTab = read("components/admin/librarians-tab.tsx");
  const libraryDashboard = read("components/student/library-dashboard.tsx");

  assert.doesNotMatch(librariansTab, /LuSparkles/);
  assert.doesNotMatch(libraryDashboard, /LuSparkles/);
  assert.match(librariansTab, /"Generate credentials"/);
  assert.match(librariansTab, /fetch\("\/api\/admin\/librarians", \{[\s\S]*?cache: "no-store"/);
  assert.match(libraryDashboard, />FEATURED THIS WEEK</);
});

test("authentication email links use one trusted canonical application origin", () => {
  assert.match(appUrlHelper, /function normalizeOrigin\(value\?: string \| null\)/);
  assert.match(appUrlHelper, /const configured = value\?\.trim\(\)/);
  assert.match(appUrlHelper, /normalizeOrigin\(process\.env\.APP_URL\)/);
  assert.match(appUrlHelper, /new URL\(configured\)/);
  assert.match(appUrlHelper, /\/\^https\?:\$\/\.test\(parsed\.protocol\)/);
  assert.match(appUrlHelper, /parsed\.username \|\| parsed\.password/);
  assert.match(appUrlHelper, /return parsed\.origin/);
  assert.match(appUrlHelper, /NODE_ENV === "production"/);
  assert.match(appUrlHelper, /APP_URL is required for production authentication links/);

  assert.match(signupRoute, /import \{ getTrustedAppOrigin \} from "@\/lib\/app-url"/);
  assert.match(signupRoute, /emailRedirectTo: new URL\("\/sign-in\?confirmed=1", getTrustedAppOrigin\(request\)\)\.toString\(\)/);
  assert.match(resetRoute, /import \{ getTrustedAppOrigin \} from "@\/lib\/app-url"/);
  assert.match(resetRoute, /redirectTo: new URL\("\/reset-password\?recovery=1", getTrustedAppOrigin\(request\)\)\.toString\(\)/);
  assert.doesNotMatch(signupRoute, /emailRedirectTo: new URL\([^\n]*request\.url/);
  assert.doesNotMatch(resetRoute, /redirectTo: new URL\([^\n]*request\.url/);
});

test("every API JSON branch applies the complete private no-store response boundary", () => {
  assert.ok(apiRouteSources.length > 0, "No API route sources were discovered");
  const requiredHeaders = [
    /"Cache-Control": "no-store, max-age=0"/,
    /"CDN-Cache-Control": "no-store"/,
    /"Vercel-CDN-Cache-Control": "no-store"/,
    /Pragma: "no-cache"/,
    /Expires: "0"/,
    /"X-Content-Type-Options": "nosniff"/,
    /"Cross-Origin-Resource-Policy": "same-origin"/,
    /"Referrer-Policy": "no-referrer"/,
  ];

  for (const route of apiRouteSources) {
    const responses = extractCalls(route.source, "NextResponse.json");
    if (responses.length === 0) continue;
    for (const header of requiredHeaders) {
      assert.match(route.source, header, `${route.path} is missing a required private response header`);
    }
    for (const response of responses) {
      assert.match(response, /\bheaders\b/, `${route.path} has a JSON response branch without its no-store headers`);
    }
  }
});

test("public signup status returns exactly one fail-closed boolean and no backend details", () => {
  const responses = extractCalls(signupStatusRoute, "NextResponse.json");
  assert.equal(responses.length, 2);
  assert.match(signupStatusRoute, /export const dynamic = "force-dynamic"/);
  assert.match(signupStatusRoute, /export const revalidate = 0/);
  assert.match(responses[0], /NextResponse\.json\(\s*\{\s*signupLocked: data\s*\},\s*\{\s*headers: noStoreHeaders\s*\},?\s*\)$/);
  assert.match(responses[1], /NextResponse\.json\(\s*\{\s*signupLocked: true\s*\},\s*\{\s*status: 503, headers: noStoreHeaders\s*\},?\s*\)$/);
  assert.doesNotMatch(signupStatusRoute, /getSupabaseAdminClient|SUPABASE_SERVICE_ROLE_KEY|library_settings/i);
  for (const response of responses) {
    assert.doesNotMatch(response, /\b(?:available|error|message|settings|serviceRoleKey)\s*:/i);
    assert.doesNotMatch(response, /\.(?:message|details|hint|code)\b/);
  }
});

test("signup responses expose only sanitized public messages and confirmation state", () => {
  const responses = extractCalls(signupRoute, "NextResponse.json");
  const sanitizer = signupRoute.match(/function signupErrorMessage\(message: string\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(sanitizer, /return "Your account could not be created\. Check your details and try again\."/);
  assert.doesNotMatch(sanitizer, /return\s+(?:message|`\$\{message\}`)/);
  assert.match(signupRoute, /NextResponse\.json\(\{ message, requiresEmailConfirmation: !data\.session \}, \{ status: 201, headers: noStoreHeaders \}\)/);

  for (const response of responses) {
    assert.doesNotMatch(response, /Supabase|schema|student-ids/i);
    assert.doesNotMatch(response, /\b(?:accessToken|refreshToken|userId|createdUserId|actorId|objectPath|studentIdBuffer|student_id_object_path|provisioningToken|intentTokenHash)\s*:/);
    assert.doesNotMatch(response, /(?:error|message):\s*(?:caughtError|signupError\??\.(?:message|details|hint|code)|uploaded\.error|privateProfileUpdate\.error|metadataUpdate\.error)/);
    assert.doesNotMatch(response, /\b(?:caughtError|deleted\.error|uploaded\.error|privateProfileUpdate\.error|metadataUpdate\.error)\.(?:message|details|hint|code)\b/);
  }
});

test("librarian credentials return the temporary password once without logging or auditing secrets", () => {
  const responses = extractCalls(librarianRoute, "NextResponse.json");
  const passwordResponses = responses.filter((response) => /\btemporaryPassword\b/.test(response));
  assert.equal(passwordResponses.length, 1, "temporaryPassword must occur in exactly one API response");
  assert.match(passwordResponses[0], /credentials:\s*\{[\s\S]*?fullName:[\s\S]*?personalEmail,[\s\S]*?staffId,[\s\S]*?temporaryPassword,[\s\S]*?\}[\s\S]*?status: 201/);
  assert.doesNotMatch(passwordResponses[0], /\b(?:createdUserId|actorId|provisioningToken|intentTokenHash|token_hash)\b/);

  for (const response of responses) {
    assert.doesNotMatch(response, /\b(?:provisioningToken|intentTokenHash|token_hash|createdUserId|actorId|serviceRoleKey)\s*:/);
    assert.doesNotMatch(response, /(?:error|message):\s*caughtError\b/);
    assert.doesNotMatch(response, /\b(?:caughtError|cleanup\??\.error|intentCleanup\??\.error)\.(?:message|details|hint|code)\b/);
  }
  assert.match(librarianRoute, /error: cleanup\?\.error \|\| intentCleanup\?\.error[\s\S]*?\? "The librarian account could not be finalized[\s\S]*?: `\$\{stageMessage\} The incomplete account was removed\.`/);

  const auditWrite = librarianRoute.match(/from\("audit_events"\)\.insert\(\{[\s\S]*?\n\s*\}\);/)?.[0] ?? "";
  const failureLog = librarianRoute.match(/console\.error\("Librarian provisioning failed", \{[\s\S]*?\n\s*\}\);/)?.[0] ?? "";
  assert.ok(auditWrite, "librarian provisioning audit write was not found");
  assert.ok(failureLog, "librarian provisioning failure log was not found");
  assert.doesNotMatch(auditWrite, /temporaryPassword|provisioningToken|intentTokenHash|token_hash|password/i);
  assert.doesNotMatch(failureLog, /temporaryPassword|provisioningToken|intentTokenHash|token_hash|password|personalEmail|staffId|caughtError\.message/i);
});

test("authentication APIs bound origins, bodies, rate state, and duplicate privacy", () => {
  const jsonEndpoints = [
    { name: "sign-in", source: signInRoute, maxBytes: "8 \\* 1024" },
    { name: "password reset", source: resetRoute, maxBytes: "4 \\* 1024" },
    { name: "librarian provisioning", source: librarianRoute, maxBytes: "8 \\* 1024" },
    { name: "administrator provisioning", source: administratorsRoute, maxBytes: "8 \\* 1024" },
  ];

  for (const endpoint of jsonEndpoints) {
    assert.match(endpoint.source, /isSameOriginRequest/);
    assert.match(endpoint.source, new RegExp(`parseLimitedJsonRequest\\(request, ${endpoint.maxBytes}\\)`));
    assert.doesNotMatch(endpoint.source, /await request\.json\(\)/);
    const post = endpoint.source.slice(endpoint.source.indexOf("export async function POST"));
    assert.ok(post.indexOf("isSameOriginRequest(request)") >= 0, `${endpoint.name} does not enforce same-origin requests`);
    assert.ok(
      post.indexOf("isSameOriginRequest(request)") < post.indexOf("parseLimitedJsonRequest(request"),
      `${endpoint.name} parses its body before enforcing the request origin`,
    );
  }

  assert.match(authServer, /export function isSameOriginRequest\(request: Request\)/);
  assert.match(authServer, /isSameOriginRequestFromHelper\(request\)/);
  assert.match(authServer, /contentType !== "application\/json"/);
  assert.match(authServer, /Number\.isSafeInteger\(parsedLength\) && parsedLength >= 0 && parsedLength <= maxBytes/);
  assert.match(authServer, /const reader = request\.body\.getReader\(\)/);
  assert.match(authServer, /totalBytes \+= value\.byteLength[\s\S]*?if \(totalBytes > maxBytes\)[\s\S]*?await reader\.cancel\(\)/);

  const signupPost = signupRoute.slice(signupRoute.indexOf("export async function POST"));
  const sameOriginAt = signupPost.indexOf("isSameOriginRequest(request)");
  const multipartAt = signupPost.indexOf("/^multipart\\/form-data;");
  const lengthAt = signupPost.indexOf("declaredLength !== null && (!Number.isSafeInteger");
  const upperBoundAt = signupPost.indexOf("declaredLength > maxSignupBodySize");
  const streamingParserAt = signupPost.indexOf("parseSignupMultipart(request, declaredLength)");
  assert.ok(sameOriginAt >= 0, "signup does not enforce same-origin requests");
  assert.match(signupPost, /\^multipart\\\/form-data;\\s\*boundary=/i);
  assert.match(signupPost, /declaredLength !== null && \(!Number\.isSafeInteger\(declaredLength\) \|\| declaredLength <= 0\)/);
  assert.match(signupPost, /declaredLength !== null && declaredLength > maxSignupBodySize/);
  assert.ok(
    sameOriginAt < multipartAt && multipartAt < lengthAt && lengthAt < upperBoundAt && upperBoundAt < streamingParserAt,
    "signup must validate origin, multipart boundary, and any declared length before streaming bounded multipart data",
  );
  assert.doesNotMatch(signupRoute, /request\.formData\(\)/);
  assert.match(signupRoute, /Busboy\(\{/);
  assert.match(signupRoute, /fileSize: maxStudentIdSize \+ 1/);
  assert.match(signupRoute, /files: signupFileNames\.size/);
  assert.match(signupRoute, /parts: signupFieldNames\.size \+ signupFileNames\.size \+ 1/);
  assert.match(signupRoute, /actualLength > maxSignupBodySize \|\| \(declaredLength !== null && actualLength > declaredLength\)/);
  assert.match(signupRoute, /await pipeline\(source, limiter, parser\)/);

  assert.match(authServer, /const attempts = new Map<string, \{ count: number; resetAt: number \}>\(\)/);
  assert.match(authServer, /const maxTrackedRateLimitKeys = 10_000/);
  assert.match(authServer, /function pruneRateLimitKeys\(now: number\)/);
  assert.match(authServer, /if \(value\.resetAt <= now\) attempts\.delete\(key\)/);
  assert.match(authServer, /while \(attempts\.size >= maxTrackedRateLimitKeys\)[\s\S]*?attempts\.delete\(oldest\)/);
  assert.ok(
    authServer.indexOf("pruneRateLimitKeys(now)") < authServer.indexOf("const current = attempts.get(key)"),
    "rate-limit state is read before expired/excess keys are pruned",
  );
  assert.match(authServer, /createHash\("sha256"\)[\s\S]*?\.update\(ip \+ ":" \+ normalizeEmail\(identifier\)\.slice\(0, 256\)\)[\s\S]*?\.digest\("hex"\)/);
  assert.doesNotMatch(authServer, /return\s+ip\s*\+\s*":"\s*\+/);

  const signupResponses = extractCalls(signupRoute, "NextResponse.json");
  const duplicateResponses = signupResponses.filter((response) => /signupErrorMessage\("duplicate"\)/.test(response));
  assert.equal(duplicateResponses.length, 2, "both explicit signup duplicate paths must use the same sanitizer");
  assert.equal(
    duplicateResponses[0].replace(/\s+/g, ""),
    duplicateResponses[1].replace(/\s+/g, ""),
    "signup duplicate paths do not return the same generic response",
  );
  for (const response of duplicateResponses) assert.match(response, /status: 400/);
  assert.doesNotMatch(signupRoute, /status:\s*409/);
  const signupSanitizer = signupRoute.match(/function signupErrorMessage\([^)]*\)\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(signupSanitizer, "signup error sanitizer was not found");
  assert.doesNotMatch(signupSanitizer, /already (?:uses|registered|exists)|account exists|duplicate|unique/i);
  for (const response of signupResponses) {
    assert.doesNotMatch(response, /already (?:uses|registered|exists)|account exists|unique constraint/i);
  }
});

test("signup lock is super-admin-only, audited, and publicly exposes only one boolean", () => {
  const toggle = extractSqlFunction("admin_set_signup_lock");
  const publicStatus = extractSqlFunction("get_public_signup_status");
  const audit = extractSqlFunction("audit_signup_lock_change");
  const newUser = extractSqlFunction("handle_new_user");
  const adminAccess = extractSqlFunction("is_admin");
  const superAdminAccess = extractSqlFunction("is_super_admin");

  assert.match(sql, /signup_locked boolean not null default false/i);

  assert.match(toggle, /security definer/i);
  assert.match(toggle, /if not public\.is_super_admin\(\)/i);
  assert.match(toggle, /update public\.library_settings[\s\S]*?signup_locked = p_locked/i);
  assert.match(toggle, /updated_by = auth\.uid\(\)/i);
  assert.match(toggle, /return p_locked/i);
  assert.match(adminAccess, /p\.role in \('admin', 'super_admin'\)/i);
  assert.match(adminAccess, /p\.status = 'active'[\s\S]*?p\.admin_access_revoked_at is null/i);
  assert.match(superAdminAccess, /p\.role = 'super_admin'/i);
  assert.doesNotMatch(superAdminAccess, /p\.role in \('admin', 'super_admin'\)/i);

  assert.match(audit, /security definer/i);
  assert.match(audit, /old\.signup_locked is distinct from new\.signup_locked/i);
  assert.match(audit, /insert into public\.audit_events/i);
  assert.match(audit, /case when new\.signup_locked then 'signup_lock_enabled' else 'signup_lock_disabled' end/i);
  assert.match(audit, /jsonb_build_object\('previous', old\.signup_locked, 'current', new\.signup_locked\)/i);
  assert.match(
    sql,
    /create trigger library_settings_signup_lock_audit[\s\S]*?after update of signup_locked on public\.library_settings[\s\S]*?execute function public\.audit_signup_lock_change\(\)/i,
  );

  assert.match(publicStatus, /returns boolean/i);
  assert.match(publicStatus, /security definer/i);
  assert.match(publicStatus, /select coalesce\(\([\s\S]*?select (?:\w+\.)?signup_locked[\s\S]*?from public\.library_settings[\s\S]*?\), true\)/i);
  assert.doesNotMatch(publicStatus, /library_name|max_active_books|max_loan_days|support_email|opening_hours/i);

  assert.match(sql, /grant execute on function public\.admin_set_signup_lock\(boolean\) to authenticated;/i);
  assert.doesNotMatch(sql, /grant execute on function public\.admin_set_signup_lock\(boolean\) to anon;/i);
  assert.match(sql, /grant execute on function public\.get_public_signup_status\(\) to anon, authenticated;/i);
  assert.match(sql, /revoke all privileges on[\s\S]*?public\.library_settings[\s\S]*?from anon;/i);
  const settingsUpdateGrant = sql.match(/grant update \(\s*((?:(?!\bgrant\b)[\s\S])*)\) on public\.library_settings to authenticated;/i)?.[0] ?? "";
  assert.ok(settingsUpdateGrant, "the bounded authenticated settings update grant is missing");
  assert.doesNotMatch(settingsUpdateGrant, /signup_locked/i);

  const trustedStaffBranch = newUser.indexOf("if v_provisioned_role in ('librarian', 'admin')");
  const lockedGate = newUser.indexOf("NEW_SIGNUPS_SUSPENDED");
  const studentValidation = newUser.indexOf("A valid full name is required");
  assert.ok(trustedStaffBranch >= 0, "trusted staff provisioning branch is missing");
  assert.ok(lockedGate > trustedStaffBranch, "signup lock must not block trusted staff provisioning");
  assert.ok(studentValidation > lockedGate, "signup lock must run before public student validation and inserts");
  assert.match(newUser, /select (?:\w+\.)?signup_locked[\s\S]*?from public\.library_settings/i);

  assert.match(adminDashboard, /const canManageSignupLock = currentRole === "super_admin"/);
  assert.match(adminDashboard, /Only the super administrator can change the global sign-up lock/);
  assert.match(adminDashboard, /disabled=\{loading \|\| signupLockUpdating \|\| !canManageSignupLock\}/);
});

test("book lifecycle is reversible archive and restore with no permanent-delete authority", () => {
  const publish = extractSqlFunction("publish_book");
  const archive = extractSqlFunction("archive_book");
  const unarchive = extractSqlFunction("unarchive_book");

  assert.match(archive, /if not public\.is_admin\(\)/i);
  assert.match(archive, /set is_published = false, archived_at = v_archived_at/i);
  assert.match(archive, /'book_archived'/i);
  assert.match(unarchive, /if not public\.is_admin\(\)/i);
  assert.match(unarchive, /set archived_at = null, is_published = true/i);
  assert.match(unarchive, /'book_unarchived'/i);
  assert.match(sql, /drop function if exists public\.permanently_delete_book\(uuid\);/i);
  assert.doesNotMatch(sql, /create or replace function public\.permanently_delete_book/i);
  assert.doesNotMatch(sql, /grant execute on function public\.permanently_delete_book/i);
  assert.match(sql, /grant execute on function public\.archive_book\(uuid\), public\.unarchive_book\(uuid\) to authenticated;/i);
  assert.match(publish, /if not public\.is_admin\(\)/i);
  assert.match(publish, /add at least one tracked physical copy before publishing/i);
  assert.match(publish, /publish online book text before publishing this title/i);
  assert.match(sql, /grant execute on function public\.publish_book\(uuid\) to authenticated;/i);
  assert.match(sql, /revoke all privileges on[\s\S]*?public\.books,[\s\S]*?from authenticated;/i);
  const bookUpdateGrant = sql.match(/grant update \(\s*((?:(?!\bgrant\b)[\s\S])*)\) on public\.books to authenticated;/i)?.[0] ?? "";
  assert.ok(bookUpdateGrant, "the bounded book update grant is missing");
  assert.doesNotMatch(bookUpdateGrant, /is_published|archived_at|borrow_count/i);

  assert.match(adminDashboard, /rpc\("archive_book", \{ p_book_id: book\.id \}\)/);
  assert.match(adminDashboard, /rpc\("unarchive_book", \{ p_book_id: book\.id \}\)/);
  assert.match(adminDashboard, /rpc\("publish_book", \{ p_book_id: bookId \}\)/);
  assert.match(adminDashboard, /action: "archive" \| "restore"/);
  assert.match(adminDashboard, /Book moved to the archive\. It can be restored at any time\./);
  assert.doesNotMatch(adminDashboard, /rpc\("permanently_delete_book"/);
});

test("fine payments settle only the server-computed balance and are idempotent per accrued total", () => {
  const payment = extractSqlFunction("pay_loan_item_fine");
  const myLoans = extractSqlView("my_loans");
  const finePaymentRpc = libraryProvider.match(/rpc\("pay_loan_item_fine", \{[\s\S]*?\n\s*\}\)/)?.[0] ?? "";

  assert.match(sql, /create table if not exists public\.fine_payments/i);
  assert.match(sql, /fine_total_pesewas integer not null/i);
  assert.match(sql, /amount_pesewas integer not null/i);
  assert.match(sql, /unique \(loan_item_id, fine_total_pesewas\)/i);
  assert.match(sql, /constraint fine_payments_status_valid check \(status = 'simulated_paid'\)/i);
  assert.match(sql, /constraint fine_payments_exact_loan_item_fkey[\s\S]*?foreign key \(loan_item_id, loan_id\) references public\.loan_items\(id, loan_id\)/i);
  assert.match(sql, /constraint fine_payments_exact_borrower_fkey[\s\S]*?foreign key \(loan_id, student_id\) references public\.loans\(id, borrower_id\)/i);
  assert.match(sql, /constraint return_requests_exact_loan_item_fkey[\s\S]*?foreign key \(loan_item_id, loan_id\) references public\.loan_items\(id, loan_id\)/i);

  assert.match(payment, /p_loan_item_id uuid,[\s\S]*?p_payment_method public\.simulated_payment_method/i);
  assert.doesNotMatch(payment, /p_(?:amount|fine|balance)_pesewas/i);
  assert.match(payment, /v_borrower_id uuid := auth\.uid\(\)/i);
  assert.match(payment, /select li\.\*[\s\S]*?into v_item[\s\S]*?and l\.borrower_id = v_borrower_id/i);
  assert.doesNotMatch(payment, /select li,\s*l\.borrower_id\s+into v_item,\s*v_borrower_id/i);
  assert.match(payment, /for update of li/i);
  assert.match(payment, /floor\(extract\(epoch from \(v_now - v_item\.due_at\)\) \/ 86400\)::integer \* v_item\.fine_rate_pesewas/i);
  assert.match(payment, /v_outstanding := greatest\(v_fine_total - v_item\.fine_paid_pesewas, 0\)/i);
  assert.match(payment, /fp\.fine_total_pesewas = v_fine_total[\s\S]*?return v_payment_id/i);
  assert.match(payment, /update public\.loan_items[\s\S]*?fine_paid_pesewas = fine_paid_pesewas \+ v_outstanding/i);
  assert.match(payment, /'fine_payment_received'/i);
  assert.match(payment, /'fine_payment_completed'/i);

  assert.match(myLoans, /fine_payment_status/i);
  assert.match(myLoans, /fine_payment_reference/i);
  assert.match(myLoans, /fine_paid_at/i);
  assert.match(myLoans, /fine_outstanding_pesewas/i);
  assert.match(sql, /create policy "fine_payments_read_own_or_staff"[\s\S]*?student_id = auth\.uid\(\) or public\.is_staff\(\)/i);
  assert.match(sql, /grant execute on function public\.pay_loan_item_fine\(uuid, public\.simulated_payment_method\) to authenticated;/i);
  assert.doesNotMatch(sql, /grant (?:insert|update|delete)[^;]*public\.fine_payments[^;]*to authenticated;/i);

  assert.match(finePaymentRpc, /p_loan_item_id: loanItemId/);
  assert.match(finePaymentRpc, /p_payment_method: paymentMethod/);
  assert.doesNotMatch(finePaymentRpc, /amount|balance|fine_total|pesewas/i);
  assert.match(libraryProvider, /table: "fine_payments"/);
  assert.match(adminDashboard, /table: "fine_payments"/);
  assert.match(librarianDashboard, /table: "fine_payments"/);
  assert.doesNotMatch(libraryProvider, /table: "loan_fine_payments"/);
  assert.doesNotMatch(adminDashboard, /table: "loan_fine_payments"/);
  assert.doesNotMatch(librarianDashboard, /table: "loan_fine_payments"/);
  assert.match(loansPage, /The system calculates the balance securely; no amount is accepted from this screen/);
  assert.match(loansPage, /Mobile money[\s\S]*?Simulated MoMo approval/);
  assert.match(loansPage, /Card[\s\S]*?Simulated card approval/);
});

test("critical fine ledgers track 48-hour accounts and payments without leaking identity evidence to librarians", () => {
  const worker = extractSqlFunction("run_due_notification_worker");
  const staffCritical = extractSqlView("staff_critical_fines");
  const adminCritical = extractSqlView("admin_critical_fines");
  const staffCriticalDefinition = staffCritical.split("\n-- Admins receive")[0];
  const librarianCriticalSurface = librarianDashboard.slice(
    librarianDashboard.indexOf("function LibrarianCriticalFinesSection"),
    librarianDashboard.indexOf("export function LibrarianDashboard"),
  );
  const adminCriticalSurface = adminDashboard.slice(
    adminDashboard.indexOf("function AdminCriticalFinesTab"),
    adminDashboard.indexOf("function DigitalTab"),
  );

  assert.match(worker, /'critical_fine_48h'/i);
  assert.match(worker, /'critical-fine-48h:' \|\| li\.id::text/i);
  assert.match(worker, /fine\.overdue_periods >= 2/i);
  assert.match(worker, /outstanding\.fine_outstanding_pesewas > 0/i);
  assert.match(worker, /li\.status in \('active', 'lost', 'returned'\)/i);
  assert.match(worker, /on conflict \(dedupe_key\) do nothing/i);

  assert.match(staffCritical, /student_name/i);
  assert.match(staffCritical, /student_personal_email/i);
  assert.match(staffCritical, /student_phone/i);
  assert.match(staffCritical, /department/i);
  assert.match(staffCritical, /residence_location/i);
  assert.match(staffCritical, /fine_outstanding_pesewas/i);
  assert.match(staffCritical, /fine_payment_reference/i);
  assert.match(staffCritical, /fine\.overdue_periods >= 2/i);
  assert.doesNotMatch(staffCriticalDefinition, /guardian_|student_id_object_path|facial_scan_status|identity_consent|verification_notes/i);

  assert.match(adminCritical, /student_id_object_path/i);
  assert.match(adminCritical, /student_id_status/i);
  assert.match(adminCritical, /facial_scan_status/i);
  assert.match(adminCritical, /face_snapshot_object_path/i);
  assert.match(adminCritical, /face_snapshot_uploaded_at/i);
  assert.match(adminCritical, /guardian_full_name/i);
  assert.match(adminCritical, /identity_consent_at/i);
  assert.doesNotMatch(adminCritical, /facial_image|face_image|biometric_(?:image|template)/i);
  assert.match(sql, /grant select on[\s\S]*?public\.staff_critical_fines, public\.admin_critical_fines[\s\S]*?to authenticated;/i);

  assert.match(adminDashboard, /\{ id: "critical-fines", label: "Critical fines", icon: CediMark \}/);
  assert.match(adminCriticalSurface, /kicker="GH₵ · 48-HOUR ESCALATION REGISTER"/);
  assert.match(adminCriticalSurface, /<CediMark \/>/);
  assert.match(librarianCriticalSurface, /GH₵ · 48-HOUR ESCALATIONS/);
  assert.match(librarianDashboard, /return "GH₵ " \+ \(Math\.max\(0, pesewas\) \/ 100\)\.toFixed\(2\)/);
  assert.doesNotMatch(adminCriticalSurface, /LuCircleDollarSign|LuDollarSign|DollarSign/);
  assert.doesNotMatch(librarianCriticalSurface, /LuCircleDollarSign|LuDollarSign|DollarSign/);
  assert.doesNotMatch(adminDashboard, /LuCircleDollarSign|LuDollarSign|DollarSign/);
  assert.doesNotMatch(librarianDashboard, /LuCircleDollarSign|LuDollarSign|DollarSign/);
});

test("signup POST fails closed before multipart parsing while sign-in remains independent", () => {
  const post = signupRoute.slice(signupRoute.indexOf("export async function POST"));
  const lockReadAt = post.indexOf("await readSignupLock()");
  const formReadAt = post.indexOf("parseSignupMultipart(request, declaredLength)");
  const authSignupAt = post.indexOf("auth.auth.signUp");

  assert.ok(lockReadAt >= 0, "signup endpoint does not read the authoritative lock");
  assert.ok(formReadAt > lockReadAt, "lock must be checked before parsing the identity upload");
  assert.ok(authSignupAt > lockReadAt, "lock must be checked before creating an Auth user");
  assert.match(signupRoute, /SIGNUPS_LOCKED/);
  assert.match(signupRoute, /status:\s*423/);
  assert.match(signupRoute, /status:\s*503/);
  assert.match(signupRoute, /Sign ups are suspended for now/i);
  assert.match(signupRoute, /Cache-Control": "no-store, max-age=0"/);

  assert.doesNotMatch(signInRoute, /signup_locked|get_public_signup_status|SIGNUPS_LOCKED/i);
  assert.match(signInRoute, /signInWithPassword/);
});

test("student signup precheck matches the authoritative active and unclaimed email-ID record", () => {
  assert.match(signupPrecheckRoute, /isSameOriginRequest\(request\)/);
  assert.match(signupPrecheckRoute, /parseLimitedJsonRequest\(request, 2 \* 1024\)/);
  assert.match(signupPrecheckRoute, /requestClientKey\(request, "signup-precheck"\)/);
  assert.match(signupPrecheckRoute, /checkAuthRateLimit\(rateKey, 20, 10 \* 60 \* 1000\)/);
  assert.doesNotMatch(signupPrecheckRoute, /requestClientKey\(request, [^)]*studentEmail/);
  assert.match(signupPrecheckRoute, /checkStudentSignupEligibility\(studentEmail, indexNumber\)/);
  assert.match(signupPrecheckRoute, /Cache-Control": "no-store, max-age=0"/);
  assert.match(signupPrecheckRoute, /STUDENT_REGISTRY_UNAVAILABLE/);

  assert.match(signupEligibility, /from\("student_signup_allowlist"\)/);
  assert.match(signupEligibility, /select\("index_number,is_active,claimed_by"\)/);
  assert.match(signupEligibility, /eq\("student_email", normalizedStudentEmail\)/);
  assert.match(signupEligibility, /data\.is_active !== true/);
  assert.match(signupEligibility, /normalizeStudentId\(String\(data\.index_number \?\? ""\)\) !== normalizedIndexNumber/);
  assert.match(signupEligibility, /if \(data\.claimed_by\)/);
  assert.match(signupEligibility, /STUDENT_EMAIL_NOT_REGISTERED/);
  assert.match(signupEligibility, /STUDENT_REGISTRY_ID_MISMATCH/);
  assert.match(signupEligibility, /STUDENT_REGISTRY_ALREADY_CLAIMED/);

  assert.match(authScreen, /fetch\("\/api\/auth\/sign-up-precheck"/);
  assert.match(authScreen, /studentEmail: normalizeEmail\(studentEmail\)/);
  assert.match(authScreen, /indexNumber: normalizeStudentId\(indexNumber\)/);
  assert.match(authScreen, /result\?\.eligible !== true/);
  assert.match(authScreen, /KNUST student registration matched/);
  assert.doesNotMatch(authScreen, /no KNUST institutional registry was queried/i);

  const signupCallAt = signupRoute.indexOf("auth.auth.signUp");
  const finalEligibilityAt = signupRoute.indexOf("checkStudentSignupEligibility(studentEmail, indexNumber)");
  const duplicateCheckAt = signupRoute.indexOf("const [personalMatch, studentMatch, indexMatch]");
  assert.ok(finalEligibilityAt >= 0 && finalEligibilityAt < signupCallAt, "final signup does not enforce eligibility before Auth creation");
  assert.ok(finalEligibilityAt < duplicateCheckAt, "a bypassed signup would lose its clear allow-list result behind the generic duplicate response");
  assert.match(signupRoute, /emailRedirectTo: new URL\("\/sign-in\?confirmed=1", getTrustedAppOrigin\(request\)\)\.toString\(\)/);
});

test("admin settings toggle and signup first-interaction lock are wired to live status", () => {
  assert.match(adminDashboard, /signup_locked/i);
  assert.match(adminDashboard, /rpc\("admin_set_signup_lock",\s*\{\s*p_locked:/i);
  assert.match(adminDashboard, />Sign up lock</i);
  assert.match(adminDashboard, /aria-pressed=\{signups?Locked\}/i);

  assert.match(signupStatusRoute, /export async function GET/);
  assert.match(signupStatusRoute, /rpc\("get_public_signup_status"\)/);
  assert.match(signupStatusRoute, /typeof data (?:!==|===) "boolean"/);
  assert.match(signupStatusRoute, /signupLocked:\s*data/);
  assert.match(signupStatusRoute, /status:\s*503/);
  assert.match(signupStatusRoute, /Cache-Control": "no-store, max-age=0"/);
  assert.doesNotMatch(signupStatusRoute, /library_name|max_active_books|max_loan_days|support_email|opening_hours/i);

  assert.match(authScreen, /type SignupAvailability = "checking" \| "open" \| "locked" \| "unavailable"/);
  assert.match(authScreen, /fetch\("\/api\/auth\/sign-up-status"/);
  assert.match(authScreen, /result\?\.signupLocked \?\? result\?\.signupsLocked/);
  assert.match(authScreen, /const handleSignupInteraction/);
  assert.match(authScreen, /onFocusCapture=\{handleSignupInteraction\}/);
  assert.match(authScreen, /on(?:Input|Change)Capture=\{handleSignupInteraction\}/);
  assert.match(authScreen, /signupAvailability !== "open"/);
  assert.match(authScreen, /response\.status === 423 \|\| result\?\.code === "SIGNUPS_LOCKED"/);
  assert.match(authScreen, /signupLockNoticeOpen &&/);
  assert.match(authScreen, /className="signup-lock-modal"/);
  assert.match(authScreen, /role="dialog"/);
  assert.match(authScreen, /aria-modal="true"/);
  assert.match(authScreen, /sign-?ups are temporarily suspended/i);
  assert.match(authScreen, /come back later|until further notice/i);
  assert.match(authScreen, /const handleSignupInteraction[\s\S]*?signupInteractedRef\.current = true/);
  assert.match(authScreen, /if \(availability === "open"\)[\s\S]*?return;[\s\S]*?if \(signupInteractedRef\.current && !signupLockNoticeShownRef\.current\)[\s\S]*?setSignupLockNoticeOpen\(true\)/);
});

test("schema and idempotent seeder define exactly 19 fictional presentation accounts", () => {
  const credentialRows = [...sql.matchAll(/^-- (\d{2}) \| (presentation\.student\d{2}@example\.com) \| (KNUSTDemo#\d{2}2026!)$/gm)];
  const registryBlock = sql.match(/insert into public\.presentation_student_registry\([\s\S]*?on conflict \(demo_number\) do update set[\s\S]*?guardian_relationship = excluded\.guardian_relationship;/i)?.[0] ?? "";
  const registryEmails = [...registryBlock.matchAll(/'presentation\.student\d{2}@example\.com'/g)];

  assert.equal(credentialRows.length, 19);
  assert.deepEqual(credentialRows.map((row) => row[1]), Array.from({ length: 19 }, (_, index) => String(index + 1).padStart(2, "0")));
  assert.equal(new Set(credentialRows.map((row) => row[2])).size, 19);
  assert.equal(new Set(credentialRows.map((row) => row[3])).size, 19);
  assert.equal(registryEmails.length, 19);

  assert.match(presentationSeeder, /if \(registry\.length !== 19\)/);
  assert.match(presentationSeeder, /const password = `KNUSTDemo#\$\{number\}2026!`/);
  assert.match(presentationSeeder, /presentation_account: true/);
  assert.match(presentationSeeder, /auth\.admin\.updateUserById/);
  assert.match(presentationSeeder, /auth\.admin\.createUser/);
  assert.match(presentationSeeder, /onConflict: "profile_id"/);
});

test("public signup admits exactly 19 fresh institutional identities and rejects every unknown email", () => {
  const trigger = extractSqlFunction("handle_new_user");
  const claimSync = extractSqlFunction("sync_student_signup_claim");
  const allowlistTable = sql.match(
    /create table if not exists public\.student_signup_allowlist \([\s\S]*?\n\);/i,
  )?.[0] ?? "";
  const allowlistSeed = sql.match(
    /insert into public\.student_signup_allowlist\s*\([\s\S]*?\)\s*values[\s\S]*?on conflict \(allow_number\) do update set[\s\S]*?;/i,
  )?.[0] ?? "";
  const allowlistValues = allowlistSeed.match(/\bvalues\b([\s\S]*?)\bon conflict\b/i)?.[1] ?? "";
  const allowlistRows = [...allowlistValues.matchAll(
    /\(\s*(\d+)\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*(true|false)\s*\)/gi,
  )].map((row) => ({
    number: Number(row[1]),
    email: row[2],
    indexNumber: row[3],
    active: row[4].toLowerCase() === "true",
  }));
  const presentationRegistrySeed = sql.match(
    /insert into public\.presentation_student_registry\([\s\S]*?on conflict \(demo_number\) do update set[\s\S]*?guardian_relationship = excluded\.guardian_relationship;/i,
  )?.[0] ?? "";
  const presentationStudentEmails = new Set(
    [...presentationRegistrySeed.matchAll(/'([^']+@st\.knust\.edu\.gh)'/gi)].map((row) => row[1].toLowerCase()),
  );

  assert.match(allowlistTable, /allow_number smallint primary key/i);
  assert.match(allowlistTable, /student_email text not null unique/i);
  assert.match(allowlistTable, /index_number text not null unique/i);
  assert.match(allowlistTable, /claimed_by uuid unique references auth\.users\(id\) on delete set null/i);
  assert.match(allowlistTable, /\(claimed_by is null and claimed_at is null\)[\s\S]*?\(claimed_by is not null and claimed_at is not null\)/i);
  assert.match(allowlistSeed, /\(\s*allow_number\s*,\s*student_email\s*,\s*index_number\s*,\s*is_active\s*\)/i);
  assert.equal(allowlistRows.length, 19, "the fresh public-signup allow-list must seed exactly 19 rows");
  assert.deepEqual(
    allowlistRows.map((row) => row.number).sort((left, right) => left - right),
    Array.from({ length: 19 }, (_, index) => index + 1),
  );
  assert.equal(new Set(allowlistRows.map((row) => row.email)).size, 19);
  assert.equal(new Set(allowlistRows.map((row) => row.indexNumber)).size, 19);
  assert.ok(allowlistRows.every((row) => row.active), "every seeded signup identity must be active");
  assert.ok(
    allowlistRows.every((row) => row.email === row.email.trim().toLowerCase() && /^[^\s@]+@st\.knust\.edu\.gh$/.test(row.email)),
    "seeded signup emails must be normalized KNUST student addresses",
  );
  assert.ok(
    allowlistRows.every((row) => !presentationStudentEmails.has(row.email)),
    "fresh signup identities must not collide with already-provisioned presentation accounts",
  );
  const allowlistSeedAssignments = allowlistSeed.match(/do update set([\s\S]*?)(?:\nwhere|;)/i)?.[1] ?? "";
  assert.doesNotMatch(allowlistSeedAssignments, /claimed_by|claimed_at/i, "rerunning the seed must not clear or forge claim state");
  assert.ok(
    allowlistRows.every((row) => /^\d{8}$/.test(row.indexNumber) && row.email === `${row.indexNumber}@st.knust.edu.gh`),
    "each signup email must use its matching eight-digit KNUST index number",
  );
  assert.match(claimSync, /if new\.claimed_by is null then[\s\S]*?new\.claimed_at := null/i);
  assert.match(claimSync, /old\.claimed_by is distinct from new\.claimed_by[\s\S]*?new\.claimed_at := now\(\)/i);
  assert.match(
    sql,
    /create trigger student_signup_allowlist_sync_claim[\s\S]*?before update of claimed_by on public\.student_signup_allowlist[\s\S]*?execute function public\.sync_student_signup_claim\(\)/i,
  );

  assert.match(sql, /alter table public\.student_signup_allowlist enable row level security;/i);
  assert.doesNotMatch(sql, /create policy[^;]*on public\.student_signup_allowlist/si);
  for (const role of ["public", "anon", "authenticated"]) {
    const revokeBlocks = [...sql.matchAll(/revoke all privileges on[\s\S]*?\nfrom (public|anon|authenticated);/gi)];
    const privateBlock = revokeBlocks.find((match) => match[1].toLowerCase() === role && /public\.student_signup_allowlist/i.test(match[0]));
    assert.ok(privateBlock, `student_signup_allowlist privileges are not revoked from ${role}`);
  }
  const allowlistGrants = [...sql.matchAll(/grant[\s\S]*?;/gi)]
    .map((match) => match[0])
    .filter((statement) => /public\.student_signup_allowlist/i.test(statement));
  assert.ok(allowlistGrants.some((statement) => /to service_role/i.test(statement)), "the trusted server role cannot inspect the signup allow-list");
  assert.ok(
    allowlistGrants.every((statement) => !/to\s+(?:anon|authenticated|public)\b/i.test(statement)),
    "a browser role must never receive direct signup allow-list privileges",
  );

  const staffBranchAt = trigger.indexOf("if v_provisioned_role in ('librarian', 'admin') then");
  const presentationGateAt = trigger.indexOf("if v_presentation_number between 1 and 19 then");
  const allowlistLookupAt = trigger.indexOf("from public.student_signup_allowlist allowed");
  const unknownEmailRejectAt = trigger.indexOf("message = 'STUDENT_EMAIL_NOT_AUTHORIZED'");
  const studentProfileInsertAt = trigger.lastIndexOf("insert into public.profiles");
  const privateProfileInsertAt = trigger.indexOf("insert into public.student_private_profiles", studentProfileInsertAt);
  const allowlistClaimAt = trigger.lastIndexOf("update public.student_signup_allowlist");

  assert.match(trigger, /from public\.student_signup_allowlist allowed[\s\S]*?where allowed\.student_email = v_student_email[\s\S]*?and allowed\.is_active[\s\S]*?for update/i);
  assert.match(trigger, /into v_allow_number, v_allow_index_number, v_allow_claimed_by/i);
  assert.match(trigger, /if v_allow_number is null then[\s\S]*?message = 'STUDENT_EMAIL_NOT_AUTHORIZED'/i);
  assert.match(trigger, /if v_allow_index_number is distinct from v_index_number then[\s\S]*?message = 'STUDENT_REGISTRY_ID_MISMATCH'/i);
  assert.match(trigger, /if v_allow_claimed_by is not null and v_allow_claimed_by is distinct from new\.id then[\s\S]*?message = 'STUDENT_REGISTRY_ALREADY_CLAIMED'/i);
  assert.match(trigger, /update public\.student_signup_allowlist[\s\S]*?claimed_by = new\.id,[\s\S]*?claimed_at = coalesce\(claimed_at, now\(\)\)[\s\S]*?where allow_number = v_allow_number/i);
  assert.ok(staffBranchAt >= 0 && presentationGateAt > staffBranchAt, "trusted staff provisioning must finish before student admission checks");
  assert.ok(presentationGateAt >= 0 && allowlistLookupAt > presentationGateAt, "the exact private presentation identity branch must precede the fresh signup list");
  assert.ok(unknownEmailRejectAt > allowlistLookupAt && studentProfileInsertAt > unknownEmailRejectAt, "an unknown email can reach a student profile write");
  assert.ok(privateProfileInsertAt > studentProfileInsertAt && allowlistClaimAt > privateProfileInsertAt, "the allow-list row is claimed before all student profile writes complete");

  assert.doesNotMatch(trigger, /auth\.role\(\) = 'service_role'/i, "an auth.users trigger does not execute with the caller's service-role JWT");
  assert.match(trigger, /raw_user_meta_data ->> 'presentation_account'[\s\S]*?raw_user_meta_data ->> 'presentation_number'/i);
  assert.match(trigger, /if v_presentation_number between 1 and 19 then[\s\S]*?from public\.presentation_student_registry registry/i);
  assert.match(trigger, /registry\.demo_number = v_presentation_number[\s\S]*?registry\.personal_email[\s\S]*?registry\.student_email[\s\S]*?registry\.index_number[\s\S]*?registry\.full_name/i);
  assert.match(trigger, /if v_registry_demo_number is not null then[\s\S]*?else[\s\S]*?from public\.student_signup_allowlist allowed/i);

  const authSignupCall = extractCalls(signupRoute, "auth.auth.signUp")[0] ?? "";
  assert.match(authSignupCall, /email:\s*personalEmail/);
  assert.match(authSignupCall, /data:\s*initialMetadata/);
  assert.match(signupRoute, /const initialMetadata = \{[\s\S]*?student_email:\s*studentEmail/);
  assert.match(authSignupCall, /emailRedirectTo: new URL\("\/sign-in\?confirmed=1", getTrustedAppOrigin\(request\)\)\.toString\(\)/);
  assert.match(signupRoute, /function signupErrorMessage\(message: string\)[\s\S]*?return "Your account could not be created\. Check your details and try again\."/);
  assert.doesNotMatch(signupRoute, /STUDENT_EMAIL_NOT_AUTHORIZED|STUDENT_REGISTRY_ID_MISMATCH|STUDENT_REGISTRY_ALREADY_CLAIMED/);
});

test("presentation seeding is explicit, project-pinned, and refuses unsafe account collisions", () => {
  assert.match(presentationSeeder, /process\.env\.ALLOW_PRESENTATION_SEED !== "true"/);
  assert.match(presentationSeeder, /Presentation seeding is disabled/);
  assert.match(presentationSeeder, /function normalizeHostedProjectRef\(value\)/);
  assert.match(presentationSeeder, /hostname\.endsWith\("\.supabase\.co"\)/);
  assert.match(presentationSeeder, /expectedProjectRef !== actualProjectRef/);
  assert.match(presentationSeeder, /PRESENTATION_SUPABASE_PROJECT_REF must match the connected Supabase project/);
  assert.match(presentationSeeder, /No users were changed/);
  assert.match(presentationSeeder, /authUser\.user_metadata\?\.presentation_account !== true && !linkedRegistryUser/);
  assert.match(presentationSeeder, /Refusing to overwrite an existing non-presentation Auth user/);
  assert.match(presentationSeeder, /department: null,[\s\S]*?guardian_relationship: null/);
});
