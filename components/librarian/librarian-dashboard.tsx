"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  LuBell,
  LuBookOpen,
  LuCheck,
  LuChevronRight,
  LuCircleCheck,
  LuClock3,
  LuCreditCard,
  LuHouse,
  LuKeyRound,
  LuLibrary,
  LuLogOut,
  LuMail,
  LuMapPin,
  LuMenu,
  LuPackageCheck,
  LuReceiptText,
  LuPhone,
  LuRefreshCcw,
  LuSearch,
  LuSettings,
  LuShieldCheck,
  LuTriangleAlert,
  LuTruck,
  LuX,
  LuCircleX,
} from "react-icons/lu";
import { Brand } from "@/components/ui/brand";
import { StatusBadge } from "@/components/ui/status-badge";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import { cn, formatDate, initials } from "@/lib/utils";

type OperatorRole = "librarian" | "admin" | "super_admin";
type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";
type ReturnRequestStatus = "requested" | "accepted" | "cancelled";
type ReturnCondition = "new" | "good" | "fair" | "poor" | "damaged";

type RequestItem = {
  id: string;
  bookId: string;
  title: string;
  author: string;
  isbn: string;
  coverUrl: string | null;
  totalCopies: number;
  availableCopies: number;
  shelfLocation: string;
  copyId: string | null;
  accessionNumber: string | null;
  loanItemId: string | null;
  dueAt: string | null;
  itemStatus: string;
};

type BorrowRequest = {
  id: string;
  loanId: string | null;
  status: RequestStatus;
  fulfilmentMethod: "pickup" | "delivery";
  loanDays: number;
  deliveryFeePesewas: number;
  deliveryFloor: string | null;
  deliveryRoom: string | null;
  paymentMethod: "card" | "momo" | null;
  paymentStatus: string;
  paymentReference: string | null;
  paymentPaidAt: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewerName: string | null;
  reviewerEmail: string | null;
  dispatchedAt: string | null;
  dispatcherId: string | null;
  dispatcherName: string | null;
  dispatcherEmail: string | null;
  receivedAt: string | null;
  recalledAt: string | null;
  recallerId: string | null;
  recallerName: string | null;
  recallerEmail: string | null;
  recallReason: string | null;
  recallReturnedAt: string | null;
  recallReturnerId: string | null;
  recallReturnerName: string | null;
  recallReturnerEmail: string | null;
  rejectionReason: string | null;
  student: {
    id: string;
    fullName: string;
    indexNumber: string;
    studentEmail: string;
    phone: string;
    residenceType: string;
    residenceLocation: string;
    deliveryLocation: string;
  };
  items: RequestItem[];
};

type InventoryTitle = {
  id: string;
  title: string;
  author: string;
  isbn: string;
  format: "physical" | "digital" | "both";
  totalCopies: number;
  availableCopies: number;
  shelfLocation: string;
};

type ReturnRequest = {
  id: string;
  loanItemId: string;
  loanId: string;
  studentId: string;
  studentName: string;
  indexNumber: string;
  studentEmail: string;
  phone: string;
  bookId: string;
  bookTitle: string;
  isbn: string;
  copyId: string;
  accessionNumber: string;
  dueAt: string;
  requestedAt: string;
  status: ReturnRequestStatus;
  fineRatePesewas: number;
  overduePeriods: number;
  fineAmountPesewas: number;
  fineOutstandingPesewas: number;
  acceptedAt: string | null;
  acceptedBy: string | null;
  acceptorName: string | null;
  acceptorEmail: string | null;
  returnCondition: ReturnCondition | null;
};

type CriticalFinesAvailability = "loading" | "ready" | "unavailable";

function CediMark({ className }: { className?: string }) {
  return <span className={cn("cedi-mark", className)} aria-hidden="true">GH₵</span>;
}

type StaffCriticalFine = {
  loanItemId: string;
  loanId: string;
  studentId: string;
  studentName: string;
  indexNumber: string;
  studentEmail: string;
  personalEmail: string;
  phone: string;
  programme: string;
  department: string;
  residenceType: string;
  residenceLocation: string;
  bookId: string;
  bookTitle: string;
  author: string;
  isbn: string;
  accessionNumber: string;
  borrowedAt: string;
  dueAt: string;
  returnedAt: string | null;
  loanItemStatus: string;
  criticalSince: string | null;
  completedDaysCritical: number;
  overduePeriods: number;
  fineAmountPesewas: number;
  finePaidPesewas: number;
  fineOutstandingPesewas: number;
  finePaymentStatus: string;
  finePaymentMethod: string | null;
  finePaymentCount: number;
  finePaymentReference: string | null;
  finePaidAt: string | null;
};

type AccessState = "checking" | "authorized" | "denied" | "unavailable";

const requestSelect = [
  "id",
  "status",
  "fulfilment_method",
  "loan_days",
  "delivery_fee_pesewas",
  "delivery_location",
  "delivery_floor",
  "delivery_room",
  "payment_method",
  "payment_status",
  "payment_reference",
  "paid_at",
  "payment_paid_at",
  "requested_at",
  "reviewed_at",
  "dispatched_at",
  "student_received_at",
  "delivery_received_at",
  "receipt_confirmed_by",
  "recalled_at",
  "recalled_by",
  "recaller_id",
  "recaller_name",
  "recaller_email",
  "recall_reason",
  "recall_returned_at",
  "recall_returned_by",
  "recall_returner_id",
  "recall_returner_name",
  "recall_returner_email",
  "rejection_reason",
  "cancelled_at",
  "loan_id",
  "student_id",
  "student_name",
  "index_number",
  "student_email",
  "phone",
  "residence_type",
  "residence_location",
  "reviewed_by",
  "reviewer_id",
  "reviewer_name",
  "reviewer_email",
  "dispatched_by",
  "dispatcher_id",
  "dispatcher_name",
  "dispatcher_email",
  "items",
].join(",");

const inventorySelect = "id,title,author,isbn,format,total_copies,available_copies,shelf_location";

const returnRequestSelect = [
  "id",
  "loan_item_id",
  "loan_id",
  "student_id",
  "student_name",
  "index_number",
  "student_email",
  "book_id",
  "book_title",
  "isbn",
  "copy_id",
  "accession_number",
  "due_at",
  "requested_at",
  "status",
  "fine_rate_pesewas",
  "overdue_periods",
  "fine_amount_pesewas",
  "fine_outstanding_pesewas",
  "accepted_at",
  "accepted_by",
  "acceptor_name",
  "acceptor_email",
  "return_condition",
].join(",");

// This operational select is intentionally explicit. Guardian data, private
// student-ID paths, and face-check fields must never reach the librarian desk.
const staffCriticalFineSelect = [
  "loan_item_id",
  "loan_id",
  "student_id",
  "student_name",
  "index_number",
  "student_email",
  "student_personal_email",
  "student_phone",
  "programme",
  "department",
  "residence_type",
  "residence_location",
  "book_id",
  "book_title",
  "author",
  "isbn",
  "accession_number",
  "borrowed_at",
  "due_at",
  "returned_at",
  "loan_item_status",
  "critical_since",
  "completed_days_critical",
  "overdue_periods",
  "fine_amount_pesewas",
  "fine_paid_pesewas",
  "fine_outstanding_pesewas",
  "fine_payment_status",
  "fine_payment_method",
  "fine_payment_count",
  "fine_payment_reference",
  "fine_paid_at",
].join(",");

const legacyStaffCriticalFineSelect = "loan_item_id,loan_id,student_id,student_name,index_number,student_email,personal_email,phone,programme,department,residence_type,residence_location,book_id,book_title,isbn,accession_number,borrowed_at,due_at,returned_at,overdue_periods,fine_amount_pesewas,fine_paid_pesewas,fine_outstanding_pesewas,fine_payment_status,fine_payment_reference,fine_paid_at";

async function loadStaffCriticalFines(client: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>) {
  const current = await client.from("staff_critical_fines").select(staffCriticalFineSelect).order("due_at", { ascending: true });
  if (!current.error) return current;
  return client.from("staff_critical_fines").select(legacyStaffCriticalFineSelect).order("due_at", { ascending: true });
}

function normalizeStatus(value: unknown): RequestStatus {
  return value === "approved" || value === "rejected" || value === "cancelled" ? value : "pending";
}

