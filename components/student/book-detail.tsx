"use client";

import Link from "next/link";
import { LuArrowLeft, LuBookOpen, LuCalendarDays, LuCheck, LuHeart, LuLanguages, LuLibrary, LuShoppingBag, LuStar } from "react-icons/lu";
import { BookCover } from "@/components/ui/book-cover";
import { useLibrary } from "@/components/student/library-provider";
import { cn } from "@/lib/utils";

export function BookDetail({ slug }: { slug: string }) {
  const { books, basket, favorites, addToBasket, toggleFavorite, settings } = useLibrary();
  const book = books.find((item) => item.slug === slug);

  if (!book) {
    return <div className="empty-state page-empty"><LuLibrary /><h1>Book not found</h1><p>This title may have been archived or moved.</p><Link className="button button--primary" href="/library">Back to catalogue</Link></div>;
  }

  const inBasket = basket.includes(book.id);
  const saved = favorites.includes(book.id);
  const canBorrow = book.format !== "digital" && book.availableCopies > 0;
  const canReadOnline = Boolean(book.onlineAvailable || book.onlineContent);
  const formatLabel = book.format === "both" && canReadOnline ? "Physical + online" : book.format === "digital" ? "Online" : "Physical";

  return (
    <div className="book-detail-page">
      <Link className="back-link" href="/library"><LuArrowLeft /> Back to catalogue</Link>
      <section className="book-detail-card">
        <div className="book-detail-card__cover"><BookCover title={book.title} author={book.author} accent={book.accent} coverUrl={book.coverUrl} size="large" /></div>
        <div className="book-detail-card__content">
          <div className="book-detail-card__labels"><span>{book.category}</span><span>{formatLabel}</span></div>
          <h1>{book.title}</h1>
          <p className="book-detail-card__author">by <strong>{book.author}</strong></p>
          <div className="book-rating">{book.rating > 0 && <><LuStar /> <strong>{book.rating.toFixed(1)}</strong><span>•</span></>}<span>{book.borrowCount} borrows</span></div>
          <p className="book-detail-card__description">{book.description}</p>
          <div className="book-facts">
            <div><LuBookOpen /><span><small>Pages</small><strong>{book.pages || "—"}</strong></span></div>
            <div><LuCalendarDays /><span><small>Published</small><strong>{book.publishedYear}</strong></span></div>
            <div><LuLanguages /><span><small>Language</small><strong>{book.language}</strong></span></div>
            <div><LuLibrary /><span><small>ISBN</small><strong>{book.isbn || "—"}</strong></span></div>
          </div>
          <div className="book-stock-line">
            <span className={cn(canBorrow ? "is-available" : canReadOnline ? "is-digital" : "is-unavailable")}><LuCheck /></span>
            <span><strong>{book.format === "both" && canReadOnline ? "Physical borrowing and online reading" : book.format === "digital" && canReadOnline ? "Available to read online" : canBorrow ? "Available to borrow" : canReadOnline ? "Read online while physical copies are on loan" : "All physical copies are on loan"}</strong><small>{book.format !== "digital" ? `${book.availableCopies} of ${book.totalCopies} physical copies available${canReadOnline ? " · Online edition available" : ""}` : canReadOnline ? "Open the published online edition below" : "No published online edition is currently available"}</small></span>
          </div>
          <div className="book-detail-card__actions">
            {canBorrow && <button className={cn("button button--gold", inBasket && "button--muted")} disabled={inBasket} onClick={() => void addToBasket(book.id)}><LuShoppingBag />{inBasket ? "Added to basket" : "Add to borrow basket"}</button>}
            {canReadOnline && <Link className="button button--primary" href={"/read/" + book.slug}><LuBookOpen /> Read online</Link>}
            <button className={cn("button button--outline", saved && "is-saved")} onClick={() => void toggleFavorite(book.id)}><LuHeart />{saved ? "Saved" : "Save for later"}</button>
          </div>
        </div>
      </section>
      <section className="book-detail-notes"><div><span>01</span><h2>About this book</h2></div><p>{book.description} This edition has been prepared for convenient discovery, responsible borrowing, and focused study.</p><div><span>02</span><h2>Borrowing details</h2></div><p>Select a period between one and {settings.maxLoanDays} days and choose pickup or campus delivery. Your loan and return date begin only after staff approval.</p></section>
    </div>
  );
}
