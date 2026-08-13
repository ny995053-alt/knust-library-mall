"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  LuCircleCheck,
  LuClipboardCheck,
  LuCopy,
  LuKeyRound,
  LuMail,
  LuRefreshCcw,
  LuShieldCheck,
  LuTriangleAlert,
  LuUserCog,
  LuUserMinus,
  LuUserPlus,
  LuUsers,
} from "react-icons/lu";
import { StatusBadge } from "@/components/ui/status-badge";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { cn, formatDate, initials } from "@/lib/utils";

type AdministratorRecord = {
  id: string;
  fullName: string;
  staffId: string;
  personalEmail: string;
  status: "active" | "suspended";
  createdAt: string;
};

type ProvisionedCredentials = {
  fullName: string;
  personalEmail: string;
  staffId: string;
  temporaryPassword: string;
};

type AdministratorsSettingsProps = {
  isDemo: boolean;
  currentRole: "admin" | "super_admin";
};

const administratorSelect = "id,full_name,index_number,email,status,created_at,updated_at";

function mapAdministrator(row: Record<string, unknown>): AdministratorRecord {
  return {
    id: String(row.id),
    fullName: String(row.full_name || "Unnamed administrator"),
    staffId: String(row.index_number || "Staff ID pending"),
    personalEmail: String(row.email || "Not provided"),
    status: row.status === "suspended" ? "suspended" : "active",
    createdAt: String(row.created_at || new Date(0).toISOString()),
  };
}