function mapRequestRows(rows: Array<Record<string, unknown>>): BorrowRequest[] {
  return rows.map((row): BorrowRequest => {
    const rawItems = Array.isArray(row.items) ? row.items as Array<Record<string, unknown>> : [];
    return {
      id: String(row.id),
      loanId: row.loan_id ? String(row.loan_id) : null,
      status: normalizeStatus(row.status),
      fulfilmentMethod: row.fulfilment_method === "delivery" ? "delivery" : "pickup",
      loanDays: Number(row.loan_days || 1),
      deliveryFeePesewas: Number(row.delivery_fee_pesewas || 0),
      deliveryFloor: row.delivery_floor ? String(row.delivery_floor) : null,
      deliveryRoom: row.delivery_room ? String(row.delivery_room) : null,
      paymentMethod: row.payment_method === "card" || row.payment_method === "momo" ? row.payment_method : null,
      paymentStatus: String(row.payment_status || "not_required"),
      paymentReference: row.payment_reference ? String(row.payment_reference) : null,
      paymentPaidAt: row.payment_paid_at ? String(row.payment_paid_at) : row.paid_at ? String(row.paid_at) : null,
      requestedAt: String(row.requested_at || new Date(0).toISOString()),
      reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
      reviewedBy: row.reviewed_by ? String(row.reviewed_by) : null,
      reviewerName: row.reviewer_name ? String(row.reviewer_name) : null,
      reviewerEmail: row.reviewer_email ? String(row.reviewer_email) : null,
      dispatchedAt: row.dispatched_at ? String(row.dispatched_at) : null,
      dispatcherId: row.dispatcher_id ? String(row.dispatcher_id) : row.dispatched_by ? String(row.dispatched_by) : null,
      dispatcherName: row.dispatcher_name ? String(row.dispatcher_name) : null,
      dispatcherEmail: row.dispatcher_email ? String(row.dispatcher_email) : null,
      receivedAt: row.delivery_received_at ? String(row.delivery_received_at) : row.student_received_at ? String(row.student_received_at) : null,
      recalledAt: row.recalled_at ? String(row.recalled_at) : null,
      recallerId: row.recaller_id ? String(row.recaller_id) : row.recalled_by ? String(row.recalled_by) : null,
      recallerName: row.recaller_name ? String(row.recaller_name) : null,
      recallerEmail: row.recaller_email ? String(row.recaller_email) : null,
      recallReason: row.recall_reason ? String(row.recall_reason) : null,
      recallReturnedAt: row.recall_returned_at ? String(row.recall_returned_at) : null,
      recallReturnerId: row.recall_returner_id ? String(row.recall_returner_id) : row.recall_returned_by ? String(row.recall_returned_by) : null,
      recallReturnerName: row.recall_returner_name ? String(row.recall_returner_name) : null,
      recallReturnerEmail: row.recall_returner_email ? String(row.recall_returner_email) : null,
      rejectionReason: row.rejection_reason ? String(row.rejection_reason) : null,
      student: {
        id: String(row.student_id),
        fullName: String(row.student_name || "Incomplete profile"),
        indexNumber: String(row.index_number || "Student ID pending"),
        studentEmail: String(row.student_email || "Student email pending"),
        phone: String(row.phone || "Not provided"),
        residenceType: String(row.residence_type || "Not provided"),
        residenceLocation: String(row.residence_location || "Not provided"),
        deliveryLocation: String(row.delivery_location || "Not provided"),
      },
      items: rawItems.map((item) => ({
        id: String(item.request_item_id),
        bookId: String(item.book_id),
        title: String(item.title || "Archived title"),
        author: String(item.author || "Unknown author"),
        isbn: String(item.isbn || "No ISBN"),
        coverUrl: item.cover_url ? String(item.cover_url) : null,
        totalCopies: Number(item.total_copies || 0),
        availableCopies: Number(item.available_copies || 0),
        shelfLocation: String(item.shelf_location || "Location pending"),
        copyId: item.allocated_copy_id ? String(item.allocated_copy_id) : null,
        accessionNumber: item.accession_number ? String(item.accession_number) : null,
        loanItemId: item.loan_item_id ? String(item.loan_item_id) : null,
        dueAt: item.due_at ? String(item.due_at) : null,
        itemStatus: String(item.item_status || "pending"),
      })),
    };
  }).sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
}

function mapInventory(row: Record<string, unknown>): InventoryTitle {
  const rawFormat = String(row.format || "physical");
  return {
    id: String(row.id),
    title: String(row.title || "Untitled book"),
    author: String(row.author || "Unknown author"),
    isbn: String(row.isbn || "No ISBN"),
    format: rawFormat === "digital" || rawFormat === "both" ? rawFormat : "physical",
    totalCopies: Number(row.total_copies || 0),
    availableCopies: Number(row.available_copies || 0),
    shelfLocation: String(row.shelf_location || "Location pending"),
  };
}

function normalizeReturnStatus(value: unknown): ReturnRequestStatus {
  if (value === "accepted" || value === "cancelled") return value;
  return "requested";
}

function normalizeReturnCondition(value: unknown): ReturnCondition | null {
  return value === "new" || value === "good" || value === "fair" || value === "poor" || value === "damaged" ? value : null;
}

function mapReturnRows(rows: Array<Record<string, unknown>>): ReturnRequest[] {
  return rows.map((row): ReturnRequest => ({
    id: String(row.id),
    loanItemId: String(row.loan_item_id),
    loanId: String(row.loan_id),
    studentId: String(row.student_id),
    studentName: String(row.student_name || "Incomplete profile"),
    indexNumber: String(row.index_number || "Student ID pending"),
    studentEmail: String(row.student_email || "Student email pending"),
    phone: String(row.phone || "Not provided"),
    bookId: String(row.book_id),
    bookTitle: String(row.book_title || "Archived title"),
    isbn: String(row.isbn || "No ISBN"),
    copyId: String(row.copy_id),
    accessionNumber: String(row.accession_number || "Accession pending"),
    dueAt: String(row.due_at || new Date(0).toISOString()),
    requestedAt: String(row.requested_at || new Date(0).toISOString()),
    status: normalizeReturnStatus(row.status),
    fineRatePesewas: Number(row.fine_rate_pesewas || 0),
    overduePeriods: Number(row.overdue_periods || 0),
    fineAmountPesewas: Number(row.fine_amount_pesewas || 0),
    fineOutstandingPesewas: Number(row.fine_outstanding_pesewas || 0),
    acceptedAt: row.accepted_at ? String(row.accepted_at) : null,
    acceptedBy: row.accepted_by ? String(row.accepted_by) : null,
    acceptorName: row.acceptor_name ? String(row.acceptor_name) : null,
    acceptorEmail: row.acceptor_email ? String(row.acceptor_email) : null,
    returnCondition: normalizeReturnCondition(row.return_condition),
  })).sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
}

function mapCriticalFineRows(rows: Array<Record<string, unknown>>): StaffCriticalFine[] {
  return rows.map((row): StaffCriticalFine => ({
    loanItemId: String(row.loan_item_id || ""),
    loanId: String(row.loan_id || ""),
    studentId: String(row.student_id || ""),
    studentName: String(row.student_name || "Incomplete profile"),
    indexNumber: String(row.index_number || "Student ID pending"),
    studentEmail: String(row.student_email || "Not recorded"),
    personalEmail: String(row.student_personal_email || row.personal_email || "Not recorded"),
    phone: String(row.student_phone || row.phone || "Not recorded"),
    programme: String(row.programme || "Not recorded"),
    department: String(row.department || "Not recorded"),
    residenceType: String(row.residence_type || "Not recorded"),
    residenceLocation: String(row.residence_location || "Not recorded"),
    bookId: String(row.book_id || ""),
    bookTitle: String(row.book_title || "Archived title"),
    author: String(row.author || "Unknown author"),
    isbn: String(row.isbn || "Not recorded"),
    accessionNumber: String(row.accession_number || "Not recorded"),
    borrowedAt: String(row.borrowed_at || ""),
    dueAt: String(row.due_at || ""),
    returnedAt: row.returned_at ? String(row.returned_at) : null,
    loanItemStatus: String(row.loan_item_status || "Not recorded"),
    criticalSince: row.critical_since ? String(row.critical_since) : null,
    completedDaysCritical: Math.max(0, Number(row.completed_days_critical || 0)),
    overduePeriods: Math.max(0, Number(row.overdue_periods || 0)),
    fineAmountPesewas: Math.max(0, Number(row.fine_amount_pesewas || 0)),
    finePaidPesewas: Math.max(0, Number(row.fine_paid_pesewas || 0)),
    fineOutstandingPesewas: Math.max(0, Number(row.fine_outstanding_pesewas || 0)),
    finePaymentStatus: String(row.fine_payment_status || "unpaid"),
    finePaymentMethod: row.fine_payment_method ? String(row.fine_payment_method) : null,
    finePaymentCount: Math.max(0, Number(row.fine_payment_count || 0)),
    finePaymentReference: row.fine_payment_reference ? String(row.fine_payment_reference) : null,
    finePaidAt: row.fine_paid_at ? String(row.fine_paid_at) : null,
  })).sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
}

