"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { LuArrowRight, LuBadgeCheck, LuBookOpen, LuCalendarClock, LuCircleCheck, LuClock3, LuCreditCard, LuHandshake, LuLibrary, LuMapPin, LuPackageCheck, LuReceiptText, LuRotateCcw, LuSend, LuShieldCheck, LuSmartphone, LuTriangleAlert, LuTruck, LuUserCheck, LuX } from "react-icons/lu";
import { BookCover } from "@/components/ui/book-cover";
import { StatusBadge } from "@/components/ui/status-badge";
import { useLibrary } from "@/components/student/library-provider";
import type { SimulatedPaymentMethod } from "@/lib/types";
import { formatDate } from "@/lib/utils";

const tabs = ["all", "active", "due-soon", "overdue", "returned"] as const;

function formatActivityDate(value?: string | null) {
  if (!value) return "Not completed";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not completed";
  return date.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatGhs(pesewas: number | undefined) {
  const amount = Number.isFinite(pesewas) ? Math.max(0, Number(pesewas)) : 0;
  return `GHS ${(amount / 100).toFixed(2)}`;
}

export function LoansPage() {
  const { books, loans, borrowRequests, settings, cancelBorrowRequest, confirmDeliveryReceipt, requestLoanReturn, payLoanFine } = useLibrary();
  const [tab, setTab] = useState<(typeof tabs)[number]>("all");
  const [receiptPromptId, setReceiptPromptId] = useState<string | null>(null);
  const [confirmingReceiptId, setConfirmingReceiptId] = useState<string | null>(null);
  const [returnPromptId, setReturnPromptId] = useState<string | null>(null);
  const [requestingReturnId, setRequestingReturnId] = useState<string | null>(null);
  const [finePromptId, setFinePromptId] = useState<string | null>(null);
  const [finePaymentMethod, setFinePaymentMethod] = useState<SimulatedPaymentMethod | null>(null);
  const [payingFineId, setPayingFineId] = useState<string | null>(null);
  const [finePaymentError, setFinePaymentError] = useState<string | null>(null);
  const [finePaymentComplete, setFinePaymentComplete] = useState(false);
  const confirmReturnRef = useRef<HTMLButtonElement>(null);
  const returnDialogRef = useRef<HTMLElement>(null);
  const finePaymentDialogRef = useRef<HTMLElement>(null);
  const firstPaymentOptionRef = useRef<HTMLButtonElement>(null);
  const payingFineRef = useRef<string | null>(null);
  const filtered = useMemo(() => tab === "all" ? loans : loans.filter((loan) => loan.status === tab), [loans, tab]);
  const activeCount = loans.filter((loan) => loan.status !== "returned").length;
  const returnedCount = loans.filter((loan) => loan.status === "returned").length;
  const pendingReturnCount = loans.filter((loan) => loan.returnRequestStatus === "pending").length;
  const totalOutstandingFine = loans.reduce((total, loan) => total + Math.max(0, Number(loan.fineOutstandingPesewas ?? 0)), 0);
  const returnPromptLoan = loans.find((loan) => loan.id === returnPromptId) ?? null;
  const finePromptLoan = loans.find((loan) => loan.id === finePromptId) ?? null;

  useEffect(() => {
    if (!returnPromptLoan) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => confirmReturnRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && requestingReturnId !== returnPromptLoan.id) setReturnPromptId(null);
      if (event.key !== "Tab") return;
      const focusable = Array.from(returnDialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])") ?? []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [requestingReturnId, returnPromptLoan]);

  useEffect(() => {
    payingFineRef.current = payingFineId;
  }, [payingFineId]);

  useEffect(() => {
    if (!finePromptId) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => firstPaymentOptionRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && payingFineRef.current !== finePromptId) setFinePromptId(null);
      if (event.key !== "Tab") return;
      const focusable = Array.from(finePaymentDialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])") ?? []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [finePromptId]);

  useEffect(() => {
    if (!finePaymentComplete) return;
    const frame = window.requestAnimationFrame(() => firstPaymentOptionRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [finePaymentComplete]);

  const confirmReturnRequest = async () => {
    if (!returnPromptLoan) return;
    setRequestingReturnId(returnPromptLoan.id);
    try {
      const requested = await requestLoanReturn(returnPromptLoan.id);
      if (requested) setReturnPromptId(null);
    } finally {
      setRequestingReturnId(null);
    }
  };

  const openFinePayment = (loanId: string) => {
    setReturnPromptId(null);
    setFinePaymentMethod(null);
    setFinePaymentError(null);
    setFinePaymentComplete(false);
    setFinePromptId(loanId);
  };

  const closeFinePayment = () => {
    if (payingFineId) return;
    setFinePromptId(null);
    setFinePaymentMethod(null);
    setFinePaymentError(null);
    setFinePaymentComplete(false);
  };

  const confirmFinePayment = async () => {
    if (!finePromptLoan || !finePaymentMethod) {
      setFinePaymentError("Choose card or mobile money to continue.");
      return;
    }
    if (Math.max(0, Number(finePromptLoan.fineOutstandingPesewas ?? 0)) < 1) {
      setFinePaymentError("This fine has already been settled. Refresh your loans to see the latest balance.");
      return;
    }
    setFinePaymentError(null);
    setPayingFineId(finePromptLoan.id);
    try {
      const paid = await payLoanFine(finePromptLoan.id, finePaymentMethod);
      if (paid) setFinePaymentComplete(true);
      else setFinePaymentError("The simulated payment could not be completed. Please review the message and try again.");
    } finally {
      setPayingFineId(null);
    }
  };

  return (
    <div className="loans-page page-stack">
      <div className="page-heading-row"><div><span className="page-kicker">MY LIBRARY</span><h1>Requests & loans</h1><p>Track staff approvals, fulfilment, active loans, and return dates.</p></div><Link href="/library#catalog" className="button button--primary">Borrow another book <LuArrowRight /></Link></div>
      <div className="loan-stats"><div><span><LuPackageCheck /></span><p><small>Pending approval</small><strong>{borrowRequests.filter((request) => request.status === "pending").length}</strong></p></div><div><span><LuBookOpen /></span><p><small>Currently borrowed</small><strong>{activeCount}</strong></p></div><div><span><LuCalendarClock /></span><p><small>Due in {settings.reminderHours} hours</small><strong>{loans.filter((loan) => loan.status === "due-soon").length}</strong></p></div><div><span><LuRotateCcw /></span><p><small>Returns awaiting staff</small><strong>{pendingReturnCount}</strong></p></div><div className={totalOutstandingFine > 0 ? "has-fine" : ""}><span>₵</span><p><small>Total outstanding fine</small><strong>{formatGhs(totalOutstandingFine)}</strong></p></div><div><span><LuCircleCheck /></span><p><small>Books returned</small><strong>{returnedCount}</strong></p></div></div>
      {borrowRequests.length > 0 && (
        <section className="request-history-panel">
          <div className="request-history-panel__heading"><div><span className="section-kicker">APPROVAL QUEUE</span><h2>Borrow requests</h2></div><p>Pickup starts at staff approval. Delivery starts only after staff dispatch and your receipt confirmation.</p></div>
          <div className="request-history-list">
            {borrowRequests.map((request) => {
              const firstItem = request.items[0];
              const firstBook = books.find((book) => book.id === firstItem?.bookId);
              const receivedAt = request.studentReceivedAt || request.deliveryReceivedAt;
              const canConfirmReceipt = request.fulfilmentMethod === "delivery" && request.status === "approved" && Boolean(request.dispatchedAt) && !receivedAt;
              const confirmReceipt = async () => {
                setConfirmingReceiptId(request.id);
                try {
                  const confirmed = await confirmDeliveryReceipt(request.id);
                  if (confirmed) setReceiptPromptId(null);
                } finally {
                  setConfirmingReceiptId(null);
                }
              };
              return <article key={request.id} className="request-history-row">
                <BookCover title={firstItem?.title || "Borrow request"} author={firstItem?.author || "Library collection"} accent={firstBook?.accent || "#0B1849"} coverUrl={firstItem?.coverUrl || firstBook?.coverUrl} size="small" />
                <div className="request-history-row__main"><span>{request.items.length} {request.items.length === 1 ? "book" : "books"}</span><h3>{request.items.map((item) => item.title).join(", ")}</h3><p>Requested {formatDate(request.requestedAt)}</p></div>
                <div className="request-history-row__method">{request.fulfilmentMethod === "delivery" ? <LuTruck /> : <LuLibrary />}<span><small>FULFILMENT</small><strong>{request.fulfilmentMethod === "delivery" ? "Campus delivery" : "Self pickup"}</strong>{request.fulfilmentMethod === "delivery" && <em>GHS {(request.deliveryFeePesewas / 100).toFixed(2)} · {request.paymentStatus ? "paid (simulated)" : "payment pending"}</em>}</span></div>
                <div className="request-history-row__period"><small>LOAN PERIOD</small><strong>{request.loanDays} {request.loanDays === 1 ? "day" : "days"}</strong><span>{request.fulfilmentMethod === "delivery" ? "starts at confirmed handoff" : "starts after approval"}</span></div>
                <div className="request-history-row__status"><StatusBadge status={request.recalledAt ? "recalled" : request.status} />{request.status === "pending" && <><small>Awaiting staff review</small><button type="button" onClick={() => void cancelBorrowRequest(request.id)}>Cancel request</button></>}{request.status === "approved" && <small>{request.fulfilmentMethod === "delivery" ? receivedAt ? "Receipt confirmed · loan active" : request.dispatchedAt ? "Dispatched · your receipt is required" : "Approved · preparing delivery" : "Loan created successfully"}</small>}{request.status === "rejected" && <small>{request.recalledAt ? request.recallReturnedAt ? "Recall complete · copies secured" : "Recall open · copies in controlled return custody" : request.rejectionReason || "Please contact the library desk"}</small>}</div>
                <div className="request-assurance-card">
                  <div className="request-assurance-card__summary">
                    <p><LuShieldCheck /><span><small>SECURE REQUEST</small><strong>{request.fulfilmentMethod === "delivery" ? "Two-sided delivery record" : "Staff-approved pickup"}</strong></span></p>
                    {request.fulfilmentMethod === "delivery" && <><p><LuMapPin /><span><small>DELIVER TO</small><strong>{request.deliveryLocation || "Saved campus residence"}{request.deliveryFloor || request.deliveryRoom ? ` · Floor ${request.deliveryFloor || "—"}, Room ${request.deliveryRoom || "—"}` : ""}</strong></span></p><p><LuCreditCard /><span><small>PAYMENT REFERENCE</small><strong>{request.paymentReference || "Issued after simulated payment"}</strong></span></p></>}
                  </div>
                  <div className="request-confirmation-timeline" aria-label="Borrow request confirmation history">
                    <div className="is-complete"><span><LuSend /></span><p><small>REQUEST SENT</small><strong>Student request recorded</strong><em>{formatActivityDate(request.requestedAt)}</em></p></div>
                    <div className={request.reviewedAt ? "is-complete" : ""}><span><LuUserCheck /></span><p><small>STAFF REVIEW</small><strong>{request.reviewedAt ? request.reviewerName || "Library staff" : "Awaiting staff approval"}</strong><em>{request.reviewedAt ? `${request.reviewerEmail || "Verified staff account"} · ${formatActivityDate(request.reviewedAt)}` : "No copy has been released"}</em></p></div>
                    {request.fulfilmentMethod === "delivery" && <div className={request.dispatchedAt ? "is-complete" : ""}><span><LuTruck /></span><p><small>STAFF HANDOFF</small><strong>{request.dispatchedAt ? request.dispatcherName || "Library dispatcher" : "Not dispatched"}</strong><em>{request.dispatchedAt ? `${request.dispatcherEmail || "Verified staff account"} · ${formatActivityDate(request.dispatchedAt)}` : "Waiting for staff to release the books"}</em></p></div>}
                    {request.recalledAt && <div className="is-warning"><span><LuRotateCcw /></span><p><small>SAFE RECALL</small><strong>{request.recallerName || "Library staff"} stopped this delivery</strong><em>{formatActivityDate(request.recalledAt)} · {request.recallReason || "Delivery could not be completed"}</em></p></div>}
                    {request.recalledAt && request.dispatchedAt && <div className={request.recallReturnedAt ? "is-complete" : "is-warning"}><span><LuPackageCheck /></span><p><small>DESK RETURN</small><strong>{request.recallReturnedAt ? `${request.recallReturnerName || "Second staff member"} secured every copy` : "Copies locked in return custody"}</strong><em>{request.recallReturnedAt ? formatActivityDate(request.recallReturnedAt) : "A different staff member must confirm the physical return before reuse"}</em></p></div>}
                    {request.fulfilmentMethod === "delivery" && <div className={receivedAt ? "is-complete" : canConfirmReceipt ? "is-action" : ""}><span>{receivedAt ? <LuBadgeCheck /> : <LuHandshake />}</span><p><small>STUDENT RECEIPT</small><strong>{receivedAt ? "You confirmed the handoff" : request.recalledAt ? "Closed after safe recall" : canConfirmReceipt ? "Your confirmation is required" : "Waiting for dispatch"}</strong><em>{receivedAt ? formatActivityDate(receivedAt) : request.recalledAt ? request.recallReturnedAt || !request.dispatchedAt ? "No loan or due date was created" : "Return custody is still awaiting an independent desk check" : canConfirmReceipt ? `Confirm only after you physically receive all ${request.items.length} ${request.items.length === 1 ? "book" : "books"}.` : "Your loan clock has not started"}</em></p></div>}
                  </div>
                  {canConfirmReceipt && (
                    <div className="student-receipt-confirmation">
                      {receiptPromptId !== request.id ? <button type="button" className="button button--gold" onClick={() => setReceiptPromptId(request.id)}><LuHandshake /> Confirm books received</button> : <div className="student-receipt-confirmation__prompt"><p><strong>Confirm the physical handoff?</strong><span>This creates your student-side audit record and starts the exact {request.loanDays}-day loan period. Do not confirm if any book is missing.</span></p><div><button type="button" className="button button--primary" disabled={confirmingReceiptId === request.id} onClick={() => void confirmReceipt()}>{confirmingReceiptId === request.id ? "Confirming…" : "Yes, I have every book"}<LuBadgeCheck /></button><button type="button" className="button button--outline" disabled={confirmingReceiptId === request.id} onClick={() => setReceiptPromptId(null)}>Not yet</button></div></div>}
                    </div>
                  )}
                </div>
              </article>;
            })}
          </div>
        </section>
      )}
      <section className="loans-panel">
        <div className="loans-tabs" role="tablist">{tabs.map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} className={tab === item ? "is-active" : ""} onClick={() => setTab(item)}>{item === "all" ? "All loans" : item.replace("-", " ")}<span>{item === "all" ? loans.length : loans.filter((loan) => loan.status === item).length}</span></button>)}</div>
        <div className="loan-list">
          {filtered.map((loan) => {
            const book = books.find((item) => item.id === loan.bookId);
            const title = book?.title || loan.title || "Archived library title";
            const author = book?.author || loan.author || "Unknown author";
            const category = book?.category || loan.category || "Library collection";
            const fineAmount = Math.max(0, Number(loan.fineAmountPesewas ?? 0));
            const finePaid = Math.max(0, Number(loan.finePaidPesewas ?? 0));
            const fineOutstanding = Math.max(0, Number(loan.fineOutstandingPesewas ?? fineAmount));
            const overduePeriods = Math.max(0, Number(loan.overduePeriods ?? 0));
            const returnPending = loan.returnRequestStatus === "pending";
            const returnAccepted = loan.returnRequestStatus === "accepted";
            const canRequestReturn = loan.status !== "returned" && !returnPending && !returnAccepted;
            return (
              <article className={`loan-row${fineOutstanding > 0 ? " loan-row--fined" : ""}${returnPending ? " loan-row--return-pending" : ""}`} key={loan.id}>
                <BookCover title={title} author={author} accent={book?.accent || "#0B1849"} coverUrl={book?.coverUrl || loan.coverUrl} size="small" />
                <div className="loan-row__book"><span>{category}</span><h3>{title}</h3><p>{author}</p></div>
                <div className="loan-row__date loan-row__date--borrowed"><small>BORROWED</small><strong>{formatDate(loan.borrowedAt)}</strong></div>
                <div className="loan-row__date loan-row__date--deadline"><small>{loan.returnedAt ? "RETURNED" : "RETURN BY"}</small><strong>{formatActivityDate(loan.returnedAt || loan.dueAt)}</strong></div>
                <div className={`loan-row__fine${fineOutstanding > 0 ? " has-fine" : finePaid > 0 ? " is-paid" : ""}`}><small>FINE BALANCE</small><strong>{formatGhs(fineOutstanding)}</strong><span>{overduePeriods > 0 ? `${overduePeriods} completed overdue ${overduePeriods === 1 ? "period" : "periods"}` : loan.status === "overdue" ? "First 24-hour period not complete" : "No outstanding fine"}</span>{fineAmount > 0 && <em>{formatGhs(fineAmount)} accrued · {formatGhs(finePaid)} paid</em>}{loan.finePaymentReference && <code title={`Payment reference ${loan.finePaymentReference}`}>Ref {loan.finePaymentReference}</code>}</div>
                <div className="loan-row__status"><StatusBadge status={loan.status} />{loan.status !== "returned" && <small>{loan.status === "overdue" ? "Return date passed" : loan.status === "due-soon" ? "Due within " + settings.reminderHours + " hours" : "Due " + formatDate(loan.dueAt)}</small>}</div>
                <div className="loan-row__actions">
                  {fineOutstanding > 0 && loan.finePaymentEnabled !== false && <button type="button" className="loan-fine-pay-action" onClick={() => openFinePayment(loan.id)}><LuCreditCard /> Pay outstanding fine</button>}
                  {fineOutstanding === 0 && finePaid > 0 && <span className="loan-fine-payment-state" role="status"><LuCircleCheck /><span><strong>Fine paid</strong><small>{loan.finePaidAt ? formatActivityDate(loan.finePaidAt) : "Payment recorded"}</small></span></span>}
                  {returnPending && <span className="loan-return-state loan-return-state--pending" role="status"><LuClock3 /><span><strong>Return requested</strong><small>{loan.returnRequestedAt ? formatActivityDate(loan.returnRequestedAt) : "Awaiting librarian acceptance"}</small></span></span>}
                  {returnAccepted && <span className="loan-return-state loan-return-state--accepted" role="status"><LuBadgeCheck /><span><strong>Return accepted</strong><small>{loan.returnAcceptedAt ? formatActivityDate(loan.returnAcceptedAt) : "Confirmed by library staff"}</small></span></span>}
                  {canRequestReturn && <button type="button" className="loan-return-action" onClick={() => setReturnPromptId(loan.id)}><LuRotateCcw /> Request return</button>}
                  {book ? <Link className="loan-row__action" href={"/book/" + book.slug}>{loan.status === "returned" ? "Borrow again" : "View book"}<LuArrowRight /></Link> : <span className="loan-row__action">Archived record</span>}
                </div>
              </article>
            );
          })}
          {!filtered.length && <div className="empty-state"><LuClock3 /><h3>No loans here</h3><p>Your matching borrowing activity will appear here.</p></div>}
        </div>
      </section>
      <section className="loan-return-policy" aria-labelledby="return-policy-title"><span><LuReceiptText /></span><div><small>RETURN POLICY</small><h2 id="return-policy-title">Request first, then hand the exact book to a librarian</h2><p>Your request places the book in the return queue; it does not close the loan. Bring the physical copy and your student ID to the circulation desk. The loan ends only when a librarian receives, inspects, and accepts that exact copy.</p><ul><li><LuClock3 />A fine of <strong>GHS 3.50</strong> is added for every completed 24-hour period after the return deadline.</li><li><LuShieldCheck />Fine totals and return acceptance are calculated and recorded securely by the library system.</li><li><LuBadgeCheck />You will receive an in-app notification when staff accepts the return.</li></ul></div></section>

      {returnPromptLoan && (
        <div className="return-request-modal" role="presentation">
          <button type="button" className="return-request-modal__scrim" aria-label="Close return request" disabled={requestingReturnId === returnPromptLoan.id} onClick={() => setReturnPromptId(null)} />
          <section ref={returnDialogRef} role="dialog" aria-modal="true" aria-labelledby="return-request-title" aria-describedby="return-request-description" className="return-request-modal__dialog">
            <button type="button" className="return-request-modal__close" aria-label="Close return request" disabled={requestingReturnId === returnPromptLoan.id} onClick={() => setReturnPromptId(null)}><LuX /></button>
            <span className="return-request-modal__icon"><LuRotateCcw /></span>
            <small>PHYSICAL RETURN REQUEST</small>
            <h2 id="return-request-title">Request to return this book?</h2>
            <p id="return-request-description">This alerts library staff that you intend to return <strong>{books.find((book) => book.id === returnPromptLoan.bookId)?.title || returnPromptLoan.title || "this library book"}</strong>. Your loan and any overdue fine remain active until a librarian physically receives and accepts the copy.</p>
            <div className="return-request-modal__summary">
              <p><span>Return deadline</span><strong>{formatActivityDate(returnPromptLoan.dueAt)}</strong></p>
              <p className={(returnPromptLoan.fineOutstandingPesewas ?? 0) > 0 ? "has-fine" : ""}><span>Outstanding fine</span><strong>{formatGhs(returnPromptLoan.fineOutstandingPesewas)}</strong></p>
            </div>
            {(returnPromptLoan.fineOutstandingPesewas ?? 0) > 0 && <div className="return-request-modal__warning"><LuTriangleAlert /><p><strong>The overdue fine is still active.</strong><span>It remains on your record after the return request and is frozen only when staff accepts the physical book.</span></p></div>}
            <div className="return-request-modal__actions">
              <button ref={confirmReturnRef} type="button" className="button button--primary" disabled={requestingReturnId === returnPromptLoan.id} onClick={() => void confirmReturnRequest()}>{requestingReturnId === returnPromptLoan.id ? <><span className="spinner" /> Sending request…</> : <><LuRotateCcw /> Yes, request return</>}</button>
              <button type="button" className="button button--outline" disabled={requestingReturnId === returnPromptLoan.id} onClick={() => setReturnPromptId(null)}>Keep this loan open</button>
            </div>
          </section>
        </div>
      )}

      {finePromptLoan && (
        <div className="fine-payment-modal" role="presentation">
          <button type="button" className="fine-payment-modal__scrim" aria-label="Close fine payment" disabled={payingFineId === finePromptLoan.id} onClick={closeFinePayment} />
          <section ref={finePaymentDialogRef} role="dialog" aria-modal="true" aria-labelledby="fine-payment-title" aria-describedby="fine-payment-description" className="fine-payment-modal__dialog">
            <button type="button" className="fine-payment-modal__close" aria-label="Close fine payment" disabled={payingFineId === finePromptLoan.id} onClick={closeFinePayment}><LuX /></button>
            {finePaymentComplete ? (
              <div className="fine-payment-success" role="status" aria-live="polite">
                <span><LuCircleCheck /></span>
                <small>PAYMENT RECORDED</small>
                <h2 id="fine-payment-title">Your fine is settled</h2>
                <p id="fine-payment-description">The simulated payment was recorded against this exact loan. Librarians and administrators can now see the updated balance and audit reference.</p>
                <div className="fine-payment-success__receipt">
                  <p><span>Paid for</span><strong>{books.find((book) => book.id === finePromptLoan.bookId)?.title || finePromptLoan.title || "Library loan"}</strong></p>
                  <p><span>Payment status</span><strong>{finePromptLoan.finePaymentStatus || "Paid"}</strong></p>
                  {finePromptLoan.finePaymentReference && <p><span>Reference</span><strong>{finePromptLoan.finePaymentReference}</strong></p>}
                </div>
                <button ref={firstPaymentOptionRef} type="button" className="button button--primary" onClick={closeFinePayment}>Done <LuBadgeCheck /></button>
              </div>
            ) : (
              <>
                <span className="fine-payment-modal__icon"><LuCreditCard /></span>
                <small>SIMULATED FINE PAYMENT</small>
                <h2 id="fine-payment-title">Pay {formatGhs(finePromptLoan.fineOutstandingPesewas)}</h2>
                <p id="fine-payment-description">Settle the outstanding fine for <strong>{books.find((book) => book.id === finePromptLoan.bookId)?.title || finePromptLoan.title || "this library book"}</strong>. The system calculates the balance securely; no amount is accepted from this screen.</p>
                <div className="fine-payment-modal__summary">
                  <p><span>Loan deadline</span><strong>{formatActivityDate(finePromptLoan.dueAt)}</strong></p>
                  <p className="has-fine"><span>Authoritative balance</span><strong>{formatGhs(finePromptLoan.fineOutstandingPesewas)}</strong></p>
                </div>
                <fieldset className="fine-payment-methods">
                  <legend>Choose payment method</legend>
                  <div role="radiogroup" aria-label="Fine payment method">
                    <button ref={firstPaymentOptionRef} type="button" role="radio" aria-checked={finePaymentMethod === "momo"} className={finePaymentMethod === "momo" ? "is-selected" : ""} disabled={payingFineId === finePromptLoan.id} onClick={() => { setFinePaymentMethod("momo"); setFinePaymentError(null); }}><LuSmartphone /><span><strong>Mobile money</strong><small>Simulated MoMo approval</small></span><i aria-hidden="true" /></button>
                    <button type="button" role="radio" aria-checked={finePaymentMethod === "card"} className={finePaymentMethod === "card" ? "is-selected" : ""} disabled={payingFineId === finePromptLoan.id} onClick={() => { setFinePaymentMethod("card"); setFinePaymentError(null); }}><LuCreditCard /><span><strong>Card</strong><small>Simulated card approval</small></span><i aria-hidden="true" /></button>
                  </div>
                </fieldset>
                <div className="fine-payment-modal__notice"><LuShieldCheck /><p><strong>Presentation-safe simulation</strong><span>No real account is charged. A traceable payment record and reference are still created for this loan.</span></p></div>
                {finePaymentError && <div className="fine-payment-modal__error" role="alert"><LuTriangleAlert /><span>{finePaymentError}</span></div>}
                <div className="fine-payment-modal__actions">
                  <button type="button" className="button button--primary" disabled={!finePaymentMethod || payingFineId === finePromptLoan.id} onClick={() => void confirmFinePayment()}>{payingFineId === finePromptLoan.id ? <><span className="spinner" /> Processing securely…</> : <><LuCreditCard /> Confirm simulated payment</>}</button>
                  <button type="button" className="button button--outline" disabled={payingFineId === finePromptLoan.id} onClick={closeFinePayment}>Cancel</button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
