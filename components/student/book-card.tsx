"use client";

import Link from "next/link";
import { LuArrowUpRight, LuBookOpen, LuHeart, LuShoppingBag, LuStar } from "react-icons/lu";
import { BookCover } from "@/components/ui/book-cover";
import { useLibrary } from "@/components/student/library-provider";
import type { Book } from "@/lib/types";
import { cn } from "@/lib/utils";

type BookCardProps = {
  book: Book;
  compact?: boolean;
};

export function BookCard({ book, compact = false }: BookCardProps) {
  const { basket, favorites, addToBasket, toggleFavorite } = useLibrary();
  const inBasket = basket.includes(book.id);
  const isSaved = favorites.includes(book.id);
  const canBorrow = book.format !== "digital" && book.availableCopies > 0;
  const canReadOnline = Boolean(book.onlineAvailable || book.onlineContent);
  const isDualFormat = book.format === "both" && canReadOnline;

  return (
    <article className={cn("book-card", compact && "book-card--compact")}>
      <div className="book-card__visual">
        <Link href={"/book/" + book.slug} aria-label={"View " + book.title}>
          <BookCover title={book.title} author={book.author} accent={book.accent} coverUrl={book.coverUrl} size={compact ? "small" : "medium"} />
        </Link>
        <button className={cn("save-button", isSaved && "is-saved")} onClick={() => void toggleFavorite(book.id)} type="button" aria-label={isSaved ? "Remove from saved books" : "Save book"}>
          <LuHeart aria-hidden="true" />
        </button>
        {book.newArrival && <span className="book-card__new">New</span>}
      </div>
      <div className="book-card__content">
        <div className="book-card__meta">
          <span>{book.category}</span>
          <span>{book.rating > 0 ? <><LuStar aria-hidden="true" /> {book.rating.toFixed(1)}</> : book.borrowCount + " borrows"}</span>
        </div>
        <Link href={"/book/" + book.slug} className="book-card__title"><h3>{book.title}</h3></Link>
        <p className="book-card__author">{book.author}</p>
        <div className="book-card__availability">
          <span className={cn(canBorrow ? "is-available" : canReadOnline ? "is-digital" : "is-unavailable")} />
          {isDualFormat ? `Physical + online · ${book.availableCopies} of ${book.totalCopies} copies available` : book.format === "digital" && canReadOnline ? "Available online" : book.availableCopies > 0 ? book.availableCopies + " of " + book.totalCopies + " physical copies available" : canReadOnline ? "Online reading available · physical copies on loan" : "Currently on loan"}
        </div>
        <div className="book-card__actions">
          {canBorrow && (
            <button className={cn("button button--small", inBasket ? "button--muted" : "button--gold")} onClick={() => void addToBasket(book.id)} type="button" disabled={inBasket}>
              <LuShoppingBag aria-hidden="true" /> {inBasket ? "In basket" : "Borrow"}
            </button>
          )}
          {canReadOnline && <Link className={cn("button button--small", canBorrow ? "button--primary" : "button--gold")} href={"/read/" + book.slug}><LuBookOpen aria-hidden="true" /> Read</Link>}
          {!canBorrow && !canReadOnline && (
            <button className="button button--small button--muted" type="button" disabled>Unavailable</button>
          )}
          <Link href={"/book/" + book.slug} className="book-card__details" aria-label={"View details for " + book.title}><LuArrowUpRight /></Link>
        </div>
      </div>
    </article>
  );
}