function matchesRequest(request: BorrowRequest, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    request.id,
    request.student.fullName,
    request.student.indexNumber,
    request.student.studentEmail,
    request.student.phone,
    request.student.residenceLocation,
    request.student.deliveryLocation,
    request.deliveryFloor,
    request.deliveryRoom,
    request.paymentMethod,
    request.paymentStatus,
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
    ...request.items.flatMap((item) => [item.title, item.author, item.isbn, item.accessionNumber]),
  ].some((value) => String(value || "").toLowerCase().includes(normalized));
}

function matchesReturnRequest(request: ReturnRequest, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    request.id,
    request.loanItemId,
    request.loanId,
    request.studentName,
    request.indexNumber,
    request.studentEmail,
    request.phone,
    request.bookTitle,
    request.isbn,
    request.copyId,
    request.accessionNumber,
    request.acceptorName,
    request.acceptorEmail,
    request.returnCondition,
  ].some((value) => String(value || "").toLowerCase().includes(normalized));
}

function matchesCriticalFine(record: StaffCriticalFine, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    record.loanItemId,
    record.loanId,
    record.studentId,
    record.studentName,
    record.indexNumber,
    record.studentEmail,
    record.personalEmail,
    record.phone,
    record.programme,
    record.department,
    record.residenceType,
    record.residenceLocation,
    record.bookId,
    record.bookTitle,
    record.author,
    record.isbn,
    record.accessionNumber,
    record.loanItemStatus,
    record.finePaymentStatus,
    record.finePaymentMethod,
    record.finePaymentReference,
  ].some((value) => String(value || "").toLowerCase().includes(normalized));
}

function formatMoney(pesewas: number) {
  return "GHS " + (pesewas / 100).toFixed(2);
}

function formatCriticalCedis(pesewas: number) {
  return "GH₵ " + (Math.max(0, pesewas) / 100).toFixed(2);
}

function formatResidence(value: string) {
  return value === "on-campus" ? "On campus" : value === "off-campus" ? "Off campus" : value.replaceAll("-", " ");
}

function formatActivityTime(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function requestOutcomeLabel(request: BorrowRequest) {
  if (request.recalledAt) return request.recallReturnedAt || !request.dispatchedAt
    ? "Delivery recalled and copies secured"
    : "Delivery recalled · desk return pending";
  if (request.status === "approved") return request.fulfilmentMethod === "delivery" ? "Approved for campus delivery" : "Approved and loan created";
  if (request.status === "rejected") return "Rejected";
  if (request.status === "cancelled") return "Cancelled by student";
  return "Awaiting staff review";
}

function paymentMethodLabel(value: BorrowRequest["paymentMethod"]) {
  return value === "momo" ? "Mobile money" : value === "card" ? "Card" : "Not required";
}

function criticalFinePaymentState(record: StaffCriticalFine) {
  if (record.fineAmountPesewas > 0 && record.fineOutstandingPesewas <= 0) return "paid" as const;
  if (record.finePaidPesewas > 0) return "part-paid" as const;
  return "outstanding" as const;
}

function formatOptionalActivityTime(value: string | null) {
  if (!value) return "Not recorded";
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? "Not recorded" : formatActivityTime(value);
}

function humanizeStaffValue(value: string) {
  const normalized = value.trim();
  return normalized ? normalized.replaceAll("_", " ").replaceAll("-", " ") : "Not recorded";
}

function LibrarianCriticalFinesSection({ records, availability, query, setQuery }: { records: StaffCriticalFine[]; availability: CriticalFinesAvailability; query: string; setQuery: (value: string) => void }) {
  const [filter, setFilter] = useState<"outstanding" | "paid" | "all">("outstanding");
  const outstanding = records.filter((record) => record.fineOutstandingPesewas > 0);
  const paid = records.filter((record) => criticalFinePaymentState(record) === "paid");
  const outstandingAmount = outstanding.reduce((sum, record) => sum + record.fineOutstandingPesewas, 0);
  const paidAmount = records.reduce((sum, record) => sum + record.finePaidPesewas, 0);
  const visible = useMemo(() => records.filter((record) => {
    const paymentState = criticalFinePaymentState(record);
    const matchesFilter = filter === "all" || (filter === "paid" ? paymentState === "paid" : paymentState !== "paid");
    return matchesFilter && matchesCriticalFine(record, query);
  }), [filter, query, records]);

  return (
    <section className="critical-fines-register librarian-critical-fines" id="librarian-critical-fines" aria-labelledby="librarian-critical-fines-title">
      <div className="critical-fines-toolbar">
        <div><span>GH₵ · 48-HOUR ESCALATIONS</span><h2 id="librarian-critical-fines-title">Critical fines</h2><p>Contact students and track the exact unpaid amount on each specific borrow after the 48-hour fine threshold.</p></div>
        <label><LuSearch /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search student, book, loan or payment reference" aria-label="Search librarian critical fines" /></label>
      </div>

      <div className="critical-fines-inline-kpis" aria-label="Critical fine ledger totals">
        <p><small>Open accounts</small><strong>{outstanding.length}</strong></p>
        <p className={outstandingAmount ? "has-balance" : ""}><small>Outstanding now</small><strong>{formatCriticalCedis(outstandingAmount)}</strong></p>
        <p><small>Payments recorded</small><strong>{formatCriticalCedis(paidAmount)}</strong></p>
        <p><small>Fully settled</small><strong>{paid.length}</strong></p>
      </div>

      <div className="critical-fines-filters" role="tablist" aria-label="Critical fine payment status">
        <button type="button" role="tab" aria-selected={filter === "outstanding"} className={filter === "outstanding" ? "is-active" : ""} onClick={() => setFilter("outstanding")}>Outstanding <span>{outstanding.length}</span></button>
        <button type="button" role="tab" aria-selected={filter === "paid"} className={filter === "paid" ? "is-active" : ""} onClick={() => setFilter("paid")}>Paid <span>{paid.length}</span></button>
        <button type="button" role="tab" aria-selected={filter === "all"} className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}>All tracked <span>{records.length}</span></button>
      </div>

      <div className="critical-fines-privacy"><LuShieldCheck /><p><strong>Operational profile only</strong><span>This view does not query guardian details, student ID-card files, private object paths, or face-check data.</span></p></div>

      {availability === "loading" && <div className="critical-fines-state" aria-live="polite"><span className="spinner" /><strong>Loading critical fines…</strong><p>Matching current loans and payment records.</p></div>}
      {availability === "unavailable" && <div className="critical-fines-state critical-fines-state--unavailable"><LuTriangleAlert /><strong>Critical fines view unavailable</strong><p>This isolated register has not been installed or is temporarily unavailable. Borrow, return, and inventory work can continue normally.</p></div>}
      {availability === "ready" && (
        <div className="critical-fine-card-list critical-fine-card-list--staff" aria-live="polite">
          {visible.map((record) => {
            const paymentState = criticalFinePaymentState(record);
            return (
              <article className={cn("critical-fine-card", paymentState === "paid" && "is-paid")} key={record.loanItemId}>
                <header>
                  <div className="critical-fine-person"><span>{initials(record.studentName)}</span><p><strong>{record.studentName}</strong><small>{record.indexNumber}</small><small>{record.studentEmail}</small></p></div>
                  <span className={cn("critical-fine-payment-state", "is-" + paymentState)}>{paymentState === "part-paid" ? "Part-paid · balance open" : paymentState}</span>
                </header>
                <div className="critical-fine-card__summary">
                  <p><small>Book &amp; exact copy</small><strong>{record.bookTitle}</strong><span>{record.author} · {record.isbn} · Accession {record.accessionNumber}</span></p>
                  <p><small>Critical age</small><strong>{record.overduePeriods} overdue periods · {record.completedDaysCritical} critical days</strong><span>Critical since {formatOptionalActivityTime(record.criticalSince)} · {humanizeStaffValue(record.loanItemStatus)}</span></p>
                  <p className={record.fineOutstandingPesewas > 0 ? "has-balance" : ""}><small>Outstanding now</small><strong>{formatCriticalCedis(record.fineOutstandingPesewas)}</strong><span>{formatCriticalCedis(record.finePaidPesewas)} paid of {formatCriticalCedis(record.fineAmountPesewas)}</span></p>
                </div>
                <details className="critical-fine-card__details">
                  <summary>View complete operational record <LuChevronRight /></summary>
                  <div className="critical-fine-detail-grid">
                    <section><span>STUDENT &amp; CONTACT</span><dl><div><dt>Database student ID</dt><dd>{record.studentId}</dd></div><div><dt>KNUST email</dt><dd>{record.studentEmail}</dd></div><div><dt>Personal email</dt><dd>{record.personalEmail}</dd></div><div><dt>Phone</dt><dd>{record.phone}</dd></div><div><dt>Programme</dt><dd>{record.programme}</dd></div><div><dt>Department</dt><dd>{record.department}</dd></div><div><dt>Residence</dt><dd>{formatResidence(record.residenceType)} · {record.residenceLocation}</dd></div></dl></section>
                    <section><span>LOAN &amp; EXACT COPY</span><dl><div><dt>Book ID</dt><dd>{record.bookId}</dd></div><div><dt>Loan ID</dt><dd>{record.loanId}</dd></div><div><dt>Loan item ID</dt><dd>{record.loanItemId}</dd></div><div><dt>Borrowed</dt><dd>{formatOptionalActivityTime(record.borrowedAt)}</dd></div><div><dt>Due</dt><dd>{formatOptionalActivityTime(record.dueAt)}</dd></div><div><dt>Returned</dt><dd>{formatOptionalActivityTime(record.returnedAt)}</dd></div></dl></section>
                    <section><span>PAYMENT LEDGER</span><dl><div><dt>Assessed</dt><dd>{formatCriticalCedis(record.fineAmountPesewas)}</dd></div><div><dt>Paid</dt><dd>{formatCriticalCedis(record.finePaidPesewas)}</dd></div><div><dt>Outstanding</dt><dd>{formatCriticalCedis(record.fineOutstandingPesewas)}</dd></div><div><dt>Recorded status</dt><dd>{humanizeStaffValue(record.finePaymentStatus)}</dd></div><div><dt>Method</dt><dd>{record.finePaymentMethod ? humanizeStaffValue(record.finePaymentMethod) : "Not recorded"}</dd></div><div><dt>Payment entries</dt><dd>{record.finePaymentCount}</dd></div><div><dt>Reference</dt><dd>{record.finePaymentReference || "No payment reference"}</dd></div><div><dt>Paid at</dt><dd>{formatOptionalActivityTime(record.finePaidAt)}</dd></div></dl></section>
                  </div>
                </details>
              </article>
            );
          })}
          {!visible.length && <div className="critical-fines-state"><LuCircleCheck /><strong>{filter === "outstanding" ? "No unpaid critical fines" : "No matching critical fine records"}</strong><p>{filter === "outstanding" ? "Every 48-hour fine currently in the register is settled." : "Try another payment state or search term."}</p></div>}
        </div>
      )}
    </section>
  );
}

