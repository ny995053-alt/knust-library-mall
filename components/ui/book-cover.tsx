import { cn } from "@/lib/utils";

type BookCoverProps = {
  title: string;
  author: string;
  accent: string;
  coverUrl?: string | null;
  size?: "small" | "medium" | "large";
  className?: string;
};

export function BookCover({ title, author, accent, coverUrl, size = "medium", className }: BookCoverProps) {
  return (
    <div
      className={cn("book-cover", "book-cover--" + size, coverUrl && "book-cover--image", className)}
      style={{
        "--cover-accent": accent,
        ...(coverUrl ? { backgroundImage: "linear-gradient(180deg, rgba(11,24,73,.02), rgba(11,24,73,.25)), url(\"" + coverUrl + "\")" } : {}),
      } as React.CSSProperties}
      role="img"
      aria-label={"Cover of " + title}
    >
      {!coverUrl && (
        <>
          <span className="book-cover__eyebrow">KNUST LIBRARY</span>
          <span className="book-cover__mark" aria-hidden="true">K</span>
          <strong>{title}</strong>
          <small>{author}</small>
        </>
      )}
    </div>
  );
}
