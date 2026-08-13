import { cn } from "@/lib/utils";

type StatusBadgeProps = {
  status: string;
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const normalized = status.toLowerCase().replace(/\s+/g, "-");
  return <span className={cn("status-badge", "status-badge--" + normalized)}>{status.replace(/-/g, " ")}</span>;
}
