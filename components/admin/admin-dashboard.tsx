"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  LuArchive,
  LuArrowRight,
  LuArrowUpRight,
  LuBell,
  LuBookOpen,
  LuCalendarDays,
  LuChartBar,
  LuCheck,
  LuChevronDown,
  LuCircleCheck,
  LuClipboardCheck,
  LuClock3,
  LuDownload,
  LuLayoutDashboard,
  LuLibrary,
  LuLockKeyhole,
  LuLogOut,
  LuMenu,
  LuPackageOpen,
  LuPencil,
  LuPlus,
  LuRefreshCcw,
  LuSearch,
  LuSettings,
  LuShieldCheck,
  LuTags,
  LuTriangleAlert,
  LuUndo2,
  LuUserRound,
  LuUsers,
  LuX,
} from "react-icons/lu";
import { BookFormModal, type BookFormValues } from "@/components/admin/book-form-modal";
import { AdministratorsSettings } from "@/components/admin/administrators-settings";
import { LibrariansTab } from "@/components/admin/librarians-tab";
import { RequestsTab } from "@/components/admin/requests-tab";
import {
  StudentsTab,
  adminStudentSelect,
  mapAdminStudentProfile,
  type AdminStudentProfile,
} from "@/components/admin/students-tab";
import { BookCover } from "@/components/ui/book-cover";
import { Brand } from "@/components/ui/brand";
import { StatusBadge } from "@/components/ui/status-badge";
import { categoryAccents, demoBooks, demoCirculation, demoStudents } from "@/lib/demo-data";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import type { Book, CirculationRecord } from "@/lib/types";
import { cn, formatDate, initials, toSlug } from "@/lib/utils";

type AdminTab = "overview" | "requests" | "books" | "digital" | "circulation" | "critical-fines" | "students" | "librarians" | "categories" | "inventory" | "reports" | "settings";
type Stats = { titles: number; physical: number; available: number; active: number; overdue: number; students: number; digital: number; pending: number; pendingDelivery: number; pendingReturns: number; outstandingFinesPesewas: number; lowStock: number };
type TrendPoint = { day: string; borrowed: number; returned: number };
type CriticalFinesAvailability = "loading" | "ready" | "unavailable";

function CediMark({ className }: { className?: string }) {
  return <span className={cn("cedi-mark", className)} aria-hidden="true">GH₵</span>;
}

type AdminCriticalFine = {
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
  gender: string;
  startYear: number | null;
  completionYear: number | null;
  guardianFullName: string;
  guardianPhone: string;
  guardianRelationship: string;
  studentIdObjectPath: string | null;
  studentIdStatus: string;
  studentRecordCheckStatus: string;
  facialScanStatus: string;
  faceSnapshotObjectPath: string | null;
  faceSnapshotUploadedAt: string | null;
  verificationStatus: string;
};

const adminCatalogSelect = "id,slug,title,isbn,description,format,pages,published_year,language,publisher,cover_url,cover_object_path,featured,author,category,total_copies,available_copies,borrow_count,shelf_location,online_available,created_at,updated_at,is_published,archived_at";
const legacyAdminCatalogSelect = "id,slug,title,isbn,description,format,pages,published_year,language,cover_url,featured,author,category,total_copies,available_copies,borrow_count,shelf_location,read_time,online_available,created_at,updated_at";
const adminCirculationSelect = "loan_item_id,loan_id,student_id,student_name,index_number,student_email,book_id,book_title,isbn,accession_number,borrowed_at,due_at,returned_at,status,display_status,overdue_periods,fine_rate_pesewas,fine_amount_pesewas,fine_outstanding_pesewas,return_request_id,return_request_status,return_requested_at,return_accepted_at,return_accepted_by,return_acceptor_name,return_acceptor_email,return_condition";
const legacyAdminCirculationSelect = "loan_item_id,loan_id,student_id,student_name,index_number,student_email,book_id,book_title,isbn,accession_number,borrowed_at,due_at,returned_at,status,display_status";
const legacyAdminStudentSelect = "id,full_name,index_number,email,student_email,programme,status,active_loans,created_at";
const criticalFineCoreSelect = "loan_item_id,loan_id,student_id,student_name,index_number,student_email,student_personal_email,student_phone,programme,department,residence_type,residence_location,book_id,book_title,author,isbn,accession_number,borrowed_at,due_at,returned_at,loan_item_status,critical_since,completed_days_critical,overdue_periods,fine_amount_pesewas,fine_paid_pesewas,fine_outstanding_pesewas,fine_payment_status,fine_payment_method,fine_payment_count,fine_payment_reference,fine_paid_at";
const adminCriticalFinePrivateSelect = ",gender,start_year,completion_year,guardian_full_name,guardian_phone,guardian_relationship,student_id_object_path,student_id_status,student_record_check_status,facial_scan_status,verification_status";
const adminCriticalFineSelect = criticalFineCoreSelect + adminCriticalFinePrivateSelect + ",face_snapshot_object_path,face_snapshot_uploaded_at";

type BrowserSupabaseClient = NonNullable<ReturnType<typeof getSupabaseBrowserClient>>;

async function loadAdminCatalogue(client: BrowserSupabaseClient) {
  const current = await client.from("admin_catalog_books").select(adminCatalogSelect).order("created_at", { ascending: false });
  if (!current.error) return current;
  return client.from("catalog_books").select(legacyAdminCatalogSelect).order("created_at", { ascending: false });
}

async function loadAdminCirculation(client: BrowserSupabaseClient) {
  const current = await client.from("admin_circulation").select(adminCirculationSelect).order("borrowed_at", { ascending: false });
  if (!current.error) return current;
  return client.from("admin_circulation").select(legacyAdminCirculationSelect).order("borrowed_at", { ascending: false });
}

async function loadAdminCriticalFines(client: BrowserSupabaseClient) {
  const detailed = await client.from("admin_critical_fines").select(adminCriticalFineSelect).order("due_at", { ascending: true });
  if (!detailed.error) return detailed;
  const withoutFaceSnapshot = await client.from("admin_critical_fines").select(criticalFineCoreSelect + adminCriticalFinePrivateSelect).order("due_at", { ascending: true });
  if (!withoutFaceSnapshot.error) return withoutFaceSnapshot;
  // Older deployments can still provide the common audit fields while the
  // administrator-only verification columns are being migrated.
  return client.from("admin_critical_fines").select(criticalFineCoreSelect).order("due_at", { ascending: true });
}

const navItems: Array<{ id: AdminTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "overview", label: "Overview", icon: LuLayoutDashboard },
  { id: "requests", label: "Borrow requests", icon: LuClipboardCheck },
  { id: "books", label: "Book catalogue", icon: LuLibrary },
  { id: "digital", label: "Digital library", icon: LuBookOpen },
  { id: "circulation", label: "Borrowing & returns", icon: LuRefreshCcw },
  { id: "critical-fines", label: "Critical fines", icon: CediMark },
  { id: "students", label: "Students", icon: LuUsers },
  { id: "librarians", label: "Librarians", icon: LuUserRound },
  { id: "categories", label: "Categories", icon: LuTags },
  { id: "inventory", label: "Inventory", icon: LuPackageOpen },
  { id: "reports", label: "Reports", icon: LuChartBar },
  { id: "settings", label: "Settings", icon: LuSettings },
];

const trendData = [
  { day: "Mon", borrowed: 42, returned: 28 },
  { day: "Tue", borrowed: 58, returned: 37 },
  { day: "Wed", borrowed: 49, returned: 44 },
  { day: "Thu", borrowed: 72, returned: 51 },
  { day: "Fri", borrowed: 64, returned: 60 },
  { day: "Sat", borrowed: 38, returned: 46 },
  { day: "Sun", borrowed: 51, returned: 43 },
];

const circulationChartMargin = { ["top"]: 10, ["right"]: 4, ["left"]: -25, ["bottom"]: 0 } as const;

function matchesAdminSearch(query: string, values: Array<string | number | null | undefined>) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  const compactQuery = normalizedQuery.replace(/[\s/.-]/g, "");
  return values.some((value) => {
    const normalizedValue = String(value ?? "").trim().toLowerCase();
    return normalizedValue.includes(normalizedQuery) || (compactQuery.length >= 3 && normalizedValue.replace(/[\s/.-]/g, "").includes(compactQuery));
  });
}

function formatGhs(pesewas: number | null | undefined) {
  const value = Number.isFinite(pesewas) ? Math.max(0, Number(pesewas)) : 0;
  return "GHS " + (value / 100).toFixed(2);
}

function formatCriticalCedis(pesewas: number | null | undefined) {
  const value = Number.isFinite(pesewas) ? Math.max(0, Number(pesewas)) : 0;
  return "GH₵ " + (value / 100).toFixed(2);
}

function criticalFineStatus(record: Pick<AdminCriticalFine, "fineAmountPesewas" | "finePaidPesewas" | "fineOutstandingPesewas">) {
  if (record.fineAmountPesewas > 0 && record.fineOutstandingPesewas <= 0) return "paid" as const;
  if (record.finePaidPesewas > 0) return "part-paid" as const;
  return "outstanding" as const;
}