export function LibrarianDashboard() {
  const router = useRouter();
  const [access, setAccess] = useState<AccessState>("checking");
  const [operatorName, setOperatorName] = useState("Librarian");
  const [operatorId, setOperatorId] = useState("");
  const [operatorEmail, setOperatorEmail] = useState("");
  const [operatorRole, setOperatorRole] = useState<OperatorRole>("librarian");
  const [requests, setRequests] = useState<BorrowRequest[]>([]);
  const [returnRequests, setReturnRequests] = useState<ReturnRequest[]>([]);
  const [criticalFines, setCriticalFines] = useState<StaffCriticalFine[]>([]);
  const [criticalFinesAvailability, setCriticalFinesAvailability] = useState<CriticalFinesAvailability>("loading");
  const [inventory, setInventory] = useState<InventoryTitle[]>([]);
  const [filter, setFilter] = useState<RequestStatus | "recalled" | "all">("pending");
  const [returnFilter, setReturnFilter] = useState<ReturnRequestStatus | "all">("requested");
  const [query, setQuery] = useState("");
  const [activeDeskSection, setActiveDeskSection] = useState<"borrows" | "returns" | "critical-fines" | "inventory">("borrows");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<BorrowRequest | null>(null);
  const [acceptingReturn, setAcceptingReturn] = useState<ReturnRequest | null>(null);
  const [returnCondition, setReturnCondition] = useState<ReturnCondition>("good");
  const [physicalReturnConfirmed, setPhysicalReturnConfirmed] = useState(false);
  const [resolutionMode, setResolutionMode] = useState<"reject" | "recall">("reject");
  const [rejectionReason, setRejectionReason] = useState("");
  const [sendingReset, setSendingReset] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const knownPending = useRef<Set<string> | null>(null);
  const knownPendingReturns = useRef<Set<string> | null>(null);

  const refresh = useCallback(async (silent = false) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !isSupabaseConfigured) {
      setAccess("unavailable");
      return;
    }
    if (!silent) setRefreshing(true);

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      setAccess("denied");
      setRefreshing(false);
      router.replace("/sign-in");
      return;
    }

    const profileResult = await supabase.from("profiles").select("full_name,email,personal_email,role,status").eq("id", userData.user.id).maybeSingle();
    const profile = profileResult.data;
    if (!profile || profile.status !== "active") {
      setAccess("denied");
      setRefreshing(false);
      return;
    }
    if (profile.role === "student") {
      setRefreshing(false);
      router.replace("/library");
      return;
    }
    if (profile.role !== "librarian" && profile.role !== "admin" && profile.role !== "super_admin") {
      setAccess("denied");
      setRefreshing(false);
      return;
    }

    setOperatorName(profile.full_name || "Library operator");
    setOperatorId(userData.user.id);
    setOperatorEmail(profile.personal_email || profile.email || userData.user.email || "");
    setOperatorRole(profile.role);

    const [requestResult, returnRequestResult, inventoryResult, criticalFineResult] = await Promise.all([
      supabase.from("staff_borrow_requests").select(requestSelect).order("requested_at", { ascending: false }),
      supabase.from("staff_return_requests").select(returnRequestSelect).order("requested_at", { ascending: false }),
      supabase.from("catalog_books").select(inventorySelect).order("title"),
      loadStaffCriticalFines(supabase),
    ]);

    if (requestResult.error && !silent) toast.error("Borrow requests could not be refreshed. Please retry in a moment.");
    if (inventoryResult.error && !silent) toast.error("Live inventory could not be refreshed. Please retry in a moment.");
    if (!requestResult.error) {
      const grouped = mapRequestRows((requestResult.data ?? []) as unknown as Array<Record<string, unknown>>);
      const nextPending = new Set(grouped.filter((item) => item.status === "pending").map((item) => item.id));
      if (knownPending.current) {
        const additions = Array.from(nextPending).filter((id) => !knownPending.current?.has(id)).length;
        if (additions > 0) toast.success(additions + " new borrow request" + (additions === 1 ? "" : "s") + " received.");
      }
      knownPending.current = nextPending;
      setRequests(grouped);
    }
    if (!returnRequestResult.error) {
      const mappedReturns = mapReturnRows((returnRequestResult.data ?? []) as unknown as Array<Record<string, unknown>>);
      const nextPendingReturns = new Set(mappedReturns.filter((item) => item.status === "requested").map((item) => item.id));
      if (knownPendingReturns.current) {
        const additions = Array.from(nextPendingReturns).filter((id) => !knownPendingReturns.current?.has(id)).length;
        if (additions > 0) toast.success(additions + " new return request" + (additions === 1 ? "" : "s") + " received.");
      }
      knownPendingReturns.current = nextPendingReturns;
      setReturnRequests(mappedReturns);
    } else if (!silent) setReturnRequests([]);
    if (criticalFineResult.error) {
      setCriticalFines([]);
      setCriticalFinesAvailability("unavailable");
    } else {
      setCriticalFines(mapCriticalFineRows((criticalFineResult.data ?? []) as unknown as Array<Record<string, unknown>>));
      setCriticalFinesAvailability("ready");
    }
    if (!inventoryResult.error) setInventory((inventoryResult.data ?? []).map((row) => mapInventory(row as Record<string, unknown>)));
    setLastUpdated(new Date());
    setAccess("authorized");
    setRefreshing(false);
  }, [router]);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(initial);
  }, [refresh]);

  useEffect(() => {
    if (access !== "authorized") return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh(true);
    }, 20_000);
    return () => window.clearInterval(interval);
  }, [access, refresh]);

  useEffect(() => {
    if (access !== "authorized" || !operatorId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let refreshTimer: number | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => void refresh(true), 250);
    };
    const channel = supabase
      .channel("librarian-return-desk:" + operatorId)
      .on("postgres_changes", { event: "*", schema: "public", table: "return_requests" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "loan_items" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "fine_payments" }, scheduleRefresh)
      .subscribe();
    return () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [access, operatorId, refresh]);

  useEffect(() => {
    if (!rejecting && !acceptingReturn) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !actingOn) {
        setRejecting(null);
        setAcceptingReturn(null);
        setPhysicalReturnConfirmed(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [acceptingReturn, actingOn, rejecting]);

  const pendingRequests = requests.filter((item) => item.status === "pending");
  const pendingReturnRequests = returnRequests.filter((item) => item.status === "requested");
  const outstandingCriticalFines = criticalFines.filter((item) => item.fineOutstandingPesewas > 0);
  const outstandingCriticalAmount = outstandingCriticalFines.reduce((sum, item) => sum + item.fineOutstandingPesewas, 0);
  const pendingItems = pendingRequests.reduce((sum, item) => sum + item.items.length, 0);
  const availableCopies = inventory.reduce((sum, item) => sum + item.availableCopies, 0);
  const readyRequests = pendingRequests.filter((item) => item.items.every((book) => book.availableCopies > 0)).length;
  const visibleRequests = useMemo(
    () => requests.filter((item) => (
      filter === "all"
      || (filter === "recalled" ? Boolean(item.recalledAt) : item.status === filter && (filter !== "rejected" || !item.recalledAt))
    ) && matchesRequest(item, query)),
    [filter, query, requests],
  );
  const visibleReturnRequests = useMemo(
    () => returnRequests.filter((item) => (returnFilter === "all" || item.status === returnFilter) && matchesReturnRequest(item, query)),
    [query, returnFilter, returnRequests],
  );
  const visibleInventory = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return inventory.filter((item) => !normalized || [item.title, item.author, item.isbn, item.shelfLocation].some((value) => value.toLowerCase().includes(normalized)));
  }, [inventory, query]);

  const openAcceptReturn = (request: ReturnRequest) => {
    setReturnCondition("good");
    setPhysicalReturnConfirmed(false);
    setAcceptingReturn(request);
  };

  const acceptReturn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!acceptingReturn || !physicalReturnConfirmed) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setActingOn(acceptingReturn.id);
    const { error } = await supabase.rpc("accept_return_request", {
      p_return_request_id: acceptingReturn.id,
      p_condition: returnCondition,
    });
    setActingOn(null);
    if (error) return void toast.error(error.message);
    toast.success("Return accepted. The exact copy is back in tracked inventory.");
    setAcceptingReturn(null);
    setPhysicalReturnConfirmed(false);
    await refresh(true);
  };

  const approve = async (request: BorrowRequest) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setActingOn(request.id);
    const { data, error } = await supabase.rpc("approve_borrow_request", { p_request_id: request.id });
    setActingOn(null);
    if (error) return void toast.error(error.message);
    toast.success(request.fulfilmentMethod === "delivery"
      ? "Delivery approved. A staff member can now mark it dispatched."
      : "Request approved" + (data ? " and loan " + String(data).slice(0, 8) + " created." : "."));
    await refresh(true);
  };

  const dispatchDelivery = async (request: BorrowRequest) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setActingOn(request.id);
    const { data, error } = await supabase.rpc("staff_mark_delivery_dispatched", { p_request_id: request.id });
    setActingOn(null);
    if (error) return void toast.error(error.message);
    toast.success("Delivery dispatched" + (data ? " at " + formatActivityTime(String(data)) + "." : "."));
    await refresh(true);
  };

  const confirmRecalledReturn = async (request: BorrowRequest) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setActingOn(request.id);
    const { data, error } = await supabase.rpc("staff_confirm_recalled_delivery_return", { p_request_id: request.id });
    setActingOn(null);
    if (error) return void toast.error(error.message);
    toast.success("Independent desk return confirmed" + (data ? " at " + formatActivityTime(String(data)) + "." : "."));
    await refresh(true);
  };

  const reject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!rejecting) return;
    const reason = rejectionReason.trim();
    if (reason.length < 3) return void toast.error("Add a short reason the student can understand.");
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setActingOn(rejecting.id);
    const { error } = resolutionMode === "recall"
      ? await supabase.rpc("staff_recall_delivery_request", { p_request_id: rejecting.id, p_reason: reason })
      : await supabase.rpc("reject_borrow_request", { p_request_id: rejecting.id, p_reason: reason });
    setActingOn(null);
    if (error) return void toast.error(error.message);
    toast.success(resolutionMode === "recall"
      ? rejecting.dispatchedAt
        ? "Delivery recalled. Copies are locked from reuse until a different staff member confirms their return."
        : "Delivery recalled, held copies released, and the student notified."
      : "Request rejected and the student was notified.");
    setRejecting(null);
    setRejectionReason("");
    await refresh(true);
  };

  const signOut = async () => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
    router.push("/sign-in");
    router.refresh();
  };

  const requestPasswordReset = async () => {
    if (!operatorEmail) return void toast.error("No personal email is available for this staff account.");
    setSendingReset(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: operatorEmail }),
      });
      const result = await response.json() as { message?: string };
      toast.success(result.message || "Check your personal email for password-reset instructions.");
    } catch {
      toast.error("Password recovery is temporarily unavailable. Please try again.");
    } finally {
      setSendingReset(false);
    }
  };

  const showPending = () => {
    setActiveDeskSection("borrows");
    setFilter("pending");
    setMobileMenu(false);
    document.getElementById("librarian-requests")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const showReturns = () => {
    setActiveDeskSection("returns");
    setReturnFilter("requested");
    setMobileMenu(false);
    document.getElementById("librarian-returns")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const showCriticalFines = () => {
    setActiveDeskSection("critical-fines");
    setMobileMenu(false);
    document.getElementById("librarian-critical-fines")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const showInventory = () => {
    setActiveDeskSection("inventory");
    setMobileMenu(false);
    document.getElementById("librarian-inventory")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const showSettings = () => {
    document.getElementById("librarian-settings")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (access === "checking") return <div className="admin-auth-state"><span className="spinner" /><p>Opening the secure librarian desk…</p></div>;
  if (access === "unavailable") return <div className="admin-auth-state"><span><LuTriangleAlert /></span><h1>Supabase setup required</h1><p>The librarian desk only works with the live database and role policies enabled.</p><Link href="/sign-in" className="button button--primary">Return to sign in</Link></div>;
  if (access === "denied") return <div className="admin-auth-state"><span><LuShieldCheck /></span><h1>Librarian access required</h1><p>This operational desk is restricted to active librarians and administrators.</p><Link href="/sign-in" className="button button--primary">Return to sign in</Link></div>;

  return (
    <div className="librarian-app">
      <aside className={cn("librarian-sidebar", mobileMenu && "librarian-sidebar--open")}>
        <div className="librarian-sidebar__brand"><Brand href="/librarian" /><button className="icon-button" type="button" onClick={() => setMobileMenu(false)} aria-label="Close navigation"><LuX /></button></div>
        <div className="librarian-portal-label"><span>LIBRARIAN DESK</span><small>Circulation operations</small></div>
        <nav className="librarian-nav" aria-label="Librarian navigation">
          <button className={activeDeskSection === "borrows" ? "is-active" : ""} type="button" onClick={showPending}><LuClock3 /><span>Borrow requests</span>{pendingRequests.length > 0 && <b>{pendingRequests.length}</b>}</button>
          <button className={activeDeskSection === "returns" ? "is-active" : ""} type="button" onClick={showReturns}><LuPackageCheck /><span>Return requests</span>{pendingReturnRequests.length > 0 && <b>{pendingReturnRequests.length}</b>}</button>
          <button className={activeDeskSection === "critical-fines" ? "is-active" : ""} type="button" onClick={showCriticalFines}><CediMark /><span>Critical fines</span>{outstandingCriticalFines.length > 0 && <b>{outstandingCriticalFines.length}</b>}</button>
          <button className={activeDeskSection === "inventory" ? "is-active" : ""} type="button" onClick={showInventory}><LuLibrary /><span>Availability</span></button>
          <button type="button" onClick={showSettings}><LuSettings /><span>Settings &amp; recovery</span></button>
          {operatorRole !== "librarian" && <Link href="/admin"><LuShieldCheck /><span>Admin dashboard</span><LuChevronRight /></Link>}
        </nav>
        <div className="librarian-privacy-note"><LuShieldCheck /><p><strong>Operational data only</strong><span>This desk never exposes guardian details, student ID images, or facial data.</span></p></div>
        <button className="librarian-signout" type="button" onClick={() => void signOut()}><LuLogOut /><span>Sign out</span></button>
      </aside>
      {mobileMenu && <button className="sidebar-scrim" type="button" onClick={() => setMobileMenu(false)} aria-label="Close navigation" />}

      <div className="librarian-main">
        <header className="librarian-header">
          <button className="icon-button librarian-menu-button" type="button" onClick={() => setMobileMenu(true)} aria-label="Open navigation"><LuMenu /></button>
          <label className="librarian-search"><LuSearch /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search student, book, ISBN or copy…" aria-label="Search the librarian desk" /></label>
          <div className="librarian-header__actions">
            <button className="icon-button" type="button" onClick={() => void refresh()} disabled={refreshing} aria-label="Refresh live data"><LuRefreshCcw className={refreshing ? "is-spinning" : ""} /></button>
            <button className="icon-button librarian-alert-button" type="button" onClick={outstandingCriticalFines.length > 0 ? showCriticalFines : pendingReturnRequests.length > 0 ? showReturns : showPending} aria-label={outstandingCriticalFines.length + pendingRequests.length + pendingReturnRequests.length + " pending circulation and fine actions"}><LuBell />{outstandingCriticalFines.length + pendingRequests.length + pendingReturnRequests.length > 0 && <b>{outstandingCriticalFines.length + pendingRequests.length + pendingReturnRequests.length}</b>}</button>
            <div className="librarian-profile"><span>{initials(operatorName)}</span><p><strong>{operatorName}</strong><small>{operatorEmail || "Personal email unavailable"}</small><em>{operatorRole.replace("_", " ")}</em></p></div>
          </div>
        </header>

        <main className="librarian-content">
          <div className="librarian-heading"><div><span>LIVE CIRCULATION</span><h1>Circulation desk</h1><p>Review new borrows, verify physical returns, and keep every copy accountable.</p></div><small>{lastUpdated ? "Updated " + lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Syncing live data…"}</small></div>

          <section className="librarian-kpi-grid" aria-label="Librarian overview">
            <article><span><LuClock3 /></span><p><small>Pending borrows</small><strong>{pendingRequests.length}</strong></p></article>
            <article><span><LuPackageCheck /></span><p><small>Pending returns</small><strong>{pendingReturnRequests.length}</strong></p></article>
            <article className={outstandingCriticalAmount > 0 ? "has-attention" : ""}><span><CediMark /></span><p><small>Critical fine balance</small><strong>{formatCriticalCedis(outstandingCriticalAmount)}</strong></p></article>
            <article><span><LuBookOpen /></span><p><small>Books requested</small><strong>{pendingItems}</strong></p></article>
            <article><span><LuCircleCheck /></span><p><small>Ready to approve</small><strong>{readyRequests}</strong></p></article>
            <article><span><LuPackageCheck /></span><p><small>Available copies</small><strong>{availableCopies}</strong></p></article>
          </section>

          <LibrarianCriticalFinesSection records={criticalFines} availability={criticalFinesAvailability} query={query} setQuery={setQuery} />

          <section className="librarian-return-panel" id="librarian-returns" aria-labelledby="librarian-return-title">
            <div className="librarian-return-panel__heading">
              <div><span>CONTROLLED RETURNS</span><h2 id="librarian-return-title">Student return requests</h2><p>Accept a request only after the exact accessioned copy is physically at the desk and its condition is checked.</p></div>
              <strong>{pendingReturnRequests.length} waiting</strong>
            </div>
            <div className="librarian-tabs" role="tablist" aria-label="Return request status">
              {(["requested", "accepted", "cancelled", "all"] as const).map((status) => (
                <button key={status} type="button" role="tab" aria-selected={returnFilter === status} className={returnFilter === status ? "is-active" : ""} onClick={() => setReturnFilter(status)}>
                  {status === "requested" ? "Waiting" : status === "all" ? "All returns" : status}
                  <span>{status === "all" ? returnRequests.length : returnRequests.filter((item) => item.status === status).length}</span>
                </button>
              ))}
            </div>
            <div className="librarian-return-list" aria-live="polite">
              {visibleReturnRequests.map((request) => (
                <article className="librarian-return-card" key={request.id}>
                  <header>
                    <div className="librarian-request-student"><span>{initials(request.studentName)}</span><p><strong>{request.studentName}</strong><small>{request.indexNumber}</small><small>{request.studentEmail}</small></p></div>
                    <div><StatusBadge status={request.status === "requested" ? "return requested" : request.status} /><small>Requested {formatActivityTime(request.requestedAt)}</small></div>
                  </header>
                  <div className="librarian-return-card__book">
                    <span><LuBookOpen /></span>
                    <p><small>BOOK &amp; EXACT COPY</small><strong>{request.bookTitle}</strong><em>{request.isbn} · Accession {request.accessionNumber}</em></p>
                    <code title={request.copyId}>{request.copyId.slice(0, 8).toUpperCase()}</code>
                  </div>
                  <div className="librarian-return-details">
                    <p><LuPhone /><span><small>Student contact</small><strong>{request.phone}</strong></span></p>
                    <p><LuClock3 /><span><small>Due date</small><strong>{formatActivityTime(request.dueAt)}</strong></span></p>
                    <p><LuReceiptText /><span><small>Fine policy</small><strong>{formatMoney(request.fineRatePesewas)} per overdue 24 hours</strong></span></p>
                    <p className={request.fineOutstandingPesewas > 0 ? "has-fine" : ""}><LuTriangleAlert /><span><small>Current outstanding fine</small><strong>{formatMoney(request.fineOutstandingPesewas)} · {request.overduePeriods} overdue period{request.overduePeriods === 1 ? "" : "s"}</strong></span></p>
                  </div>
                  <div className="librarian-return-ledger">
                    <span><strong>Assessed fine</strong><em>{formatMoney(request.fineAmountPesewas)}</em></span>
                    <span><strong>Outstanding at this return</strong><em>{formatMoney(request.fineOutstandingPesewas)}</em></span>
                    <span><strong>Loan record</strong><em>{request.loanId.slice(0, 8).toUpperCase()}</em></span>
                    <span><strong>Loan item</strong><em>{request.loanItemId.slice(0, 8).toUpperCase()}</em></span>
                  </div>
                  {request.acceptedAt && (
                    <div className="librarian-return-accepted"><LuCircleCheck /><p><strong>Accepted {formatActivityTime(request.acceptedAt)}</strong><span>{request.acceptorName || "Staff account"}{request.acceptorEmail ? " · " + request.acceptorEmail : ""} · Condition {request.returnCondition || "recorded"}</span></p></div>
                  )}
                  <footer>
                    <span>Return <strong>{request.id.slice(0, 8).toUpperCase()}</strong></span>
                    {request.status === "requested" ? <button className="button button--gold" type="button" onClick={() => openAcceptReturn(request)} disabled={actingOn === request.id}><LuPackageCheck /> {actingOn === request.id ? "Accepting…" : "Accept return"}</button> : <strong className="librarian-delivery-state">{request.status === "accepted" ? "Inventory restored" : "Request cancelled"}</strong>}
                  </footer>
                </article>
              ))}
              {!visibleReturnRequests.length && <div className="librarian-empty"><LuPackageCheck /><strong>No matching return requests</strong><p>{returnFilter === "requested" ? "There are no physical returns waiting for staff acceptance." : "Try another return status or search term."}</p></div>}
            </div>
          </section>

          <div className="librarian-workspace">
            <section className="librarian-request-panel" id="librarian-requests">
              <div className="librarian-tabs" role="tablist" aria-label="Borrow request status">
                {(["pending", "approved", "recalled", "rejected", "cancelled", "all"] as const).map((status) => <button key={status} type="button" role="tab" aria-selected={filter === status} className={filter === status ? "is-active" : ""} onClick={() => setFilter(status)}>{status === "all" ? "All requests" : status}<span>{status === "all" ? requests.length : status === "recalled" ? requests.filter((item) => item.recalledAt).length : requests.filter((item) => item.status === status && !item.recalledAt).length}</span></button>)}
              </div>
              <div className="librarian-request-list">
                {visibleRequests.map((request) => (
                  <article className="librarian-request-card" key={request.id}>
                    <header>
                      <div className="librarian-request-student"><span>{initials(request.student.fullName)}</span><p><strong>{request.student.fullName}</strong><small>{request.student.indexNumber}</small><small>{request.student.studentEmail}</small></p></div>
                      <div><StatusBadge status={request.recalledAt ? "recalled" : request.status} /><small>Requested {formatDate(request.requestedAt, { weekday: "short" })}</small></div>
                    </header>

                    <div className="librarian-contact-grid">
                      <p><LuPhone /><span><small>Phone</small><strong>{request.student.phone}</strong></span></p>
                      <p><LuHouse /><span><small>Residence</small><strong>{formatResidence(request.student.residenceType)} · {request.student.residenceLocation}</strong></span></p>
                      <p><LuClock3 /><span><small>Loan period</small><strong>{request.loanDays} day{request.loanDays === 1 ? "" : "s"} from {request.fulfilmentMethod === "delivery" ? "student receipt" : "approval"}</strong></span></p>
                      <p><LuTruck /><span><small>Fulfilment & fee</small><strong>{request.fulfilmentMethod === "delivery" ? "Campus delivery · GHS " + (request.deliveryFeePesewas / 100).toFixed(2) : "Desk pickup · Free"}</strong></span></p>
                      {request.fulfilmentMethod === "delivery" && <p className="librarian-contact-grid__wide"><LuMapPin /><span><small>Delivery destination</small><strong>{request.student.deliveryLocation} · Floor {request.deliveryFloor || "not provided"} · Room {request.deliveryRoom || "not provided"}</strong></span></p>}
                      {request.fulfilmentMethod === "delivery" && <p className="librarian-contact-grid__wide"><LuCreditCard /><span><small>Simulated payment · no payment secrets stored</small><strong>{paymentMethodLabel(request.paymentMethod)} · {request.paymentStatus === "simulated_paid" ? "Simulated paid" : request.paymentStatus.replaceAll("_", " ")}{request.paymentReference ? " · Ref " + request.paymentReference : ""}{request.paymentPaidAt ? " · " + formatActivityTime(request.paymentPaidAt) : ""}</strong></span></p>}
                    </div>

                    <div className="librarian-request-books">
                      {request.items.map((item) => (
                        <div key={item.id}>
                          <span className={item.availableCopies > 0 ? "is-available" : "is-unavailable"}><LuBookOpen /></span>
                          <p><strong>{item.title}</strong><small>{item.author} · {item.isbn}</small><small>{item.accessionNumber ? "Allocated " + item.accessionNumber : item.shelfLocation}</small></p>
                          <em className={item.availableCopies > 0 ? "is-available" : "is-unavailable"}>{item.availableCopies} / {item.totalCopies} available</em>
                        </div>
                      ))}
                    </div>

                    <div className={cn("librarian-request-history", request.fulfilmentMethod === "delivery" && "librarian-request-history--delivery")} aria-label="Request activity history">
                      <div><i /><p><small>REQUESTED</small><strong>{formatActivityTime(request.requestedAt)}</strong><span>Submitted by {request.student.fullName}</span></p></div>
                      <div className={request.reviewedAt || request.status === "cancelled" ? "is-complete" : "is-pending"}><i /><p><small>{request.status === "pending" ? "STAFF REVIEW" : "REVIEW OUTCOME"}</small><strong>{requestOutcomeLabel(request)}</strong><span>{request.reviewedAt ? formatActivityTime(request.reviewedAt) + (request.reviewerName ? " · " + request.reviewerName : request.reviewedBy ? " · Staff account" : "") + (request.reviewerEmail ? " · " + request.reviewerEmail : "") : request.status === "cancelled" ? "The student closed this request" : "A librarian or administrator must confirm stock"}</span></p></div>
                      {request.fulfilmentMethod === "delivery" && <div className={request.dispatchedAt ? "is-complete" : "is-pending"}><i /><p><small>STAFF DISPATCH</small><strong>{request.dispatchedAt ? "Campus delivery dispatched" : request.status === "approved" ? "Awaiting staff dispatch" : request.status === "pending" ? "Available after approval" : "Delivery not proceeding"}</strong><span>{request.dispatchedAt ? formatActivityTime(request.dispatchedAt) + (request.dispatcherName ? " · " + request.dispatcherName : " · Staff account") + (request.dispatcherEmail ? " · " + request.dispatcherEmail : "") : "A separate dispatch confirmation is required"}</span></p></div>}
                      {request.recalledAt && <div className="is-complete"><i /><p><small>SAFE RECALL</small><strong>{request.dispatchedAt ? "Dispatched delivery stopped" : "Held copies returned to inventory"}</strong><span>{formatActivityTime(request.recalledAt)} · {request.recallerName || "Staff account"}{request.recallerEmail ? " · " + request.recallerEmail : ""} · {request.recallReason}</span></p></div>}
                      {request.recalledAt && request.dispatchedAt && <div className={request.recallReturnedAt ? "is-complete" : "is-pending"}><i /><p><small>INDEPENDENT DESK RETURN</small><strong>{request.recallReturnedAt ? "Every copy physically secured" : "Controlled return custody"}</strong><span>{request.recallReturnedAt ? formatActivityTime(request.recallReturnedAt) + " · " + (request.recallReturnerName || "Second staff account") + (request.recallReturnerEmail ? " · " + request.recallReturnerEmail : "") : "A staff member other than the dispatcher or recaller must confirm the return"}</span></p></div>}
                      {request.fulfilmentMethod === "delivery" && <div className={request.receivedAt ? "is-complete" : "is-pending"}><i /><p><small>STUDENT RECEIPT</small><strong>{request.receivedAt ? "Received and loan started" : request.recalledAt ? "Closed without a loan" : request.dispatchedAt ? "Awaiting student confirmation" : "Waiting for dispatch"}</strong><span>{request.receivedAt ? formatActivityTime(request.receivedAt) + " · Confirmed by " + request.student.fullName : request.recalledAt ? request.recallReturnedAt || !request.dispatchedAt ? "No due date was created" : "Copies remain unavailable until the independent desk return" : "The due date begins only after the student confirms receipt"}</span></p></div>}
                    </div>

                    {request.rejectionReason && <div className="librarian-rejection-note"><LuTriangleAlert /><p><strong>{request.recalledAt ? "Recall record" : "Rejection reason"}</strong><span>{request.rejectionReason}</span></p></div>}
                    <footer>
                      <span>Request <strong>{request.id.slice(0, 8).toUpperCase()}</strong>{request.loanId ? " · Loan " + request.loanId.slice(0, 8).toUpperCase() : ""}</span>
                      {request.status === "pending" && <div><button className="button button--outline" type="button" onClick={() => { setResolutionMode("reject"); setRejecting(request); setRejectionReason(""); }} disabled={actingOn === request.id}><LuCircleX /> Reject</button><button className="button button--gold" type="button" onClick={() => void approve(request)} disabled={actingOn === request.id || request.items.some((item) => item.availableCopies < 1)}><LuCheck /> {actingOn === request.id ? "Processing…" : "Approve request"}</button></div>}
                      {request.status === "approved" && request.fulfilmentMethod === "delivery" && !request.receivedAt && <div><button className="button button--outline" type="button" onClick={() => { setResolutionMode("recall"); setRejecting(request); setRejectionReason(""); }} disabled={actingOn === request.id}><LuRefreshCcw /> Recall delivery</button>{!request.dispatchedAt && <button className="button button--gold" type="button" onClick={() => void dispatchDelivery(request)} disabled={actingOn === request.id}><LuTruck /> {actingOn === request.id ? "Dispatching…" : "Mark dispatched"}</button>}{request.dispatchedAt && <strong className="librarian-delivery-state">Awaiting student receipt</strong>}</div>}
                      {request.status === "approved" && request.fulfilmentMethod === "delivery" && request.receivedAt && <strong className="librarian-delivery-state">Student confirmed receipt</strong>}
                      {request.recalledAt && request.dispatchedAt && !request.recallReturnedAt && <div>{operatorId !== request.dispatcherId && operatorId !== request.recallerId ? <button className="button button--gold" type="button" onClick={() => void confirmRecalledReturn(request)} disabled={actingOn === request.id}><LuPackageCheck /> {actingOn === request.id ? "Confirming…" : "Confirm books back at desk"}</button> : <strong className="librarian-delivery-state">A different staff member must confirm the desk return</strong>}</div>}
                      {request.recalledAt && request.recallReturnedAt && <strong className="librarian-delivery-state">Recalled copies secured by independent staff</strong>}
                    </footer>
                  </article>
                ))}
                {!visibleRequests.length && <div className="librarian-empty"><LuCircleCheck /><strong>No matching requests</strong><p>{filter === "pending" ? "There are no pending requests requiring action." : "Try another status or search term."}</p></div>}
              </div>
            </section>

            <aside className="librarian-inventory-panel" id="librarian-inventory">
              <div className="librarian-panel-heading"><div><span>LIVE INVENTORY</span><h2>Book availability</h2></div><strong>{visibleInventory.length}</strong></div>
              <div className="librarian-inventory-list">
                {visibleInventory.slice(0, 12).map((book) => <article key={book.id}><span className={book.availableCopies > 0 ? "is-available" : "is-unavailable"}>{book.availableCopies}</span><p><strong>{book.title}</strong><small>{book.author}</small><small>{book.shelfLocation}</small></p><em>{book.availableCopies}/{book.totalCopies}</em></article>)}
                {!visibleInventory.length && <div className="librarian-inventory-empty"><LuSearch /><span>No inventory matches this search.</span></div>}
              </div>
              <p className="librarian-inventory-note"><LuRefreshCcw /> Availability refreshes automatically every 20 seconds and is rechecked atomically on approval.</p>
            </aside>
          </div>

          <section className="librarian-settings-panel" id="librarian-settings" aria-labelledby="librarian-settings-title">
            <div className="librarian-settings-panel__heading"><span><LuSettings /></span><div><small>STAFF SETTINGS</small><h2 id="librarian-settings-title">Account &amp; recovery</h2><p>Recovery links are sent only to the personal email attached to this staff identity.</p></div></div>
            <div className="librarian-settings-identity"><span>{initials(operatorName)}</span><p><strong>{operatorName}</strong><small><LuMail /> {operatorEmail || "Personal email unavailable"}</small><em>{operatorRole.replace("_", " ")}</em></p></div>
            <button className="button button--outline" type="button" onClick={() => void requestPasswordReset()} disabled={sendingReset || !operatorEmail}><LuKeyRound /> {sendingReset ? "Sending secure link…" : "Send password-reset link"}</button>
          </section>
        </main>
      </div>

      {acceptingReturn && (
        <div className="modal-layer librarian-reject-layer" role="dialog" aria-modal="true" aria-labelledby="accept-return-title" aria-describedby="accept-return-description">
          <button className="modal-scrim" type="button" onClick={() => { if (!actingOn) { setAcceptingReturn(null); setPhysicalReturnConfirmed(false); } }} aria-label="Close return acceptance form" />
          <form className="librarian-return-dialog" onSubmit={acceptReturn}>
            <span><LuPackageCheck /></span>
            <div><small>RETURN {acceptingReturn.id.slice(0, 8).toUpperCase()}</small><h2 id="accept-return-title">Accept this physical return?</h2><p id="accept-return-description">Match the book and accession number at the desk. This action records your staff identity, closes the loan item, freezes the fine, and restores the exact copy according to its condition.</p></div>
            <div className="librarian-return-dialog__identity">
              <p><span>Student</span><strong>{acceptingReturn.studentName}</strong><small>{acceptingReturn.indexNumber} · {acceptingReturn.studentEmail}</small></p>
              <p><span>Book</span><strong>{acceptingReturn.bookTitle}</strong><small>{acceptingReturn.isbn}</small></p>
              <p><span>Exact copy</span><strong>{acceptingReturn.accessionNumber}</strong><small>Copy {acceptingReturn.copyId.slice(0, 8).toUpperCase()}</small></p>
              <p className={acceptingReturn.fineOutstandingPesewas > 0 ? "has-fine" : ""}><span>Outstanding fine</span><strong>{formatMoney(acceptingReturn.fineOutstandingPesewas)}</strong><small>{acceptingReturn.overduePeriods} overdue 24-hour period{acceptingReturn.overduePeriods === 1 ? "" : "s"}</small></p>
            </div>
            <label className="librarian-return-dialog__condition"><span>Condition on return</span><select value={returnCondition} onChange={(event) => setReturnCondition(event.target.value as ReturnCondition)} autoFocus required><option value="new">New</option><option value="good">Good</option><option value="fair">Fair</option><option value="poor">Poor</option><option value="damaged">Damaged</option></select><small>Damaged copies remain unavailable and are routed for staff attention.</small></label>
            <label className="librarian-return-dialog__confirmation"><input type="checkbox" checked={physicalReturnConfirmed} onChange={(event) => setPhysicalReturnConfirmed(event.target.checked)} /><span><strong>I physically received and matched this copy</strong><small>I verified the title and accession number shown above. My staff identity will be stored in the audit trail.</small></span></label>
            <footer><button className="button button--outline" type="button" onClick={() => { setAcceptingReturn(null); setPhysicalReturnConfirmed(false); }} disabled={Boolean(actingOn)}>Cancel</button><button className="button button--gold" type="submit" disabled={Boolean(actingOn) || !physicalReturnConfirmed}><LuPackageCheck /> {actingOn ? "Accepting return…" : "Confirm & accept return"}</button></footer>
          </form>
        </div>
      )}

      {rejecting && (
        <div className="modal-layer librarian-reject-layer" role="dialog" aria-modal="true" aria-labelledby="reject-request-title">
          <button className="modal-scrim" type="button" onClick={() => !actingOn && setRejecting(null)} aria-label={resolutionMode === "recall" ? "Close delivery recall form" : "Close rejection form"} />
          <form className="librarian-reject-dialog" onSubmit={reject}>
            <span><LuCircleX /></span>
            <div><small>REQUEST {rejecting.id.slice(0, 8).toUpperCase()}</small><h2 id="reject-request-title">{resolutionMode === "recall" ? "Recall this delivery safely?" : "Reject borrow request?"}</h2><p>{resolutionMode === "recall" ? rejecting.dispatchedAt ? "The copies will be locked in controlled return custody. A staff member other than the dispatcher or recaller must physically verify them at the desk before they become available again." : "Every held copy will return to available stock, the approval actor stays in the audit trail, and the student will be notified." : `Give ${rejecting.student.fullName.split(" ")[0]} a clear reason. This message will be visible to the student.`}</p></div>
            <label><span>{resolutionMode === "recall" ? "Failed-delivery or recall reason" : "Reason for rejection"}</span><textarea value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} maxLength={300} rows={4} placeholder={resolutionMode === "recall" ? "For example: student unavailable after verified delivery attempts…" : "For example: one requested title is unavailable…"} autoFocus required /></label>
            <footer><button className="button button--outline" type="button" onClick={() => setRejecting(null)} disabled={Boolean(actingOn)}>Keep request</button><button className="button button--primary" disabled={Boolean(actingOn)}>{actingOn ? resolutionMode === "recall" ? "Recalling…" : "Rejecting…" : resolutionMode === "recall" ? rejecting.dispatchedAt ? "Lock custody & recall" : "Release copies & recall" : "Confirm rejection"}</button></footer>
          </form>
        </div>
      )}
    </div>
  );
}
