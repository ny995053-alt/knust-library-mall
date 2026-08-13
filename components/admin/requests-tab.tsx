"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  LuBadgeCheck,
  LuBookOpen,
  LuCircleCheck,
  LuClock3,
  LuCreditCard,
  LuHandshake,
  LuMapPin,
  LuRefreshCcw,
  LuRotateCcw,
  LuSearch,
  LuSend,
  LuShieldCheck,
  LuTruck,
  LuUserCheck,
} from "react-icons/lu";
import { StatusBadge } from "@/components/ui/status-badge";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { formatDate } from "@/lib/utils";

type AuditFilter = "all" | "pending" | "handover" | "completed" | "issues";

type AuditItem = {
  id: string;
  title: string;
  author: string;
  accessionNumber: string | null;
};

type AuditRequest = {
  id: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  fulfilmentMethod: "pickup" | "delivery";
  loanDays: number;
  deliveryFeePesewas: number;
  deliveryLocation: string | null;
  deliveryFloor: string | null;
  deliveryRoom: string | null;
  paymentMethod: string | null;
  paymentStatus: string | null;
  paymentReference: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  reviewerName: string | null;
  reviewerEmail: string | null;
  dispatchedAt: string | null;
  dispatcherName: string | null;
  dispatcherEmail: string | null;
  receivedAt: string | null;
  recalledAt: string | null;
  recallerName: string | null;
  recallerEmail: string | null;
  recallReason: string | null;
  recallReturnedAt: string | null;
  recallReturnerName: string | null;
  recallReturnerEmail: string | null;
  rejectionReason: string | null;
  loanId: string | null;
  studentName: string;
  indexNumber: string;
  studentEmail: string;
  programme: string | null;
  items: AuditItem[];
};

function mapRequest(row: Record<string, unknown>): AuditRequest {
  const rawStatus = String(row.status || "pending");
  const status = rawStatus === "approved" || rawStatus === "rejected" || rawStatus === "cancelled" ? rawStatus : "pending";
  const rawItems = Array.isArray(row.items) ? row.items as Array<Record<string, unknown>> : [];
  return {
    id: String(row.id),
    status,
    fulfilmentMethod: row.fulfilment_method === "delivery" ? "delivery" : "pickup",
    loanDays: Number(row.loan_days || 1),
    deliveryFeePesewas: Number(row.delivery_fee_pesewas || 0),
    deliveryLocation: row.delivery_location ? String(row.delivery_location) : null,
    deliveryFloor: row.delivery_floor ? String(row.delivery_floor) : null,
    deliveryRoom: row.delivery_room ? String(row.delivery_room) : null,
    paymentMethod: row.payment_method ? String(row.payment_method) : null,
    paymentStatus: row.payment_status ? String(row.payment_status) : null,
    paymentReference: row.payment_reference ? String(row.payment_reference) : null,
    requestedAt: String(row.requested_at || new Date(0).toISOString()),
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
    reviewerName: row.reviewer_name ? String(row.reviewer_name) : null,
    reviewerEmail: row.reviewer_email ? String(row.reviewer_email) : null,
    dispatchedAt: row.dispatched_at ? String(row.dispatched_at) : null,
    dispatcherName: row.dispatcher_name ? String(row.dispatcher_name) : null,
    dispatcherEmail: row.dispatcher_email ? String(row.dispatcher_email) : null,
    receivedAt: row.student_received_at ? String(row.student_received_at) : row.delivery_received_at ? String(row.delivery_received_at) : null,
    recalledAt: row.recalled_at ? String(row.recalled_at) : null,
    recallerName: row.recaller_name ? String(row.recaller_name) : null,
    recallerEmail: row.recaller_email ? String(row.recaller_email) : null,
    recallReason: row.recall_reason ? String(row.recall_reason) : null,
    recallReturnedAt: row.recall_returned_at ? String(row.recall_returned_at) : null,
    recallReturnerName: row.recall_returner_name ? String(row.recall_returner_name) : null,
    recallReturnerEmail: row.recall_returner_email ? String(row.recall_returner_email) : null,
    rejectionReason: row.rejection_reason ? String(row.rejection_reason) : null,
    loanId: row.loan_id ? String(row.loan_id) : null,
    studentName: String(row.student_name || "Incomplete profile"),
    indexNumber: String(row.index_number || "Student ID pending"),
    studentEmail: String(row.student_email || "Student email pending"),
    programme: row.programme ? String(row.programme) : null,
    items: rawItems.map((item) => ({
      id: String(item.request_item_id || item.book_id || crypto.randomUUID()),
      title: String(item.title || "Archived title"),
      author: String(item.author || "Unknown author"),
      accessionNumber: item.accession_number ? String(item.accession_number) : null,
    })),
  };
}

