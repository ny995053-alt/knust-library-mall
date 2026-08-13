"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  LuCircleCheck,
  LuClock3,
  LuDownload,
  LuEye,
  LuGraduationCap,
  LuHouse,
  LuIdCard,
  LuMail,
  LuPhone,
  LuSearch,
  LuShieldCheck,
  LuTriangleAlert,
  LuUserRound,
  LuUsers,
  LuX,
} from "react-icons/lu";
import type { Student } from "@/lib/types";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { cn, formatDate, initials } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/status-badge";

export type AdminStudentProfile = Student & {
  phone?: string | null;
  department?: string | null;
  startYear?: number | null;
  completionYear?: number | null;
  gender?: string | null;
  residenceType?: "on-campus" | "off-campus" | null;
  residenceLocation?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  guardianRelationship?: string | null;
  studentIdObjectPath?: string | null;
  studentIdStatus?: string | null;
  studentIdUploadedAt?: string | null;
  studentRecordStatus?: string | null;
  facialScanStatus?: string | null;
  faceSnapshotObjectPath?: string | null;
  faceSnapshotUploadedAt?: string | null;
  verificationMode?: string | null;
  verificationCompletedAt?: string | null;
  identityConsentAt?: string | null;
  identityConsentScope?: string | null;
  privacyNoticeVersion?: string | null;
  verificationStatus?: string | null;
  verificationNotes?: string | null;
  verifiedAt?: string | null;
  verifierName?: string | null;
  updatedAt?: string | null;
};

export const adminStudentSelect = [
  "id",
  "full_name",
  "index_number",
  "personal_email",
  "student_email",
  "phone",
  "department",
  "programme",
  "start_year",
  "completion_year",
  "gender",
  "residence_type",
  "residence_location",
  "guardian_full_name",
  "guardian_phone",
  "guardian_relationship",
  "student_id_object_path",
  "student_id_status",
  "student_id_uploaded_at",
  "student_record_check_status",
  "facial_scan_status",
  "face_snapshot_object_path",
  "face_snapshot_uploaded_at",
  "identity_verification_mode",
  "identity_verification_completed_at",
  "identity_consent_at",
  "identity_consent_scope",
  "privacy_notice_version",
  "verification_status",
  "verification_notes",
  "verified_at",
  "verified_by",
  "verifier_name",
  "status",
  "active_loans",
  "created_at",
  "updated_at",
].join(",");

export function mapAdminStudentProfile(row: Record<string, unknown>): AdminStudentProfile {
  const residenceType = row.residence_type === "on-campus" || row.residence_type === "off-campus" ? row.residence_type : null;
  return {
    id: String(row.id),
    fullName: String(row.full_name || "Incomplete profile"),
    indexNumber: String(row.index_number || "Student ID pending"),
    email: String(row.student_email || "Student email pending"),
    studentEmail: row.student_email ? String(row.student_email) : undefined,
    personalEmail: row.personal_email ? String(row.personal_email) : undefined,
    programme: String(row.programme || "Not provided"),
    activeLoans: Number(row.active_loans || 0),
    status: row.status === "suspended" ? "suspended" : "active",
    joinedAt: String(row.created_at || new Date(0).toISOString()),
    phone: row.phone ? String(row.phone) : null,
    department: row.department ? String(row.department) : null,
    startYear: row.start_year ? Number(row.start_year) : null,
    completionYear: row.completion_year ? Number(row.completion_year) : null,
    gender: row.gender ? String(row.gender) : null,
    residenceType,
    residenceLocation: row.residence_location ? String(row.residence_location) : null,
    guardianName: row.guardian_full_name ? String(row.guardian_full_name) : null,
    guardianPhone: row.guardian_phone ? String(row.guardian_phone) : null,
    guardianRelationship: row.guardian_relationship ? String(row.guardian_relationship) : null,
    studentIdObjectPath: row.student_id_object_path ? String(row.student_id_object_path) : null,
    studentIdStatus: row.student_id_status ? String(row.student_id_status) : null,
    studentIdUploadedAt: row.student_id_uploaded_at ? String(row.student_id_uploaded_at) : null,
    studentRecordStatus: row.student_record_check_status ? String(row.student_record_check_status) : null,
    facialScanStatus: row.facial_scan_status ? String(row.facial_scan_status) : null,
    faceSnapshotObjectPath: row.face_snapshot_object_path ? String(row.face_snapshot_object_path) : null,
    faceSnapshotUploadedAt: row.face_snapshot_uploaded_at ? String(row.face_snapshot_uploaded_at) : null,
    verificationMode: row.identity_verification_mode ? String(row.identity_verification_mode) : null,
    verificationCompletedAt: row.identity_verification_completed_at ? String(row.identity_verification_completed_at) : null,
    identityConsentAt: row.identity_consent_at ? String(row.identity_consent_at) : null,
    identityConsentScope: row.identity_consent_scope ? String(row.identity_consent_scope) : null,
    privacyNoticeVersion: row.privacy_notice_version ? String(row.privacy_notice_version) : null,
    verificationStatus: row.verification_status ? String(row.verification_status) : null,
    verificationNotes: row.verification_notes ? String(row.verification_notes) : null,
    verifiedAt: row.verified_at ? String(row.verified_at) : null,
    verifierName: row.verifier_name ? String(row.verifier_name) : null,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  };
}

