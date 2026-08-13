"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { categoryAccents, demoBooks, demoLoans } from "@/lib/demo-data";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import type { Book, BorrowRequest, FulfilmentMethod, Loan, Profile, SimulatedPaymentMethod } from "@/lib/types";
import { toSlug } from "@/lib/utils";

type CheckoutOptions = {
  days: number;
  fulfilmentMethod: FulfilmentMethod;
  deliveryLocation?: string;
  deliveryFloor?: string;
  deliveryRoom?: string;
  paymentMethod?: SimulatedPaymentMethod;
  paymentSimulated?: boolean;
};

type LibraryContextValue = {
  books: Book[];
  basket: string[];
  favorites: string[];
  loans: Loan[];
  borrowRequests: BorrowRequest[];
  profile: Profile;
  loading: boolean;
  isDemo: boolean;
  settings: LibrarySettings;
  notifications: LibraryNotification[];
  requestError: string | null;
  addToBasket: (bookId: string) => Promise<void>;
  removeFromBasket: (bookId: string) => Promise<void>;
  toggleFavorite: (bookId: string) => Promise<void>;
  checkout: (options: CheckoutOptions) => Promise<boolean>;
  clearRequestError: () => void;
  cancelBorrowRequest: (requestId: string) => Promise<void>;
  confirmDeliveryReceipt: (requestId: string) => Promise<boolean>;
  requestLoanReturn: (loanItemId: string) => Promise<boolean>;
  payLoanFine: (loanItemId: string, paymentMethod: SimulatedPaymentMethod) => Promise<boolean>;
  refresh: () => Promise<void>;
  markNotificationRead: (notificationId: string) => Promise<void>;
};

export type LibrarySettings = {
  maxActiveBooks: number;
  maxLoanDays: number;
  reminderHours: number;
  libraryName: string;
  deskLocation: string;
  supportEmail: string;
  openingHours: string;
  deliveryFeePesewas: number;
};

export type LibraryNotification = { id: string; title: string; body: string; type: string; createdAt: string; readAt?: string | null };

const defaultSettings: LibrarySettings = { maxActiveBooks: 5, maxLoanDays: 7, reminderHours: 48, libraryName: "KNUST Library Mall", deskLocation: "Main Library, Ground Floor", supportEmail: "library@knust.edu.gh", openingHours: "Monday–Friday, 8:00 AM–10:00 PM", deliveryFeePesewas: 500 };

const demoProfile: Profile = {
  id: "demo-student",
  fullName: "Nana Yaa Owusu",
  indexNumber: "PS/CSC/23/0142",
  email: "nana.owusu@st.knust.edu.gh",
  studentEmail: "nana.owusu@st.knust.edu.gh",
  personalEmail: "nana.owusu@gmail.com",
  phone: "+233 20 000 0142",
  department: "Computer Science",
  programme: "BSc Computer Science",
  yearStarted: 2023,
  yearCompletion: 2027,
  gender: "Female",
  residenceType: "on-campus",
  residenceLocation: "Queen Elizabeth II Hall, Block C",
  guardianName: "Yaw Owusu",
  guardianPhone: "+233 24 000 0142",
  guardianRelationship: "Parent",
  studentRecordVerified: true,
  studentIdVerified: true,
  faceCheckVerified: true,
  role: "student",
};

const liveProfilePlaceholder: Profile = {
  id: "",
  fullName: "KNUST student",
  indexNumber: "Loading student ID…",
  email: "",
  role: "student",
};

const LibraryContext = createContext<LibraryContextValue | null>(null);

