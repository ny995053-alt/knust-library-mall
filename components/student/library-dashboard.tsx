"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { LuArrowRight, LuBookOpen, LuChevronDown, LuSearch, LuShoppingBag } from "react-icons/lu";
import { BookCard } from "@/components/student/book-card";
import { useLibrary } from "@/components/student/library-provider";
import { BookCover } from "@/components/ui/book-cover";
import { formatDate } from "@/lib/utils";

type LibraryDashboardProps = {
  initialQuery?: string;
  dateLabel: string;
};

export function LibraryDashboard({ initialQuery = "", dateLabel }: LibraryDashboardProps) {
  const { books, basket, loans, addToBasket, removeFromBasket, profile, loading, settings } = useLibrary();
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState("All books");
  const [format, setFormat] = useState("all");
  const [sort, setSort] = useState("popular");

  const categories = useMemo(() => ["All books", ...Array.from(new Set(books.map((book) => book.category)))], [books]);
  const featured = books.find((book) => book.featured) ?? books[0];
  const featuredCanBorrow = Boolean(featured && featured.format !== "digital" && featured.availableCopies > 0);
  const featuredCanRead = Boolean(featured && (featured.onlineAvailable || featured.onlineContent));
  const activeLoan = loans.find((loan) => loan.status !== "returned");
  const activeLoanBook = activeLoan ? books.find((book) => book.id === activeLoan.bookId) : null;

  const filteredBooks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const result = books.filter((book) => {
      const matchesQuery = !normalizedQuery || [book.title, book.author, book.isbn, book.category].some((value) => value.toLowerCase().includes(normalizedQuery));
      const matchesCategory = category === "All books" || book.category === category;
      const matchesFormat = format === "all" || book.format === format || book.format === "both";
      return matchesQuery && matchesCategory && matchesFormat;
    });

    return [...result].sort((a, b) => {
      if (sort === "newest") return b.publishedYear - a.publishedYear;
      if (sort === "title") return a.title.localeCompare(b.title);
      if (sort === "available") return b.availableCopies - a.availableCopies;
      return b.borrowCount - a.borrowCount;
    });
  }, [books, category, format, query, sort]);

  const basketBooks = basket.map((id) => books.find((book) => book.id === id)).filter(Boolean);

  return (
    <div className="library-page">
      <section className="student-welcome">
        <div>
          <p className="page-kicker">{dateLabel}</p>
          <h1>Good evening, {profile.fullName.split(" ")[0]}.</h1>
          <p>What will you learn today?</p>
        </div>
        {activeLoan && (activeLoanBook || activeLoan.title) && (
          <Link href="/loans" className="due-reminder">
            <span className="due-reminder__icon"><LuBookOpen /></span>
            <span><small>UPCOMING RETURN</small><strong>{activeLoanBook?.title || activeLoan.title}</strong><em>Due {formatDate(activeLoan.dueAt)}</em></span>
            <LuArrowRight aria-hidden="true" />
          </Link>
        )}
      </section>

      <div className="library-layout">
        <div className="library-feed">
          {featured && (
            <section className="library-hero">
              <div className="library-hero__content">
                <span className="library-hero__eyebrow">FEATURED THIS WEEK</span>
                <h2>{featured.title}</h2>
                <p>{featured.description}</p>
                <div className="library-hero__author"><span>{featured.author}</span><i /> <span>{featured.category}</span></div>
                <div className="library-hero__format">{featured.format === "both" && featuredCanRead ? "Physical + online" : featured.format === "digital" ? "Online edition" : "Physical edition"}</div>
                <div className="library-hero__actions">
                  {featuredCanBorrow && <button className={basket.includes(featured.id) ? "button button--muted" : "button button--gold"} type="button" disabled={basket.includes(featured.id)} onClick={() => void addToBasket(featured.id)}>{basket.includes(featured.id) ? "In borrow basket" : "Add to basket"}</button>}
                  {featuredCanRead && <Link href={"/read/" + featured.slug} className="button button--ghost-light"><LuBookOpen /> Read online</Link>}
                  <Link href={"/book/" + featured.slug} className="button button--ghost-light">View book <LuArrowRight /></Link>
                </div>
              </div>
              <div className="library-hero__book" aria-hidden="true">
                <BookCover title={featured.title} author={featured.author} accent={featured.accent} coverUrl={featured.coverUrl} size="large" />
              </div>
              <span className="library-hero__ring library-hero__ring--one" />
              <span className="library-hero__ring library-hero__ring--two" />
            </section>
          )}

          <section className="catalog-section" id="catalog">
            <div className="section-heading">
              <div><span className="section-kicker">EXPLORE THE COLLECTION</span><h2>Find your next book</h2></div>
              <span>{filteredBooks.length} titles</span>
            </div>

            <div className="catalog-search-row">
              <label className="catalog-search">
                <LuSearch aria-hidden="true" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search books, authors or ISBN" />
              </label>
              <label className="select-control">
                <select value={format} onChange={(event) => setFormat(event.target.value)} aria-label="Filter by format">
                  <option value="all">All formats</option>
                  <option value="physical">Physical</option>
                  <option value="digital">Digital</option>
                </select>
                <LuChevronDown aria-hidden="true" />
              </label>
              <label className="select-control">
                <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort books">
                  <option value="popular">Most popular</option>
                  <option value="newest">Newest</option>
                  <option value="available">Availability</option>
                  <option value="title">Title A–Z</option>
                </select>
                <LuChevronDown aria-hidden="true" />
              </label>
            </div>

            <div className="category-chips" role="list" aria-label="Book categories">
              {categories.map((item) => <button key={item} type="button" className={category === item ? "is-active" : ""} onClick={() => setCategory(item)}>{item}</button>)}
            </div>

            {loading ? (
              <div className="book-grid book-grid--loading">{Array.from({ length: 6 }, (_, index) => <div className="book-card-skeleton" key={index} />)}</div>
            ) : filteredBooks.length ? (
              <div className="book-grid">{filteredBooks.map((book) => <BookCard key={book.id} book={book} />)}</div>
            ) : (
              <div className="empty-state"><LuSearch /><h3>No books found</h3><p>Try another title, author, category, or format.</p><button className="button button--outline" onClick={() => { setQuery(""); setCategory("All books"); setFormat("all"); }}>Clear filters</button></div>
            )}
          </section>
        </div>

        <aside className="basket-preview">
          <div className="basket-preview__heading">
            <div><span><LuShoppingBag /></span><div><strong>Borrow basket</strong><small>{basket.length} of {settings.maxActiveBooks} books</small></div></div>
            {basket.length > 0 && <Link href="/basket">View all</Link>}
          </div>
          <div className="basket-progress"><span style={{ width: (basket.length / settings.maxActiveBooks) * 100 + "%" }} /></div>
          {basketBooks.length ? (
            <div className="basket-preview__list">
              {basketBooks.map((book) => book && (
                <div className="basket-preview__item" key={book.id}>
                  <BookCover title={book.title} author={book.author} accent={book.accent} coverUrl={book.coverUrl} size="small" />
                  <div><strong>{book.title}</strong><span>{book.author}</span><small>{book.availableCopies} available</small></div>
                  <button onClick={() => void removeFromBasket(book.id)} type="button" aria-label={"Remove " + book.title}>×</button>
                </div>
              ))}
            </div>
          ) : (
            <div className="basket-preview__empty"><span><LuShoppingBag /></span><strong>Your basket is empty</strong><p>Add available books from the catalogue to prepare a borrow request.</p></div>
          )}
          <Link href={basket.length ? "/basket" : "#catalog"} className="button button--primary button--full">{basket.length ? "Review borrow request" : "Browse available books"}<LuArrowRight /></Link>
          <p className="basket-preview__note">Choose 1–{settings.maxLoanDays} days and pickup or delivery. Stock and the loan start are confirmed by library staff.</p>
        </aside>
      </div>
    </div>
  );
}
