"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useShape } from "@/lib/shape-context";

type PdfjsModule = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfjsModule> | null = null;

async function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((mod) => {
      if (!mod.GlobalWorkerOptions.workerSrc) {
        mod.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${mod.version}/build/pdf.worker.min.mjs`;
      }
      return mod;
    });
  }
  return pdfjsPromise;
}

async function renderPdfFirstPage(file: File, targetWidth: number): Promise<string> {
  const pdfjs = await loadPdfjs();
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const page = await pdf.getPage(1);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = (targetWidth * 2) / baseViewport.width; // 2× for retina
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvas, viewport }).promise;
  return canvas.toDataURL("image/png");
}

interface FileThumbnailProps {
  file: File;
  size: number;
  className?: string;
}

function FileThumbnail({ file, size, className }: FileThumbnailProps) {
  const shape = useShape();
  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf";

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!isImage) return;
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [isImage, file]);

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!isPdf) return;
    let cancelled = false;
    renderPdfFirstPage(file, size)
      .then((url) => {
        if (!cancelled) setPdfUrl(url);
      })
      .catch(() => {
        /* fall through to spinner */
      });
    return () => {
      cancelled = true;
    };
  }, [file, isPdf, size]);

  const previewUrl = imageUrl ?? pdfUrl;

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden bg-accent border border-border",
        shape.bg,
        className
      )}
      style={{ width: size, height: size }}
    >
      {previewUrl ? (
        <img
          src={previewUrl}
          alt={file.name}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="w-6 h-6 rounded-full border-2 border-border border-t-muted-foreground animate-spin"
            aria-label="Loading preview"
            role="status"
          />
        </div>
      )}
    </div>
  );
}

export { FileThumbnail, loadPdfjs, renderPdfFirstPage };
export type { FileThumbnailProps };