function formatCriticalTimestamp(value: string | null) {
  if (!value) return "Not recorded";
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return "Not recorded";
  return timestamp.toLocaleString("en-GH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function humanizeCriticalValue(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  return normalized ? normalized.replaceAll("_", " ").replaceAll("-", " ") : "Not recorded";
}

function mapAdminCriticalFine(row: Record<string, unknown>): AdminCriticalFine {
  return {
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
    gender: String(row.gender || "Not recorded"),
    startYear: Number.isFinite(Number(row.start_year)) && row.start_year != null ? Number(row.start_year) : null,
    completionYear: Number.isFinite(Number(row.completion_year)) && row.completion_year != null ? Number(row.completion_year) : null,
    guardianFullName: String(row.guardian_full_name || "Not recorded"),
    guardianPhone: String(row.guardian_phone || "Not recorded"),
    guardianRelationship: String(row.guardian_relationship || "Not recorded"),
    // Paths remain private implementation data and are used only to mint
    // short-lived signed URLs on an explicit administrator action.
    studentIdObjectPath: row.student_id_object_path ? String(row.student_id_object_path) : null,
    studentIdStatus: String(row.student_id_status || "Not recorded"),
    studentRecordCheckStatus: String(row.student_record_check_status || "Not recorded"),
    facialScanStatus: String(row.facial_scan_status || "Not recorded"),
    faceSnapshotObjectPath: row.face_snapshot_object_path ? String(row.face_snapshot_object_path) : null,
    faceSnapshotUploadedAt: row.face_snapshot_uploaded_at ? String(row.face_snapshot_uploaded_at) : null,
    verificationStatus: String(row.verification_status || "Not recorded"),
  };
}

function downloadCsv(filename: string, rows: Array<Record<string, string | number | null | undefined>>) {
  if (!rows.length) return void toast.error("There is no data to export yet.");
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const escapeCell = (value: string | number | null | undefined) => {
    const raw = value == null ? "" : String(value);
    const content = /^[=+\-@]/.test(raw) ? "'" + raw : raw;
    return "\"" + content.replaceAll("\"", "\"\"") + "\"";
  };
  const csv = [
    headers.map(escapeCell).join(","),
    ...rows.map((row) => headers.map((header) => escapeCell(row[header])).join(",")),
  ].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  toast.success("Report exported.");
}

function mapAdminBook(row: Record<string, unknown>): Book {
  const category = String(row.category ?? "General");
  const rawFormat = String(row.format ?? "physical");
  const format = rawFormat === "digital" || rawFormat === "both" ? rawFormat : "physical";
  return {
    id: String(row.id),
    slug: String(row.slug ?? toSlug(String(row.title ?? "book"))),
    title: String(row.title ?? "Untitled book"),
    author: String(row.author ?? "Unknown author"),
    category,
    isbn: String(row.isbn ?? ""),
    description: String(row.description ?? ""),
    format,
    totalCopies: Number(row.total_copies ?? 0),
    availableCopies: Number(row.available_copies ?? 0),
    pages: Number(row.pages ?? 0),
    publishedYear: Number(row.published_year ?? new Date().getFullYear()),
    language: String(row.language ?? "English"),
    rating: Number(row.rating ?? 0),
    borrowCount: Number(row.borrow_count ?? 0),
    readTime: String(row.read_time ?? "—"),
    accent: categoryAccents[category] ?? "#0B1849",
    coverUrl: row.cover_url ? String(row.cover_url) : null,
    onlineContent: row.online_content ? String(row.online_content) : null,
    onlineAvailable: Boolean(row.online_available),
    shelfLocation: row.shelf_location ? String(row.shelf_location) : null,
    featured: Boolean(row.featured),
    newArrival: Boolean(row.new_arrival),
    archivedAt: row.archived_at ? String(row.archived_at) : null,
    isPublished: Boolean(row.is_published),
    coverObjectPath: row.cover_object_path ? String(row.cover_object_path) : null,
  };
}

function mapAdminCirculation(row: Record<string, unknown>): CirculationRecord {
  const displayStatus = String(row.display_status ?? "");
  const status = displayStatus === "returned" || displayStatus === "overdue" || displayStatus === "due-soon" || displayStatus === "active"
    ? displayStatus
    : row.returned_at ? "returned" : new Date(String(row.due_at)) < new Date() ? "overdue" : "active";
  return {
    id: String(row.loan_item_id),
    bookId: row.book_id ? String(row.book_id) : undefined,
    studentName: String(row.student_name || "Incomplete profile"),
    indexNumber: String(row.index_number || "Student ID pending"),
    studentEmail: row.student_email ? String(row.student_email) : undefined,
    bookTitle: String(row.book_title || "Archived title"),
    isbn: String(row.isbn || "—"),
    accessionNumber: row.accession_number ? String(row.accession_number) : undefined,
    issuedAt: String(row.borrowed_at),
    dueAt: String(row.due_at),
    returnedAt: row.returned_at ? String(row.returned_at) : null,
    status,
    overduePeriods: Math.max(0, Number(row.overdue_periods ?? 0)),
    fineRatePesewas: Math.max(0, Number(row.fine_rate_pesewas ?? 350)),
    fineAmountPesewas: Math.max(0, Number(row.fine_amount_pesewas ?? 0)),
    fineOutstandingPesewas: Math.max(0, Number(row.fine_outstanding_pesewas ?? row.fine_amount_pesewas ?? 0)),
    returnRequestId: row.return_request_id ? String(row.return_request_id) : null,
    returnRequestStatus: ["pending", "accepted", "cancelled", "rejected"].includes(String(row.return_request_status)) ? String(row.return_request_status) as CirculationRecord["returnRequestStatus"] : null,
    returnRequestedAt: row.return_requested_at ? String(row.return_requested_at) : null,
    returnAcceptedAt: row.return_accepted_at ? String(row.return_accepted_at) : null,
    returnAcceptedBy: row.return_accepted_by ? String(row.return_accepted_by) : null,
    returnAcceptorName: row.return_acceptor_name ? String(row.return_acceptor_name) : null,
    returnAcceptorEmail: row.return_acceptor_email ? String(row.return_acceptor_email) : null,
    returnCondition: row.return_condition ? String(row.return_condition) : null,
  };
}

export function AdminDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [books, setBooks] = useState<Book[]>(isSupabaseConfigured ? [] : demoBooks);
  const [students, setStudents] = useState<AdminStudentProfile[]>(isSupabaseConfigured ? [] : demoStudents);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [circulation, setCirculation] = useState<CirculationRecord[]>(isSupabaseConfigured ? [] : demoCirculation);
  const [circulationTrend, setCirculationTrend] = useState<TrendPoint[]>(isSupabaseConfigured ? [] : trendData);
  const [criticalFines, setCriticalFines] = useState<AdminCriticalFine[]>([]);
  const [criticalFinesAvailability, setCriticalFinesAvailability] = useState<CriticalFinesAvailability>(isSupabaseConfigured ? "loading" : "unavailable");
  const [authoritativeStats, setAuthoritativeStats] = useState<Omit<Stats, "lowStock"> | null>(null);
  const [bookSearch, setBookSearch] = useState("");
  const [requestSearch, setRequestSearch] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [librarianSearch, setLibrarianSearch] = useState("");
  const [circulationSearch, setCirculationSearch] = useState("");
  const [criticalFineSearch, setCriticalFineSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [formatFilter, setFormatFilter] = useState("all");
  const [bookStatusFilter, setBookStatusFilter] = useState<"active" | "archived" | "all">("active");
  const [bookModalOpen, setBookModalOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [savingBook, setSavingBook] = useState(false);
  const [selectedBooks, setSelectedBooks] = useState<string[]>([]);
  const [authorization, setAuthorization] = useState<"checking" | "authorized" | "denied">("checking");
  const [isDemo, setIsDemo] = useState(!isSupabaseConfigured);
  const [adminName, setAdminName] = useState(isSupabaseConfigured ? "Library administrator" : "Akua Mensah");
  const [adminRole, setAdminRole] = useState<"admin" | "super_admin">(isSupabaseConfigured ? "admin" : "super_admin");

  useEffect(() => {
    const load = async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setAuthorization("authorized");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setAuthorization("denied");
        return;
      }

      const { data: profile } = await supabase.from("profiles").select("full_name, role, status").eq("id", sessionData.session.user.id).maybeSingle();
      if (profile?.role === "librarian" && profile.status === "active") {
        router.replace("/librarian");
        return;
      }
      if (!profile || !["admin", "super_admin"].includes(profile.role) || profile.status !== "active") {
        setAuthorization("denied");
        return;
      }

      setAuthorization("authorized");
      setIsDemo(false);
      setAdminName(profile.full_name || "Library administrator");
      setAdminRole(profile.role === "super_admin" ? "super_admin" : "admin");
      setBooks([]);
      setStudents([]);
      setCirculation([]);
      setCirculationTrend([]);
      setCriticalFines([]);
      setCriticalFinesAvailability("loading");
      setAuthoritativeStats(null);

      const [catalogResult, circulationResult, statsResult, trendResult, criticalFineResult] = await Promise.all([
        loadAdminCatalogue(supabase),
        loadAdminCirculation(supabase),
        supabase.from("admin_dashboard_stats").select("*").maybeSingle(),
        supabase.from("admin_daily_circulation").select("*").order("activity_date", { ascending: true }),
        loadAdminCriticalFines(supabase),
      ]);

      if (!catalogResult.error) setBooks((catalogResult.data ?? []).map((row) => mapAdminBook(row as Record<string, unknown>)));
      if (!circulationResult.error) {
        setCirculation((circulationResult.data ?? []).map((row) => mapAdminCirculation(row as Record<string, unknown>)));
      }
      if (!statsResult.error && statsResult.data) {
        setAuthoritativeStats({
          titles: Number(statsResult.data.total_titles ?? 0),
          physical: Number(statsResult.data.total_copies ?? 0),
          available: Number(statsResult.data.available_copies ?? 0),
          active: Number(statsResult.data.active_loans ?? 0),
          overdue: Number(statsResult.data.overdue_loans ?? 0),
          students: Number(statsResult.data.total_students ?? 0),
          digital: Number(statsResult.data.digital_titles ?? 0),
          pending: Number(statsResult.data.pending_requests ?? 0),
          pendingDelivery: Number(statsResult.data.pending_delivery_requests ?? 0),
          pendingReturns: Number(statsResult.data.pending_return_requests ?? 0),
          outstandingFinesPesewas: Number(statsResult.data.outstanding_fines_pesewas ?? 0),
        });
      }
      if (!trendResult.error) {
        setCirculationTrend((trendResult.data ?? []).map((row) => ({
          day: String(row.day_label ?? ""),
          borrowed: Number(row.borrowed_count ?? 0),
          returned: Number(row.returned_count ?? 0),
        })));
      }
      if (criticalFineResult.error) {
        setCriticalFines([]);
        setCriticalFinesAvailability("unavailable");
      } else {
        setCriticalFines((criticalFineResult.data ?? []).map((row) => mapAdminCriticalFine(row as Record<string, unknown>)));
        setCriticalFinesAvailability("ready");
      }

      if (catalogResult.error) toast.error("The book catalogue could not be refreshed. Please retry in a moment.");
      if (circulationResult.error) toast.error("Circulation records could not be refreshed. Please retry in a moment.");
    };
    void load();
  }, [router]);

  useEffect(() => {
    if (authorization !== "authorized" || isDemo) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      void Promise.all([
        loadAdminCatalogue(supabase),
        loadAdminCirculation(supabase),
        loadAdminCriticalFines(supabase),
      ]).then(([catalogResult, circulationResult, criticalFineResult]) => {
        if (!catalogResult.error) setBooks((catalogResult.data ?? []).map((row) => mapAdminBook(row as Record<string, unknown>)));
        if (!circulationResult.error) setCirculation((circulationResult.data ?? []).map((row) => mapAdminCirculation(row as Record<string, unknown>)));
        if (criticalFineResult.error) {
          setCriticalFines([]);
          setCriticalFinesAvailability("unavailable");
        } else {
          setCriticalFines((criticalFineResult.data ?? []).map((row) => mapAdminCriticalFine(row as Record<string, unknown>)));
          setCriticalFinesAvailability("ready");
        }
        void refreshLiveMetrics();
      });
    }, 30_000);
    return () => window.clearInterval(interval);
  // refreshLiveMetrics reads only stable clients and state setters.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorization, isDemo]);

  useEffect(() => {
    if (authorization !== "authorized" || isDemo) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let queuedRefresh: number | null = null;
    const refreshReturnWorkflow = () => {
      if (queuedRefresh !== null) window.clearTimeout(queuedRefresh);
      queuedRefresh = window.setTimeout(() => {
        void Promise.all([
          loadAdminCatalogue(supabase),
          loadAdminCirculation(supabase),
          loadAdminCriticalFines(supabase),
        ]).then(([catalogResult, circulationResult, criticalFineResult]) => {
          if (!catalogResult.error) setBooks((catalogResult.data ?? []).map((row) => mapAdminBook(row as Record<string, unknown>)));
          if (!circulationResult.error) setCirculation((circulationResult.data ?? []).map((row) => mapAdminCirculation(row as Record<string, unknown>)));
          if (criticalFineResult.error) {
            setCriticalFines([]);
            setCriticalFinesAvailability("unavailable");
          } else {
            setCriticalFines((criticalFineResult.data ?? []).map((row) => mapAdminCriticalFine(row as Record<string, unknown>)));
            setCriticalFinesAvailability("ready");
          }
          void refreshLiveMetrics();
        });
      }, 180);
    };

    const channel = supabase
      .channel("admin-return-workflow")
      .on("postgres_changes", { event: "*", schema: "public", table: "return_requests" }, refreshReturnWorkflow)
      .on("postgres_changes", { event: "*", schema: "public", table: "loan_items" }, refreshReturnWorkflow)
      .on("postgres_changes", { event: "*", schema: "public", table: "fine_payments" }, refreshReturnWorkflow)
      .subscribe();

    return () => {
      if (queuedRefresh !== null) window.clearTimeout(queuedRefresh);
      void supabase.removeChannel(channel);
    };
  // refreshLiveMetrics is component-local and only updates live dashboard state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorization, isDemo]);

  useEffect(() => {
    if (activeTab !== "students" || authorization !== "authorized" || isDemo) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let cancelled = false;

    const loadPrivateStudentProfiles = async (showLoader: boolean) => {
      if (showLoader) setStudentsLoading(true);
      const result = await supabase
        .from("admin_student_profiles")
        .select(adminStudentSelect)
        .order("created_at", { ascending: false });
      const effectiveResult = result.error
        ? await supabase.from("admin_students").select(legacyAdminStudentSelect).order("created_at", { ascending: false })
        : result;
      if (cancelled) return;
      setStudentsLoading(false);
      if (effectiveResult.error) {
        toast.error("Student profiles could not be refreshed. Please retry in a moment.");
        return;
      }
      setStudents((effectiveResult.data ?? []).map((sourceRow) => {
        const row = sourceRow as unknown as Record<string, unknown>;
        return mapAdminStudentProfile({ ...row, personal_email: row.personal_email ?? row.email });
      }));
    };

    void loadPrivateStudentProfiles(true);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadPrivateStudentProfiles(false);
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeTab, authorization, isDemo]);

  async function refreshLiveMetrics() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || isDemo) return;
    const [statsResult, trendResult] = await Promise.all([
      supabase.from("admin_dashboard_stats").select("*").maybeSingle(),
      supabase.from("admin_daily_circulation").select("*").order("activity_date", { ascending: true }),
    ]);
    if (statsResult.data) {
      setAuthoritativeStats({
        titles: Number(statsResult.data.total_titles ?? 0),
        physical: Number(statsResult.data.total_copies ?? 0),
        available: Number(statsResult.data.available_copies ?? 0),
        active: Number(statsResult.data.active_loans ?? 0),
        overdue: Number(statsResult.data.overdue_loans ?? 0),
        students: Number(statsResult.data.total_students ?? 0),
        digital: Number(statsResult.data.digital_titles ?? 0),
        pending: Number(statsResult.data.pending_requests ?? 0),
        pendingDelivery: Number(statsResult.data.pending_delivery_requests ?? 0),
        pendingReturns: Number(statsResult.data.pending_return_requests ?? 0),
        outstandingFinesPesewas: Number(statsResult.data.outstanding_fines_pesewas ?? 0),
      });
    }
    if (trendResult.data) setCirculationTrend(trendResult.data.map((row) => ({ day: String(row.day_label ?? ""), borrowed: Number(row.borrowed_count ?? 0), returned: Number(row.returned_count ?? 0) })));
  }

  const stats = useMemo(() => {
    const liveBooks = books.filter((book) => !book.archivedAt);
    const physical = liveBooks.reduce((sum, book) => sum + book.totalCopies, 0);
    const available = liveBooks.reduce((sum, book) => sum + book.availableCopies, 0);
    const active = circulation.filter((item) => item.status !== "returned").length;
    const overdue = circulation.filter((item) => item.status === "overdue").length;
    const calculated = {
      titles: liveBooks.length,
      physical,
      available,
      active,
      overdue,
      students: students.length,
      digital: liveBooks.filter((book) => book.format !== "physical").length,
      pending: 0,
      pendingDelivery: 0,
      pendingReturns: circulation.filter((item) => item.returnRequestStatus === "pending").length,
      outstandingFinesPesewas: circulation.reduce((total, item) => total + Math.max(0, item.fineOutstandingPesewas ?? 0), 0),
      lowStock: liveBooks.filter((book) => book.format !== "digital" && book.availableCopies <= 2).length,
    };
    return authoritativeStats ? { ...authoritativeStats, lowStock: calculated.lowStock } : calculated;
  }, [authoritativeStats, books, circulation, students]);

  const filteredBooks = useMemo(() => books.filter((book) => {
    const matchesSearch = matchesAdminSearch(bookSearch, [book.title, book.author, book.isbn, book.category, book.language, book.shelfLocation]);
    const matchesCategory = categoryFilter === "all" || book.category === categoryFilter;
    const matchesFormat = formatFilter === "all" || book.format === formatFilter || book.format === "both";
    const matchesStatus = bookStatusFilter === "all" || (bookStatusFilter === "archived" ? Boolean(book.archivedAt) : !book.archivedAt);
    return matchesSearch && matchesCategory && matchesFormat && matchesStatus;
  }), [bookSearch, bookStatusFilter, books, categoryFilter, formatFilter]);

  const openAddBook = () => {
    setEditingBook(null);
    setBookModalOpen(true);
  };

  const openEditBook = async (book: Book) => {
    let completeBook = book;
    const supabase = getSupabaseBrowserClient();
    if (supabase && !isDemo && book.onlineAvailable) {
      const { data } = await supabase.from("published_book_chapters").select("content_text, order_index").eq("book_id", book.id).order("order_index");
      if (data?.length) completeBook = { ...book, onlineContent: data.map((chapter) => chapter.content_text).join("\n\n") };
    }
    setEditingBook(completeBook);
    setBookModalOpen(true);
  };

  const saveBook = async (values: BookFormValues) => {
    setSavingBook(true);
    const supabase = getSupabaseBrowserClient();
    try {
      if (values.coverFile && values.coverFile.size > 5 * 1024 * 1024) {
        throw new Error("Book covers must be 5 MB or smaller.");
      }
      if (values.coverFile && !["image/png", "image/jpeg", "image/webp", "image/avif"].includes(values.coverFile.type)) {
        throw new Error("Use a PNG, JPG, WEBP, or AVIF cover image.");
      }
      if (editingBook && values.format === "digital" && editingBook.totalCopies > 0) {
        throw new Error("A title with physical copies cannot become digital-only. Choose “Both formats” or archive the physical title first.");
      }
      let coverUrl = editingBook?.coverUrl ?? null;
      let bookId = editingBook?.id ?? crypto.randomUUID();

      if (supabase && !isDemo) {
        const { data: authData } = await supabase.auth.getUser();
        const actorId = authData.user?.id;
        if (!actorId) throw new Error("Your administrator session has expired. Please sign in again.");
        const authorResult = await supabase.from("authors").select("id").ilike("name", values.author.trim()).maybeSingle();
        let authorId = authorResult.data?.id;
        if (!authorId) {
          const inserted = await supabase.from("authors").insert({ name: values.author.trim() }).select("id").single();
          if (inserted.error) throw inserted.error;
          authorId = inserted.data.id;
        }

        const categoryResult = await supabase.from("categories").select("id").ilike("name", values.category.trim()).maybeSingle();
        let categoryId = categoryResult.data?.id;
        if (!categoryId) {
          const inserted = await supabase.from("categories").insert({ name: values.category.trim(), slug: toSlug(values.category) }).select("id").single();
          if (inserted.error) throw inserted.error;
          categoryId = inserted.data.id;
        }

        const payload = {
          title: values.title.trim(),
          slug: toSlug(values.title) + "-" + bookId.slice(0, 6),
          author_id: authorId,
          category_id: categoryId,
          isbn: values.isbn.trim() || null,
          description: values.description.trim(),
          format: values.format,
          pages: values.pages || null,
          published_year: values.publishedYear || null,
          language: values.language.trim() || "English",
          updated_by: actorId,
        };

        if (editingBook) {
          const result = await supabase.from("books").update(payload).eq("id", editingBook.id);
          if (result.error) throw result.error;
        } else {
          const result = await supabase.from("books").insert({ id: bookId, ...payload, created_by: actorId }).select("id").single();
          if (result.error) throw result.error;
          bookId = result.data.id;
        }

        if (values.coverFile) {
          const extension = values.coverFile.name.split(".").pop()?.toLowerCase() || "jpg";
          const objectPath = bookId + "/cover-" + Date.now() + "." + extension;
          const uploaded = await supabase.storage.from("book-covers").upload(objectPath, values.coverFile, { upsert: true });
          if (uploaded.error) throw uploaded.error;
          coverUrl = supabase.storage.from("book-covers").getPublicUrl(objectPath).data.publicUrl;
          const updated = await supabase.from("books").update({ cover_object_path: objectPath, cover_url: coverUrl }).eq("id", bookId);
          if (updated.error) throw updated.error;
        }

        if (values.format !== "digital") {
          const stockResult = editingBook
            ? await supabase.rpc("adjust_book_stock", { p_book_id: bookId, p_target_quantity: values.stockQuantity, p_shelf_location: values.shelfLocation === (editingBook.shelfLocation ?? "") ? null : values.shelfLocation })
            : await supabase.rpc("add_book_stock", { p_book_id: bookId, p_quantity: values.stockQuantity, p_shelf_location: values.shelfLocation || "Main Stacks" });
          if (stockResult.error) throw stockResult.error;
        }

        if (values.format !== "physical" && values.onlineText.trim()) {
          const editionResult = await supabase.from("digital_editions").upsert({ book_id: bookId, status: "published", published_at: new Date().toISOString() }, { onConflict: "book_id" }).select("id").single();
          if (editionResult.error) throw editionResult.error;
          const chapterResult = await supabase.from("book_chapters").upsert({ edition_id: editionResult.data.id, order_index: 1, title: "Full text", content_text: values.onlineText.trim(), is_published: true }, { onConflict: "edition_id,order_index" });
          if (chapterResult.error) throw chapterResult.error;
        } else if (values.format === "physical" && editingBook?.onlineAvailable) {
          const editionResult = await supabase.from("digital_editions").update({ status: "archived" }).eq("book_id", bookId);
          if (editionResult.error) throw editionResult.error;
        }

        if (!editingBook) {
          const publishResult = await supabase.rpc("publish_book", { p_book_id: bookId });
          if (publishResult.error) throw publishResult.error;
        }
      }

      const newBook: Book = {
        id: bookId,
        slug: toSlug(values.title) + "-" + bookId.slice(0, 6),
        title: values.title,
        author: values.author,
        category: values.category,
        isbn: values.isbn,
        description: values.description,
        format: values.format,
        totalCopies: values.format === "digital" ? 0 : values.stockQuantity,
        availableCopies: values.format === "digital" ? 0 : editingBook ? Math.max(0, values.stockQuantity - (editingBook.totalCopies - editingBook.availableCopies)) : values.stockQuantity,
        pages: values.pages,
        publishedYear: values.publishedYear,
        language: values.language,
        rating: editingBook?.rating ?? 0,
        borrowCount: editingBook?.borrowCount ?? 0,
        readTime: values.pages ? Math.max(1, Math.round(values.pages / 55)) + " hr read" : "—",
        accent: categoryAccents[values.category] ?? "#0B1849",
        coverUrl,
        onlineContent: values.onlineText || null,
        onlineAvailable: values.format !== "physical" && Boolean(values.onlineText.trim()),
        shelfLocation: values.shelfLocation || editingBook?.shelfLocation || null,
        newArrival: !editingBook,
      };

      setBooks((current) => editingBook ? current.map((book) => book.id === editingBook.id ? newBook : book) : [newBook, ...current]);
      await refreshLiveMetrics();
      setBookModalOpen(false);
      toast.success(editingBook ? "Book updated successfully." : "Book published to the library.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save this book.");
    } finally {
      setSavingBook(false);
    }
  };

  const archiveBook = async (book: Book) => {
    if (!window.confirm("Archive “" + book.title + "”? It will disappear from the student catalogue but its loan history will remain.")) return;
    const supabase = getSupabaseBrowserClient();
    if (supabase && !isDemo) {
      const { error } = await supabase.rpc("archive_book", { p_book_id: book.id });
      if (error) return void toast.error("This title could not be archived. Check its current library activity and try again.");
    }
    setBooks((current) => current.map((item) => item.id === book.id ? { ...item, archivedAt: new Date().toISOString(), isPublished: false } : item));
    setSelectedBooks((current) => current.filter((id) => id !== book.id));
    await refreshLiveMetrics();
    toast.success("Book moved to the archive. It can be restored at any time.");
  };

  const unarchiveBook = async (book: Book) => {
    const supabase = getSupabaseBrowserClient();
    if (supabase && !isDemo) {
      const { error } = await supabase.rpc("unarchive_book", { p_book_id: book.id });
      if (error) return void toast.error("This title could not be restored. Check its stock and edition details, then try again.");
    }
    setBooks((current) => current.map((item) => item.id === book.id ? { ...item, archivedAt: null, isPublished: true } : item));
    setSelectedBooks((current) => current.filter((id) => id !== book.id));
    await refreshLiveMetrics();
    toast.success("Book restored to the live student catalogue.");
  };

  const runSelectedBookAction = async (action: "archive" | "restore") => {
    const selected = books.filter((book) => selectedBooks.includes(book.id));
    if (!selected.length) return;
    const eligible = selected.filter((book) => action === "archive" ? !book.archivedAt : Boolean(book.archivedAt));
    if (!eligible.length) return void toast.error(action === "archive" ? "Select at least one live title." : "Select at least one archived title.");
    const message = action === "archive"
      ? `Archive ${eligible.length} selected ${eligible.length === 1 ? "title" : "titles"}?`
      : `Restore ${eligible.length} selected ${eligible.length === 1 ? "title" : "titles"} to the student catalogue?`;
    if (!window.confirm(message)) return;

    const supabase = getSupabaseBrowserClient();
    const succeeded: Book[] = [];
    let failed = 0;
    for (const book of eligible) {
      if (!supabase || isDemo) {
        succeeded.push(book);
        continue;
      }
      const rpc = action === "archive" ? "archive_book" : "unarchive_book";
      const { error } = await supabase.rpc(rpc, { p_book_id: book.id });
      if (error) {
        failed += 1;
        continue;
      }
      succeeded.push(book);
    }

    const succeededIds = new Set(succeeded.map((book) => book.id));
    setBooks((current) => current.map((book) => succeededIds.has(book.id) ? { ...book, archivedAt: action === "archive" ? new Date().toISOString() : null, isPublished: action !== "archive" } : book));
    setSelectedBooks((current) => current.filter((id) => !succeededIds.has(id)));
    await refreshLiveMetrics();
    if (succeeded.length) toast.success(`${succeeded.length} ${succeeded.length === 1 ? "title" : "titles"} ${action === "archive" ? "archived" : "restored"}.`);
    if (failed) toast.error(`${failed} ${failed === 1 ? "title was" : "titles were"} not updated. Refresh and try again.`);
  };

  const acceptReturn = async (record: CirculationRecord, condition: "new" | "good" | "fair" | "poor" | "damaged") => {
    if (!record.returnRequestId || record.returnRequestStatus !== "pending") {
      toast.error("A student return request is required before this copy can be accepted.");
      return false;
    }
    const supabase = getSupabaseBrowserClient();
    if (supabase && !isDemo) {
      const { error } = await supabase.rpc("accept_return_request", { p_return_request_id: record.returnRequestId, p_condition: condition });
      if (error) {
        toast.error("The return could not be accepted. Refresh the queue and confirm that this exact copy is still pending.");
        return false;
      }
      const [catalogResult, circulationResult] = await Promise.all([
        loadAdminCatalogue(supabase),
        loadAdminCirculation(supabase),
      ]);
      if (!catalogResult.error) setBooks((catalogResult.data ?? []).map((row) => mapAdminBook(row as Record<string, unknown>)));
      if (!circulationResult.error) setCirculation((circulationResult.data ?? []).map((row) => mapAdminCirculation(row as Record<string, unknown>)));
    } else {
      setCirculation((current) => current.map((item) => item.id === record.id ? { ...item, status: "returned", returnedAt: new Date().toISOString(), returnRequestStatus: "accepted", returnAcceptedAt: new Date().toISOString(), returnCondition: condition } : item));
      setBooks((current) => current.map((book) => book.id === record.bookId ? { ...book, availableCopies: condition === "damaged" ? book.availableCopies : Math.min(book.totalCopies, book.availableCopies + 1) } : book));
    }
    await refreshLiveMetrics();
    toast.success("Return accepted, final fine recorded, and copy custody updated.");
    return true;
  };

  const toggleStudentStatus = async (student: AdminStudentProfile) => {
    const nextStatus = student.status === "active" ? "suspended" : "active";
    const supabase = getSupabaseBrowserClient();
    if (supabase && !isDemo) {
      const { error } = await supabase.rpc("admin_set_student_status", { p_student_id: student.id, p_status: nextStatus });
      if (error) return void toast.error(error.message);
    }
    setStudents((current) => current.map((item) => item.id === student.id ? { ...item, status: nextStatus } : item));
    toast.success(nextStatus === "active" ? "Student account restored." : "Student borrowing suspended.");
  };

  const setStudentVerification = async (
    student: AdminStudentProfile,
    status: "verified" | "rejected",
    notes: string,
  ) => {
    const supabase = getSupabaseBrowserClient();
    if (supabase && !isDemo) {
      const { error } = await supabase.rpc("admin_set_student_verification", {
        p_student_id: student.id,
        p_status: status,
        p_notes: notes.trim() || null,
      });
      if (error) {
        toast.error(error.message);
        return false;
      }
    }
    setStudents((current) => current.map((item) => item.id === student.id ? {
      ...item,
      verificationStatus: status,
      verificationNotes: notes.trim() || null,
      verifiedAt: status === "verified" ? new Date().toISOString() : null,
      verifierName: status === "verified" ? adminName : null,
      studentIdStatus: status === "verified" ? "verified" : item.studentIdStatus,
    } : item));
    toast.success(status === "verified" ? "Student identity marked as verified." : "Student identity review rejected.");
    return true;
  };

  const signOut = async () => {
    const supabase = getSupabaseBrowserClient();
    if (supabase && !isDemo) await supabase.auth.signOut();
    router.push("/sign-in");
    router.refresh();
  };

  const criticalOutstandingCount = criticalFines.filter((record) => record.fineOutstandingPesewas > 0).length;
  const headerSearchValue = activeTab === "requests" ? requestSearch : activeTab === "students" ? studentSearch : activeTab === "librarians" ? librarianSearch : activeTab === "circulation" ? circulationSearch : activeTab === "critical-fines" ? criticalFineSearch : activeTab === "books" ? bookSearch : "";
  const headerSearchPlaceholder = activeTab === "requests"
    ? "Search requests, students, books or staff…"
    : activeTab === "students"
    ? "Search students by name, ID or email…"
    : activeTab === "librarians"
      ? "Search librarians by name or email…"
    : activeTab === "circulation"
      ? "Search loans by student, book or ISBN…"
      : activeTab === "critical-fines"
        ? "Search critical fines by student, book, loan or payment…"
      : "Search catalogue title, author or ISBN…";
  const updateHeaderSearch = (value: string) => {
    if (activeTab === "requests") setRequestSearch(value);
    else if (activeTab === "students") setStudentSearch(value);
    else if (activeTab === "librarians") setLibrarianSearch(value);
    else if (activeTab === "circulation") setCirculationSearch(value);
    else if (activeTab === "critical-fines") setCriticalFineSearch(value);
    else {
      setBookSearch(value);
      if (activeTab !== "books") setActiveTab("books");
    }
  };

  if (authorization === "checking") return <div className="admin-auth-state"><span className="spinner" /><p>Checking administrator access…</p></div>;
  if (authorization === "denied") return <div className="admin-auth-state"><span><LuTriangleAlert /></span><h1>Administrator access required</h1><p>Sign in with an active administrator or super administrator account.</p><Link href="/sign-in" className="button button--primary">Return to sign in</Link></div>;

  return (
    <div className="admin-app">
      <aside className={cn("admin-sidebar", mobileMenu && "admin-sidebar--open")}>
        <div className="admin-sidebar__brand"><Brand href="/admin" /><button className="icon-button" onClick={() => setMobileMenu(false)} aria-label="Close navigation"><LuX /></button></div>
        <div className="admin-portal-label"><span>ADMIN PORTAL</span><small>{isDemo ? "Preview workspace" : "Live workspace"}</small></div>
        <Link className="admin-librarian-desk-link" href="/librarian"><LuRefreshCcw /><span>Open librarian desk</span><LuArrowRight /></Link>
        <nav className="admin-nav" aria-label="Admin navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} type="button" className={activeTab === item.id ? "is-active" : ""} onClick={() => { setActiveTab(item.id); setMobileMenu(false); }}><Icon /><span>{item.label}</span>{item.id === "requests" && stats.pending > 0 ? <b>{stats.pending}</b> : item.id === "circulation" && stats.overdue + stats.pendingReturns > 0 ? <b>{stats.overdue + stats.pendingReturns}</b> : item.id === "critical-fines" && criticalOutstandingCount > 0 ? <b>{criticalOutstandingCount}</b> : null}</button>;
          })}
        </nav>
        <div className="admin-sidebar__system"><span className={isDemo ? "is-demo" : ""} /><p><strong>{isDemo ? "Demo data active" : "All systems operational"}</strong><small>{isDemo ? "Connect Supabase to go live" : "Database connected"}</small></p></div>
        <button className="admin-signout" type="button" onClick={() => void signOut()}><LuLogOut /><span>Sign out</span></button>
      </aside>
      {mobileMenu && <button className="sidebar-scrim" onClick={() => setMobileMenu(false)} aria-label="Close navigation" />}

      <div className="admin-main">
        <header className="admin-header">
          <button className="icon-button admin-menu-button" onClick={() => setMobileMenu(true)} aria-label="Open navigation"><LuMenu /></button>
          <label className="admin-global-search"><LuSearch /><input type="search" value={headerSearchValue} onChange={(event) => updateHeaderSearch(event.target.value)} placeholder={headerSearchPlaceholder} aria-label={headerSearchPlaceholder.replace("…", "")} /></label>
          <div className="admin-header__actions">
            <button className="icon-button" aria-label={criticalOutstandingCount > 0 ? "View critical fine alerts" : "View circulation alerts"} onClick={() => setActiveTab(criticalOutstandingCount > 0 ? "critical-fines" : "circulation")}><LuBell />{(criticalOutstandingCount > 0 || stats.overdue > 0 || stats.pendingReturns > 0) && <i />}</button>
            <span className="header-separator" />
            <div className="admin-profile"><span>{initials(adminName)}</span><p><strong>{adminName}</strong><small>Library administrator</small></p></div>
          </div>
        </header>

        <main className="admin-content">
          {activeTab === "overview" && <OverviewTab stats={stats} books={books.filter((book) => !book.archivedAt)} circulation={circulation} trend={circulationTrend} adminName={adminName} onNavigate={setActiveTab} onAddBook={openAddBook} />}
          {activeTab === "requests" && <RequestsTab search={requestSearch} setSearch={setRequestSearch} />}
          {activeTab === "books" && <BooksTab books={filteredBooks} allBooks={books} search={bookSearch} setSearch={setBookSearch} categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter} formatFilter={formatFilter} setFormatFilter={setFormatFilter} statusFilter={bookStatusFilter} setStatusFilter={setBookStatusFilter} selectedBooks={selectedBooks} setSelectedBooks={setSelectedBooks} onSelectedAction={runSelectedBookAction} onAddBook={openAddBook} onEdit={openEditBook} onArchive={archiveBook} onUnarchive={unarchiveBook} />}
          {activeTab === "circulation" && <CirculationTab records={circulation} search={circulationSearch} setSearch={setCirculationSearch} onAcceptReturn={acceptReturn} />}
          {activeTab === "critical-fines" && <AdminCriticalFinesTab records={criticalFines} availability={criticalFinesAvailability} search={criticalFineSearch} setSearch={setCriticalFineSearch} />}
          {activeTab === "students" && <StudentsTab students={students} loading={studentsLoading} search={studentSearch} setSearch={setStudentSearch} onToggleStatus={toggleStudentStatus} onSetVerification={setStudentVerification} />}
          {activeTab === "librarians" && <LibrariansTab search={librarianSearch} setSearch={setLibrarianSearch} isDemo={isDemo} />}
          {activeTab === "digital" && <DigitalTab books={books.filter((book) => !book.archivedAt && book.format !== "physical")} onAddBook={openAddBook} onEdit={openEditBook} />}
          {activeTab === "categories" && <CategoriesTab books={books.filter((book) => !book.archivedAt)} />}
          {activeTab === "inventory" && <InventoryTab books={books.filter((book) => !book.archivedAt && book.format !== "digital")} onEdit={openEditBook} />}
          {activeTab === "reports" && <ReportsTab books={books.filter((book) => !book.archivedAt)} circulation={circulation} trend={circulationTrend} />}
          {activeTab === "settings" && <SettingsTab isDemo={isDemo} currentRole={adminRole} />}
        </main>
      </div>

      {bookModalOpen && <BookFormModal key={editingBook?.id ?? "new-book"} open book={editingBook} saving={savingBook} onClose={() => setBookModalOpen(false)} onSubmit={saveBook} />}
    </div>
  );
}

