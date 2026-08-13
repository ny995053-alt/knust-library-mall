"use client";

import Image from "next/image";
import { FormEvent, useEffect, useRef, useState } from "react";
import { LuBookOpen, LuImagePlus, LuLibrary, LuUpload, LuX } from "react-icons/lu";
import type { Book, BookFormat } from "@/lib/types";
import { cn } from "@/lib/utils";

export type BookFormValues = {
  title: string;
  author: string;
  isbn: string;
  category: string;
  description: string;
  format: BookFormat;
  stockQuantity: number;
  shelfLocation: string;
  pages: number;
  publishedYear: number;
  language: string;
  onlineText: string;
  coverFile: File | null;
};

type BookFormModalProps = {
  open: boolean;
  book?: Book | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (values: BookFormValues) => Promise<void>;
};

const emptyForm: BookFormValues = {
  title: "",
  author: "",
  isbn: "",
  category: "",
  description: "",
  format: "physical",
  stockQuantity: 1,
  shelfLocation: "Main Stacks",
  pages: 0,
  publishedYear: new Date().getFullYear(),
  language: "English",
  onlineText: "",
  coverFile: null,
};

const previewableCoverTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/avif"]);

function formatFileSize(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export function BookFormModal({ open, book, saving, onClose, onSubmit }: BookFormModalProps) {
  const [values, setValues] = useState<BookFormValues>(() => book ? {
    title: book.title,
    author: book.author,
    isbn: book.isbn,
    category: book.category,
    description: book.description,
    format: book.format,
    stockQuantity: book.totalCopies,
    shelfLocation: book.shelfLocation ?? "",
    pages: book.pages,
    publishedYear: book.publishedYear,
    language: book.language,
    onlineText: book.onlineContent ?? "",
    coverFile: null,
  } : emptyForm);
  const [step, setStep] = useState<1 | 2>(1);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const coverPreviewRef = useRef<string | null>(null);

  useEffect(() => () => {
    if (coverPreviewRef.current) URL.revokeObjectURL(coverPreviewRef.current);
    coverPreviewRef.current = null;
  }, []);

  if (!open) return null;

  const update = <Key extends keyof BookFormValues>(key: Key, value: BookFormValues[Key]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const selectCoverFile = (file: File | null) => {
    if (coverPreviewRef.current) URL.revokeObjectURL(coverPreviewRef.current);
    const nextPreviewUrl = file && previewableCoverTypes.has(file.type) ? URL.createObjectURL(file) : null;
    coverPreviewRef.current = nextPreviewUrl;
    setCoverPreviewUrl(nextPreviewUrl);
    update("coverFile", file);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step === 1) {
      setStep(2);
      return;
    }
    await onSubmit(values);
  };

  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="book-form-title">
      <button className="modal-scrim" onClick={onClose} aria-label="Close add book form" />
      <form className="book-form-drawer" onSubmit={submit}>
        <header className="book-form-drawer__header">
          <div><span className="section-kicker">CATALOGUE MANAGEMENT</span><h2 id="book-form-title">{book ? "Edit book" : "Add a new book"}</h2><p>{book ? "Update this title and its reading options." : "Create a complete catalogue record in two quick steps."}</p></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close"><LuX /></button>
        </header>
        <div className="form-stepper"><span className="is-active"><b>1</b>Book information</span><i /><span className={step === 2 ? "is-active" : ""}><b>2</b>Stock & content</span></div>

        <div className="book-form-drawer__body">
          {step === 1 ? (
            <>
              <div className={cn("cover-upload", (coverPreviewUrl || book?.coverUrl) && "cover-upload--has-preview")}>
                <span className="cover-upload__preview">
                  {coverPreviewUrl || book?.coverUrl ? <Image src={coverPreviewUrl || book?.coverUrl || ""} width={55} height={62} unoptimized alt={values.coverFile ? "Selected book cover preview" : "Current book cover"} /> : <LuImagePlus />}
                </span>
                <p>
                  <strong>{values.coverFile?.name ?? (book?.coverUrl ? "Current book cover" : "Upload book cover")}</strong>
                  <small>{values.coverFile ? formatFileSize(values.coverFile.size) + " • " + values.coverFile.type.replace("image/", "").toUpperCase() : book?.coverUrl ? "Choose a new image to replace this cover" : "PNG, JPG, WEBP or AVIF • Max 5 MB"}</small>
                </p>
                <div className="cover-upload__actions">
                  <label className="cover-upload__choose">
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={(event) => { selectCoverFile(event.target.files?.[0] ?? null); event.target.value = ""; }} />
                    <LuUpload /><span>{values.coverFile || book?.coverUrl ? "Replace" : "Choose file"}</span>
                  </label>
                  {values.coverFile && <button type="button" className="cover-upload__remove" onClick={() => selectCoverFile(null)} aria-label={"Remove selected cover " + values.coverFile.name}><LuX /><span>Remove</span></button>}
                </div>
              </div>
              <div className="admin-form-grid">
                <label className="admin-field admin-field--wide"><span>Book title *</span><input value={values.title} onChange={(event) => update("title", event.target.value)} placeholder="Enter the full title" required /></label>
                <label className="admin-field"><span>Author *</span><input value={values.author} onChange={(event) => update("author", event.target.value)} placeholder="Author name" required /></label>
                <label className="admin-field"><span>ISBN</span><input value={values.isbn} onChange={(event) => update("isbn", event.target.value)} placeholder="978-…" /></label>
                <label className="admin-field"><span>Category *</span><input value={values.category} onChange={(event) => update("category", event.target.value)} placeholder="e.g. Engineering" required /></label>
                <label className="admin-field"><span>Language</span><input value={values.language} onChange={(event) => update("language", event.target.value)} /></label>
                <label className="admin-field"><span>Publication year</span><input type="number" min="1000" max="2100" value={values.publishedYear} onChange={(event) => update("publishedYear", Number(event.target.value))} /></label>
                <label className="admin-field"><span>Number of pages</span><input type="number" min="0" value={values.pages} onChange={(event) => update("pages", Number(event.target.value))} /></label>
                <label className="admin-field admin-field--wide"><span>Description *</span><textarea value={values.description} onChange={(event) => update("description", event.target.value)} placeholder="Write a concise description students will see…" rows={5} required /></label>
              </div>
            </>
          ) : (
            <>
              <div className="format-selector" role="radiogroup" aria-label="Book format">
                {[
                  { value: "physical", label: "Physical", description: "A copy students collect", icon: LuLibrary },
                  { value: "digital", label: "Digital", description: "Read fully online", icon: LuBookOpen },
                  { value: "both", label: "Both formats", description: "Borrow or read online", icon: LuBookOpen },
                ].map((option) => {
                  const Icon = option.icon;
                  return <button type="button" key={option.value} role="radio" aria-checked={values.format === option.value} className={cn(values.format === option.value && "is-selected")} onClick={() => update("format", option.value as BookFormat)}><Icon /><span><strong>{option.label}</strong><small>{option.description}</small></span></button>;
                })}
              </div>

              {values.format !== "digital" && (
                <div className="admin-form-grid stock-fields">
                  <label className="admin-field"><span>Stock quantity *</span><input type="number" min="1" max="500" value={values.stockQuantity} onChange={(event) => update("stockQuantity", Number(event.target.value))} required /></label>
                  <label className="admin-field"><span>Shelf location</span><input value={values.shelfLocation} onChange={(event) => update("shelfLocation", event.target.value)} placeholder="e.g. Main Stacks A-14" /></label>
                  <div className="stock-explanation admin-field--wide"><LuLibrary /><p><strong>Copy-level inventory</strong><span>Each quantity becomes a uniquely tracked library copy. Loans and returns will update its status automatically.</span></p></div>
                </div>
              )}

              {values.format !== "physical" && (
                <label className="admin-field digital-editor"><span>Online book text *</span><textarea value={values.onlineText} onChange={(event) => update("onlineText", event.target.value)} placeholder="Type or paste the book text here. Separate paragraphs with a blank line…" rows={15} required /><small>{values.onlineText.trim() ? values.onlineText.trim().split(/\s+/).length.toLocaleString() : 0} words • Stored as safe plain text</small></label>
              )}
            </>
          )}
        </div>

        <footer className="book-form-drawer__footer">
          <button type="button" className="button button--outline" onClick={step === 2 ? () => setStep(1) : onClose}>{step === 2 ? "Back" : "Cancel"}</button>
          <button type="submit" className="button button--primary" disabled={saving}>{saving ? "Saving book…" : step === 1 ? "Continue" : book ? "Save changes" : "Publish book"}</button>
        </footer>
      </form>
    </div>
  );
}
