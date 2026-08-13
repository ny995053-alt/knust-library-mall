"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { LuArrowLeft, LuArrowRight, LuBadgeCheck, LuBuilding2, LuCalendarDays, LuCheck, LuCreditCard, LuInfo, LuLibrary, LuLockKeyhole, LuMapPin, LuShieldCheck, LuSmartphone, LuTrash2, LuTriangleAlert, LuTruck } from "react-icons/lu";
import { BookCover } from "@/components/ui/book-cover";
import { useLibrary } from "@/components/student/library-provider";
import { addDays, formatDate, pluralize } from "@/lib/utils";
import type { FulfilmentMethod, SimulatedPaymentMethod } from "@/lib/types";

function validCardNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 12 || digits.length > 19 || /^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

function validCardExpiry(value: string) {
  const match = value.match(/^(0[1-9]|1[0-2])\/(\d{2})$/);
  if (!match) return false;
  const now = new Date();
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  return year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1);
}

export function BasketPage() {
  const router = useRouter();
  const { books, basket, removeFromBasket, checkout, settings, profile, requestError, clearRequestError } = useLibrary();
  const maxLoanDays = Math.min(7, Math.max(1, Math.trunc(settings.maxLoanDays || 1)));
  const [chosenDays, setChosenDays] = useState(() => maxLoanDays);
  const [fulfilmentMethod, setFulfilmentMethod] = useState<FulfilmentMethod>("pickup");
  const [deliveryCardSelected, setDeliveryCardSelected] = useState(false);
  const [deliveryFloor, setDeliveryFloor] = useState("");
  const [deliveryRoom, setDeliveryRoom] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<SimulatedPaymentMethod>("momo");
  const [paymentState, setPaymentState] = useState<"idle" | "processing" | "success">("idle");
  const [paymentError, setPaymentError] = useState("");
  const [cardholder, setCardholder] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [momoProvider, setMomoProvider] = useState("MTN MoMo");
  const [momoNumber, setMomoNumber] = useState("");
  const [checkingOut, setCheckingOut] = useState(false);
  const days = Math.min(Math.max(1, chosenDays), maxLoanDays);
  const basketBooks = basket.map((id) => books.find((book) => book.id === id)).filter(Boolean);
  const dueDate = useMemo(() => addDays(new Date(), days), [days]);
  const deliveryAllowed = profile.residenceType === "on-campus";
  const savedDeliveryLocation = profile.residenceLocation?.trim() || "";
  const fee = fulfilmentMethod === "delivery" ? settings.deliveryFeePesewas / 100 : 0;

  const invalidatePayment = () => {
    setPaymentError("");
    setPaymentState("idle");
    clearRequestError();
  };

  const simulatePayment = async () => {
    setPaymentError("");
    clearRequestError();
    if (!deliveryCardSelected || savedDeliveryLocation.length < 4 || !deliveryFloor.trim() || !deliveryRoom.trim()) {
      const message = "Select your saved residence and enter the floor and room before payment.";
      setPaymentError(message);
      toast.error(message);
      return;
    }
    if (paymentMethod === "card" && (cardholder.trim().length < 2 || !validCardNumber(cardNumber) || !validCardExpiry(cardExpiry) || !/^\d{3,4}$/.test(cardCvv))) {
      const message = "Enter a valid cardholder name, card number, future expiry, and CVV for the simulation.";
      setPaymentError(message);
      toast.error(message);
      return;
    }
    if (paymentMethod === "momo" && !/^(?:0\d{9}|233\d{9})$/.test(momoNumber.replace(/[\s-]/g, ""))) {
      const message = "Enter a valid 10-digit Ghana mobile number for the MoMo simulation.";
      setPaymentError(message);
      toast.error(message);
      return;
    }

    setPaymentState("processing");
    await new Promise((resolve) => window.setTimeout(resolve, 850));
    setPaymentState("success");
    setCardholder("");
    setCardNumber("");
    setCardExpiry("");
    setCardCvv("");
    setMomoNumber("");
    toast.success("Simulated delivery payment marked successful.");
  };

  const handleCheckout = async () => {
    clearRequestError();
    setCheckingOut(true);
    try {
      if (fulfilmentMethod === "delivery" && paymentState !== "success") {
        toast.error("Complete the simulated delivery payment before sending your request.");
        return;
      }
      const complete = await checkout({
        days,
        fulfilmentMethod,
        deliveryLocation: fulfilmentMethod === "delivery" ? savedDeliveryLocation : undefined,
        deliveryFloor: fulfilmentMethod === "delivery" ? deliveryFloor : undefined,
        deliveryRoom: fulfilmentMethod === "delivery" ? deliveryRoom : undefined,
        paymentMethod: fulfilmentMethod === "delivery" ? paymentMethod : undefined,
        paymentSimulated: fulfilmentMethod === "delivery" ? paymentState === "success" : false,
      });
      if (complete) router.push("/loans?request=pending");
    } finally {
      setCheckingOut(false);
    }
  };

  if (!basketBooks.length) {
    return (
      <div className="empty-page-card">
        <span><LuLibrary /></span>
        <h1>Your borrow basket is empty</h1>
        <p>Browse the catalogue and add up to {settings.maxActiveBooks} available physical books.</p>
        <Link href="/library#catalog" className="button button--primary">Explore the catalogue <LuArrowRight /></Link>
      </div>
    );
  }

  return (
    <div className="basket-page page-stack">
      <div className="page-heading-row">
        <div><Link href="/library" className="back-link"><LuArrowLeft /> Continue browsing</Link><span className="page-kicker">BORROWING</span><h1>Your borrow basket</h1><p>Review your books, choose a loan period, and tell us how you want to receive them.</p></div>
        <span className="page-count">{basketBooks.length} {pluralize(basketBooks.length, "book")}</span>
      </div>

      <div className="checkout-layout">
        <section className="checkout-main">
          <div className="checkout-section-heading"><span>01</span><div><h2>Review your books</h2><p>Availability will be confirmed when you check out.</p></div></div>
          <div className="basket-list">
            {basketBooks.map((book) => book && (
              <article className="basket-row" key={book.id}>
                <BookCover title={book.title} author={book.author} accent={book.accent} coverUrl={book.coverUrl} size="small" />
                <div className="basket-row__main"><span>{book.category}</span><h3>{book.title}</h3><p>{book.author}</p><small><i /> {book.availableCopies} of {book.totalCopies} available</small></div>
                <div className="basket-row__meta"><span>FORMAT</span><strong>Physical copy</strong><small>{book.isbn}</small></div>
                <button className="remove-button" onClick={() => void removeFromBasket(book.id)} aria-label={"Remove " + book.title}><LuTrash2 /><span>Remove</span></button>
              </article>
            ))}
          </div>

          <div className="checkout-section-heading checkout-section-heading--spaced"><span>02</span><div><h2>Choose your loan period</h2><p>Select between one and {maxLoanDays} days. Pickup starts at approval; delivery starts after you confirm the handoff.</p></div></div>
          <div className="loan-day-picker" role="radiogroup" aria-label="Loan period">
            {Array.from({ length: maxLoanDays }, (_, index) => index + 1).map((value) => {
              const date = addDays(new Date(), value);
              return (
                <button key={value} type="button" role="radio" aria-checked={days === value} className={days === value ? "is-selected" : ""} onClick={() => { setChosenDays(value); clearRequestError(); }}>
                  <span>{date.toLocaleDateString("en-GB", { weekday: "short" })}</span>
                  <strong>{date.getDate()}</strong>
                  <small>{date.toLocaleDateString("en-GB", { month: "short" })}</small>
                  {days === value && <i><LuCheck /></i>}
                </button>
              );
            })}
          </div>
          <div className="due-date-banner"><LuCalendarDays /><span><small>ESTIMATED IF FINALISED TODAY</small><strong>{formatDate(dueDate, { weekday: "long" })}</strong><p>Your exact {days}-day period is saved. Pickup begins at approval; delivery begins at your receipt confirmation.</p></span></div>

          <div className="checkout-section-heading checkout-section-heading--spaced"><span>03</span><div><h2>Choose fulfilment</h2><p>Collect from the circulation desk for free, or request on-campus delivery for GHS {(settings.deliveryFeePesewas / 100).toFixed(2)}.</p></div></div>
          <div className="fulfilment-options" role="radiogroup" aria-label="Book fulfilment method">
            <button type="button" role="radio" aria-checked={fulfilmentMethod === "pickup"} className={fulfilmentMethod === "pickup" ? "is-selected" : ""} onClick={() => { setFulfilmentMethod("pickup"); clearRequestError(); }}>
              <span><LuBuilding2 /></span><div><strong>Self pickup</strong><small>Collect at {settings.deskLocation}</small><em>Free</em></div>{fulfilmentMethod === "pickup" && <i><LuCheck /></i>}
            </button>
            <button type="button" role="radio" aria-checked={fulfilmentMethod === "delivery"} aria-disabled={!deliveryAllowed} disabled={!deliveryAllowed} className={fulfilmentMethod === "delivery" ? "is-selected" : ""} onClick={() => { setFulfilmentMethod("delivery"); invalidatePayment(); }}>
              <span><LuTruck /></span><div><strong>Campus delivery</strong><small>{deliveryAllowed ? "Delivered to your hall or campus hostel" : "Available only to registered on-campus residences"}</small><em>GHS {(settings.deliveryFeePesewas / 100).toFixed(2)}</em></div>{fulfilmentMethod === "delivery" && <i><LuCheck /></i>}
            </button>
          </div>
          {fulfilmentMethod === "delivery" && (
            <div className="delivery-address-panel">
              <span className="delivery-address-panel__label"><LuMapPin /> Select your saved delivery address</span>
              <button type="button" role="radio" aria-checked={deliveryCardSelected} className={deliveryCardSelected ? "delivery-address-card is-selected" : "delivery-address-card"} onClick={() => { setDeliveryCardSelected(true); invalidatePayment(); }}>
                <span><LuBuilding2 /></span>
                <p><small>ON-CAMPUS RESIDENCE</small><strong>{savedDeliveryLocation || "No on-campus residence saved"}</strong><em>From your verified student profile</em></p>
                {deliveryCardSelected && <i><LuCheck /></i>}
              </button>
              <div className="delivery-room-grid">
                <label><span>Floor</span><input value={deliveryFloor} onChange={(event) => { setDeliveryFloor(event.target.value.slice(0, 30)); invalidatePayment(); }} placeholder="e.g. 2nd floor" autoComplete="off" required /></label>
                <label><span>Room number</span><input value={deliveryRoom} onChange={(event) => { setDeliveryRoom(event.target.value.slice(0, 30)); invalidatePayment(); }} placeholder="e.g. C-214" autoComplete="off" required /></label>
              </div>
              <small>For safety, the saved hall or hostel cannot be changed during checkout. Update your student record through the library desk if it is wrong.</small>
            </div>
          )}
          {!deliveryAllowed && <p className="campus-delivery-note"><LuInfo /> Your profile is marked off campus, so self pickup is the available option.</p>}

          {fulfilmentMethod === "delivery" && (
            <>
              <div className="checkout-section-heading checkout-section-heading--spaced"><span>04</span><div><h2>Simulate delivery payment</h2><p>Choose card or mobile money to mark the GHS {fee.toFixed(2)} presentation payment as successful.</p></div></div>
              <div className={paymentState === "success" ? "simulated-payment-panel is-success" : "simulated-payment-panel"}>
                <div className="payment-simulation-note"><LuLockKeyhole /><p><strong>Presentation simulation only</strong><span>No money is charged. Card number, CVV, and MoMo number stay only in this form, are never sent to Supabase, and are cleared after the simulation.</span></p></div>
                {paymentState !== "success" ? (
                  <>
                    <div className="payment-method-options" role="radiogroup" aria-label="Simulated payment method">
                      <button type="button" role="radio" aria-checked={paymentMethod === "momo"} className={paymentMethod === "momo" ? "is-selected" : ""} onClick={() => { setPaymentMethod("momo"); invalidatePayment(); }}><LuSmartphone /><span><strong>Mobile money</strong><small>MTN, Telecel or AT Money</small></span>{paymentMethod === "momo" && <LuCheck />}</button>
                      <button type="button" role="radio" aria-checked={paymentMethod === "card"} className={paymentMethod === "card" ? "is-selected" : ""} onClick={() => { setPaymentMethod("card"); invalidatePayment(); }}><LuCreditCard /><span><strong>Card</strong><small>Visa or Mastercard simulation</small></span>{paymentMethod === "card" && <LuCheck />}</button>
                    </div>
                    {paymentMethod === "momo" ? (
                      <div className="payment-fields payment-fields--momo">
                        <label><span>Network</span><select value={momoProvider} onChange={(event) => { setMomoProvider(event.target.value); invalidatePayment(); }}><option>MTN MoMo</option><option>Telecel Cash</option><option>AT Money</option></select></label>
                        <label><span>Mobile money number</span><input type="tel" inputMode="numeric" autoComplete="off" value={momoNumber} onChange={(event) => { setMomoNumber(event.target.value.replace(/[^\d\s-]/g, "").slice(0, 14)); invalidatePayment(); }} placeholder="024 000 0000" /></label>
                      </div>
                    ) : (
                      <div className="payment-fields payment-fields--card">
                        <label className="payment-field--wide"><span>Name on card</span><input autoComplete="off" value={cardholder} onChange={(event) => { setCardholder(event.target.value.slice(0, 80)); invalidatePayment(); }} placeholder="Student name" /></label>
                        <label className="payment-field--wide"><span>Card number</span><input inputMode="numeric" autoComplete="off" value={cardNumber} onChange={(event) => { setCardNumber(event.target.value.replace(/\D/g, "").slice(0, 19).replace(/(.{4})/g, "$1 ").trim()); invalidatePayment(); }} placeholder="4242 4242 4242 4242" /></label>
                        <label><span>Expiry</span><input inputMode="numeric" autoComplete="off" value={cardExpiry} onChange={(event) => { const digits = event.target.value.replace(/\D/g, "").slice(0, 4); setCardExpiry(digits.length > 2 ? digits.slice(0, 2) + "/" + digits.slice(2) : digits); invalidatePayment(); }} placeholder="MM/YY" /></label>
                        <label><span>CVV</span><input type="password" inputMode="numeric" autoComplete="off" value={cardCvv} onChange={(event) => { setCardCvv(event.target.value.replace(/\D/g, "").slice(0, 4)); invalidatePayment(); }} placeholder="•••" /></label>
                      </div>
                    )}
                    {paymentError && <p className="payment-validation-error" role="alert"><LuTriangleAlert /> {paymentError}</p>}
                    <button type="button" className="button button--primary simulate-payment-button" onClick={() => void simulatePayment()} disabled={paymentState === "processing"}>{paymentState === "processing" ? "Marking simulation…" : `Simulate GHS ${fee.toFixed(2)} payment`}<LuArrowRight /></button>
                  </>
                ) : (
                  <div className="payment-success-state"><span><LuBadgeCheck /></span><p><small>SIMULATED PAYMENT</small><strong>Marked successful</strong><em>{paymentMethod === "momo" ? momoProvider : "Card"} · GHS {fee.toFixed(2)}</em></p><button type="button" onClick={invalidatePayment}>Change method</button></div>
                )}
              </div>
            </>
          )}
        </section>

        <aside className="checkout-summary">
          <span className="section-kicker">CHECKOUT SUMMARY</span>
          <h2>Ready to request?</h2>
          <div className="summary-lines"><div><span>Books</span><strong>{basketBooks.length} / {settings.maxActiveBooks}</strong></div><div><span>Loan period</span><strong>{days} {pluralize(days, "day")}</strong></div><div><span>Fulfilment</span><strong>{fulfilmentMethod === "delivery" ? "Campus delivery" : "Self pickup"}</strong></div><div><span>Delivery fee</span><strong>{fee ? "GHS " + fee.toFixed(2) : "Free"}</strong></div>{fulfilmentMethod === "delivery" && <div><span>Payment</span><strong>{paymentState === "success" ? "Simulation successful" : "Required"}</strong></div>}<div><span>Starts</span><strong>{fulfilmentMethod === "delivery" ? "At confirmed handoff" : "After approval"}</strong></div></div>
          <div className="summary-rule" />
          <div className="checkout-promise"><LuShieldCheck /><p><strong>{fulfilmentMethod === "delivery" ? "Two-sided delivery protection" : "Staff-approved pickup"}</strong><span>{fulfilmentMethod === "delivery" ? "Staff approval reserves the copies. Your loan and due date start only when you confirm the physical handoff." : "A librarian or administrator confirms every available copy before your selected loan period starts."}</span></p></div>
          {requestError && <p className="checkout-error-alert" role="alert"><LuTriangleAlert /><span><strong>Request not sent</strong>{requestError}</span></p>}
          <button className="button button--gold button--full checkout-button" onClick={() => void handleCheckout()} disabled={checkingOut || (fulfilmentMethod === "delivery" && (!deliveryAllowed || !deliveryCardSelected || !deliveryFloor.trim() || !deliveryRoom.trim() || paymentState !== "success"))}>{checkingOut ? "Sending request…" : "Send borrow request"}<LuArrowRight /></button>
          <p className="checkout-terms"><LuInfo /> In-app notifications keep you informed at approval, dispatch, receipt, and rejection stages.</p>
        </aside>
      </div>
    </div>
  );
}