function AdminPageHeading({ kicker, title, description, action }: { kicker: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="admin-page-heading"><div><span>{kicker}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function OverviewTab({ stats, books, circulation, trend, adminName, onNavigate, onAddBook }: { stats: Stats; books: Book[]; circulation: CirculationRecord[]; trend: TrendPoint[]; adminName: string; onNavigate: (tab: AdminTab) => void; onAddBook: () => void }) {
  const kpis = [
    { label: "Total titles", value: stats.titles.toLocaleString(), detail: "Published catalogue records", icon: LuLibrary },
    { label: "Physical copies", value: stats.physical.toLocaleString(), detail: stats.available + " currently available", icon: LuPackageOpen },
    { label: "Active loans", value: stats.active.toLocaleString(), detail: "Across all students", icon: LuRefreshCcw },
    { label: "Pending requests", value: stats.pending.toLocaleString(), detail: `${stats.pendingDelivery} campus ${stats.pendingDelivery === 1 ? "delivery" : "deliveries"}`, icon: LuClipboardCheck, attention: stats.pending > 0 },
    { label: "Return requests", value: stats.pendingReturns.toLocaleString(), detail: "Awaiting physical acceptance", icon: LuRefreshCcw, attention: stats.pendingReturns > 0 },
    { label: "Overdue", value: stats.overdue.toLocaleString(), detail: stats.overdue ? "Needs attention" : "All on schedule", icon: LuTriangleAlert, attention: stats.overdue > 0 },
    { label: "Outstanding fines", value: formatGhs(stats.outstandingFinesPesewas), detail: "GH₵ 3.50 per completed overdue day", icon: CediMark, attention: stats.outstandingFinesPesewas > 0 },
    { label: "Registered students", value: stats.students.toLocaleString(), detail: "Verified library accounts", icon: LuUsers },
    { label: "Digital titles", value: stats.digital.toLocaleString(), detail: "Ready to read online", icon: LuBookOpen },
    { label: "Available copies", value: stats.available.toLocaleString(), detail: Math.round((stats.available / Math.max(stats.physical, 1)) * 100) + "% of inventory", icon: LuCircleCheck },
    { label: "Low stock titles", value: stats.lowStock.toLocaleString(), detail: "Two or fewer available", icon: LuClock3, attention: stats.lowStock > 0 },
  ];
  const overdue = circulation.filter((item) => item.status === "overdue");
  const topBooks = [...books].sort((a, b) => b.borrowCount - a.borrowCount).slice(0, 4);
  const lowStock = books.filter((book) => book.format !== "digital" && book.availableCopies <= 2).slice(0, 4);

  return (
    <div className="admin-tab overview-tab">
      <AdminPageHeading kicker="LIBRARY OVERVIEW" title={"Good evening, " + adminName.split(" ")[0] + "."} description="Here is what is happening across the library today." action={<div className="admin-heading-actions"><button className="button button--gold" type="button" onClick={() => onNavigate("requests")}><LuClipboardCheck /> Audit requests</button><button className="button button--outline" onClick={() => downloadCsv("knust-library-overview.csv", [{ total_titles: stats.titles, physical_copies: stats.physical, available_copies: stats.available, pending_requests: stats.pending, pending_delivery_requests: stats.pendingDelivery, pending_return_requests: stats.pendingReturns, outstanding_fines_ghs: (stats.outstandingFinesPesewas / 100).toFixed(2), active_loans: stats.active, overdue_loans: stats.overdue, registered_students: stats.students, digital_titles: stats.digital, low_stock_titles: stats.lowStock }])}><LuDownload /> Export report</button><button className="button button--primary" onClick={onAddBook}><LuPlus /> Add book</button></div>} />
      <section className="admin-kpi-grid">{kpis.map((kpi) => { const Icon = kpi.icon; return <article key={kpi.label} className={cn(kpi.attention && "has-attention")}><div><span>{kpi.label}</span><Icon /></div><strong>{kpi.value}</strong><small>{kpi.detail}</small></article>; })}</section>
      <div className="admin-dashboard-grid">
        <section className="admin-panel checkout-chart-panel">
          <div className="panel-heading"><div><span className="section-kicker">CIRCULATION</span><h2>Checkout activity</h2></div><div className="chart-legend"><span><i className="navy" />Borrowed</span><span><i className="gold" />Returned</span></div></div>
          <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trend} margin={circulationChartMargin}><defs><linearGradient id="borrowedFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0B1849" stopOpacity={0.2} /><stop offset="100%" stopColor="#0B1849" stopOpacity={0} /></linearGradient><linearGradient id="returnedFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FBC02D" stopOpacity={0.28} /><stop offset="100%" stopColor="#FBC02D" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="rgba(11,24,73,.08)" vertical={false} /><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "rgba(0,0,0,.5)", fontSize: 12 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: "rgba(0,0,0,.4)", fontSize: 11 }} /><Tooltip contentStyle={{ borderRadius: 10, border: "1px solid rgba(11,24,73,.1)", boxShadow: "0 12px 30px rgba(11,24,73,.12)" }} /><Area type="monotone" dataKey="borrowed" stroke="#0B1849" strokeWidth={2.5} fill="url(#borrowedFill)" /><Area type="monotone" dataKey="returned" stroke="#FBC02D" strokeWidth={2.5} fill="url(#returnedFill)" /></AreaChart></ResponsiveContainer></div>
        </section>
        <section className="admin-panel overdue-panel"><div className="panel-heading"><div><span className="section-kicker">NEEDS ATTENTION</span><h2>Overdue books</h2></div><button onClick={() => onNavigate("circulation")}>View all <LuArrowUpRight /></button></div>{overdue.length ? <div className="overdue-list">{overdue.slice(0, 4).map((item) => <div key={item.id}><span>{initials(item.studentName)}</span><p><strong>{item.studentName}</strong><small>{item.bookTitle}</small></p><em>Due {formatDate(item.dueAt)}</em></div>)}</div> : <div className="panel-empty"><LuCircleCheck /><strong>No overdue books</strong><p>Every active loan is currently on schedule.</p></div>}</section>
      </div>
      <div className="admin-dashboard-lower">
        <section className="admin-panel recent-table-panel"><div className="panel-heading"><div><span className="section-kicker">LATEST ACTIVITY</span><h2>Recent checkouts</h2></div><button onClick={() => onNavigate("circulation")}>View circulation <LuArrowRight /></button></div><div className="responsive-table"><table><thead><tr><th>Student</th><th>Book</th><th>Issued</th><th>Return date</th><th>Status</th></tr></thead><tbody>{circulation.slice(0, 5).map((item) => <tr key={item.id}><td><strong>{item.studentName}</strong><small>{item.indexNumber}</small></td><td>{item.bookTitle}</td><td>{formatDate(item.issuedAt)}</td><td>{formatDate(item.returnedAt || item.dueAt)}</td><td><StatusBadge status={item.status} /></td></tr>)}</tbody></table></div></section>
        <div className="admin-side-stack"><section className="admin-panel top-books-panel"><div className="panel-heading"><div><span className="section-kicker">MOST POPULAR</span><h2>Top borrowed</h2></div></div>{topBooks.map((book, index) => <div className="ranked-book" key={book.id}><b>{String(index + 1).padStart(2, "0")}</b><BookCover title={book.title} author={book.author} accent={book.accent} coverUrl={book.coverUrl} size="small" /><p><strong>{book.title}</strong><small>{book.borrowCount} total borrows</small></p><span>{book.availableCopies}/{book.totalCopies}</span></div>)}</section><section className="admin-panel low-stock-panel"><div className="panel-heading"><div><span className="section-kicker">INVENTORY</span><h2>Low stock</h2></div><button onClick={() => onNavigate("inventory")}>Manage</button></div>{lowStock.map((book) => <div key={book.id}><p><strong>{book.title}</strong><small>{book.category}</small></p><span>{book.availableCopies} left</span></div>)}</section></div>
      </div>
    </div>
  );
}

