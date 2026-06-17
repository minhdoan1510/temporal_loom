import { useMemo, useRef, useState } from "react";

const MIN_HEIGHT = 180;
const MAX_HEIGHT = 900;

const fallbackTheme = {
  card: "#ffffff",
  foreground: "#1d1d1f",
  muted: "#f5f5f7",
  mutedForeground: "#707070",
  border: "#e2e2e5",
  primary: "#0071e3",
  fontSans: '"SF Pro Text", Inter, ui-sans-serif, system-ui, sans-serif',
  fontHeading: '"SF Pro Display", Inter, ui-sans-serif, system-ui, sans-serif',
  fontMono: '"SFMono-Regular", ui-monospace, monospace',
} as const;

type HtmlRendererTheme = Record<keyof typeof fallbackTheme, string>;

const allowedTags = new Set([
  "a",
  "article",
  "aside",
  "b",
  "br",
  "code",
  "dd",
  "div",
  "dl",
  "dt",
  "em",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "i",
  "li",
  "ol",
  "p",
  "pre",
  "section",
  "small",
  "span",
  "strong",
  "style",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
]);

const forbiddenTags = new Set([
  "base",
  "button",
  "embed",
  "form",
  "iframe",
  "img",
  "input",
  "link",
  "meta",
  "object",
  "script",
  "textarea",
]);

const allowedAttributes = new Set([
  "class",
  "id",
  "role",
  "style",
  "title",
]);

export default function HtmlRenderer({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(360);

  const srcDoc = useMemo(() => buildSrcDoc(html, readHtmlRendererTheme()), [html]);

  const handleLoad = () => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;

    const nextHeight = Math.ceil(
      Math.max(
        doc.body?.scrollHeight ?? 0,
        doc.documentElement?.scrollHeight ?? 0,
        MIN_HEIGHT
      )
    );
    setHeight(Math.min(Math.max(nextHeight, MIN_HEIGHT), MAX_HEIGHT));
  };

  return (
    <div className="my-3 w-full overflow-hidden rounded-2xl border border-border/60 bg-card/40 shadow-sm">
      <iframe
        ref={iframeRef}
        title="Rendered assistant HTML"
        srcDoc={srcDoc}
        sandbox="allow-same-origin allow-popups"
        referrerPolicy="no-referrer"
        loading="lazy"
        onLoad={handleLoad}
        className="block w-full border-0 bg-transparent"
        style={{ height }}
      />
    </div>
  );
}

