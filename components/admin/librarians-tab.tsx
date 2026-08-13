"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  LuClipboardCheck,
  LuCircleCheck,
  LuCopy,
  LuKeyRound,
  LuMail,
  LuRefreshCcw,
  LuSearch,
  LuShieldCheck,
  LuTrophy,
  LuTriangleAlert,
  LuUserMinus,
  LuUserPlus,
  LuUsers,
} from "react-icons/lu";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { cn, formatDate, initials } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/status-badge";

type LibrarianRecord = {
  id: string;
  fullName: string;
  staffId: string;
  personalEmail: string;
  studentEmail: string;
  role: "librarian";
  status: "active" | "suspended";
  createdAt: string;
};

type LibrarianPerformance = {
  rank: number;
  librarianId: string;
  fullName: string;
  email: string;
  approvedRequests: number;
  dispatchedDeliveries: number;
  studentConfirmedDeliveries: number;
  safeConfirmationRate: number;
  lastActivityAt: string | null;
};

type ProvisionedCredentials = {
  fullName: string;
  personalEmail: string;
  staffId: string;
  temporaryPassword: string;
};

type ProfileCandidate = {
  id: string;
  fullName: string;
  indexNumber: string;
  personalEmail: string;
  studentEmail: string;
  role: "student" | "librarian" | "admin" | "super_admin";
  status: "active" | "suspended";
};

type LibrariansTabProps = {
  search: string;
  setSearch: (value: string) => void;
  isDemo: boolean;
};

const librarianSelect = "id, full_name, index_number, email, student_email, status, created_at, updated_at";

function mapLibrarian(row: Record<string, unknown>): LibrarianRecord {
  return {
    id: String(row.id),
    fullName: String(row.full_name || "Unnamed profile"),
    staffId: String(row.index_number || "Staff ID pending"),
    personalEmail: String(row.email || "Not provided"),
    studentEmail: String(row.student_email || "Not provided"),
    role: "librarian",
    status: row.status === "suspended" ? "suspended" : "active",
    createdAt: String(row.created_at || new Date(0).toISOString()),
  };
}

function mapPerformance(row: Record<string, unknown>, index: number): LibrarianPerformance {
  return {
    rank: Number(row.rank || index + 1),
    librarianId: String(row.librarian_id),
    fullName: String(row.full_name || "Unnamed librarian"),
    email: String(row.email || "Not provided"),
    approvedRequests: Number(row.approved_requests || 0),
    dispatchedDeliveries: Number(row.dispatched_deliveries || 0),
    studentConfirmedDeliveries: Number(row.student_confirmed_deliveries || 0),
    safeConfirmationRate: Number(row.safe_confirmation_rate || 0),
    lastActivityAt: row.last_activity_at ? String(row.last_activity_at) : null,
  };
}

function mapCandidate(row: Record<string, unknown>): ProfileCandidate {
  const rawRole = String(row.role || "student");
  const role = rawRole === "librarian" || rawRole === "admin" || rawRole === "super_admin" ? rawRole : "student";
  return {
    id: String(row.id),
    fullName: String(row.full_name || "Unnamed profile"),
    indexNumber: String(row.index_number || "Not provided"),
    personalEmail: String(row.email || "Not provided"),
    studentEmail: String(row.student_email || "Not provided"),
    role,
    status: row.status === "suspended" ? "suspended" : "active",
  };
}

function matchesSearch(query: string, librarian: LibrarianRecord) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [librarian.fullName, librarian.staffId, librarian.personalEmail, librarian.studentEmail, librarian.status]
    .some((value) => value.toLowerCase().includes(normalized));
}

