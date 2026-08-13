"use client";

import Link from "next/link";
import { LuArrowRight, LuHeart } from "react-icons/lu";
import { BookCard } from "@/components/student/book-card";
import { useLibrary } from "@/components/student/library-provider";

export function SavedPage() {
  const { books, favorites } = useLibrary();
  const savedBooks = books.filter((book) => favorites.includes(book.id));
  return (
    <div className="saved-page page-stack">
      <div className="page-heading-row"><div><span className="page-kicker">YOUR READING LIST</span><h1>Saved books</h1><p>Keep interesting titles close until you are ready to read or borrow.</p></div><span className="page-count">{savedBooks.length} saved</span></div>
      {savedBooks.length ? <div className="book-grid saved-book-grid">{savedBooks.map((book) => <BookCard key={book.id} book={book} />)}</div> : <div className="empty-page-card"><span><LuHeart /></span><h2>Save books for later</h2><p>Tap the heart on any title to build a personal reading list.</p><Link href="/library#catalog" className="button button--primary">Browse books <LuArrowRight /></Link></div>}
    </div>
  );
}
