export type BookFormat = "physical" | "digital" | "both";

export type Book = {
  id: string;
  slug: string;
  title: string;
  author: string;
  category: string;
  isbn: string;
  description: string;
  format: BookFormat;
  totalCopies: number;
  availableCopies: number;
  pages: number;
  publishedYear: number;
  language: string;
  rating: number;
  borrowCount: number;
  readTime: string;
  accent: string;
  coverUrl?: string | null;
  onlineContent?: string | null;
  onlineAvailable?: boolean;
  shelfLocation?: string | null;
  featured?: boolean;
  newArrival?: boolean;
  /** Admin-only catalogue lifecycle fields. Student catalogue rows never include archived titles. */
  archivedAt?: string | null;
  isPublished?: boolean;
  coverObjectPath?: string | null;
};

export type LoanStatus = "active" | "due-soon" | "overdue" | "returned";

export type ReturnRequestStatus = "pending" | "accepted" | "cancelled" | "rejected";

export type Loan = {
  id: string;
  bookId: string;
  borrowedAt: string;
  dueAt: string;
  returnedAt?: string | null;
  status: LoanStatus;
  title?: string;
  author?: string;
  category?: string;
  slug?: string;
  coverUrl?: string | null;
  /** Completed 24-hour periods after the due timestamp, calculated by Postgres. */
  overduePeriods?: number;
  /** Fine policy and balances are authoritative values returned by `my_loans`. */
  fineRatePesewas?: number;
  fineAmountPesewas?: number;
  /** Sum of successful, server-recorded fine payments for this exact loan item. */
  finePaidPesewas?: number;
  fineOutstandingPesewas?: number;
  finePaymentStatus?: string | null;
  finePaymentReference?: string | null;
  finePaidAt?: string | null;
  /** False only when the connected project still exposes the pre-payment view. */
  finePaymentEnabled?: boolean;
  returnRequestId?: string | null;
  returnRequestStatus?: ReturnRequestStatus | null;
  returnRequestedAt?: string | null;
  returnAcceptedAt?: string | null;
};

export type FulfilmentMethod = "pickup" | "delivery";

export type SimulatedPaymentMethod = "card" | "momo";

export type BorrowRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export type BorrowRequest = {
  id: string;
  status: BorrowRequestStatus;
  fulfilmentMethod: FulfilmentMethod;
  loanDays: number;
  deliveryFeePesewas: number;
  deliveryLocation?: string | null;
  deliveryFloor?: string | null;
  deliveryRoom?: string | null;
  paymentMethod?: SimulatedPaymentMethod | null;
  paymentStatus?: string | null;
  paymentReference?: string | null;
  paymentPaidAt?: string | null;
  requestedAt: string;
  reviewedAt?: string | null;
  reviewerId?: string | null;
  reviewerName?: string | null;
  reviewerEmail?: string | null;
  dispatcherId?: string | null;
  dispatcherName?: string | null;
  dispatcherEmail?: string | null;
  dispatchedAt?: string | null;
  studentReceivedAt?: string | null;
  deliveryReceivedAt?: string | null;
  recalledAt?: string | null;
  recallerId?: string | null;
  recallerName?: string | null;
  recallReason?: string | null;
  recallReturnedAt?: string | null;
  recallReturnerId?: string | null;
  recallReturnerName?: string | null;
  recallReturnerEmail?: string | null;
  rejectionReason?: string | null;
  loanId?: string | null;
  items: Array<{
    bookId: string;
    title: string;
    author?: string;
    coverUrl?: string | null;
  }>;
};

export type Student = {
  id: string;
  fullName: string;
  indexNumber: string;
  email: string;
  studentEmail?: string;
  personalEmail?: string;
  programme: string;
  activeLoans: number;
  status: "active" | "suspended";
  joinedAt: string;
};

export type CirculationRecord = {
  id: string;
  bookId?: string;
  studentName: string;
  indexNumber: string;
  studentEmail?: string;
  bookTitle: string;
  isbn: string;
  accessionNumber?: string;
  issuedAt: string;
  dueAt: string;
  returnedAt?: string | null;
  status: LoanStatus;
  overduePeriods?: number;
  fineRatePesewas?: number;
  fineAmountPesewas?: number;
  fineOutstandingPesewas?: number;
  returnRequestId?: string | null;
  returnRequestStatus?: ReturnRequestStatus | null;
  returnRequestedAt?: string | null;
  returnAcceptedAt?: string | null;
  returnAcceptedBy?: string | null;
  returnAcceptorName?: string | null;
  returnAcceptorEmail?: string | null;
  returnCondition?: string | null;
};

export type Profile = {
  id: string;
  fullName: string;
  indexNumber: string;
  email: string;
  studentEmail?: string;
  personalEmail?: string;
  phone?: string;
  department?: string;
  programme?: string;
  yearStarted?: number;
  yearCompletion?: number;
  gender?: string;
  residenceType?: "on-campus" | "off-campus";
  residenceLocation?: string;
  guardianName?: string;
  guardianPhone?: string;
  guardianRelationship?: string;
  studentRecordVerified?: boolean;
  studentIdVerified?: boolean;
  faceCheckVerified?: boolean;
  role: "student" | "librarian" | "admin" | "super_admin";
};