function formatPerformanceActivity(value: string | null) {
  if (!value) return "No activity yet";
  return new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

export function LibrariansTab({ search, setSearch, isDemo }: LibrariansTabProps) {
  const [librarians, setLibrarians] = useState<LibrarianRecord[]>([]);
  const [performance, setPerformance] = useState<LibrarianPerformance[]>([]);
  const [candidate, setCandidate] = useState<ProfileCandidate | null>(null);
  const [email, setEmail] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newPersonalEmail, setNewPersonalEmail] = useState("");
  const [provisioning, setProvisioning] = useState(false);
  const [credentials, setCredentials] = useState<ProvisionedCredentials | null>(null);
  const [loading, setLoading] = useState(!isDemo);
  const [finding, setFinding] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const loadLibrarians = useCallback(async (silent = false) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || isDemo) {
      setLoading(false);
      return;
    }
    const [librarianResult, performanceResult] = await Promise.all([
      supabase.from("admin_librarians").select(librarianSelect).order("created_at", { ascending: false }),
      supabase.from("admin_librarian_performance")
        .select("rank,librarian_id,full_name,email,approved_requests,dispatched_deliveries,student_confirmed_deliveries,safe_confirmation_rate,last_activity_at")
        .order("rank", { ascending: true }),
    ]);
    if (librarianResult.error) {
      if (!silent) toast.error("Librarian accounts could not be loaded. Apply the latest Supabase SQL and try again.");
    } else {
      setLibrarians((librarianResult.data ?? []).map((row) => mapLibrarian(row as Record<string, unknown>)));
    }
    if (performanceResult.error) {
      if (!silent) toast.error("Librarian performance could not be loaded. Apply the latest Supabase SQL and retry.");
    } else {
      setPerformance((performanceResult.data ?? []).map((row, index) => mapPerformance(row as Record<string, unknown>, index)));
    }
    setLoading(false);
  }, [isDemo]);

  useEffect(() => {
    const initial = window.setTimeout(() => void loadLibrarians(), 0);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadLibrarians(true);
    }, 30_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [loadLibrarians]);

  const visible = useMemo(() => librarians.filter((item) => matchesSearch(search, item)), [librarians, search]);
  const activeCount = librarians.filter((item) => item.status === "active").length;
  const topPerformer = performance[0] ?? null;

  const provisionLibrarian = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (credentials) return void toast.error("Dismiss or securely copy the current one-time credentials before creating another account.");
    const fullName = newFullName.trim();
    const personalEmail = newPersonalEmail.trim().toLowerCase();
    if (fullName.length < 2) return void toast.error("Enter the librarian's full name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personalEmail) || personalEmail.endsWith("@st.knust.edu.gh")) {
      return void toast.error("Enter a valid personal email, not a student email.");
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase || isDemo) return void toast.error("Connect Supabase before creating librarian accounts.");
    const sessionResult = await supabase.auth.getSession();
    const accessToken = sessionResult.data.session?.access_token;
    if (!accessToken) return void toast.error("Your administrator session has expired. Sign in again.");

    setProvisioning(true);
    try {
      const response = await fetch("/api/admin/librarians", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + accessToken,
        },
        body: JSON.stringify({ fullName, personalEmail }),
      });
      const result = await response.json() as { credentials?: ProvisionedCredentials; error?: string };
      if (!response.ok || !result.credentials) throw new Error(result.error || "The librarian account could not be created.");
      setCredentials(result.credentials);
      setNewFullName("");
      setNewPersonalEmail("");
      toast.success("Librarian account created. Copy the credentials before dismissing them.");
      window.setTimeout(() => {
        const heading = document.getElementById("one-time-credentials-title");
        heading?.focus();
        heading?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 0);
      await loadLibrarians(true);
    } catch (caughtError) {
      toast.error(caughtError instanceof Error ? caughtError.message : "The librarian account could not be created.");
    } finally {
      setProvisioning(false);
    }
  };

  const copyCredential = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(label + " copied.");
    } catch {
      toast.error("Copying was blocked by this browser. Select the value manually.");
    }
  };

  const copyAllCredentials = async () => {
    if (!credentials) return;
    await copyCredential("All credentials", [
      "KNUST Library Mall librarian access",
      "Name: " + credentials.fullName,
      "Personal email: " + credentials.personalEmail,
      "Staff ID: " + credentials.staffId,
      "Temporary password: " + credentials.temporaryPassword,
      "Sign in and use Settings to replace this password immediately.",
    ].join("\n"));
  };

  const dismissCredentials = () => {
    if (!window.confirm("Permanently dismiss these one-time credentials? Confirm that they have been copied and shared securely.")) return;
    setCredentials(null);
  };

  const findProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return void toast.error("Enter a valid personal or KNUST email address.");
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase || isDemo) return void toast.error("Connect Supabase before managing librarian access.");

    setFinding(true);
    setCandidate(null);
    const { data, error } = await supabase.rpc("admin_find_profile_by_email", { p_email: normalizedEmail });
    setFinding(false);
    if (error) return void toast.error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return void toast.error("No existing account matches that email.");
    setCandidate(mapCandidate(row as Record<string, unknown>));
  };

  const promote = async () => {
    if (!candidate) return;
    if (candidate.status !== "active") {
      return void toast.error("Reactivate this account before granting librarian access.");
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase || isDemo) return;
    setPendingId(candidate.id);
    const { error } = await supabase.rpc("admin_promote_librarian", { p_profile_id: candidate.id });
    setPendingId(null);
    if (error) return void toast.error(error.message);
    toast.success(candidate.fullName + " is now a librarian.");
    setCandidate(null);
    setEmail("");
    await loadLibrarians(true);
  };

  const toggleStatus = async (librarian: LibrarianRecord) => {
    const nextStatus = librarian.status === "active" ? "suspended" : "active";
    const supabase = getSupabaseBrowserClient();
    if (!supabase || isDemo) return;
    setPendingId(librarian.id);
    const { error } = await supabase.rpc("admin_set_librarian_status", { p_profile_id: librarian.id, p_status: nextStatus });
    setPendingId(null);
    if (error) return void toast.error(error.message);
    toast.success(nextStatus === "active" ? "Librarian access restored." : "Librarian access suspended.");
    await loadLibrarians(true);
  };

  const remove = async (librarian: LibrarianRecord) => {
    if (!window.confirm("Remove librarian access for “" + librarian.fullName + "”? Their account and history will be preserved.")) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase || isDemo) return;
    setPendingId(librarian.id);
    const { error } = await supabase.rpc("admin_remove_librarian", { p_profile_id: librarian.id });
    setPendingId(null);
    if (error) return void toast.error(error.message);
    toast.success("Librarian access removed. Staff-only accounts are suspended; promoted student accounts return to student access.");
    await loadLibrarians(true);
  };

  return (
    <div className="admin-tab librarian-management-tab">
      <div className="admin-page-heading">
        <div><span>ACCESS CONTROL</span><h1>Librarian management</h1><p>Create staff access, promote eligible accounts, and review safe delivery performance.</p></div>
        <button className="button button--outline" type="button" onClick={() => void loadLibrarians()} disabled={loading}><LuRefreshCcw /> Refresh</button>
      </div>

      <div className="librarian-management-summary">
        <article><span><LuUsers /></span><p><small>Total librarians</small><strong>{librarians.length}</strong></p></article>
        <article><span><LuCircleCheck /></span><p><small>Active access</small><strong>{activeCount}</strong></p></article>
        <article><span><LuTrophy /></span><p><small>Performance leader</small><strong>{topPerformer?.fullName || "Awaiting activity"}</strong><em>{topPerformer ? topPerformer.safeConfirmationRate.toFixed(1) + "% safely confirmed" : "Rankings update from live circulation"}</em></p></article>
      </div>

      <div className="librarian-onboarding-grid">
        <section className="admin-panel librarian-provision-panel">
          <div className="librarian-panel-intro">
            <span className="section-kicker">NEW STAFF ACCOUNT</span>
            <h2>Generate librarian credentials</h2>
            <p>Create an email-confirmed staff account with a random staff ID and one-time temporary password.</p>
          </div>
          <form className="librarian-provision-form" onSubmit={provisionLibrarian}>
            <label><span>Full name</span><input name="librarianFullName" value={newFullName} onChange={(event) => setNewFullName(event.target.value)} autoComplete="off" placeholder="e.g. Akosua Owusu" maxLength={120} required /></label>
            <label><span>Personal email</span><input name="librarianPersonalEmail" type="email" value={newPersonalEmail} onChange={(event) => setNewPersonalEmail(event.target.value)} autoComplete="off" placeholder="staff@example.com" maxLength={160} required /></label>
            <button className="button button--primary" disabled={provisioning || Boolean(credentials)}>{provisioning ? "Creating secure access…" : credentials ? "Dismiss current credentials first" : "Generate credentials"}</button>
          </form>
          <p className="librarian-provision-note"><LuShieldCheck /> The temporary password is returned once, never written to application tables or audit metadata.</p>
        </section>

        <section className="admin-panel librarian-invite-panel">
          <div>
            <span className="section-kicker">EXISTING ACCOUNT</span>
            <h2>Promote an eligible profile</h2>
            <p>Keep an existing identity and circulation history while granting librarian access.</p>
          </div>
          <form onSubmit={findProfile}>
            <label><LuSearch /><input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setCandidate(null); }} placeholder="Personal or KNUST email" aria-label="Existing account email" /></label>
            <button className="button button--primary" disabled={finding}>{finding ? "Searching…" : "Find account"}</button>
          </form>
          {candidate && (
            <div className="librarian-candidate">
              <span>{initials(candidate.fullName)}</span>
              <p><strong>{candidate.fullName}</strong><small>{candidate.studentEmail}</small><small>{candidate.indexNumber}</small></p>
              <StatusBadge status={candidate.status} />
              {candidate.role === "student" ? (
                <div className="librarian-candidate__access">
                  <button className="button button--gold" type="button" onClick={() => void promote()} disabled={pendingId === candidate.id || candidate.status !== "active"}><LuUserPlus /> {pendingId === candidate.id ? "Promoting…" : candidate.status === "suspended" ? "Activate account first" : "Promote librarian"}</button>
                  {candidate.status === "suspended" && <span className="librarian-candidate__note"><LuTriangleAlert /> Reactivate this student account before assigning the librarian role.</span>}
                </div>
              ) : candidate.role === "librarian" ? (
                <span className="librarian-candidate__note"><LuCircleCheck /> Already a librarian</span>
              ) : (
                <span className="librarian-candidate__note"><LuTriangleAlert /> {candidate.role.replace("_", " ")} roles cannot be changed here</span>
              )}
            </div>
          )}
        </section>
      </div>

      {credentials && (
        <section className="librarian-credentials-card" aria-labelledby="one-time-credentials-title">
          <div className="librarian-credentials-card__heading"><span><LuKeyRound /></span><div><small>ONE-TIME CREDENTIALS</small><h2 id="one-time-credentials-title" tabIndex={-1}>Securely share these with {credentials.fullName}</h2><p>This password cannot be retrieved after you dismiss this panel.</p></div></div>
          <div className="librarian-credential-grid">
            <div><span><LuMail /> Personal email</span><code>{credentials.personalEmail}</code><button type="button" onClick={() => void copyCredential("Personal email", credentials.personalEmail)} aria-label="Copy personal email"><LuCopy /></button></div>
            <div><span><LuClipboardCheck /> Staff ID</span><code>{credentials.staffId}</code><button type="button" onClick={() => void copyCredential("Staff ID", credentials.staffId)} aria-label="Copy staff ID"><LuCopy /></button></div>
            <div className="is-password"><span><LuKeyRound /> Temporary password</span><code>{credentials.temporaryPassword}</code><button type="button" onClick={() => void copyCredential("Temporary password", credentials.temporaryPassword)} aria-label="Copy temporary password"><LuCopy /></button></div>
          </div>
          <footer><p><LuTriangleAlert /> Ask the librarian to use Settings to request a password-reset link immediately after first sign-in.</p><div><button className="button button--outline" type="button" onClick={dismissCredentials}>Dismiss permanently</button><button className="button button--gold" type="button" onClick={() => void copyAllCredentials()}><LuCopy /> Copy all credentials</button></div></footer>
        </section>
      )}

      <section className="admin-table-card librarian-performance-table">
        <div className="librarian-performance-heading"><div><span className="section-kicker">LIVE PERFORMANCE</span><h2>Librarian ranking</h2><p>Operational counts only. Safe confirmation measures student-confirmed deliveries against dispatched deliveries.</p></div><LuTrophy /></div>
        <div className="responsive-table">
          <table>
            <thead><tr><th>Rank</th><th>Librarian</th><th>Approved</th><th>Dispatched</th><th>Student confirmed</th><th>Safe confirmation</th><th>Last activity</th></tr></thead>
            <tbody>{performance.map((item) => <tr key={item.librarianId}><td><strong className="librarian-rank">#{item.rank}</strong></td><td><div className="table-person"><span>{initials(item.fullName)}</span><p><strong>{item.fullName}</strong><small>{item.email}</small></p></div></td><td>{item.approvedRequests}</td><td>{item.dispatchedDeliveries}</td><td>{item.studentConfirmedDeliveries}</td><td><span className="safe-confirmation-rate">{item.safeConfirmationRate.toFixed(1)}%</span></td><td>{formatPerformanceActivity(item.lastActivityAt)}</td></tr>)}</tbody>
          </table>
          {!loading && !performance.length && <div className="table-empty"><LuTrophy /><strong>No performance activity yet</strong><p>Rankings appear after librarians review or dispatch requests.</p></div>}
          {loading && <div className="table-empty"><span className="spinner" /><strong>Loading performance</strong></div>}
        </div>
      </section>

      <section className="admin-table-card librarian-management-table">
        <div className="table-toolbar">
          <label><LuSearch /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search librarians by name, staff ID or email" aria-label="Search librarians" /></label>
          <div><span className="librarian-table-count">{visible.length} account{visible.length === 1 ? "" : "s"}</span></div>
        </div>
        <div className="responsive-table">
          <table>
            <thead><tr><th>Librarian</th><th>Personal email</th><th>Added</th><th>Status</th><th>Controls</th></tr></thead>
            <tbody>
              {visible.map((librarian) => (
                <tr key={librarian.id}>
                  <td><div className="table-person"><span>{initials(librarian.fullName)}</span><p><strong>{librarian.fullName}</strong><small>{librarian.staffId}</small></p></div></td>
                  <td>{librarian.personalEmail}</td>
                  <td>{formatDate(librarian.createdAt)}</td>
                  <td><StatusBadge status={librarian.status} /></td>
                  <td><div className="librarian-row-actions"><button className={cn("text-action", librarian.status === "suspended" && "is-positive")} type="button" onClick={() => void toggleStatus(librarian)} disabled={pendingId === librarian.id}>{librarian.status === "active" ? "Suspend" : "Reactivate"}</button><button className="text-action text-action--danger" type="button" onClick={() => void remove(librarian)} disabled={pendingId === librarian.id}><LuUserMinus /> Remove role</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !visible.length && <div className="table-empty"><LuUsers /><strong>No matching librarians</strong><p>Generate a new staff account or promote an eligible profile above.</p></div>}
          {loading && <div className="table-empty"><span className="spinner" /><strong>Loading librarian access</strong></div>}
        </div>
      </section>
    </div>
  );
}