function readStoredList(key: string) {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function mapCatalogBook(row: Record<string, unknown>): Book {
  const category = String(row.category ?? "General");
  const format = row.format === "digital" || row.format === "both" ? row.format : "physical";
  return {
    id: String(row.id),
    slug: String(row.slug ?? toSlug(String(row.title ?? "book"))),
    title: String(row.title ?? "Untitled book"),
    author: String(row.author ?? "Unknown author"),
    category,
    isbn: String(row.isbn ?? ""),
    description: String(row.description ?? "No description has been added yet."),
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
  };
}

function deriveLoanStatus(dueAt: string, returnedAt?: string | null): Loan["status"] {
  if (returnedAt) return "returned";
  const hours = (new Date(dueAt).getTime() - Date.now()) / 36e5;
  if (hours < 0) return "overdue";
  if (hours <= 48) return "due-soon";
  return "active";
}

function mapBorrowRequest(row: Record<string, unknown>): BorrowRequest {
  const rawItems = Array.isArray(row.items) ? row.items : [];
  const status = ["pending", "approved", "rejected", "cancelled"].includes(String(row.status))
    ? String(row.status) as BorrowRequest["status"]
    : "pending";
  return {
    id: String(row.id),
    status,
    fulfilmentMethod: row.fulfilment_method === "delivery" ? "delivery" : "pickup",
    loanDays: Number(row.loan_days ?? 1),
    deliveryFeePesewas: Number(row.delivery_fee_pesewas ?? 0),
    deliveryLocation: row.delivery_location ? String(row.delivery_location) : null,
    deliveryFloor: row.delivery_floor ? String(row.delivery_floor) : null,
    deliveryRoom: row.delivery_room ? String(row.delivery_room) : null,
    paymentMethod: row.payment_method === "card" || row.payment_method === "momo" ? row.payment_method : null,
    paymentStatus: row.payment_status ? String(row.payment_status) : null,
    paymentReference: row.payment_reference ? String(row.payment_reference) : null,
    paymentPaidAt: row.paid_at ? String(row.paid_at) : row.payment_paid_at ? String(row.payment_paid_at) : null,
    requestedAt: String(row.requested_at ?? row.created_at ?? new Date(0).toISOString()),
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
    reviewerId: row.reviewer_id ? String(row.reviewer_id) : row.reviewed_by ? String(row.reviewed_by) : null,
    reviewerName: row.reviewer_name ? String(row.reviewer_name) : null,
    reviewerEmail: row.reviewer_email ? String(row.reviewer_email) : null,
    dispatcherId: row.dispatcher_id ? String(row.dispatcher_id) : row.dispatched_by ? String(row.dispatched_by) : null,
    dispatcherName: row.dispatcher_name ? String(row.dispatcher_name) : null,
    dispatcherEmail: row.dispatcher_email ? String(row.dispatcher_email) : null,
    dispatchedAt: row.dispatched_at ? String(row.dispatched_at) : null,
    studentReceivedAt: row.student_received_at ? String(row.student_received_at) : null,
    deliveryReceivedAt: row.delivery_received_at ? String(row.delivery_received_at) : null,
    recalledAt: row.recalled_at ? String(row.recalled_at) : null,
    recallerId: row.recaller_id ? String(row.recaller_id) : row.recalled_by ? String(row.recalled_by) : null,
    recallerName: row.recaller_name ? String(row.recaller_name) : null,
    recallReason: row.recall_reason ? String(row.recall_reason) : null,
    recallReturnedAt: row.recall_returned_at ? String(row.recall_returned_at) : null,
    recallReturnerId: row.recall_returner_id ? String(row.recall_returner_id) : row.recall_returned_by ? String(row.recall_returned_by) : null,
    recallReturnerName: row.recall_returner_name ? String(row.recall_returner_name) : null,
    recallReturnerEmail: row.recall_returner_email ? String(row.recall_returner_email) : null,
    rejectionReason: row.rejection_reason ? String(row.rejection_reason) : null,
    loanId: row.loan_id ? String(row.loan_id) : null,
    items: rawItems.map((item) => {
      const value = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return {
        bookId: String(value.book_id ?? ""),
        title: String(value.title ?? "Library book"),
        author: value.author ? String(value.author) : undefined,
        coverUrl: value.cover_url ? String(value.cover_url) : null,
      };
    }),
  };
}

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [books, setBooks] = useState<Book[]>(isSupabaseConfigured ? [] : demoBooks);
  const [basket, setBasket] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loans, setLoans] = useState<Loan[]>(isSupabaseConfigured ? [] : demoLoans);
  const [borrowRequests, setBorrowRequests] = useState<BorrowRequest[]>([]);
  const [profile, setProfile] = useState<Profile>(isSupabaseConfigured ? liveProfilePlaceholder : demoProfile);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(!isSupabaseConfigured);
  const [settings, setSettings] = useState<LibrarySettings>(defaultSettings);
  const [notifications, setNotifications] = useState<LibraryNotification[]>([]);
  const [requestError, setRequestError] = useState<string | null>(null);

  const clearRequestError = useCallback(() => setRequestError(null), []);

  const reportRequestError = (message: string) => {
    setRequestError(message);
    toast.error(message);
    return false;
  };

  const refresh = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setBasket(readStoredList("knust-library-basket"));
      setFavorites(readStoredList("knust-library-favorites"));
      try {
        const stored = window.localStorage.getItem("knust-demo-profile");
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<Profile> & { email?: string };
          setProfile((current) => ({
            ...current,
            fullName: parsed.fullName || current.fullName,
            indexNumber: parsed.indexNumber || current.indexNumber,
            email: parsed.studentEmail || current.email,
            studentEmail: parsed.studentEmail || current.studentEmail,
            personalEmail: parsed.email || current.personalEmail,
            phone: parsed.phone || current.phone,
            department: parsed.department || current.department,
            programme: parsed.programme || current.programme,
            yearStarted: parsed.yearStarted || current.yearStarted,
            yearCompletion: parsed.yearCompletion || current.yearCompletion,
            gender: parsed.gender || current.gender,
            residenceType: parsed.residenceType || current.residenceType,
            residenceLocation: parsed.residenceLocation || current.residenceLocation,
          }));
        }
        const storedLoans = window.localStorage.getItem("knust-library-loans");
        if (storedLoans) setLoans(JSON.parse(storedLoans) as Loan[]);
        const storedRequests = window.localStorage.getItem("knust-library-requests");
        if (storedRequests) setBorrowRequests(JSON.parse(storedRequests) as BorrowRequest[]);
      } catch {
        // Keep the complete demo state if local storage has malformed data.
      }
      setLoading(false);
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      router.replace("/sign-in");
      return;
    }

    setIsDemo(false);
    const userId = sessionData.session.user.id;

    // Remove stale items changed or archived after they entered the basket.
    await supabase.rpc("clean_my_basket");

    const [catalogResult, profileResult, richProfileResult, basketResult, favoritesResult, initialLoansResult, requestsResult, settingsResult, notificationsResult] = await Promise.all([
      supabase.from("catalog_books").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, index_number, email, personal_email, student_email, programme, role, status").eq("id", userId).maybeSingle(),
      supabase.from("my_student_profile").select("*").maybeSingle(),
      supabase.from("my_basket").select("book_id"),
      supabase.from("favorites").select("book_id").eq("user_id", userId),
      supabase.from("my_loans").select("loan_item_id, book_id, title, author, category, slug, cover_url, borrowed_at, due_at, returned_at, display_status, overdue_periods, fine_rate_pesewas, fine_amount_pesewas, fine_paid_pesewas, fine_outstanding_pesewas, fine_payment_status, fine_payment_reference, fine_paid_at, return_request_id, return_request_status, return_requested_at, return_accepted_at").order("borrowed_at", { ascending: false }),
      supabase.from("my_borrow_requests").select("*").order("requested_at", { ascending: false }),
      supabase.from("library_settings").select("max_active_books, max_loan_days, reminder_hours, library_name, desk_location, support_email, opening_hours, delivery_fee_pesewas").eq("id", true).maybeSingle(),
      supabase.from("notifications").select("id, title, body, type, created_at, read_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
    ]);

    // Keep existing loan history visible while a project is between schema
    // versions. Payment controls remain hidden until the authoritative columns
    // are available from the latest `my_loans` view.
    const loansResult = initialLoansResult.error
      ? await supabase.from("my_loans").select("loan_item_id, book_id, title, author, category, slug, cover_url, borrowed_at, due_at, returned_at, display_status, overdue_periods, fine_rate_pesewas, fine_amount_pesewas, fine_outstanding_pesewas, return_request_id, return_request_status, return_requested_at, return_accepted_at").order("borrowed_at", { ascending: false })
      : initialLoansResult;

    if (!catalogResult.error) setBooks((catalogResult.data ?? []).map((row) => mapCatalogBook(row as Record<string, unknown>)));
    else toast.error("The live catalogue could not be loaded. Please try again.");

    if (profileResult.data) {
      const row = profileResult.data;
      if (row.status !== "active") {
        toast.error("Your library access is currently suspended. Please contact the circulation desk.");
        await supabase.auth.signOut();
        router.replace("/sign-in");
        return;
      }
      if (row.role === "librarian") {
        router.replace("/librarian");
        return;
      }
      if (row.role === "admin" || row.role === "super_admin") {
        router.replace("/admin");
        return;
      }
      const details = richProfileResult.data as Record<string, unknown> | null;
      setProfile({
        id: row.id,
        fullName: row.full_name || "KNUST student",
        indexNumber: row.index_number || "Student ID pending",
        email: row.student_email || "",
        studentEmail: row.student_email || "",
        personalEmail: row.personal_email || row.email || sessionData.session.user.email || "",
        phone: details?.phone ? String(details.phone) : undefined,
        department: details?.department ? String(details.department) : undefined,
        programme: details?.programme ? String(details.programme) : row.programme || undefined,
        yearStarted: details?.start_year ? Number(details.start_year) : undefined,
        yearCompletion: details?.completion_year ? Number(details.completion_year) : undefined,
        gender: details?.gender ? String(details.gender) : undefined,
        residenceType: details?.residence_type === "off-campus" ? "off-campus" : details?.residence_type === "on-campus" ? "on-campus" : undefined,
        residenceLocation: details?.residence_location ? String(details.residence_location) : undefined,
        guardianName: details?.guardian_full_name ? String(details.guardian_full_name) : undefined,
        guardianPhone: details?.guardian_phone ? String(details.guardian_phone) : undefined,
        guardianRelationship: details?.guardian_relationship ? String(details.guardian_relationship) : undefined,
        studentRecordVerified: details?.student_record_check_status === "simulated_passed" || details?.is_verified === true,
        studentIdVerified: details?.student_id_status === "verified" || details?.student_id_uploaded === true,
        faceCheckVerified: details?.facial_scan_status === "simulated_completed_no_biometric_match" || details?.is_verified === true,
        role: row.role || "student",
      });
    }

    if (!basketResult.error) setBasket((basketResult.data ?? []).map((row) => row.book_id));
    if (!favoritesResult.error) setFavorites((favoritesResult.data ?? []).map((row) => row.book_id));
    if (!loansResult.error) {
      setLoans((loansResult.data ?? []).map((row) => {
        const paymentRow = row as typeof row & {
          fine_paid_pesewas?: unknown;
          fine_payment_status?: unknown;
          fine_payment_reference?: unknown;
          fine_paid_at?: unknown;
        };
        const rawReturnStatus = String(row.return_request_status ?? "").toLowerCase();
        const returnRequestStatus = rawReturnStatus === "requested" ? "pending" : (["pending", "accepted", "cancelled", "rejected"] as const).includes(rawReturnStatus as "pending" | "accepted" | "cancelled" | "rejected")
          ? rawReturnStatus as "pending" | "accepted" | "cancelled" | "rejected"
          : null;
        return {
          id: row.loan_item_id,
          bookId: row.book_id,
          borrowedAt: row.borrowed_at,
          dueAt: row.due_at,
          returnedAt: row.returned_at,
          status: (["active", "due-soon", "overdue", "returned"] as const).includes(row.display_status) ? row.display_status : deriveLoanStatus(row.due_at, row.returned_at),
          title: row.title || "Archived title",
          author: row.author || "Unknown author",
          category: row.category || "Library collection",
          slug: row.slug || undefined,
          coverUrl: row.cover_url || null,
          overduePeriods: Math.max(0, Number(row.overdue_periods ?? 0)),
          fineRatePesewas: Math.max(0, Number(row.fine_rate_pesewas ?? 350)),
          fineAmountPesewas: Math.max(0, Number(row.fine_amount_pesewas ?? 0)),
          finePaidPesewas: Math.max(0, Number(paymentRow.fine_paid_pesewas ?? 0)),
          fineOutstandingPesewas: Math.max(0, Number(row.fine_outstanding_pesewas ?? row.fine_amount_pesewas ?? 0)),
          finePaymentStatus: paymentRow.fine_payment_status ? String(paymentRow.fine_payment_status) : null,
          finePaymentReference: paymentRow.fine_payment_reference ? String(paymentRow.fine_payment_reference) : null,
          finePaidAt: paymentRow.fine_paid_at ? String(paymentRow.fine_paid_at) : null,
          finePaymentEnabled: Object.prototype.hasOwnProperty.call(paymentRow, "fine_paid_pesewas"),
          returnRequestId: row.return_request_id || null,
          returnRequestStatus,
          returnRequestedAt: row.return_requested_at || null,
          returnAcceptedAt: row.return_accepted_at || null,
        };
      }));
    } else setLoans([]);

    if (!requestsResult.error) setBorrowRequests((requestsResult.data ?? []).map((row) => mapBorrowRequest(row as Record<string, unknown>)));

    if (settingsResult.data) {
      setSettings({
        maxActiveBooks: Number(settingsResult.data.max_active_books || 5),
        maxLoanDays: Number(settingsResult.data.max_loan_days || 7),
        reminderHours: Number(settingsResult.data.reminder_hours || 48),
        libraryName: settingsResult.data.library_name || "KNUST Library Mall",
        deskLocation: settingsResult.data.desk_location || "Main Library, Ground Floor",
        supportEmail: settingsResult.data.support_email || "library@knust.edu.gh",
        openingHours: settingsResult.data.opening_hours || "Monday–Friday, 8:00 AM–10:00 PM",
        deliveryFeePesewas: Number(settingsResult.data.delivery_fee_pesewas ?? 500),
      });
    }

    if (!notificationsResult.error) setNotifications((notificationsResult.data ?? []).map((item) => ({ id: item.id, title: item.title, body: item.body, type: item.type, createdAt: item.created_at, readAt: item.read_at })));

    setLoading(false);
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    if (isDemo || !profile.id) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel("student-library-activity-" + profile.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: "user_id=eq." + profile.id }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "borrow_requests", filter: "student_id=eq." + profile.id }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "loan_items" }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "return_requests" }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "fine_payments" }, () => void refresh())
      .subscribe();
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30_000);

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(poll);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      void supabase.removeChannel(channel);
    };
  }, [isDemo, profile.id, refresh]);

  const persistList = (key: string, value: string[]) => {
    window.localStorage.setItem(key, JSON.stringify(value));
  };

  const addToBasket = async (bookId: string) => {
    const book = books.find((item) => item.id === bookId);
    if (!book || book.format === "digital" || book.availableCopies < 1) {
      toast.error("This title is not currently available to borrow.");
      return;
    }
    if (basket.includes(bookId)) {
      toast("This book is already in your basket.");
      return;
    }
    if (basket.length >= settings.maxActiveBooks) {
      toast.error("You can borrow up to " + settings.maxActiveBooks + " books at a time.");
      return;
    }

    const next = [...basket, bookId];
    setBasket(next);
    const supabase = getSupabaseBrowserClient();
    if (!supabase || isDemo) {
      persistList("knust-library-basket", next);
      toast.success("Added to your borrow basket.");
      return;
    }

    const { error } = await supabase.rpc("add_to_basket", { p_book_id: bookId });
    if (error) {
      setBasket(basket);
      toast.error(error.message);
      return;
    }
    toast.success("Added to your borrow basket.");
  };

  const removeFromBasket = async (bookId: string) => {
    const next = basket.filter((id) => id !== bookId);
    setBasket(next);
    const supabase = getSupabaseBrowserClient();
    if (!supabase || isDemo) {
      persistList("knust-library-basket", next);
      return;
    }
    const { error } = await supabase.rpc("remove_from_basket", { p_book_id: bookId });
    if (error) {
      toast.error(error.message);
      void refresh();
    }
  };

  const toggleFavorite = async (bookId: string) => {
    const alreadySaved = favorites.includes(bookId);
    const next = alreadySaved ? favorites.filter((id) => id !== bookId) : [...favorites, bookId];
    setFavorites(next);
    const supabase = getSupabaseBrowserClient();
    if (!supabase || isDemo) {
      persistList("knust-library-favorites", next);
      toast.success(alreadySaved ? "Removed from saved books." : "Saved for later.");
      return;
    }

    const result = alreadySaved
      ? await supabase.from("favorites").delete().eq("user_id", profile.id).eq("book_id", bookId)
      : await supabase.from("favorites").insert({ user_id: profile.id, book_id: bookId });

    if (result.error) {
      setFavorites(favorites);
      toast.error(result.error.message);
    }
  };

  const checkout = async ({ days, fulfilmentMethod, deliveryLocation, deliveryFloor, deliveryRoom, paymentMethod, paymentSimulated }: CheckoutOptions) => {
    setRequestError(null);
    if (basket.length === 0) return reportRequestError("Your borrow basket is empty. Add a book before sending a request.");
    const permittedLoanDays = Math.min(7, settings.maxLoanDays);
    if (!Number.isInteger(days) || days < 1 || days > permittedLoanDays) return reportRequestError("Choose a loan period between 1 and " + permittedLoanDays + " days.");
    const normalizedLocation = deliveryLocation?.trim() || "";
    const normalizedFloor = deliveryFloor?.trim() || "";
    const normalizedRoom = deliveryRoom?.trim() || "";
    const savedResidence = profile.residenceLocation?.trim() || "";
    if (fulfilmentMethod === "delivery" && profile.residenceType !== "on-campus") {
      return reportRequestError("Delivery is available to on-campus residences only. Choose self pickup to continue.");
    }
    if (fulfilmentMethod === "delivery" && (savedResidence.length < 4 || normalizedLocation !== savedResidence)) {
      return reportRequestError("Select the saved on-campus residence from your student profile.");
    }
    if (fulfilmentMethod === "delivery" && (normalizedFloor.length < 1 || normalizedFloor.length > 30)) {
      return reportRequestError("Enter a valid floor for your campus delivery.");
    }
    if (fulfilmentMethod === "delivery" && (normalizedRoom.length < 1 || normalizedRoom.length > 30)) {
      return reportRequestError("Enter a valid room number for your campus delivery.");
    }
    if (fulfilmentMethod === "delivery" && (!paymentMethod || paymentSimulated !== true)) {
      return reportRequestError("Complete the simulated GHS 5.00 payment before sending your delivery request.");
    }
    const supabase = getSupabaseBrowserClient();

    if (!supabase || isDemo) {
      const now = new Date();
      const request: BorrowRequest = {
        id: "demo-request-" + Date.now(),
        status: "pending",
        fulfilmentMethod,
        loanDays: days,
        deliveryFeePesewas: fulfilmentMethod === "delivery" ? settings.deliveryFeePesewas : 0,
        deliveryLocation: fulfilmentMethod === "delivery" ? normalizedLocation : null,
        deliveryFloor: fulfilmentMethod === "delivery" ? normalizedFloor : null,
        deliveryRoom: fulfilmentMethod === "delivery" ? normalizedRoom : null,
        paymentMethod: fulfilmentMethod === "delivery" ? paymentMethod : null,
        paymentStatus: fulfilmentMethod === "delivery" ? "simulated_paid" : "not_required",
        paymentReference: fulfilmentMethod === "delivery" ? "SIM-" + Date.now().toString(36).toUpperCase() : null,
        paymentPaidAt: fulfilmentMethod === "delivery" ? now.toISOString() : null,
        requestedAt: now.toISOString(),
        items: basket.map((bookId) => {
          const book = books.find((item) => item.id === bookId);
          return { bookId, title: book?.title || "Library book", author: book?.author, coverUrl: book?.coverUrl };
        }),
      };
      const nextRequests = [request, ...borrowRequests];
      setBorrowRequests(nextRequests);
      setBasket([]);
      persistList("knust-library-basket", []);
      window.localStorage.setItem("knust-library-requests", JSON.stringify(nextRequests));
      setRequestError(null);
      toast.success("Borrow request sent. Pickup starts at approval; delivery starts after your receipt confirmation.");
      return true;
    }

    try {
      const { error } = await supabase.rpc("submit_borrow_request", {
        p_loan_days: days,
        p_fulfilment_method: fulfilmentMethod,
        p_delivery_location: fulfilmentMethod === "delivery" ? normalizedLocation : null,
        p_delivery_floor: fulfilmentMethod === "delivery" ? normalizedFloor : null,
        p_delivery_room: fulfilmentMethod === "delivery" ? normalizedRoom : null,
        p_payment_method: fulfilmentMethod === "delivery" ? paymentMethod : null,
        p_payment_simulated: fulfilmentMethod === "delivery" ? paymentSimulated === true : false,
      });
      if (error) return reportRequestError(error.message);
    } catch {
      return reportRequestError("The borrow request could not be sent. Check your connection and try again.");
    }
    setRequestError(null);
    toast.success("Borrow request sent. Pickup starts at approval; delivery starts after your receipt confirmation.");
    await refresh();
    return true;
  };

  const markNotificationRead = async (notificationId: string) => {
    setNotifications((current) => current.map((item) => item.id === notificationId ? { ...item, readAt: item.readAt || new Date().toISOString() } : item));
    const supabase = getSupabaseBrowserClient();
    if (!supabase || isDemo) return;
    const { error } = await supabase.rpc("mark_notification_read", { p_notification_id: notificationId });
    if (error) {
      toast.error("That notification could not be updated.");
      await refresh();
    }
  };

  const cancelBorrowRequest = async (requestId: string) => {
    const request = borrowRequests.find((item) => item.id === requestId);
    if (!request || request.status !== "pending") return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase || isDemo) {
      const next = borrowRequests.map((item) => item.id === requestId ? { ...item, status: "cancelled" as const } : item);
      setBorrowRequests(next);
      window.localStorage.setItem("knust-library-requests", JSON.stringify(next));
      toast.success("Borrow request cancelled.");
      return;
    }
    const { error } = await supabase.rpc("cancel_borrow_request", { p_request_id: requestId });
    if (error) return void toast.error(error.message);
    toast.success("Borrow request cancelled.");
    await refresh();
  };

  const confirmDeliveryReceipt = async (requestId: string) => {
    const request = borrowRequests.find((item) => item.id === requestId);
    if (!request || request.fulfilmentMethod !== "delivery" || request.status !== "approved" || !request.dispatchedAt || request.studentReceivedAt) {
      return reportRequestError("This delivery is not ready for student receipt confirmation.");
    }

    const receivedAt = new Date().toISOString();
    const supabase = getSupabaseBrowserClient();
    if (!supabase || isDemo) {
      const next = borrowRequests.map((item) => item.id === requestId ? { ...item, studentReceivedAt: receivedAt, deliveryReceivedAt: receivedAt } : item);
      setBorrowRequests(next);
      window.localStorage.setItem("knust-library-requests", JSON.stringify(next));
      toast.success("Delivery receipt confirmed. Your loan period has started.");
      return true;
    }

    const { error } = await supabase.rpc("student_confirm_delivery_receipt", { p_request_id: requestId });
    if (error) {
      reportRequestError(error.message);
      return false;
    }
    toast.success("Delivery receipt confirmed. Your loan period has started.");
    await refresh();
    return true;
  };

  const requestLoanReturn = async (loanItemId: string) => {
    const loan = loans.find((item) => item.id === loanItemId);
    if (!loan || loan.status === "returned") return reportRequestError("This book is no longer eligible for a return request.");
    if (loan.returnRequestStatus === "pending") return reportRequestError("A librarian is already reviewing this return request.");
    if (loan.returnRequestStatus === "accepted") return reportRequestError("This return was already accepted by library staff.");

    const requestedAt = new Date().toISOString();
    const supabase = getSupabaseBrowserClient();
    if (!supabase || isDemo) {
      const next = loans.map((item) => item.id === loanItemId ? {
        ...item,
        returnRequestId: item.returnRequestId || "demo-return-" + Date.now(),
        returnRequestStatus: "pending" as const,
        returnRequestedAt: requestedAt,
      } : item);
      setLoans(next);
      window.localStorage.setItem("knust-library-loans", JSON.stringify(next));
      toast.success("Return requested. Bring the exact book to the circulation desk for librarian confirmation.");
      return true;
    }

    const { error } = await supabase.rpc("request_loan_item_return", { p_loan_item_id: loanItemId });
    if (error) return reportRequestError(error.message);

    setLoans((current) => current.map((item) => item.id === loanItemId ? {
      ...item,
      returnRequestStatus: "pending" as const,
      returnRequestedAt: requestedAt,
    } : item));
    toast.success("Return requested. A librarian will accept it after receiving and inspecting the book.");
    await refresh();
    return true;
  };

  const payLoanFine = async (loanItemId: string, paymentMethod: SimulatedPaymentMethod) => {
    const loan = loans.find((item) => item.id === loanItemId);
    const outstandingPesewas = Math.max(0, Number(loan?.fineOutstandingPesewas ?? 0));
    if (!loan || outstandingPesewas < 1) return reportRequestError("This loan does not have an outstanding fine to pay.");
    if (loan.finePaymentEnabled === false) return reportRequestError("Fine payments are not available until the latest Supabase SQL has been applied.");
    if (paymentMethod !== "card" && paymentMethod !== "momo") return reportRequestError("Choose card or mobile money to continue.");

    const paidAt = new Date().toISOString();
    const paymentReference = "FINE-SIM-" + Date.now().toString(36).toUpperCase();
    const supabase = getSupabaseBrowserClient();
    if (!supabase || isDemo) {
      const next = loans.map((item) => item.id === loanItemId ? {
        ...item,
        finePaidPesewas: Math.max(0, Number(item.finePaidPesewas ?? 0)) + outstandingPesewas,
        fineOutstandingPesewas: 0,
        finePaymentStatus: "paid",
        finePaymentReference: paymentReference,
        finePaidAt: paidAt,
      } : item);
      setLoans(next);
      window.localStorage.setItem("knust-library-loans", JSON.stringify(next));
      setRequestError(null);
      toast.success("Fine payment recorded successfully (simulated).");
      return true;
    }

    const { error } = await supabase.rpc("pay_loan_item_fine", {
      p_loan_item_id: loanItemId,
      p_payment_method: paymentMethod,
    });
    if (error) return reportRequestError(error.message);

    setRequestError(null);
    toast.success("Fine payment recorded successfully (simulated).");
    await refresh();
    return true;
  };

  const value = useMemo<LibraryContextValue>(() => ({
    books,
    basket,
    favorites,
    loans,
    borrowRequests,
    profile,
    loading,
    isDemo,
    settings,
    notifications,
    requestError,
    addToBasket,
    removeFromBasket,
    toggleFavorite,
    checkout,
    clearRequestError,
    cancelBorrowRequest,
    confirmDeliveryReceipt,
    requestLoanReturn,
    payLoanFine,
    refresh,
    markNotificationRead,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [books, basket, favorites, loans, borrowRequests, profile, loading, isDemo, settings, notifications, requestError]);

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  const context = useContext(LibraryContext);
  if (!context) throw new Error("useLibrary must be used inside LibraryProvider");
  return context;
}