type BooksTabProps = {
  books: Book[];
  allBooks: Book[];
  search: string;
  setSearch: (value: string) => void;
  categoryFilter: string;
  setCategoryFilter: (value: string) => void;
  formatFilter: string;
  setFormatFilter: (value: string) => void;
  statusFilter: "active" | "archived" | "all";
  setStatusFilter: (value: "active" | "archived" | "all") => void;
  selectedBooks: string[];
  setSelectedBooks: React.Dispatch<React.SetStateAction<string[]>>;
  onSelectedAction: (action: "archive" | "restore") => Promise<void>;
  onAddBook: () => void;
  onEdit: (book: Book) => void;
  onArchive: (book: Book) => void;
  onUnarchive: (book: Book) => void;
};

function BooksTab({ books, allBooks, search, setSearch, categoryFilter, setCategoryFilter, formatFilter, setFormatFilter, statusFilter, setStatusFilter, selectedBooks, setSelectedBooks, onSelectedAction, onAddBook, onEdit, onArchive, onUnarchive }: BooksTabProps) {
  const categories = Array.from(new Set(allBooks.map((book) => book.category)));
  const visibleIds = books.map((book) => book.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedBooks.includes(id));
  const selected = allBooks.filter((book) => selectedBooks.includes(book.id));
  const selectedActive = selected.filter((book) => !book.archivedAt).length;
  const selectedArchived = selected.length - selectedActive;
  const toggleAll = () => setSelectedBooks((current) => allVisibleSelected ? current.filter((id) => !visibleIds.includes(id)) : Array.from(new Set([...current, ...visibleIds])));

  return (
    <div className="admin-tab">
      <AdminPageHeading kicker="CATALOGUE" title="All library books" description="Publish live titles and manage a reversible, audited archive." action={<button className="button button--primary" onClick={onAddBook}><LuPlus /> Add book</button>} />
      <div className="catalog-lifecycle-summary">
        <span><strong>{allBooks.filter((book) => !book.archivedAt).length}</strong> live titles</span>
        <span><strong>{allBooks.filter((book) => Boolean(book.archivedAt)).length}</strong> archived titles</span>
        <p>Archived books disappear from student discovery but retain every loan, fine, and custody record.</p>
      </div>
      <section className="admin-table-card">
        <div className="table-toolbar">
          <label><LuSearch /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, author, ISBN, shelf or language" aria-label="Search the book catalogue" /></label>
          <div>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "active" | "archived" | "all")} aria-label="Filter books by lifecycle status"><option value="active">Live catalogue</option><option value="archived">Archive</option><option value="all">All statuses</option></select>
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="Filter books by category"><option value="all">All categories</option>{categories.map((category) => <option key={category}>{category}</option>)}</select>
            <select value={formatFilter} onChange={(event) => setFormatFilter(event.target.value)} aria-label="Filter books by format"><option value="all">All formats</option><option value="physical">Physical</option><option value="digital">Online</option><option value="both">Physical + online</option></select>
            <button className="button button--outline" onClick={() => downloadCsv("knust-library-catalogue.csv", books.map((book) => ({ title: book.title, author: book.author, isbn: book.isbn, category: book.category, format: book.format, lifecycle_status: book.archivedAt ? "archived" : "live", archived_at: book.archivedAt, total_copies: book.totalCopies, available_copies: book.availableCopies, borrow_count: book.borrowCount })))}><LuDownload /> Export</button>
          </div>
        </div>
        {selected.length > 0 && <div className="book-bulk-actions" role="region" aria-label="Selected book actions"><span><strong>{selected.length}</strong> selected</span>{selectedActive > 0 && <button type="button" onClick={() => void onSelectedAction("archive")}><LuArchive /> Archive {selectedActive}</button>}{selectedArchived > 0 && <button type="button" onClick={() => void onSelectedAction("restore")}><LuUndo2 /> Restore {selectedArchived}</button>}<button type="button" onClick={() => setSelectedBooks([])}>Clear</button></div>}
        <div className="responsive-table books-table">
          <table>
            <thead><tr><th><input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} aria-label="Select all visible books" /></th><th>Book</th><th>ISBN</th><th>Category</th><th>Format</th><th>Stock</th><th>Popularity</th><th>Lifecycle</th><th>Actions</th></tr></thead>
            <tbody>{books.map((book) => <tr key={book.id} className={selectedBooks.includes(book.id) ? "is-selected" : ""}>
              <td><input type="checkbox" checked={selectedBooks.includes(book.id)} onChange={() => setSelectedBooks((current) => current.includes(book.id) ? current.filter((id) => id !== book.id) : [...current, book.id])} aria-label={"Select " + book.title} /></td>
              <td><div className="table-book"><BookCover title={book.title} author={book.author} accent={book.accent} coverUrl={book.coverUrl} size="small" /><span><strong>{book.title}</strong><small>{book.author}</small></span></div></td>
              <td>{book.isbn || "—"}</td><td>{book.category}</td><td><span className="format-pill">{book.format === "both" ? "physical + online" : book.format}</span></td>
              <td><strong>{book.format === "digital" ? "—" : book.availableCopies + " / " + book.totalCopies}</strong><small>{book.format === "digital" ? "Online only" : "available"}</small></td>
              <td>{book.borrowCount} borrows</td>
              <td><StatusBadge status={book.archivedAt ? "archived" : "live"} />{book.archivedAt && <small>{formatDate(book.archivedAt)}</small>}</td>
              <td><div className="table-actions">{book.archivedAt ? <button onClick={() => void onUnarchive(book)} title="Restore book"><LuUndo2 /></button> : <><button onClick={() => onEdit(book)} title="Edit book"><LuPencil /></button><button onClick={() => void onArchive(book)} title="Archive book"><LuArchive /></button></>}</div></td>
            </tr>)}</tbody>
          </table>
          {!books.length && <div className="table-empty"><LuSearch /><strong>No matching books</strong><p>Adjust your search or lifecycle filters.</p></div>}
        </div>
        <div className="table-pagination"><span>Showing all <strong>{books.length}</strong> matching titles</span></div>
      </section>
    </div>
  );
}