type StudentsTabProps = {
  students: AdminStudentProfile[];
  loading: boolean;
  search: string;
  setSearch: (value: string) => void;
  onToggleStatus: (student: AdminStudentProfile) => Promise<void>;
  onSetVerification: (student: AdminStudentProfile, status: "verified" | "rejected", notes: string) => Promise<boolean>;
};

function matchesSearch(query: string, student: AdminStudentProfile) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    student.fullName,
    student.indexNumber,
    student.studentEmail,
    student.personalEmail,
    student.phone,
    student.department,
    student.programme,
    student.residenceLocation,
    student.status,
    student.verificationStatus,
  ].some((value) => String(value || "").toLowerCase().includes(normalized));
}

function humanize(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return "Not recorded";
  return String(value).replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function optionalDate(value?: string | null) {
  return value ? formatDate(value, { hour: "2-digit", minute: "2-digit" }) : "Not recorded";
}

function downloadStudents(students: AdminStudentProfile[]) {
  if (!students.length) return void toast.error("There are no matching students to export.");
  const headers = ["full_name", "student_email", "personal_email", "student_id", "phone", "department", "programme", "start_year", "completion_year", "residence", "active_loans", "verification_status", "account_status", "joined_at"];
  const escape = (value: unknown) => {
    const raw = value == null ? "" : String(value);
    const safe = /^[=+\-@]/.test(raw) ? "'" + raw : raw;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const rows = students.map((student) => [
    student.fullName,
    student.studentEmail,
    student.personalEmail,
    student.indexNumber,
    student.phone,
    student.department,
    student.programme,
    student.startYear,
    student.completionYear,
    [humanize(student.residenceType), student.residenceLocation].filter((value) => value && value !== "Not recorded").join(" - "),
    student.activeLoans,
    student.verificationStatus,
    student.status,
    student.joinedAt,
  ]);
  const csv = [headers.map(escape).join(","), ...rows.map((row) => row.map(escape).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "knust-library-students.csv";
  anchor.click();
  URL.revokeObjectURL(url);
  toast.success("Student report exported without guardian or ID-document data.");
}

export function StudentsTab({ students, loading, search, setSearch, onToggleStatus, onSetVerification }: StudentsTabProps) {
  const [programmeFilter, setProgrammeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [verificationFilter, setVerificationFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusPending, setStatusPending] = useState(false);
  const [signingId, setSigningId] = useState(false);
  const [signedIdUrl, setSignedIdUrl] = useState<string | null>(null);
  const [signingFaceSnapshot, setSigningFaceSnapshot] = useState(false);
  const [signedFaceSnapshotUrl, setSignedFaceSnapshotUrl] = useState<string | null>(null);
  const [verificationPending, setVerificationPending] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");
  const selected = selectedId ? students.find((student) => student.id === selectedId) ?? null : null;

  const programmes = useMemo(
    () => Array.from(new Set(students.map((student) => student.programme).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [students],
  );
  const visible = useMemo(
    () => students.filter((student) => matchesSearch(search, student)
      && (programmeFilter === "all" || student.programme === programmeFilter)
      && (statusFilter === "all" || student.status === statusFilter)
      && (verificationFilter === "all" || student.verificationStatus === verificationFilter)),
    [programmeFilter, search, statusFilter, students, verificationFilter],
  );

  useEffect(() => {
    if (!selected) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !statusPending) {
        setSelectedId(null);
        setSignedIdUrl(null);
        setSignedFaceSnapshotUrl(null);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [selected, statusPending]);

  const openStudent = (student: AdminStudentProfile) => {
    setSelectedId(student.id);
    setSignedIdUrl(null);
    setSignedFaceSnapshotUrl(null);
    setReviewNotes(student.verificationNotes || "");
  };

  const toggleSelectedStatus = async () => {
    if (!selected) return;
    setStatusPending(true);
    await onToggleStatus(selected);
    setStatusPending(false);
  };

  const createStudentIdLink = async () => {
    if (!selected?.studentIdObjectPath) return void toast.error("No student ID document has been uploaded.");
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return void toast.error("Connect Supabase before opening private documents.");
    setSigningId(true);
    setSignedIdUrl(null);
    const { data, error } = await supabase.storage.from("student-ids").createSignedUrl(selected.studentIdObjectPath, 60);
    setSigningId(false);
    if (error || !data?.signedUrl) return void toast.error(error?.message || "The secure document link could not be created.");
    setSignedIdUrl(data.signedUrl);
    window.setTimeout(() => setSignedIdUrl(null), 60_000);
  };

  const createFaceSnapshotLink = async () => {
    if (!selected?.faceSnapshotObjectPath) return void toast.error("No face-presence image has been stored for this student.");
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return void toast.error("Connect Supabase before opening private identity evidence.");
    setSigningFaceSnapshot(true);
    setSignedFaceSnapshotUrl(null);
    const { data, error } = await supabase.storage.from("student-ids").createSignedUrl(selected.faceSnapshotObjectPath, 60);
    setSigningFaceSnapshot(false);
    if (error || !data?.signedUrl) return void toast.error(error?.message || "The private face-presence link could not be created.");
    setSignedFaceSnapshotUrl(data.signedUrl);
    window.setTimeout(() => setSignedFaceSnapshotUrl(null), 60_000);
  };

  const setVerification = async (status: "verified" | "rejected") => {
    if (!selected) return;
    if (status === "rejected" && reviewNotes.trim().length < 3) {
      return void toast.error("Add a short reason before rejecting this verification.");
    }
    setVerificationPending(true);
    const completed = await onSetVerification(selected, status, reviewNotes);
    setVerificationPending(false);
    if (completed && status === "verified") setReviewNotes("");
  };

  const verified = students.filter((student) => student.verificationStatus === "verified").length;
  const pending = students.filter((student) => student.verificationStatus === "pending").length;

  return (
    <div className="admin-tab admin-students-tab">
      <div className="admin-page-heading">
        <div><span>MEMBERS</span><h1>Registered students</h1><p>Review complete student profiles, verification status, borrowing activity, and account access.</p></div>
        <button className="button button--outline" type="button" onClick={() => downloadStudents(visible)}><LuDownload /> Export safe report</button>
      </div>

      <div className="student-admin-summary">
        <article><span><LuUsers /></span><p><small>Registered</small><strong>{students.length}</strong></p></article>
        <article><span><LuCircleCheck /></span><p><small>Verified</small><strong>{verified}</strong></p></article>
        <article><span><LuClock3 /></span><p><small>Pending review</small><strong>{pending}</strong></p></article>
      </div>

      <section className="admin-table-card admin-student-table">
        <div className="table-toolbar">
          <label><LuSearch /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, student ID, email or programme" aria-label="Search registered students" /></label>
          <div>
            <select value={programmeFilter} onChange={(event) => setProgrammeFilter(event.target.value)} aria-label="Filter students by programme"><option value="all">All programmes</option>{programmes.map((programme) => <option key={programme} value={programme}>{programme}</option>)}</select>
            <select value={verificationFilter} onChange={(event) => setVerificationFilter(event.target.value)} aria-label="Filter students by verification status"><option value="all">All verification</option><option value="verified">Verified</option><option value="pending">Pending</option><option value="rejected">Rejected</option></select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter students by status"><option value="all">All access</option><option value="active">Active</option><option value="suspended">Suspended</option></select>
          </div>
        </div>
        <div className="responsive-table">
          <table>
            <thead><tr><th>Student</th><th>Student ID</th><th>Programme</th><th>Active loans</th><th>Verification</th><th>Access</th><th>Details</th></tr></thead>
            <tbody>{visible.map((student) => <tr key={student.id}><td><div className="table-person"><span>{initials(student.fullName)}</span><p><strong>{student.fullName}</strong><small>{student.studentEmail || student.email}</small></p></div></td><td><strong>{student.indexNumber}</strong></td><td><strong>{student.programme}</strong><small>{student.department || "Department not provided"}</small></td><td>{student.activeLoans}</td><td><StatusBadge status={student.verificationStatus || "pending"} /></td><td><StatusBadge status={student.status} /></td><td><button className="text-action" type="button" onClick={() => openStudent(student)}><LuEye /> View profile</button></td></tr>)}</tbody>
          </table>
          {loading && <div className="table-empty"><span className="spinner" /><strong>Loading private student profiles</strong><p>This data is requested only while an administrator is viewing this tab.</p></div>}
          {!loading && !visible.length && <div className="table-empty"><LuSearch /><strong>No matching students</strong><p>Adjust the search, programme, verification, or access filter.</p></div>}
        </div>
      </section>

      {selected && (
        <div className="modal-layer student-detail-layer" role="dialog" aria-modal="true" aria-labelledby="student-detail-title">
          <button className="modal-scrim" type="button" onClick={() => { if (!statusPending) { setSelectedId(null); setSignedIdUrl(null); setSignedFaceSnapshotUrl(null); } }} aria-label="Close student profile" />
          <article className="student-detail-drawer">
            <header className="student-detail-header">
              <div className="student-detail-person"><span>{initials(selected.fullName)}</span><p><small>STUDENT PROFILE</small><h2 id="student-detail-title">{selected.fullName}</h2><strong>{selected.indexNumber}</strong></p></div>
              <div><StatusBadge status={selected.verificationStatus || "pending"} /><button className="icon-button" type="button" onClick={() => { setSelectedId(null); setSignedIdUrl(null); setSignedFaceSnapshotUrl(null); }} aria-label="Close student profile"><LuX /></button></div>
            </header>

            <div className="student-detail-body">
              <section className="student-detail-section">
                <div className="student-detail-section__heading"><span><LuUserRound /></span><div><h3>Identity & contact</h3><p>Primary account and contact information</p></div></div>
                <dl className="student-detail-grid">
                  <div><dt><LuMail /> Student email</dt><dd>{selected.studentEmail || "Not recorded"}</dd></div>
                  <div><dt><LuMail /> Personal email</dt><dd>{selected.personalEmail || "Not recorded"}</dd></div>
                  <div><dt><LuPhone /> Phone</dt><dd>{selected.phone || "Not recorded"}</dd></div>
                  <div><dt><LuUserRound /> Gender</dt><dd>{humanize(selected.gender)}</dd></div>
                </dl>
              </section>

              <section className="student-detail-section">
                <div className="student-detail-section__heading"><span><LuGraduationCap /></span><div><h3>Academic details</h3><p>Programme and expected study period</p></div></div>
                <dl className="student-detail-grid">
                  <div><dt>Department</dt><dd>{selected.department || "Not recorded"}</dd></div>
                  <div><dt>Programme</dt><dd>{selected.programme || "Not recorded"}</dd></div>
                  <div><dt>Start year</dt><dd>{selected.startYear || "Not recorded"}</dd></div>
                  <div><dt>Completion year</dt><dd>{selected.completionYear || "Not recorded"}</dd></div>
                </dl>
              </section>

              <section className="student-detail-section">
                <div className="student-detail-section__heading"><span><LuHouse /></span><div><h3>Residence & guardian</h3><p>Private welfare and emergency contact details</p></div></div>
                <dl className="student-detail-grid">
                  <div><dt>Residence type</dt><dd>{humanize(selected.residenceType)}</dd></div>
                  <div><dt>Residence location</dt><dd>{selected.residenceLocation || "Not recorded"}</dd></div>
                  <div><dt>Guardian</dt><dd>{selected.guardianName || "Not recorded"}</dd></div>
                  <div><dt>Relationship</dt><dd>{selected.guardianRelationship || "Not recorded"}</dd></div>
                  <div><dt>Guardian phone</dt><dd>{selected.guardianPhone || "Not recorded"}</dd></div>
                </dl>
              </section>

              <section className="student-detail-section student-verification-section">
                <div className="student-detail-section__heading"><span><LuShieldCheck /></span><div><h3>Identity verification</h3><p>Private evidence is administrator-only. The camera step stores one face-presence image but creates no biometric match or template.</p></div></div>
                <div className="student-verification-cards">
                  <article><span><LuGraduationCap /></span><p><small>Student record</small><strong>{humanize(selected.studentRecordStatus)}</strong></p></article>
                  <article><span><LuIdCard /></span><p><small>Student ID</small><strong>{humanize(selected.studentIdStatus)}</strong><em>{optionalDate(selected.studentIdUploadedAt)}</em></p></article>
                  <article><span><LuShieldCheck /></span><p><small>Identity check</small><strong>{humanize(selected.facialScanStatus)}</strong><em>{selected.faceSnapshotObjectPath ? "Private image stored " + optionalDate(selected.faceSnapshotUploadedAt) : humanize(selected.verificationMode)}</em></p></article>
                </div>
                <dl className="student-detail-grid">
                  <div><dt>Overall status</dt><dd>{humanize(selected.verificationStatus)}</dd></div>
                  <div><dt>Completed</dt><dd>{optionalDate(selected.verificationCompletedAt)}</dd></div>
                  <div><dt>Verified at</dt><dd>{optionalDate(selected.verifiedAt)}</dd></div>
                  <div><dt>Verified by</dt><dd>{selected.verifierName || "Not recorded"}</dd></div>
                  <div><dt>Consent captured</dt><dd>{optionalDate(selected.identityConsentAt)}</dd></div>
                  <div><dt>Consent scope</dt><dd>{selected.identityConsentScope || "Not recorded"}</dd></div>
                  <div><dt>Privacy notice</dt><dd>{selected.privacyNoticeVersion || "Not recorded"}</dd></div>
                  <div><dt>Last profile update</dt><dd>{optionalDate(selected.updatedAt)}</dd></div>
                </dl>
                {selected.verificationNotes && <div className="student-verification-note"><LuTriangleAlert /><p><strong>Verification notes</strong><span>{selected.verificationNotes}</span></p></div>}
                <div className="student-verification-review">
                  <label className="admin-field"><span>Administrator review note</span><textarea value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} placeholder="Required when rejecting; optional when verifying" rows={3} maxLength={500} /></label>
                  <div>
                    <button className="button button--outline" type="button" onClick={() => void setVerification("rejected")} disabled={verificationPending}>{verificationPending ? "Saving…" : "Reject verification"}</button>
                    <button className="button button--primary" type="button" onClick={() => void setVerification("verified")} disabled={verificationPending}>{verificationPending ? "Saving…" : "Mark verified"}</button>
                  </div>
                </div>
                <div className="student-id-access">
                  <div><LuIdCard /><p><strong>Private student ID document</strong><span>A signed link expires after 60 seconds and is only available to administrators.</span></p></div>
                  {selected.studentIdObjectPath ? <button className="button button--outline" type="button" onClick={() => void createStudentIdLink()} disabled={signingId}>{signingId ? "Creating secure link…" : "Create 60-second link"}</button> : <span className="student-id-missing">No document uploaded</span>}
                  {signedIdUrl && <a className="button button--gold" href={signedIdUrl} target="_blank" rel="noreferrer"><LuEye /> Open ID document</a>}
                </div>
                <div className="student-id-access">
                  <div><LuShieldCheck /><p><strong>Private face-presence image</strong><span>A signed link expires after 60 seconds. This image is never exposed to librarians or student exports.</span></p></div>
                  {selected.faceSnapshotObjectPath ? <button className="button button--outline" type="button" onClick={() => void createFaceSnapshotLink()} disabled={signingFaceSnapshot}>{signingFaceSnapshot ? "Creating secure link…" : "Create 60-second link"}</button> : <span className="student-id-missing">No face image stored</span>}
                  {signedFaceSnapshotUrl && <a className="button button--gold" href={signedFaceSnapshotUrl} target="_blank" rel="noreferrer"><LuEye /> Open face image</a>}
                </div>
              </section>
            </div>

            <footer className="student-detail-footer">
              <p><LuShieldCheck /><span><strong>Admin-only private profile</strong><small>Guardian and verification data never appears on the librarian desk or CSV export.</small></span></p>
              <button className={cn("button", selected.status === "active" ? "button--outline" : "button--primary")} type="button" onClick={() => void toggleSelectedStatus()} disabled={statusPending}>{statusPending ? "Updating…" : selected.status === "active" ? "Suspend borrowing" : "Restore access"}</button>
            </footer>
          </article>
        </div>
      )}
    </div>
  );
}
