"use client";

import { useState } from "react";
import { cn, initials, safeHref } from "@/lib/format";

interface AvatarPhotoProps {
  name: string;
  url?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = {
  sm: "size-10 text-sm",
  md: "size-12 text-base",
  lg: "size-16 text-xl",
};

/** Foto do avatar; se não houver (ou o link quebrar), mostra as iniciais. */
export function AvatarPhoto({ name, url, size = "md", className }: AvatarPhotoProps) {
  const src = safeHref(url);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = src && failedSrc !== src;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-soft font-semibold text-primary-soft-fg",
        SIZES[size],
        className,
      )}
      aria-hidden
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- foto vem de um link externo qualquer, informado pelo usuário
        <img
          src={src}
          alt=""
          className="size-full object-cover"
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}