type ReturnCondition = "new" | "good" | "fair" | "poor" | "damaged";

function CirculationTab({ records, search, setSearch, onAcceptReturn }: { records: CirculationRecord[]; search: string; setSearch: (value: string) => void; onAcceptReturn: (record: CirculationRecord, condition: ReturnCondition) => Promise<boolean> }) {
  const [filter, setFilter] = useState("all");
  const [selectedReturn, setSelectedReturn] = useState<CirculationRecord | null>(null);
  const [condition, setCondition] = useState<ReturnCondition>("good");
  const [accepting, setAccepting] = useState(false);
  const matchesFilter = (record: CirculationRecord) => filter === "all" || filter === "return-requested" ? filter === "all" || record.returnRequestStatus === "pending" : record.status === filter;
  const visible = records.filter((record) => matchesFilter(record) && matchesAdminSearch(search, [record.studentName, record.indexNumber, record.studentEmail, record.bookTitle, record.isbn, record.accessionNumber, record.status, record.returnRequestStatus, record.returnAcceptorName, record.returnAcceptorEmail]));
  const pendingReturns = records.filter((record) => record.returnRequestStatus === "pending");
  const outstandingFines = records.reduce((total, record) => total + Math.max(0, record.fineOutstandingPesewas ?? 0), 0);

  useEffect(() => {
    if (!selectedReturn) return;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !accepting) setSelectedReturn(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = priorOverflow;
    };
  }, [accepting, selectedReturn]);

  const acceptSelected = async () => {
    if (!selectedReturn) return;
    setAccepting(true);
    const accepted = await onAcceptReturn(selectedReturn, condition);
    setAccepting(false);
    if (accepted) setSelectedReturn(null);
  };

  return (
    <div className="admin-tab">
      <AdminPageHeading kicker="LIVE CUSTODY AUDIT" title="Borrowing, returns & fines" description="Track every overdue period, student return request, exact copy, and accepting staff member in real time." action={<button className="button button--outline" onClick={() => downloadCsv("knust-library-circulation.csv", visible.map((record) => ({ student: record.studentName, student_email: record.studentEmail, student_id: record.indexNumber, book: record.bookTitle, isbn: record.isbn, accession: record.accessionNumber, issued_at: record.issuedAt, due_at: record.dueAt, returned_at: record.returnedAt, loan_status: record.status, return_request_status: record.returnRequestStatus, return_requested_at: record.returnRequestedAt, accepted_at: record.returnAcceptedAt, accepted_by: record.returnAcceptorName, accepting_staff_email: record.returnAcceptorEmail, return_condition: record.returnCondition, overdue_periods: record.overduePeriods, fine_ghs: ((record.fineAmountPesewas ?? 0) / 100).toFixed(2), outstanding_fine_ghs: ((record.fineOutstandingPesewas ?? 0) / 100).toFixed(2) })))}><LuDownload /> Export audit</button>} />
      <div className="admin-summary-strip return-summary-strip">
        <div><span><LuRefreshCcw /></span><p><small>Active loans</small><strong>{records.filter((record) => record.status !== "returned").length}</strong></p></div>
        <div className={pendingReturns.length ? "has-attention" : ""}><span><LuClipboardCheck /></span><p><small>Return requests</small><strong>{pendingReturns.length}</strong></p></div>
        <div><span><LuTriangleAlert /></span><p><small>Overdue</small><strong>{records.filter((record) => record.status === "overdue").length}</strong></p></div>
        <div className={outstandingFines ? "has-attention" : ""}><span><CediMark /></span><p><small>Outstanding fines</small><strong>{formatGhs(outstandingFines)}</strong></p></div>
      </div>
      <section className="admin-table-card return-audit-table">
        <div className="table-toolbar"><label><LuSearch /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student, staff, book, ISBN or accession" aria-label="Search circulation and return records" /></label></div>
        <div className="table-tabs">{["all", "return-requested", "active", "due-soon", "overdue", "returned"].map((item) => <button type="button" key={item} className={filter === item ? "is-active" : ""} onClick={() => setFilter(item)}>{item === "all" ? "All records" : item.replaceAll("-", " ")}{item === "return-requested" && <span>{pendingReturns.length}</span>}</button>)}</div>
        <div className="responsive-table">
          <table>
            <thead><tr><th>Student</th><th>Book & copy</th><th>Loan dates</th><th>Return workflow</th><th>Fine</th><th>Accepted by</th><th>Action</th></tr></thead>
            <tbody>{visible.map((record) => <tr key={record.id}>
              <td><div className="table-person"><span>{initials(record.studentName)}</span><p><strong>{record.studentName}</strong><small>{record.studentEmail || record.indexNumber}</small><small>{record.indexNumber}</small></p></div></td>
              <td><strong>{record.bookTitle}</strong><small>{record.isbn} · {record.accessionNumber || "No accession"}</small></td>
              <td><strong>Due {formatDate(record.dueAt)}</strong><small>{record.returnedAt ? "Returned " + formatDate(record.returnedAt) : "Issued " + formatDate(record.issuedAt)}</small><StatusBadge status={record.status} /></td>
              <td>{record.returnRequestStatus ? <><StatusBadge status={record.returnRequestStatus === "pending" ? "return requested" : record.returnRequestStatus} /><small>{record.returnRequestedAt ? "Requested " + formatDate(record.returnRequestedAt) : "Request recorded"}</small></> : <><strong>No request</strong><small>Student still holds this copy</small></>}</td>
              <td><strong className={(record.fineOutstandingPesewas ?? 0) > 0 ? "fine-value" : ""}>{formatGhs(record.fineOutstandingPesewas)}</strong><small>{record.overduePeriods ? `${record.overduePeriods} completed × ${formatGhs(record.fineRatePesewas)}` : "No completed overdue period"}</small></td>
              <td>{record.returnAcceptorName ? <><strong>{record.returnAcceptorName}</strong><small>{record.returnAcceptorEmail || "Verified staff"}</small><small>{record.returnAcceptedAt ? formatDate(record.returnAcceptedAt) : "Accepted"} · {record.returnCondition || "condition recorded"}</small></> : <><strong>—</strong><small>No staff acceptance yet</small></>}</td>
              <td>{record.returnRequestStatus === "pending" ? <button className="text-action is-positive" onClick={() => { setCondition("good"); setSelectedReturn(record); }}><LuCheck /> Review return</button> : record.status === "returned" ? <span className="completed-action"><LuCircleCheck /> Complete</span> : <span className="completed-action"><LuClock3 /> Awaiting request</span>}</td>
            </tr>)}</tbody>
          </table>
          {!visible.length && <div className="table-empty"><LuSearch /><strong>No matching circulation records</strong><p>Try another status, student, staff member, title, ISBN, or accession number.</p></div>}
        </div>
      </section>

      {selectedReturn && <div className="admin-return-modal" role="presentation">
        <button type="button" className="admin-return-modal__scrim" aria-label="Close return review" disabled={accepting} onClick={() => setSelectedReturn(null)} />
        <section className="admin-return-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="admin-return-title" aria-describedby="admin-return-description">
          <button type="button" className="admin-return-modal__close" aria-label="Close return review" disabled={accepting} onClick={() => setSelectedReturn(null)}><LuX /></button>
          <span className="admin-return-modal__icon"><LuClipboardCheck /></span><small>PHYSICAL CUSTODY CHECK</small><h2 id="admin-return-title">Accept this exact copy?</h2>
          <p id="admin-return-description">Confirm only after receiving <strong>{selectedReturn.bookTitle}</strong>, accession <strong>{selectedReturn.accessionNumber || "not recorded"}</strong>, from <strong>{selectedReturn.studentName}</strong>. Acceptance ends fine accrual and records your administrator identity.</p>
          <div className="admin-return-modal__facts"><p><span>Requested</span><strong>{formatDate(selectedReturn.returnRequestedAt || "")}</strong></p><p><span>Current fine</span><strong>{formatGhs(selectedReturn.fineOutstandingPesewas)}</strong></p><p><span>Due date</span><strong>{formatDate(selectedReturn.dueAt)}</strong></p></div>
          <label className="admin-field"><span>Physical condition at return</span><select value={condition} onChange={(event) => setCondition(event.target.value as ReturnCondition)} disabled={accepting}><option value="new">New</option><option value="good">Good</option><option value="fair">Fair</option><option value="poor">Poor</option><option value="damaged">Damaged — quarantine copy</option></select></label>
          <div className="admin-return-modal__notice"><LuShieldCheck /><p><strong>This action is final and audited.</strong><span>A damaged copy will not return to available stock. The student receives an in-app confirmation immediately.</span></p></div>
          <div className="admin-return-modal__actions"><button type="button" className="button button--primary" disabled={accepting} onClick={() => void acceptSelected()}>{accepting ? "Accepting return…" : "Accept return"}<LuCircleCheck /></button><button type="button" className="button button--outline" disabled={accepting} onClick={() => setSelectedReturn(null)}>Cancel</button></div>
        </section>
      </div>}
    </div>
  );
}

