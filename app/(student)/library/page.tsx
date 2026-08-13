import { LibraryDashboard } from "@/components/student/library-dashboard";

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ query?: string | string[] }> }) {
  const params = await searchParams;
  const query = Array.isArray(params.query) ? params.query[0] : params.query;
  const dateLabel = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "Africa/Accra",
  }).format(new Date()).toUpperCase();
  return <LibraryDashboard key={query ?? "all-books"} initialQuery={query ?? ""} dateLabel={dateLabel} />;
}