export function AdministratorsSettings({ isDemo, currentRole }: AdministratorsSettingsProps) {
  const isSuperAdmin = currentRole === "super_admin";
  const [administrators, setAdministrators] = useState<AdministratorRecord[]>([]);
  const [fullName, setFullName] = useState("");
  const [personalEmail, setPersonalEmail] = useState("");
  const [credentials, setCredentials] = useState<ProvisionedCredentials | null>(null);
  const [loading, setLoading] = useState(isSuperAdmin && !isDemo);
  const [provisioning, setProvisioning] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const loadAdministrators = useCallback(async (silent = false) => {
    if (!isSuperAdmin || isDemo) {
      setLoading(false);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      if (!silent) toast.error("Administrator access is temporarily unavailable.");
      return;
    }

    if (!silent) setLoading(true);
    const result = await supabase
      .from("super_admin_administrators")
      .select(administratorSelect)
      .order("created_at", { ascending: false });

    setLoading(false);
    if (result.error) {
      if (!silent) toast.error("Administrator accounts could not be loaded. Refresh and try again.");
      return;
    }

    setAdministrators((result.data ?? []).map((row) => mapAdministrator(row as Record<string, unknown>)));
  }, [isDemo, isSuperAdmin]);

  useEffect(() => {
    if (!isSuperAdmin) return;

    const initial = window.setTimeout(() => void loadAdministrators(), 0);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadAdministrators(true);
    }, 30_000);

    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [isSuperAdmin, loadAdministrators]);

  const activeCount = useMemo(
    () => administrators.filter((administrator) => administrator.status === "active").length,
    [administrators],
  );

  const createAdministrator = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isSuperAdmin) return void toast.error("Only a super administrator can create administrator access.");
    if (credentials) return void toast.error("Dismiss or copy the current one-time credentials before creating another account.");

    const normalizedName = fullName.trim();
    const normalizedEmail = personalEmail.trim().toLowerCase();
    if (normalizedName.length < 2) return void toast.error("Enter the administrator's full name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.endsWith("@st.knust.edu.gh")) {
      return void toast.error("Enter a valid personal email, not a student email.");
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase || isDemo) return void toast.error("Connect Supabase before creating administrator accounts.");
    const sessionResult = await supabase.auth.getSession();
    const accessToken = sessionResult.data.session?.access_token;
    if (!accessToken) return void toast.error("Your super administrator session has expired. Sign in again.");

    setProvisioning(true);
    try {
      const response = await fetch("/api/admin/administrators", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + accessToken,
        },
        body: JSON.stringify({ fullName: normalizedName, personalEmail: normalizedEmail }),
      });
      const result = await response.json() as { credentials?: ProvisionedCredentials; error?: string };
      if (!response.ok || !result.credentials) throw new Error(result.error || "The administrator account could not be created.");

      setCredentials(result.credentials);
      setFullName("");
      setPersonalEmail("");
      toast.success("Administrator account created. Copy the one-time credentials now.");
      window.setTimeout(() => {
        const heading = document.getElementById("administrator-one-time-credentials-title");
        heading?.focus();
        heading?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 0);
      await loadAdministrators(true);
    } catch (caughtError) {
      toast.error(caughtError instanceof Error ? caughtError.message : "The administrator account could not be created.");
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
      "KNUST Library administrator access",
      "Name: " + credentials.fullName,
      "Personal email: " + credentials.personalEmail,
      "Administrator ID: " + credentials.staffId,
      "Temporary password: " + credentials.temporaryPassword,
      "Sign in and request a password reset immediately.",
    ].join("\n"));
  };

  const dismissCredentials = () => {
    if (!window.confirm("Permanently dismiss these one-time credentials? Confirm they have been copied and shared securely.")) return;
    setCredentials(null);
  };

  const toggleStatus = async (administrator: AdministratorRecord) => {
    if (!isSuperAdmin || isDemo) return;
    const nextStatus = administrator.status === "active" ? "suspended" : "active";
    if (nextStatus === "suspended" && !window.confirm("Suspend administrator access for “" + administrator.fullName + "”?")) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return void toast.error("Administrator access is temporarily unavailable.");
    setPendingId(administrator.id);
    const { error } = await supabase.rpc("super_admin_set_administrator_status", {
      p_admin_id: administrator.id,
      p_status: nextStatus,
    });
    setPendingId(null);
    if (error) return void toast.error("Administrator access could not be updated. Refresh and try again.");

    toast.success(nextStatus === "active" ? "Administrator access restored." : "Administrator access suspended.");
    await loadAdministrators(true);
  };

  const removeAdministrator = async (administrator: AdministratorRecord) => {
    if (!isSuperAdmin || isDemo) return;
    if (!window.confirm(
      "Remove administrator access for “" + administrator.fullName + "”? Their account and audit history will be preserved, but they will no longer access the admin dashboard.",
    )) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return void toast.error("Administrator access is temporarily unavailable.");
    setPendingId(administrator.id);
    const { error } = await supabase.rpc("super_admin_remove_administrator", { p_admin_id: administrator.id });
    setPendingId(null);
    if (error) return void toast.error("Administrator access could not be removed. Refresh and try again.");

    toast.success("Administrator access removed. The account and audit history were preserved.");
    await loadAdministrators(true);
  };

  if (!isSuperAdmin) {
    return (
      <section className="admin-panel settings-panel settings-panel--wide">
        <div className="settings-heading"><span><LuUserCog /></span><div><h2>Administrator access</h2><p>Super administrators control administrator membership.</p></div></div>
        <div className="admin-access-note"><LuShieldCheck /><p><strong>Your administrator access is active</strong><span>You retain the full library administration workspace. Creating, suspending, or removing other administrators is restricted to a super administrator.</span></p></div>
      </section>
    );
  }

  return (
    <section className="admin-panel settings-panel settings-panel--wide administrator-settings" aria-labelledby="administrator-access-title">
      <div className="settings-heading">
        <span><LuUserCog /></span>
        <div><h2 id="administrator-access-title">Administrator access</h2><p>Create and control administrator accounts without exposing service credentials.</p></div>
      </div>

      <div className="librarian-management-summary">
        <article><span><LuUsers /></span><p><small>Administrators</small><strong>{administrators.length}</strong></p></article>
        <article><span><LuCircleCheck /></span><p><small>Active access</small><strong>{activeCount}</strong></p></article>
        <article><span><LuShieldCheck /></span><p><small>Authority</small><strong>Super admin</strong><em>Membership changes are audited</em></p></article>
      </div>

      <div className="librarian-onboarding-grid">
        <div className="admin-panel librarian-provision-panel">
          <div className="librarian-panel-intro"><span className="section-kicker">NEW ADMINISTRATOR</span><h2>Generate secure credentials</h2><p>Create a normal administrator with a random ID and one-time temporary password.</p></div>
          <form className="librarian-provision-form" onSubmit={createAdministrator}>
            <label><span>Full name</span><input name="administratorFullName" value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="off" placeholder="e.g. Kwame Asante" maxLength={120} required /></label>
            <label><span>Personal email</span><input name="administratorPersonalEmail" type="email" value={personalEmail} onChange={(event) => setPersonalEmail(event.target.value)} autoComplete="off" placeholder="admin@example.com" maxLength={160} required /></label>
            <button className="button button--primary" disabled={provisioning || Boolean(credentials) || isDemo}><LuUserPlus /> {provisioning ? "Creating secure access…" : credentials ? "Dismiss current credentials first" : "Generate administrator credentials"}</button>
          </form>
          <p className="librarian-provision-note"><LuShieldCheck /> The password is returned once and is never stored in application tables, audit events, logs, or browser storage.</p>
        </div>

        <div className="admin-panel librarian-provision-panel">
          <div className="librarian-panel-intro"><span className="section-kicker">CONTROL BOUNDARY</span><h2>Protected super-admin authority</h2><p>Normal administrators can run the library but cannot manage administrator membership or change the global sign-up lock.</p></div>
          <div className="admin-access-note"><LuTriangleAlert /><p><strong>Accounts are preserved when access is removed</strong><span>Removal revokes the administrator role without deleting identity, circulation, or audit history.</span></p></div>
          <button className="button button--outline" type="button" onClick={() => void loadAdministrators()} disabled={loading}><LuRefreshCcw className={loading ? "is-spinning" : ""} /> {loading ? "Refreshing…" : "Refresh access list"}</button>
        </div>
      </div>

      {credentials && (
        <div className="librarian-credentials-card" aria-labelledby="administrator-one-time-credentials-title">
          <div className="librarian-credentials-card__heading"><span><LuKeyRound /></span><div><small>ONE-TIME CREDENTIALS</small><h2 id="administrator-one-time-credentials-title" tabIndex={-1}>Securely share these with {credentials.fullName}</h2><p>This temporary password cannot be retrieved after this panel is dismissed.</p></div></div>
          <div className="librarian-credential-grid">
            <div><span><LuMail /> Personal email</span><code>{credentials.personalEmail}</code><button type="button" onClick={() => void copyCredential("Personal email", credentials.personalEmail)} aria-label="Copy administrator personal email"><LuCopy /></button></div>
            <div><span><LuClipboardCheck /> Administrator ID</span><code>{credentials.staffId}</code><button type="button" onClick={() => void copyCredential("Administrator ID", credentials.staffId)} aria-label="Copy administrator ID"><LuCopy /></button></div>
            <div className="is-password"><span><LuKeyRound /> Temporary password</span><code>{credentials.temporaryPassword}</code><button type="button" onClick={() => void copyCredential("Temporary password", credentials.temporaryPassword)} aria-label="Copy temporary password"><LuCopy /></button></div>
          </div>
          <footer><p><LuTriangleAlert /> Ask the administrator to replace this temporary password immediately after first sign-in.</p><div><button className="button button--outline" type="button" onClick={dismissCredentials}>Dismiss permanently</button><button className="button button--gold" type="button" onClick={() => void copyAllCredentials()}><LuCopy /> Copy all credentials</button></div></footer>
        </div>
      )}

      <div className="admin-table-card librarian-management-table">
        <div className="librarian-performance-heading"><div><span className="section-kicker">LIVE ACCESS</span><h2>Administrator accounts</h2><p>Only normal administrators are manageable here. Super-administrator authority cannot be delegated from this list.</p></div><LuShieldCheck /></div>
        <div className="responsive-table">
          <table>
            <thead><tr><th>Administrator</th><th>Personal email</th><th>Added</th><th>Status</th><th>Controls</th></tr></thead>
            <tbody>
              {administrators.map((administrator) => (
                <tr key={administrator.id}>
                  <td><div className="table-person"><span>{initials(administrator.fullName)}</span><p><strong>{administrator.fullName}</strong><small>{administrator.staffId}</small></p></div></td>
                  <td>{administrator.personalEmail}</td>
                  <td>{formatDate(administrator.createdAt)}</td>
                  <td><StatusBadge status={administrator.status} /></td>
                  <td><div className="librarian-row-actions"><button className={cn("text-action", administrator.status === "suspended" && "is-positive")} type="button" onClick={() => void toggleStatus(administrator)} disabled={pendingId === administrator.id}>{administrator.status === "active" ? "Suspend" : "Reactivate"}</button><button className="text-action text-action--danger" type="button" onClick={() => void removeAdministrator(administrator)} disabled={pendingId === administrator.id}><LuUserMinus /> Remove access</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !administrators.length && <div className="table-empty"><LuUsers /><strong>No normal administrators yet</strong><p>Generate credentials above to add the first normal administrator.</p></div>}
          {loading && <div className="table-empty"><span className="spinner" /><strong>Loading administrator access</strong></div>}
        </div>
      </div>
    </section>
  );
}
