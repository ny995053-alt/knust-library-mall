"use client";

import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LuArrowRight,
  LuBookOpen,
  LuChevronDown,
  LuHeart,
  LuRefreshCw,
  LuSearch,
  LuShoppingBag,
  LuX,
} from "react-icons/lu";
import { BookCover } from "@/components/ui/book-cover";
import { Brand } from "@/components/ui/brand";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { Book } from "@/lib/types";
import { cn } from "@/lib/utils";

type CatalogueSource = "live" | "fallback";
type AccessIntent = "borrow" | "read" | "save" | "view";

type CataloguePayload = {
  books?: Book[];
  categories?: string[];
  source?: CatalogueSource;
  updatedAt?: string;
};

type AccessPrompt = {
  book: Book;
  intent: AccessIntent;
};

const intentCopy: Record<AccessIntent, { eyebrow: string; title: string; body: string }> = {
  borrow: {
    eyebrow: "BORROWING ACCESS",
    title: "Sign in to borrow this book",
    body: "Create your student account or sign in to add this title to your basket, choose 1–7 days, and request pickup or on-campus delivery.",
  },
  read: {
    eyebrow: "DIGITAL READING",
    title: "Sign in to start reading",
    body: "Online books are available to verified KNUST students. Create an account or sign in to continue reading.",
  },
  save: {
    eyebrow: "SAVED BOOKS",
    title: "Sign in to save this book",
    body: "Keep a personal reading list and return to it from any device after you create your student account.",
  },
  view: {
    eyebrow: "STUDENT ACCESS",
    title: "Sign in to open this book",
    body: "View the full record, read online, or request an available copy after you create your student account.",
  },
};

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function formatCatalogueTime(value: string) {
  return new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function isBook(value: unknown): value is Book {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Book>;
  return typeof candidate.id === "string"
    && typeof candidate.slug === "string"
    && typeof candidate.title === "string"
    && typeof candidate.author === "string"
    && typeof candidate.category === "string";
}

function PublicBookCard({
  book,
  onIntent,
}: {
  book: Book;
  onIntent: (book: Book, intent: AccessIntent) => void;
}) {
  const canBorrow = book.format !== "digital" && book.availableCopies > 0;
  const canRead = Boolean(book.onlineAvailable || book.onlineContent || book.format === "digital");
  const primaryIntent: AccessIntent = canBorrow ? "borrow" : canRead ? "read" : "view";

  return (
    <article className="book-card public-book-card">
      <div className="book-card__visual">
        <button
          className="public-book-card__cover-button"
          type="button"
          onClick={() => onIntent(book, "view")}
          aria-label={`Open ${book.title}`}
        >
          <BookCover title={book.title} author={book.author} accent={book.accent} coverUrl={book.coverUrl} />
        </button>
        <button
          className="save-button"
          onClick={() => onIntent(book, "save")}
          type="button"
          aria-label={`Save ${book.title}`}
        >
          <LuHeart aria-hidden="true" />
        </button>
        {book.newArrival && <span className="book-card__new">New</span>}
      </div>
      <div className="book-card__content">
        <div className="book-card__meta">
          <span>{book.category}</span>
          <span>{book.borrowCount.toLocaleString()} borrows</span>
        </div>
        <button className="public-book-card__title" type="button" onClick={() => onIntent(book, "view")}>
          <h3>{book.title}</h3>
        </button>
        <p className="book-card__author">{book.author}</p>
        <div className="book-card__availability">
          <span className={cn(canBorrow ? "is-available" : canRead ? "is-digital" : "is-unavailable")} />
          {canBorrow
            ? `${book.availableCopies} of ${book.totalCopies} available`
            : canRead
              ? "Available to read online"
              : "Currently unavailable"}
        </div>
        <div className="book-card__actions">
          <button
            className="button button--small button--gold"
            type="button"
            onClick={() => onIntent(book, primaryIntent)}
          >
            {primaryIntent === "borrow" ? <LuShoppingBag aria-hidden="true" /> : <LuBookOpen aria-hidden="true" />}
            {primaryIntent === "borrow" ? "Borrow" : primaryIntent === "read" ? "Read online" : "View book"}
          </button>
          <button
            className="book-card__details"
            type="button"
            onClick={() => onIntent(book, "view")}
            aria-label={`View details for ${book.title}`}
          >
            <LuArrowRight aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  );
}

function AccessModal({ prompt, onClose }: { prompt: AccessPrompt; onClose: () => void }) {
  const signUpRef = useRef<HTMLAnchorElement>(null);
  const copy = intentCopy[prompt.intent];

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => signUpRef.current?.focus(), 80);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [onClose]);

  return (
    <div className="public-access-modal" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="access-modal-title" aria-describedby="access-modal-description">
        <button className="public-access-modal__close" type="button" onClick={onClose} aria-label="Close sign-in prompt"><LuX /></button>
        <span className="public-access-modal__icon" aria-hidden="true"><LuBookOpen /></span>
        <span className="public-access-modal__eyebrow">{copy.eyebrow}</span>
        <h2 id="access-modal-title">{copy.title}</h2>
        <p id="access-modal-description">{copy.body}</p>
        <div className="public-access-modal__book">
          <BookCover title={prompt.book.title} author={prompt.book.author} accent={prompt.book.accent} coverUrl={prompt.book.coverUrl} size="small" />
          <span><strong>{prompt.book.title}</strong><small>{prompt.book.author} · {prompt.book.category}</small></span>
        </div>
        <div className="public-access-modal__actions">
          <Link ref={signUpRef} href="/sign-up" className="button button--primary">Create student account <LuArrowRight /></Link>
          <Link href="/sign-in" className="button button--outline">I already have an account</Link>
        </div>
        <small className="public-access-modal__note">Your personal email receives the confirmation link. Your KNUST student email and student ID identify you in the library.</small>
      </section>
    </div>
  );
}