function buildSrcDoc(html: string, theme: HtmlRendererTheme) {
  const sanitized = sanitizeHtmlFragment(html);
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root {
      --html-card: ${theme.card};
      --html-foreground: ${theme.foreground};
      --html-muted: ${theme.muted};
      --html-muted-foreground: ${theme.mutedForeground};
      --html-border: ${theme.border};
      --html-primary: ${theme.primary};
      --html-font-sans: ${theme.fontSans};
      --html-font-heading: ${theme.fontHeading};
      --html-font-mono: ${theme.fontMono};
    }

    html,
    body { margin: 0; padding: 0; background: transparent; }
    * { box-sizing: border-box; max-width: 100%; }
    body {
      min-width: 0;
      padding: 16px;
      color: var(--html-foreground);
      font-family: var(--html-font-sans);
      font-size: 14px;
      line-height: 1.6;
      letter-spacing: 0;
      overflow-wrap: anywhere;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    :where(h1, h2, h3, h4, h5, h6) { margin: 0 0 10px; color: var(--html-foreground); font-family: var(--html-font-heading); font-weight: 700; line-height: 1.2; letter-spacing: 0; }
    h1 { font-size: 22px; }
    h2 { font-size: 19px; }
    h3 { font-size: 17px; }
    :where(h4, h5, h6) { font-size: 14px; }

    :where(p, ul, ol, dl, table, pre) { margin: 0 0 12px; }
    :where(:last-child) { margin-bottom: 0; }
    :where(strong, b) { font-weight: 650; }
    :where(small) { color: var(--html-muted-foreground); font-size: 12px; }
    :where(a) { color: var(--html-primary); text-decoration: underline; text-underline-offset: 2px; }
    :where(hr) { margin: 14px 0; border: 0; border-top: 1px solid var(--html-border); }
    :where(ul, ol) { padding-left: 22px; }
    :where(li) { margin: 2px 0; }

    :where(code) { border: 1px solid var(--html-border); border-radius: 6px; background: var(--html-muted); padding: 1px 5px; color: var(--html-foreground); font-family: var(--html-font-mono); font-size: 0.92em; }
    :where(pre) { overflow-x: auto; border: 1px solid var(--html-border); border-radius: 10px; background: #0a0f1d; padding: 12px; color: #e5e7eb; font-family: var(--html-font-mono); font-size: 13px; line-height: 1.55; }
    :where(pre code) { border: 0; background: transparent; padding: 0; color: inherit; font-size: inherit; }

    :where(table) { width: 100%; border: 1px solid var(--html-border); border-collapse: separate; border-radius: 10px; border-spacing: 0; font-size: 13px; }
    :where(th, td) { border-bottom: 1px solid var(--html-border); padding: 8px 10px; text-align: left; vertical-align: top; }
    :where(th) { background: var(--html-muted); color: var(--html-muted-foreground); font-size: 12px; font-weight: 650; }
    :where(tr:last-child td) { border-bottom: 0; }
    :where(dl) { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 6px 12px; }
    :where(dt) { color: var(--html-muted-foreground); font-weight: 650; }
    :where(dd) { margin: 0; }
  </style>
</head>
<body>${sanitized}</body>
</html>`;
}

function readHtmlRendererTheme(): HtmlRendererTheme {
  if (typeof window === "undefined") return fallbackTheme;

  const styles = window.getComputedStyle(document.documentElement);
  return {
    card: cssVariable(styles, "--card", fallbackTheme.card),
    foreground: cssVariable(styles, "--foreground", fallbackTheme.foreground),
    muted: cssVariable(styles, "--muted", fallbackTheme.muted),
    mutedForeground: cssVariable(styles, "--muted-foreground", fallbackTheme.mutedForeground),
    border: cssVariable(styles, "--border", fallbackTheme.border),
    primary: cssVariable(styles, "--primary", fallbackTheme.primary),
    fontSans: cssVariable(styles, "--font-sans", fallbackTheme.fontSans),
    fontHeading: cssVariable(styles, "--font-heading", fallbackTheme.fontHeading),
    fontMono: cssVariable(styles, "--font-mono", fallbackTheme.fontMono),
  };
}

function cssVariable(styles: CSSStyleDeclaration, name: string, fallback: string) {
  return styles.getPropertyValue(name).trim() || fallback;
}

function sanitizeHtmlFragment(input: string) {
  const template = document.createElement("template");
  template.innerHTML = input;
  sanitizeChildren(template.content);
  return template.innerHTML;
}

function sanitizeChildren(parent: ParentNode) {
  Array.from(parent.childNodes).forEach((node) => {
    if (node.nodeType === Node.COMMENT_NODE) {
      node.parentNode?.removeChild(node);
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (forbiddenTags.has(tag)) {
      el.remove();
      return;
    }

    if (!allowedTags.has(tag)) {
      unwrapElement(el);
      return;
    }

    sanitizeAttributes(el, tag);
    if (tag === "style") {
      el.textContent = sanitizeCss(el.textContent ?? "");
    }
    sanitizeChildren(el);
  });
}

function unwrapElement(el: HTMLElement) {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) {
    parent.insertBefore(el.firstChild, el);
  }
  parent.removeChild(el);
}

function sanitizeAttributes(el: HTMLElement, tag: string) {
  Array.from(el.attributes).forEach((attr) => {
    const name = attr.name.toLowerCase();
    const value = attr.value;

    if (name.startsWith("on") || name === "srcdoc") {
      el.removeAttribute(attr.name);
      return;
    }

    if (name.startsWith("aria-") || name.startsWith("data-")) {
      return;
    }

    if (tag === "a" && name === "href") {
      if (isSafeHref(value)) return;
      el.removeAttribute(attr.name);
      return;
    }

    if (!allowedAttributes.has(name)) {
      el.removeAttribute(attr.name);
      return;
    }

    if (name === "style") {
      el.setAttribute(attr.name, sanitizeCss(value));
    }
  });

  if (tag === "a") {
    el.setAttribute("target", "_blank");
    el.setAttribute("rel", "noopener noreferrer");
  }
}

function isSafeHref(value: string) {
  const trimmed = value.trim().toLowerCase();
  return (
    trimmed.startsWith("https://") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("/")
  );
}

function sanitizeCss(css: string) {
  return css
    .replace(/@import[^;]+;?/gi, "")
    .replace(/url\s*\([^)]*\)/gi, "none")
    .replace(/expression\s*\([^)]*\)/gi, "");
}