function AdminCriticalFinesTab({ records, availability, search, setSearch }: { records: AdminCriticalFine[]; availability: CriticalFinesAvailability; search: string; setSearch: (value: string) => void }) {
  const [filter, setFilter] = useState<"outstanding" | "paid" | "all">("outstanding");
  const [signingEvidence, setSigningEvidence] = useState<string | null>(null);
  const [signedEvidence, setSignedEvidence] = useState<{ loanItemId: string; kind: "id-card" | "face-snapshot"; url: string } | null>(null);
  const outstanding = records.filter((record) => record.fineOutstandingPesewas > 0);
  const paid = records.filter((record) => criticalFineStatus(record) === "paid");
  const outstandingAmount = outstanding.reduce((sum, record) => sum + record.fineOutstandingPesewas, 0);
  const paidAmount = records.reduce((sum, record) => sum + record.finePaidPesewas, 0);
  const affectedStudents = new Set(outstanding.map((record) => record.studentId)).size;
  const visible = useMemo(() => records.filter((record) => {
    const status = criticalFineStatus(record);
    const matchesFilter = filter === "all" || (filter === "paid" ? status === "paid" : status !== "paid");
    return matchesFilter && matchesAdminSearch(search, [
      record.studentName,
      record.indexNumber,
      record.studentEmail,
      record.personalEmail,
      record.phone,
      record.programme,
      record.department,
      record.residenceType,
      record.residenceLocation,
      record.bookTitle,
      record.author,
      record.isbn,
      record.accessionNumber,
      record.loanId,
      record.loanItemId,
      record.finePaymentStatus,
      record.finePaymentMethod,
      record.finePaymentReference,
      record.guardianFullName,
      record.guardianPhone,
    ]);
  }), [filter, records, search]);

  const openPrivateEvidence = async (record: AdminCriticalFine, kind: "id-card" | "face-snapshot") => {
    const objectPath = kind === "id-card" ? record.studentIdObjectPath : record.faceSnapshotObjectPath;
    if (!objectPath) return void toast.error(kind === "id-card" ? "No private student ID is available." : "No private face snapshot is available.");
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return void toast.error("Connect Supabase before opening private verification evidence.");
    const evidenceKey = record.loanItemId + ":" + kind;
    setSigningEvidence(evidenceKey);
    setSignedEvidence(null);
    const { data, error } = await supabase.storage.from("student-ids").createSignedUrl(objectPath, 60);
    setSigningEvidence(null);
    if (error || !data?.signedUrl) return void toast.error(error?.message || "The secure evidence link could not be created.");
    const nextEvidence = { loanItemId: record.loanItemId, kind, url: data.signedUrl };
    setSignedEvidence(nextEvidence);
    window.setTimeout(() => setSignedEvidence((current) => current?.url === nextEvidence.url ? null : current), 60_000);
  };

  const exportLedger = () => downloadCsv("knust-library-critical-fines.csv", visible.map((record) => ({
    student: record.studentName,
    index_number: record.indexNumber,
    student_email: record.studentEmail,
    personal_email: record.personalEmail,
    phone: record.phone,
    programme: record.programme,
    department: record.department,
    residence: `${humanizeCriticalValue(record.residenceType)} · ${record.residenceLocation}`,
    book: record.bookTitle,
    author: record.author,
    isbn: record.isbn,
    accession_number: record.accessionNumber,
    loan_id: record.loanId,
    loan_item_id: record.loanItemId,
    borrowed_at: record.borrowedAt,
    due_at: record.dueAt,
    returned_at: record.returnedAt,
    loan_item_status: record.loanItemStatus,
    critical_since: record.criticalSince,
    completed_days_critical: record.completedDaysCritical,
    overdue_periods: record.overduePeriods,
    fine_assessed_ghs: (record.fineAmountPesewas / 100).toFixed(2),
    fine_paid_ghs: (record.finePaidPesewas / 100).toFixed(2),
    fine_outstanding_ghs: (record.fineOutstandingPesewas / 100).toFixed(2),
    payment_status: record.finePaymentStatus,
    payment_method: record.finePaymentMethod,
    payment_count: record.finePaymentCount,
    payment_reference: record.finePaymentReference,
    paid_at: record.finePaidAt,
    verification_status: record.verificationStatus,
  })));

  return (
    <div className="admin-tab admin-critical-fines-tab">
      <AdminPageHeading
        kicker="GH₵ · 48-HOUR ESCALATION REGISTER"
        title="Critical fines"
        description="Track each loan that reached the 48-hour fine threshold, its exact student, payment history, and current outstanding balance."
        action={<button className="button button--outline" type="button" onClick={exportLedger} disabled={availability !== "ready" || visible.length === 0}><LuDownload /> Export safe ledger</button>}
      />

      <section className="critical-fines-kpis" aria-label="Critical fine totals">
        <article className={outstanding.length ? "has-attention" : ""}><span><LuTriangleAlert /></span><p><small>Unpaid critical borrows</small><strong>{outstanding.length}</strong><em>48+ hours overdue</em></p></article>
        <article><span><LuUsers /></span><p><small>Students to contact</small><strong>{affectedStudents}</strong><em>Unique student accounts</em></p></article>
        <article className={outstandingAmount ? "has-attention" : ""}><span><CediMark /></span><p><small>Exact outstanding</small><strong>{formatCriticalCedis(outstandingAmount)}</strong><em>Still owed now</em></p></article>
        <article><span><LuCircleCheck /></span><p><small>Payments tracked</small><strong>{formatCriticalCedis(paidAmount)}</strong><em>{paid.length} fully settled</em></p></article>
      </section>

      <section className="critical-fines-register" aria-labelledby="admin-critical-fines-title">
        <div className="critical-fines-toolbar">
          <div><span>PAYMENT LEDGER</span><h2 id="admin-critical-fines-title">48-hour fine accounts</h2><p>Balances update from the loan and simulated-payment ledgers in real time.</p></div>
          <label><LuSearch /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student, loan, book or payment reference" aria-label="Search critical fines" /></label>
        </div>
        <div className="critical-fines-filters" role="tablist" aria-label="Critical fine payment status">
          <button type="button" role="tab" aria-selected={filter === "outstanding"} className={filter === "outstanding" ? "is-active" : ""} onClick={() => setFilter("outstanding")}>Outstanding <span>{outstanding.length}</span></button>
          <button type="button" role="tab" aria-selected={filter === "paid"} className={filter === "paid" ? "is-active" : ""} onClick={() => setFilter("paid")}>Paid <span>{paid.length}</span></button>
          <button type="button" role="tab" aria-selected={filter === "all"} className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}>All tracked <span>{records.length}</span></button>
        </div>

        {availability === "loading" && <div className="critical-fines-state" aria-live="polite"><span className="spinner" /><strong>Loading the critical fine register…</strong><p>Matching current loans and payment records.</p></div>}
        {availability === "unavailable" && <div className="critical-fines-state critical-fines-state--unavailable"><LuTriangleAlert /><strong>Critical fines view unavailable</strong><p>This isolated register has not been installed or is temporarily unavailable. The rest of the admin dashboard remains live.</p></div>}
        {availability === "ready" && (
          <div className="critical-fine-card-list" aria-live="polite">
            {visible.map((record) => {
              const paymentState = criticalFineStatus(record);
              return (
                <article className={cn("critical-fine-card", paymentState === "paid" && "is-paid")} key={record.loanItemId}>
                  <header>
                    <div className="critical-fine-person"><span>{initials(record.studentName)}</span><p><strong>{record.studentName}</strong><small>{record.indexNumber}</small><small>{record.studentEmail}</small></p></div>
                    <span className={cn("critical-fine-payment-state", "is-" + paymentState)}>{paymentState === "part-paid" ? "Part-paid · balance open" : paymentState}</span>
                  </header>
                  <div className="critical-fine-card__summary">
                    <p><small>Book &amp; copy</small><strong>{record.bookTitle}</strong><span>{record.author} · {record.isbn} · Accession {record.accessionNumber}</span></p>
                    <p><small>Critical age</small><strong>{record.overduePeriods} overdue periods · {record.completedDaysCritical} critical days</strong><span>Critical since {formatCriticalTimestamp(record.criticalSince)} · {humanizeCriticalValue(record.loanItemStatus)}</span></p>
                    <p className={record.fineOutstandingPesewas > 0 ? "has-balance" : ""}><small>Outstanding now</small><strong>{formatCriticalCedis(record.fineOutstandingPesewas)}</strong><span>{formatCriticalCedis(record.finePaidPesewas)} paid of {formatCriticalCedis(record.fineAmountPesewas)}</span></p>
                  </div>
                  <details className="critical-fine-card__details">
                    <summary>Complete student, loan, payment &amp; verification record <LuChevronDown /></summary>
                    <div className="critical-fine-detail-grid">
                      <section><span>STUDENT &amp; ACADEMICS</span><dl><div><dt>Database student ID</dt><dd>{record.studentId}</dd></div><div><dt>Gender</dt><dd>{record.gender}</dd></div><div><dt>Programme</dt><dd>{record.programme}</dd></div><div><dt>Department</dt><dd>{record.department}</dd></div><div><dt>Academic years</dt><dd>{record.startYear || "Not recorded"} – {record.completionYear || "Not recorded"}</dd></div><div><dt>Residence</dt><dd>{humanizeCriticalValue(record.residenceType)} · {record.residenceLocation}</dd></div></dl></section>
                      <section><span>CONTACT &amp; GUARDIAN</span><dl><div><dt>KNUST email</dt><dd>{record.studentEmail}</dd></div><div><dt>Personal email</dt><dd>{record.personalEmail}</dd></div><div><dt>Phone</dt><dd>{record.phone}</dd></div><div><dt>Guardian</dt><dd>{record.guardianFullName}</dd></div><div><dt>Guardian phone</dt><dd>{record.guardianPhone}</dd></div><div><dt>Relationship</dt><dd>{record.guardianRelationship}</dd></div></dl></section>
                      <section><span>LOAN &amp; EXACT COPY</span><dl><div><dt>Book ID</dt><dd>{record.bookId}</dd></div><div><dt>Loan ID</dt><dd>{record.loanId}</dd></div><div><dt>Loan item ID</dt><dd>{record.loanItemId}</dd></div><div><dt>Borrowed</dt><dd>{formatCriticalTimestamp(record.borrowedAt)}</dd></div><div><dt>Due</dt><dd>{formatCriticalTimestamp(record.dueAt)}</dd></div><div><dt>Returned</dt><dd>{formatCriticalTimestamp(record.returnedAt)}</dd></div></dl></section>
                      <section><span>PAYMENT LEDGER</span><dl><div><dt>Assessed</dt><dd>{formatCriticalCedis(record.fineAmountPesewas)}</dd></div><div><dt>Paid</dt><dd>{formatCriticalCedis(record.finePaidPesewas)}</dd></div><div><dt>Outstanding</dt><dd>{formatCriticalCedis(record.fineOutstandingPesewas)}</dd></div><div><dt>Recorded status</dt><dd>{humanizeCriticalValue(record.finePaymentStatus)}</dd></div><div><dt>Method</dt><dd>{humanizeCriticalValue(record.finePaymentMethod)}</dd></div><div><dt>Payment entries</dt><dd>{record.finePaymentCount}</dd></div><div><dt>Reference</dt><dd>{record.finePaymentReference || "No payment reference"}</dd></div><div><dt>Paid at</dt><dd>{formatCriticalTimestamp(record.finePaidAt)}</dd></div></dl></section>
                      <section className="critical-fine-verification"><span>ADMIN-ONLY VERIFICATION</span><dl><div><dt>Private ID card</dt><dd>{record.studentIdObjectPath ? "Uploaded to private storage" : "No stored upload"}</dd></div><div><dt>ID review</dt><dd>{humanizeCriticalValue(record.studentIdStatus)}</dd></div><div><dt>Student record check</dt><dd>{humanizeCriticalValue(record.studentRecordCheckStatus)}</dd></div><div><dt>Face-presence check</dt><dd>{humanizeCriticalValue(record.facialScanStatus)}</dd></div><div><dt>Private face snapshot</dt><dd>{record.faceSnapshotObjectPath ? "Available to administrators" : "No stored snapshot"}</dd></div><div><dt>Snapshot uploaded</dt><dd>{formatCriticalTimestamp(record.faceSnapshotUploadedAt)}</dd></div><div><dt>Overall verification</dt><dd>{humanizeCriticalValue(record.verificationStatus)}</dd></div></dl><div className="critical-fine-evidence-actions">{record.studentIdObjectPath && <button type="button" onClick={() => void openPrivateEvidence(record, "id-card")} disabled={signingEvidence === record.loanItemId + ":id-card"}><LuShieldCheck /> {signingEvidence === record.loanItemId + ":id-card" ? "Signing ID link…" : "View ID card for 60 seconds"}</button>}{record.faceSnapshotObjectPath && <button type="button" onClick={() => void openPrivateEvidence(record, "face-snapshot")} disabled={signingEvidence === record.loanItemId + ":face-snapshot"}><LuUserRound /> {signingEvidence === record.loanItemId + ":face-snapshot" ? "Signing face link…" : "View face snapshot for 60 seconds"}</button>}</div>{signedEvidence?.loanItemId === record.loanItemId && <a className="critical-fine-evidence-link" href={signedEvidence.url} target="_blank" rel="noreferrer"><LuArrowUpRight /> Open {signedEvidence.kind === "id-card" ? "private ID card" : "private face snapshot"} · expires in 60 seconds</a>}<p><LuShieldCheck /> Raw private object paths are never rendered. Evidence links expire after 60 seconds. If no private snapshot exists, the face check remains status-only; no biometric template is stored.</p></section>
                    </div>
                  </details>
                </article>
              );
            })}
            {!visible.length && <div className="critical-fines-state"><LuCircleCheck /><strong>{filter === "outstanding" ? "No unpaid critical fines" : "No matching critical fine records"}</strong><p>{filter === "outstanding" ? "Every 48-hour fine currently in the register is settled." : "Try another payment state or search term."}</p></div>}
          </div>
        )}
      </section>
    </div>
  );
}

