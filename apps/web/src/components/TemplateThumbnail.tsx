import { useEffect, useState } from "react";

// Cache object URLs (not raw SVG strings) — data URIs with non-ASCII text
// (Korean) are unreliable across browsers, so we convert to a Blob once and
// reuse the resulting blob: URL for the lifetime of the page.
const urlCache = new Map<string, string>();

interface TemplateThumbnailProps {
  id: string;
  render: () => Promise<string>;
  className?: string;
}

export function TemplateThumbnail({ id, render, className }: TemplateThumbnailProps) {
  const [url, setUrl] = useState<string | null>(urlCache.get(id) ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (urlCache.has(id)) return;

    let cancelled = false;
    render()
      .then((svg) => {
        if (cancelled) return;
        const blob = new Blob([svg], { type: "image/svg+xml" });
        const objectUrl = URL.createObjectURL(blob);
        urlCache.set(id, objectUrl);
        setUrl(objectUrl);
      })
      .catch((err) => {
        console.error(`Failed to render template thumbnail "${id}"`, err);
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [id, render]);

  if (failed) {
    return (
      <div className={`flex items-center justify-center bg-muted text-[10px] text-muted-foreground ${className ?? ""}`}>
        렌더링 실패
      </div>
    );
  }

  if (!url) {
    return (
      <div className={`flex items-center justify-center bg-muted text-[10px] text-muted-foreground ${className ?? ""}`}>
        렌더링 중…
      </div>
    );
  }

  return (
    <img
      src={url}
      alt=""
      className={`object-cover object-top ${className ?? ""}`}
    />
  );
}
