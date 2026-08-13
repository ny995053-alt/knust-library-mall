"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { LuArrowLeft, LuBookOpen, LuCheck, LuChevronLeft, LuChevronRight, LuMinus, LuMoon, LuPlus, LuSun, LuTriangleAlert } from "react-icons/lu";
import { useLibrary } from "@/components/student/library-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type ReaderChapter = {
  id: string;
  editionId: string;
  title: string;
  content: string;
  order: number;
};

export function ReaderPage({ slug }: { slug: string }) {
  const { books, isDemo, profile } = useLibrary();
  const book = books.find((item) => item.slug === slug);
  const [chapters, setChapters] = useState<ReaderChapter[]>([]);
  const [activeChapter, setActiveChapter] = useState(0);
  const [fontSize, setFontSize] = useState(19);
  const [theme, setTheme] = useState<"light" | "paper" | "dark">("paper");
  const [progress, setProgress] = useState(0);
  const [loadingContent, setLoadingContent] = useState(true);
  const [contentError, setContentError] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!book) return;
    const timer = window.setTimeout(() => {
      setContentError("");

      if (isDemo && book.onlineContent) {
        setChapters([{ id: "demo-chapter", editionId: "demo-edition", title: "Full text", content: book.onlineContent, order: 1 }]);
        setProgress(Number(window.localStorage.getItem("knust-reader-" + book.id) || 0));
        setLoadingContent(false);
        return;
      }

      if (!book.onlineAvailable) {
        setLoadingContent(false);
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      void supabase.from("published_book_chapters").select("id, edition_id, title, content_text, order_index").eq("book_id", book.id).order("order_index").then(async ({ data, error }) => {
        if (error || !data?.length) {
          setContentError(error ? "This online edition could not be loaded. Please try again." : "This online edition has no published text yet.");
          setLoadingContent(false);
          return;
        }

        const loaded = data.map((item) => ({ id: item.id, editionId: item.edition_id, title: item.title || "Untitled chapter", content: item.content_text, order: Number(item.order_index) }));
        setChapters(loaded);
        const saved = await supabase.from("reading_progress").select("chapter_id, progress_percent, last_position").eq("user_id", profile.id).eq("edition_id", loaded[0].editionId).maybeSingle();
        const savedData = saved.data;
        if (savedData) {
          const chapterIndex = loaded.findIndex((item) => item.id === savedData.chapter_id);
          setActiveChapter(Math.max(0, chapterIndex));
          setProgress(Number(savedData.progress_percent || 0));
        }
        setLoadingContent(false);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [book, isDemo, profile.id]);

  const chapter = chapters[activeChapter];
  const paragraphs = useMemo(() => (chapter?.content || "").split(/\n\s*\n/).filter(Boolean), [chapter?.content]);

  useEffect(() => {
    if (!book || !chapter) return;
    const onScroll = () => {
      const total = document.documentElement.scrollHeight - window.innerHeight;
      const withinChapter = total > 0 ? Math.min(1, Math.max(0, window.scrollY / total)) : 0;
      const next = Math.min(100, Math.round(((activeChapter + withinChapter) / Math.max(chapters.length, 1)) * 100));
      setProgress(next);
      window.localStorage.setItem("knust-reader-" + book.id, String(next));

      if (isDemo || !profile.id) {
        setSaveState("saved");
        return;
      }

      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      setSaveState("saving");
      saveTimer.current = window.setTimeout(() => {
        const supabase = getSupabaseBrowserClient();
        if (!supabase) return;
        void supabase.from("reading_progress").upsert({
          user_id: profile.id,
          edition_id: chapter.editionId,
          chapter_id: chapter.id,
          progress_percent: next,
          last_position: { chapter_order: chapter.order, scroll_percent: Math.round(withinChapter * 100) },
          last_read_at: new Date().toISOString(),
        }, { onConflict: "user_id,edition_id" }).then(({ error }) => setSaveState(error ? "error" : "saved"));
      }, 700);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [activeChapter, book, chapter, chapters.length, isDemo, profile.id]);

  const changeChapter = (next: number) => {
    setActiveChapter(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!book) return <div className="empty-state page-empty"><LuBookOpen /><h1>Book not found</h1><Link href="/library" className="button button--primary">Return to library</Link></div>;
  if (!book.onlineAvailable && !book.onlineContent) return <div className="empty-state page-empty"><LuBookOpen /><h1>Online edition unavailable</h1><p>This title does not have published online text yet.</p><Link href={"/book/" + book.slug} className="button button--primary">View book details</Link></div>;
  if (contentError) return <div className="empty-state page-empty"><LuTriangleAlert /><h1>Unable to open this edition</h1><p>{contentError}</p><Link href={"/book/" + book.slug} className="button button--primary">Back to book</Link></div>;

  return (
    <div className={cn("reader", "reader--" + theme)}>
      <div className="reader-progress"><span style={{ width: progress + "%" }} /></div>
      <header className="reader-toolbar">
        <Link href={"/book/" + book.slug} className="reader-back"><LuArrowLeft /><span>Exit reader</span></Link>
        <div className="reader-title"><span>{book.title}</span><small>{loadingContent ? "Loading secure edition…" : chapter?.title || "Online edition"}</small></div>
        <div className="reader-controls">
          <div><button onClick={() => setFontSize((value) => Math.max(15, value - 1))} aria-label="Decrease font size"><LuMinus /></button><span>Aa</span><button onClick={() => setFontSize((value) => Math.min(26, value + 1))} aria-label="Increase font size"><LuPlus /></button></div>
          <div><button className={theme === "light" ? "is-active" : ""} onClick={() => setTheme("light")} aria-label="Light theme"><LuSun /></button><button className={theme === "paper" ? "is-active" : ""} onClick={() => setTheme("paper")} aria-label="Paper theme">A</button><button className={theme === "dark" ? "is-active" : ""} onClick={() => setTheme("dark")} aria-label="Dark theme"><LuMoon /></button></div>
        </div>
      </header>
      <main className="reader-sheet" style={{ fontSize }}>
        <div className="reader-sheet__heading"><span>{book.category.toUpperCase()}</span><h1>{book.title}</h1><p>{book.author}</p><i /></div>
        {loadingContent ? <div className="reader-loading"><span className="button-spinner" /> Preparing this online edition…</div> : <><h2>{chapter?.title}</h2>{paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</>}
        {!loadingContent && chapter && <div className="reader-chapter-nav">
          <button className="button button--outline" disabled={activeChapter === 0} onClick={() => changeChapter(activeChapter - 1)}><LuChevronLeft /> Previous</button>
          <span>Chapter {activeChapter + 1} of {chapters.length}</span>
          <button className="button button--primary" disabled={activeChapter === chapters.length - 1} onClick={() => changeChapter(activeChapter + 1)}>Next <LuChevronRight /></button>
        </div>}
        <div className="reader-end"><span><LuCheck /></span><h3>{activeChapter === chapters.length - 1 ? "You reached the end of this edition" : "You reached the end of this chapter"}</h3><p>{saveState === "error" ? "Progress could not be saved. Keep this page open and try scrolling again." : saveState === "saving" ? "Saving your reading progress…" : "Your reading progress is saved securely."}</p><Link href="/library">Return to the library</Link></div>
      </main>
    </div>
  );
}