function DigitalTab({ books, onAddBook, onEdit }: { books: Book[]; onAddBook: () => void; onEdit: (book: Book) => void }) {
  return <div className="admin-tab"><AdminPageHeading kicker="ONLINE COLLECTION" title="Digital library" description="Manage books that students can read online from any device." action={<button className="button button--primary" onClick={onAddBook}><LuPlus /> Add digital book</button>} /><section className="digital-admin-hero"><div><span><LuBookOpen /></span><div><small>ONLINE READING</small><h2>{books.length} digital titles are live</h2><p>Typed book content is stored as safe text and protected by student authentication.</p></div></div></section><div className="digital-admin-grid">{books.map((book) => <article key={book.id}><BookCover title={book.title} author={book.author} accent={book.accent} coverUrl={book.coverUrl} size="medium" /><div><span>{book.category}</span><h3>{book.title}</h3><p>{book.author}</p><div><small>{book.readTime}</small><small>{book.borrowCount} physical borrows</small></div><button className="button button--outline button--full" onClick={() => onEdit(book)}>Edit content <LuPencil /></button></div></article>)}</div></div>;
}

function CategoriesTab({ books }: { books: Book[] }) {
  const categories = Array.from(new Set(books.map((book) => book.category))).map((name) => ({ name, books: books.filter((book) => book.category === name), accent: categoryAccents[name] ?? "#0B1849" }));
  return <div className="admin-tab"><AdminPageHeading kicker="ORGANISATION" title="Book categories" description="Keep the catalogue easy to browse and understand." /><div className="category-admin-grid">{categories.map((category) => <article key={category.name} style={{ "--category-accent": category.accent } as React.CSSProperties}><div><span>{category.name.slice(0, 1)}</span></div><h3>{category.name}</h3><p>{category.books.length} titles • {category.books.reduce((sum, book) => sum + book.borrowCount, 0)} total borrows</p><div><span style={{ inlineSize: Math.min(100, category.books.length * 12) + "%" }} /></div><small>{category.books.filter((book) => book.format !== "physical").length} digital editions</small></article>)}</div></div>;
}

