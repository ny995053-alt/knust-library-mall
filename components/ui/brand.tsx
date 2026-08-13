import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

type BrandProps = {
  href?: string;
  compact?: boolean;
  light?: boolean;
  className?: string;
};

export function Brand({ href = "/library", compact = false, light = false, className }: BrandProps) {
  return (
    <Link href={href} className={cn("brand", compact && "brand--compact", light && "brand--light", className)} aria-label="KNUST Library Mall home">
      <span className="brand__crest" aria-hidden="true">
        <Image src="/knustlogo.jpeg" alt="" width={736} height={1040} className="brand__crest-image" />
      </span>
      {!compact && (
        <span className="brand__copy">
          <strong>KNUST</strong>
          <span>Library Mall</span>
        </span>
      )}
    </Link>
  );
}