function activityDate(value: string | null) {
  if (!value) return "Not completed";
  return new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

function matchesSearch(request: AuditRequest, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    request.id,
    request.studentName,
    request.indexNumber,
    request.studentEmail,
    request.programme,
    request.paymentReference,
    request.reviewerName,
    request.reviewerEmail,
    request.dispatcherName,
    request.dispatcherEmail,
    request.recallerName,
    request.recallerEmail,
    request.recallReason,
    request.recallReturnerName,
    request.recallReturnerEmail,
    ...request.items.flatMap((item) => [item.title, item.author, item.accessionNumber]),
  ].some((value) => String(value || "").toLowerCase().includes(normalized));
}

function matchesFilter(request: AuditRequest, filter: AuditFilter) {
  if (filter === "all") return true;
  if (filter === "pending") return request.status === "pending";
  if (filter === "handover") return request.fulfilmentMethod === "delivery" && request.status === "approved" && !request.receivedAt;
  if (filter === "completed") return request.status === "approved" && (request.fulfilmentMethod === "pickup" ? Boolean(request.loanId) : Boolean(request.receivedAt));
  return request.status === "rejected" || request.status === "cancelled";
}

export function RequestsTab({ search, setSearch }: { search: string; setSearch: (value: string) => void }) {
  const [requests, setRequests] = useState<AuditRequest[]>([]);
  const [filter, setFilter] = useState<AuditFilter>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async (silent = false) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      return;
    }
    if (silent) setRefreshing(true);
    const result = await supabase.from("admin_borrow_requests").select("*").order("requested_at", { ascending: false });
    if (result.error) {
      if (!silent) toast.error("Borrow request audit could not be loaded. Apply the latest Supabase SQL and retry.");
    } else {
      setRequests((result.data ?? []).map((row) => mapRequest(row as Record<string, unknown>)));
      setUpdatedAt(new Date());
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 25_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [load]);

  const visible = useMemo(
    () => requests.filter((request) => matchesFilter(request, filter) && matchesSearch(request, search)),
    [filter, requests, search],
  );
  const pending = requests.filter((request) => request.status === "pending").length;
  const awaitingReceipt = requests.filter((request) => request.fulfilmentMethod === "delivery" && request.status === "approved" && request.dispatchedAt && !request.receivedAt).length;
  const dualConfirmed = requests.filter((request) => request.fulfilmentMethod === "delivery" && request.dispatchedAt && request.receivedAt).length;
  const returnCustody = requests.filter((request) => request.recalledAt && request.dispatchedAt && !request.recallReturnedAt).length;

  return (
    <div className="admin-tab admin-request-audit">
      <div className="admin-page-heading">
        <div><span>CHAIN OF CUSTODY</span><h1>Borrow request audit</h1><p>See approval, dispatch, and student receipt as separate, attributable events.</p></div>
        <div className="admin-heading-actions"><Link className="button button--gold" href="/librarian"><LuUserCheck /> Open operations desk</Link><button className="button button--outline" type="button" onClick={() => void load(true)} disabled={refreshing}><LuRefreshCcw className={refreshing ? "is-spinning" : ""} /> Refresh</button></div>
      </div>

      <div className="request-audit-summary">
        <article><span><LuClock3 /></span><p><small>Pending review</small><strong>{pending}</strong></p></article>
        <article><span><LuTruck /></span><p><small>Awaiting student receipt</small><strong>{awaitingReceipt}</strong></p></article>
        <article><span><LuHandshake /></span><p><small>Dual-confirmed deliveries</small><strong>{dualConfirmed}</strong></p></article>
        <article><span><LuRotateCcw /></span><p><small>Controlled return custody</small><strong>{returnCustody}</strong></p></article>
        <article><span><LuShieldCheck /></span><p><small>Audit refresh</small><strong>{updatedAt ? updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Syncing"}</strong></p></article>
      </div>

      <section className="admin-table-card request-audit-panel">
        <div className="table-toolbar">
          <label><LuSearch /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search request, student, book, staff or reference" aria-label="Search borrow request audit" /></label>
        </div>
        <div className="request-audit-tabs" role="tablist" aria-label="Filter request audit">
          {(["all", "pending", "handover", "completed", "issues"] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={filter === item} className={filter === item ? "is-active" : ""} onClick={() => setFilter(item)}>{item === "all" ? "All requests" : item === "handover" ? "Open handovers" : item}<span>{requests.filter((request) => matchesFilter(request, item)).length}</span></button>)}
        </div>

        <div className="request-audit-list">
          {visible.map((request) => (
            <article className="request-audit-card" key={request.id}>
              <header>
                <div><small>REQUEST {request.id.slice(0, 8).toUpperCase()}</small><h2>{request.studentName}</h2><p>{request.indexNumber} · {request.studentEmail}</p></div>
                <div><StatusBadge status={request.recalledAt ? "recalled" : request.status} /><small>{formatDate(request.requestedAt)}</small></div>
              </header>

              <div className="request-audit-details">
                <p><LuBookOpen /><span><small>BOOKS</small><strong>{request.items.map((item) => item.title).join(", ")}</strong><em>{request.items.length} title{request.items.length === 1 ? "" : "s"} · {request.loanDays} day{request.loanDays === 1 ? "" : "s"}</em></span></p>
                <p>{request.fulfilmentMethod === "delivery" ? <LuTruck /> : <LuBookOpen />}<span><small>FULFILMENT</small><strong>{request.fulfilmentMethod === "delivery" ? "Campus delivery" : "Self pickup"}</strong><em>{request.fulfilmentMethod === "delivery" ? `GHS ${(request.deliveryFeePesewas / 100).toFixed(2)} · ${request.paymentStatus?.replaceAll("_", " ") || "payment pending"}` : "Free circulation-desk collection"}</em></span></p>
                {request.fulfilmentMethod === "delivery" && <p><LuMapPin /><span><small>DELIVERY</small><strong>{request.deliveryLocation || "Location missing"}</strong><em>Floor {request.deliveryFloor || "—"} · Room {request.deliveryRoom || "—"}</em></span></p>}
                {request.fulfilmentMethod === "delivery" && <p><LuCreditCard /><span><small>SIMULATED PAYMENT</small><strong>{request.paymentReference || "Reference missing"}</strong><em>{request.paymentMethod || "Method missing"} · no payment secrets retained</em></span></p>}
              </div>

              <div className="request-audit-timeline">
                <div className="is-complete"><i><LuSend /></i><p><small>STUDENT REQUEST</small><strong>{request.studentName}</strong><span>{activityDate(request.requestedAt)}</span></p></div>
                <div className={request.reviewedAt ? "is-complete" : ""}><i><LuUserCheck /></i><p><small>{request.status === "pending" ? "STAFF REVIEW" : request.status === "approved" || request.recalledAt ? "STAFF APPROVAL" : "REVIEW OUTCOME"}</small><strong>{request.reviewedAt ? request.reviewerName || "Staff account" : "Awaiting review"}</strong><span>{request.reviewedAt ? `${request.reviewerEmail || "Verified staff"} · ${activityDate(request.reviewedAt)}` : "No copy released"}</span></p></div>
                {request.fulfilmentMethod === "delivery" && <div className={request.dispatchedAt ? "is-complete" : ""}><i><LuTruck /></i><p><small>STAFF DISPATCH</small><strong>{request.dispatchedAt ? request.dispatcherName || "Staff account" : "Awaiting dispatch"}</strong><span>{request.dispatchedAt ? `${request.dispatcherEmail || "Verified staff"} · ${activityDate(request.dispatchedAt)}` : "Allocated copies remain in staff custody"}</span></p></div>}
                {request.recalledAt && <div className="is-warning"><i><LuRotateCcw /></i><p><small>SAFE RECALL</small><strong>{request.recallerName || "Staff account"}</strong><span>{request.recallerEmail || "Verified staff"} · {activityDate(request.recalledAt)} · {request.recallReason}</span></p></div>}
                {request.recalledAt && request.dispatchedAt && <div className={request.recallReturnedAt ? "is-complete" : "is-warning"}><i><LuShieldCheck /></i><p><small>INDEPENDENT DESK RETURN</small><strong>{request.recallReturnedAt ? request.recallReturnerName || "Second staff account" : "Controlled return custody"}</strong><span>{request.recallReturnedAt ? `${request.recallReturnerEmail || "Verified staff"} · ${activityDate(request.recallReturnedAt)}` : "Copies are blocked from reuse until a different staff member checks them in"}</span></p></div>}
                {request.fulfilmentMethod === "delivery" && <div className={request.receivedAt ? "is-complete" : request.dispatchedAt && !request.recalledAt ? "is-warning" : ""}><i>{request.receivedAt ? <LuBadgeCheck /> : <LuHandshake />}</i><p><small>STUDENT RECEIPT</small><strong>{request.receivedAt ? "Student confirmed every book" : request.recalledAt ? "Closed without student receipt" : request.dispatchedAt ? "Student confirmation outstanding" : "Not yet available"}</strong><span>{request.receivedAt ? activityDate(request.receivedAt) : request.recalledAt ? request.recallReturnedAt || !request.dispatchedAt ? "No loan or due date was created" : "Exact copies remain unavailable in controlled custody" : request.dispatchedAt ? "Loan clock is paused until confirmation" : "Waiting for dispatch"}</span></p></div>}
                {request.fulfilmentMethod === "pickup" && <div className={request.loanId ? "is-complete" : ""}><i><LuCircleCheck /></i><p><small>LOAN CREATED</small><strong>{request.loanId ? request.loanId.slice(0, 8).toUpperCase() : "Not created"}</strong><span>{request.loanId ? "Loan started at approval" : "Awaiting a successful approval"}</span></p></div>}
              </div>

              {request.rejectionReason && <div className="request-audit-rejection"><strong>{request.recalledAt ? "Recall record" : "Reason recorded"}</strong><span>{request.rejectionReason}</span></div>}
            </article>
          ))}
          {loading && <div className="table-empty"><span className="spinner" /><strong>Loading chain-of-custody records</strong></div>}
          {!loading && !visible.length && <div className="table-empty"><LuSearch /><strong>No matching request records</strong><p>Adjust the status filter or search terms.</p></div>}
        </div>
      </section>
    </div>
  );
}