function InventoryTab({ books, onEdit }: { books: Book[]; onEdit: (book: Book) => void }) {
  return <div className="admin-tab"><AdminPageHeading kicker="PHYSICAL COLLECTION" title="Inventory control" description="Monitor physical copies, shelf locations, and low-stock titles." action={<button className="button button--outline" onClick={() => downloadCsv("knust-library-inventory.csv", books.map((book) => ({ title: book.title, isbn: book.isbn, shelf: book.shelfLocation, total_copies: book.totalCopies, available: book.availableCopies, on_loan: book.totalCopies - book.availableCopies })))}><LuDownload /> Export inventory</button>} /><section className="admin-table-card"><div className="inventory-health"><div><span>COLLECTION AVAILABILITY</span><strong>{Math.round((books.reduce((sum, book) => sum + book.availableCopies, 0) / Math.max(1, books.reduce((sum, book) => sum + book.totalCopies, 0))) * 100)}%</strong><p>of all physical copies are currently available</p></div><div className="inventory-health__bar"><span style={{ inlineSize: Math.round((books.reduce((sum, book) => sum + book.availableCopies, 0) / Math.max(1, books.reduce((sum, book) => sum + book.totalCopies, 0))) * 100) + "%" }} /></div></div><div className="responsive-table"><table><thead><tr><th>Title</th><th>Total copies</th><th>Available</th><th>On loan</th><th>Availability</th><th>Health</th><th>Action</th></tr></thead><tbody>{books.map((book) => { const percentage = Math.round((book.availableCopies / Math.max(book.totalCopies, 1)) * 100); return <tr key={book.id}><td><strong>{book.title}</strong><small>{book.isbn || "No ISBN"}</small></td><td>{book.totalCopies}</td><td><strong>{book.availableCopies}</strong></td><td>{book.totalCopies - book.availableCopies}</td><td><div className="mini-progress"><span style={{ inlineSize: percentage + "%" }} /></div><small>{percentage}%</small></td><td><StatusBadge status={book.availableCopies <= 2 ? "low stock" : "healthy"} /></td><td><button className="text-action" onClick={() => onEdit(book)}>Adjust stock</button></td></tr>; })}</tbody></table></div></section></div>;
}

function ReportsTab({ books, circulation, trend }: { books: Book[]; circulation: CirculationRecord[]; trend: TrendPoint[] }) {
  const categories = Array.from(new Set(books.map((book) => book.category))).map((category) => ({ category, count: books.filter((book) => book.category === category).length })).sort((a, b) => b.count - a.count);
  const activelyBorrowing = new Set(circulation.filter((item) => item.status !== "returned").map((item) => item.indexNumber)).size;
  return (
    <div className="admin-tab">
      <AdminPageHeading
        kicker="ANALYTICS"
        title="Library reports"
        description="Understand circulation, collection health, and student engagement."
        action={<button className="button button--primary" onClick={() => downloadCsv("knust-library-report.csv", circulation.map((item) => ({ student: item.studentName, student_id: item.indexNumber, book: item.bookTitle, isbn: item.isbn, issued_at: item.issuedAt, due_at: item.dueAt, returned_at: item.returnedAt, status: item.status })))}><LuDownload /> Export full report</button>}
      />
      <div className="report-period"><span><LuCalendarDays /> Reporting period</span><button>Last 7 days <LuChevronDown /></button></div>
      <div className="reports-grid">
        <section className="admin-panel report-large">
          <div className="panel-heading"><div><span className="section-kicker">CIRCULATION TREND</span><h2>Borrowed versus returned</h2></div></div>
          <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trend}><CartesianGrid stroke="rgba(11,24,73,.08)" vertical={false} /><XAxis dataKey="day" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} /><Tooltip /><Area type="monotone" dataKey="borrowed" stroke="#0B1849" fill="#0B184920" strokeWidth={3} /><Area type="monotone" dataKey="returned" stroke="#FBC02D" fill="#FBC02D25" strokeWidth={3} /></AreaChart></ResponsiveContainer></div>
        </section>
        <section className="admin-panel report-breakdown">
          <div className="panel-heading"><div><span className="section-kicker">COLLECTION</span><h2>Titles by category</h2></div></div>
          {categories.map((item) => <div key={item.category}><p><span>{item.category}</span><strong>{item.count}</strong></p><div><span style={{ inlineSize: (item.count / Math.max(...categories.map((entry) => entry.count))) * 100 + "%" }} /></div></div>)}
        </section>
        <section className="admin-panel report-metrics">
          <div><span><LuUsers /></span><p><small>Student engagement</small><strong>{activelyBorrowing}</strong><em>currently borrowing</em></p></div>
          <div><span><LuClipboardCheck /></span><p><small>Return rate</small><strong>{Math.round((circulation.filter((item) => item.status === "returned").length / Math.max(1, circulation.length)) * 100)}%</strong><em>in recent activity</em></p></div>
          <div><span><LuBookOpen /></span><p><small>Digital share</small><strong>{Math.round((books.filter((book) => book.format !== "physical").length / Math.max(1, books.length)) * 100)}%</strong><em>of the catalogue</em></p></div>
        </section>
      </div>
    </div>
  );
}

function SettingsTab({ isDemo, currentRole }: { isDemo: boolean; currentRole: "admin" | "super_admin" }) {
  const canManageSignupLock = currentRole === "super_admin";
  const [days, setDays] = useState(7);
  const [limit, setLimit] = useState(5);
  const [reminders, setReminders] = useState(true);
  const [reminderHours, setReminderHours] = useState(48);
  const [libraryName, setLibraryName] = useState("KNUST Library Mall");
  const [deskLocation, setDeskLocation] = useState("Main Library, Ground Floor");
  const [supportEmail, setSupportEmail] = useState("library@knust.edu.gh");
  const [openingHours, setOpeningHours] = useState("Monday–Friday, 8:00 AM–10:00 PM");
  const [signupLocked, setSignupLocked] = useState(false);
  const [signupLockUpdating, setSignupLockUpdating] = useState(false);
  const [loading, setLoading] = useState(!isDemo);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isDemo) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    void (async () => {
      const current = await supabase.from("library_settings").select("max_loan_days,max_active_books,reminders_enabled,reminder_hours,library_name,desk_location,support_email,opening_hours,signup_locked").eq("id", true).maybeSingle();
      const result = current.error
        ? await supabase.from("library_settings").select("max_loan_days,max_active_books,reminders_enabled,reminder_hours,library_name,desk_location,support_email,opening_hours").eq("id", true).maybeSingle()
        : current;
      const { data, error } = result;
      if (error) toast.error("Library settings could not be loaded.");
      if (data) {
        setDays(Number(data.max_loan_days || 7));
        setLimit(Number(data.max_active_books || 5));
        setReminders(data.reminders_enabled !== false);
        setReminderHours(Number(data.reminder_hours || 48));
        setLibraryName(data.library_name || "KNUST Library Mall");
        setDeskLocation(data.desk_location || "Main Library, Ground Floor");
        setSupportEmail(data.support_email || "library@knust.edu.gh");
        setOpeningHours(data.opening_hours || "Monday–Friday, 8:00 AM–10:00 PM");
        setSignupLocked("signup_locked" in data && data.signup_locked === true);
      }
      setLoading(false);
    })();
  }, [isDemo]);

  const save = async () => {
    if (isDemo) return void toast.success("Preview settings updated for this screen.");
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setSaving(true);
    const { data: authData } = await supabase.auth.getUser();
    const { error } = await supabase.from("library_settings").update({
      max_loan_days: days,
      max_active_books: limit,
      reminders_enabled: reminders,
      reminder_hours: reminderHours,
      library_name: libraryName.trim(),
      desk_location: deskLocation.trim(),
      support_email: supportEmail.trim().toLowerCase(),
      opening_hours: openingHours.trim(),
      updated_by: authData.user?.id,
    }).eq("id", true);
    setSaving(false);
    if (error) return void toast.error(error.message);
    toast.success("Library settings saved and are now live.");
  };

  const toggleSignupLock = async () => {
    if (!canManageSignupLock) {
      toast.error("Only the super administrator can change the global sign-up lock.");
      return;
    }
    const nextLocked = !signupLocked;
    if (nextLocked && !window.confirm("Suspend all new student sign-ups? Existing users will still be able to sign in.")) return;

    if (isDemo) {
      setSignupLocked(nextLocked);
      toast.success(nextLocked ? "Preview sign-ups suspended." : "Preview sign-ups reopened.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return void toast.error("Supabase is not configured.");
    setSignupLockUpdating(true);
    const { error } = await supabase.rpc("admin_set_signup_lock", { p_locked: nextLocked });
    setSignupLockUpdating(false);

    if (error) {
      return void toast.error("The sign-up lock could not be changed. Apply the latest Supabase schema and try again.");
    }

    setSignupLocked(nextLocked);
    toast.success(nextLocked ? "New student sign-ups are now suspended." : "New student sign-ups are open again.");
  };

  return (
    <div className="admin-tab">
      <AdminPageHeading kicker="SYSTEM" title="Library settings" description="Configure borrowing rules, alerts, and public library information." action={<button className="button button--primary" onClick={() => void save()} disabled={saving || loading}>{saving ? "Saving…" : "Save changes"}</button>} />
      <div className={cn("settings-layout", loading && "is-loading")}>
        <section className="admin-panel settings-panel">
          <div className="settings-heading"><span><LuSettings /></span><div><h2>Borrowing policy</h2><p>These rules are enforced during student checkout.</p></div></div>
          <label className="setting-row"><span><strong>Maximum loan period</strong><small>Students choose between 1 and this number of days.</small></span><div className="number-control"><button onClick={() => setDays((value) => Math.max(1, value - 1))}>−</button><input value={days} readOnly /><button onClick={() => setDays((value) => Math.min(7, value + 1))}>+</button><em>days</em></div></label>
          <label className="setting-row"><span><strong>Maximum active books</strong><small>Maximum physical titles a student may hold.</small></span><div className="number-control"><button onClick={() => setLimit((value) => Math.max(1, value - 1))}>−</button><input value={limit} readOnly /><button onClick={() => setLimit((value) => Math.min(10, value + 1))}>+</button><em>books</em></div></label>
          <label className="setting-row"><span><strong>Automatic due reminders</strong><small>Notify students {reminderHours} hours before their return date.</small></span><button className={cn("toggle", reminders && "is-on")} onClick={() => setReminders((value) => !value)} type="button" aria-pressed={reminders}><span /></button></label>
          <label className="setting-row"><span><strong>Reminder window</strong><small>How early a due-soon notice is generated.</small></span><div className="number-control"><button onClick={() => setReminderHours((value) => Math.max(1, value - 12))}>−</button><input value={reminderHours} readOnly /><button onClick={() => setReminderHours((value) => Math.min(168, value + 12))}>+</button><em>hours</em></div></label>
        </section>
        <section className="admin-panel settings-panel">
          <div className="settings-heading"><span><LuLibrary /></span><div><h2>Library information</h2><p>Details shown across the student portal.</p></div></div>
          <label className="admin-field"><span>Library name</span><input value={libraryName} onChange={(event) => setLibraryName(event.target.value)} required /></label>
          <label className="admin-field"><span>Circulation desk location</span><input value={deskLocation} onChange={(event) => setDeskLocation(event.target.value)} required /></label>
          <label className="admin-field"><span>Support email</span><input type="email" value={supportEmail} onChange={(event) => setSupportEmail(event.target.value)} required /></label>
          <label className="admin-field"><span>Opening hours</span><input value={openingHours} onChange={(event) => setOpeningHours(event.target.value)} required /></label>
        </section>
        <section className={cn("admin-panel settings-panel settings-panel--wide signup-lock-panel", signupLocked && "is-locked")}>
          <div className="settings-heading"><span><LuLockKeyhole /></span><div><h2>Student registration</h2><p>Control whether new student accounts can be created.</p></div></div>
          <div className="setting-row signup-lock-row">
            <span><strong>Sign up lock</strong><small>When enabled, the sign-up page stays visible but new registrations are blocked. Existing users can still sign in normally.</small></span>
            <div className="signup-lock-control">
              <span className="signup-lock-state" role="status" aria-live="polite">{signupLocked ? "Sign-ups suspended" : "Sign-ups open"}</span>
              <button
                className={cn("toggle", signupLocked && "is-on")}
                onClick={() => void toggleSignupLock()}
                type="button"
                aria-label={signupLocked ? "Reopen student sign-ups" : "Suspend student sign-ups"}
                aria-pressed={signupLocked}
                disabled={loading || signupLockUpdating || !canManageSignupLock}
              >
                <span />
              </button>
            </div>
          </div>
          <p className="signup-lock-note"><LuTriangleAlert /> {!canManageSignupLock ? "Only the super administrator can change this global control. You can still manage every other library setting." : signupLocked ? "Registration is currently suspended. Sign-in and existing accounts are unaffected." : "Registration is currently accepting new student accounts."}</p>
        </section>
        <AdministratorsSettings isDemo={isDemo} currentRole={currentRole} />
      </div>
    </div>
  );
}