export function PublicHome({ initialPayload }: { initialPayload?: CataloguePayload }) {
  const router = useRouter();
  const initialBooks = Array.isArray(initialPayload?.books) ? initialPayload.books.filter(isBook) : [];
  const hasInitialPayload = initialBooks.length > 0;
  const [books, setBooks] = useState<Book[]>(initialBooks);
  const [catalogueCategories, setCatalogueCategories] = useState<string[]>(
    Array.isArray(initialPayload?.categories)
      ? initialPayload.categories.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [],
  );
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [category, setCategory] = useState("All books");
  const [format, setFormat] = useState("all");
  const [sort, setSort] = useState("popular");
  const [loading, setLoading] = useState(!hasInitialPayload);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState<CatalogueSource>(initialPayload?.source === "fallback" ? "fallback" : "live");
  const [updatedAt, setUpdatedAt] = useState(initialPayload?.updatedAt ?? "");
  const [authenticated, setAuthenticated] = useState(false);
  const [prompt, setPrompt] = useState<AccessPrompt | null>(null);

  const loadCatalogue = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const response = await fetch("/api/catalog", { cache: "no-store" });
      if (!response.ok) throw new Error("Catalogue request failed");
      const payload = await response.json() as CataloguePayload;
      const nextBooks = Array.isArray(payload.books) ? payload.books.filter(isBook) : [];
      setBooks(nextBooks);
      setCatalogueCategories(
        Array.isArray(payload.categories)
          ? payload.categories.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          : [],
      );
      setSource(payload.source === "fallback" ? "fallback" : "live");
      setUpdatedAt(payload.updatedAt || new Date().toISOString());
      setError("");
    } catch {
      setError("The live catalogue could not be reached. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = hasInitialPayload ? undefined : window.setTimeout(() => void loadCatalogue(), 0);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadCatalogue(true);
    }, 45_000);
    return () => {
      if (initialLoad !== undefined) window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, [hasInitialPayload, loadCatalogue]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setAuthenticated(Boolean(data.session)));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setAuthenticated(Boolean(session)));
    return () => listener.subscription.unsubscribe();
  }, []);

  const categories = useMemo(
    () => ["All books", ...Array.from(new Set([...catalogueCategories, ...books.map((book) => book.category)])).sort((a, b) => a.localeCompare(b))],
    [books, catalogueCategories],
  );

  const filteredBooks = useMemo(() => {
    const normalizedQuery = normalizeSearch(deferredQuery);
    const compactQuery = normalizedQuery.replace(/[^a-z0-9]/g, "");
    const results = books.filter((book) => {
      const fields = [book.title, book.author, book.isbn, book.category, book.description, book.shelfLocation ?? ""];
      const matchesText = !normalizedQuery
        || fields.some((value) => normalizeSearch(value).includes(normalizedQuery))
        || (compactQuery.length > 2 && fields.some((value) => normalizeSearch(value).replace(/[^a-z0-9]/g, "").includes(compactQuery)));
      const matchesCategory = category === "All books" || book.category === category;
      const matchesFormat = format === "all" || book.format === format || book.format === "both";
      return matchesText && matchesCategory && matchesFormat;
    });

    return [...results].sort((a, b) => {
      if (sort === "newest") return b.publishedYear - a.publishedYear;
      if (sort === "available") return b.availableCopies - a.availableCopies;
      if (sort === "title") return a.title.localeCompare(b.title);
      return b.borrowCount - a.borrowCount;
    });
  }, [books, category, deferredQuery, format, sort]);

  const featuredBook = books.find((book) => book.featured) ?? books[0];
  const totals = useMemo(() => ({
    titles: books.length,
    copies: books.reduce((sum, book) => sum + book.totalCopies, 0),
    available: books.reduce((sum, book) => sum + book.availableCopies, 0),
    digital: books.filter((book) => book.onlineAvailable || book.format === "digital" || book.format === "both").length,
  }), [books]);

  const requestAccess = useCallback((book: Book, intent: AccessIntent) => {
    if (!authenticated) {
      setPrompt({ book, intent });
      return;
    }
    if (intent === "read") router.push(`/read/${book.slug}`);
    else if (intent === "save") router.push("/saved");
    else router.push(`/book/${book.slug}`);
  }, [authenticated, router]);

  const submitSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    document.getElementById("public-catalogue")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="public-app">
      <header className="public-header">
        <div className="public-container public-header__inner">
          <Brand href="/" />
          <nav aria-label="Main navigation">
            <a href="#public-catalogue">Catalogue</a>
            <a href="#how-it-works">How it works</a>
            <a href="#library-help">Library help</a>
          </nav>
          <div className="public-header__actions">
            {authenticated ? (
              <Link className="button button--primary" href="/library">Open my library <LuArrowRight /></Link>
            ) : (
              <>
                <Link className="public-sign-in" href="/sign-in">Sign in</Link>
                <Link className="button button--primary" href="/sign-up">Create account</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="public-hero">
          <div className="public-container public-hero__grid">
            <div className="public-hero__copy">
              <span className="public-eyebrow"><i /> KNUST UNIVERSITY LIBRARY</span>
              <h1>Your next idea is already on the shelf.</h1>
              <p>Search the live KNUST collection, reserve a physical copy, or continue learning online from one simple library experience.</p>
              <form className="public-hero-search" onSubmit={submitSearch} role="search">
                <LuSearch aria-hidden="true" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search title, author, ISBN or category"
                  aria-label="Search the public book catalogue"
                />
                <button type="submit">Search collection <LuArrowRight /></button>
              </form>
              <div className="public-hero__trust">
                <span><i className="is-live" /> Live availability</span>
                <span>Physical & digital books</span>
                <span>1–7 day borrowing</span>
              </div>
            </div>

            <div className="public-hero__visual" aria-label="Featured library title">
              <span className="public-hero__halo" />
              {featuredBook ? (
                <>
                  <button type="button" onClick={() => requestAccess(featuredBook, "view")} aria-label={`Open featured book ${featuredBook.title}`}>
                    <BookCover title={featuredBook.title} author={featuredBook.author} accent={featuredBook.accent} coverUrl={featuredBook.coverUrl} size="large" />
                  </button>
                  <div className="public-feature-card">
                    <span>FEATURED TITLE</span>
                    <strong>{featuredBook.title}</strong>
                    <small>{featuredBook.author}</small>
                    <button type="button" onClick={() => requestAccess(featuredBook, featuredBook.onlineAvailable ? "read" : "borrow")}>
                      {featuredBook.onlineAvailable ? "Read this book" : "Borrow this book"} <LuArrowRight />
                    </button>
                  </div>
                </>
              ) : (
                <div className="public-hero__book-skeleton" aria-hidden="true" />
              )}
            </div>
          </div>
        </section>

        <section className="public-stats" aria-label="Live catalogue summary">
          <div className="public-container">
            <div><strong>{loading ? "—" : totals.titles.toLocaleString()}</strong><span>Published titles</span></div>
            <div><strong>{loading ? "—" : totals.copies.toLocaleString()}</strong><span>Tracked copies</span></div>
            <div><strong>{loading ? "—" : totals.available.toLocaleString()}</strong><span>Available now</span></div>
            <div><strong>{loading ? "—" : totals.digital.toLocaleString()}</strong><span>Online titles</span></div>
          </div>
        </section>

        <section className="public-catalogue public-container" id="public-catalogue">
          <div className="public-section-heading">
            <div><span className="section-kicker">EXPLORE THE COLLECTION</span><h2>Find your next book</h2><p>Availability and stock update automatically from the library system.</p></div>
            <div className={cn("public-live-state", source === "fallback" && "is-fallback")}>
              <i />
              <span><strong>{source === "live" ? "Live catalogue" : "Reconnecting"}</strong><small>{updatedAt ? `Updated ${formatCatalogueTime(updatedAt)}` : "Fetching now"}</small></span>
              <button type="button" onClick={() => void loadCatalogue(true)} disabled={refreshing} aria-label="Refresh catalogue"><LuRefreshCw className={refreshing ? "is-spinning" : ""} /></button>
            </div>
          </div>

          {source === "fallback" && <p className="public-data-notice">The live service is reconnecting. You can still explore the starter catalogue, but stock should be confirmed after signing in.</p>}
          {error && !books.length && <div className="public-data-error" role="alert"><span>{error}</span><button type="button" onClick={() => void loadCatalogue()}>Try again</button></div>}

          <div className="public-catalogue__toolbar">
            <label className="catalog-search">
              <LuSearch aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search books, authors, categories or ISBN" aria-label="Filter catalogue" />
              {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><LuX /></button>}
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
            {categories.map((item) => (
              <button key={item} type="button" className={category === item ? "is-active" : ""} onClick={() => setCategory(item)}>{item}</button>
            ))}
          </div>

          <div className="public-results-line">
            <span>{loading ? "Loading live books…" : `${filteredBooks.length} ${filteredBooks.length === 1 ? "title" : "titles"}`}</span>
            {(query || category !== "All books" || format !== "all") && (
              <button type="button" onClick={() => { setQuery(""); setCategory("All books"); setFormat("all"); }}>Clear all filters</button>
            )}
          </div>

          {loading ? (
            <div className="public-book-grid" aria-label="Loading books">{Array.from({ length: 8 }, (_, index) => <div className="book-card-skeleton" key={index} />)}</div>
          ) : filteredBooks.length ? (
            <div className="public-book-grid">{filteredBooks.map((book) => <PublicBookCard key={book.id} book={book} onIntent={requestAccess} />)}</div>
          ) : (
            <div className="empty-state"><LuSearch /><h3>No matching books</h3><p>Try a different title, author, ISBN, category, or format.</p><button className="button button--outline" type="button" onClick={() => { setQuery(""); setCategory("All books"); setFormat("all"); }}>Clear filters</button></div>
          )}
        </section>

        <section className="public-how" id="how-it-works">
          <div className="public-container">
            <div className="public-how__heading"><span className="section-kicker">BORROW WITH CONFIDENCE</span><h2>From discovery to collection in three steps.</h2></div>
            <div className="public-how__steps">
              <article><span>01</span><h3>Create your student account</h3><p>Register with your personal email, mandatory KNUST student email, full name, and student ID.</p></article>
              <article><span>02</span><h3>Build your borrow basket</h3><p>Search live stock and add available physical books, or open a published digital title online.</p></article>
              <article><span>03</span><h3>Request pickup or delivery</h3><p>Choose 1–7 days and free self pickup or GHS 5 on-campus delivery. Pickup starts at approval; delivery starts only after dispatch and your receipt confirmation.</p></article>
            </div>
          </div>
        </section>
      </main>

      <footer className="public-footer" id="library-help">
        <div className="public-container">
          <Brand href="/" light />
          <p>Discover, borrow, and read from the KNUST community collection.</p>
          <div><Link href="/sign-in">Student sign in</Link><Link href="/sign-up">Create account</Link><a href="mailto:library@knust.edu.gh">library@knust.edu.gh</a></div>
        </div>
      </footer>

      {prompt && <AccessModal prompt={prompt} onClose={() => setPrompt(null)} />}
    </div>
  );
}
