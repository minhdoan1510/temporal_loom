import { useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";

interface ProseProps {
  content: string;
}

export default function Prose({ content }: ProseProps) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const handleCopy = useCallback((code: string, idx: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }, []);

  if (!content) return null;

  // Split on fenced code blocks: captures [before, lang, code, between, lang, code, ...]
  const blocks = content.split(/```(\w*)\n?([\s\S]*?)```/g);
  const elements: React.ReactNode[] = [];
  let codeBlockIdx = 0;

  for (let i = 0; i < blocks.length; i++) {
    if (i % 3 === 0) {
      // Text block — parse block-level markdown
      const parsed = parseBlocks(blocks[i]);
      if (parsed.length > 0) {
        elements.push(<span key={i}>{parsed}</span>);
      }
    } else if (i % 3 === 1) {
      // Language identifier — skip (used by next block)
    } else if (i % 3 === 2) {
      // Code block content
      const lang = blocks[i - 1] || "";
      const code = blocks[i];
      const idx = codeBlockIdx++;
      const isCopied = copiedIdx === idx;

      elements.push(
        <div key={i} className="group relative my-3 min-w-0">
          {lang && (
            <span className="absolute left-3 top-2 select-none font-mono text-[11px] text-muted-foreground/60">
              {lang}
            </span>
          )}
          <button
            onClick={() => handleCopy(code, idx)}
            className="absolute right-2 top-2 rounded-md p-1.5 text-muted-foreground/60 opacity-0 transition-opacity hover:bg-white/5 hover:text-muted-foreground group-hover:opacity-100"
          >
            {isCopied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </button>
          <pre className="max-w-full overflow-x-auto rounded-lg border border-border/30 bg-[#0a0f1d] p-3 pt-8 text-[13px] leading-relaxed text-muted-foreground">
            <code>{code}</code>
          </pre>
        </div>
      );
    }
  }

  return <div className="min-w-0 space-y-1 break-words leading-relaxed">{elements}</div>;
}

// ─── Block-level parsing ──────────────────────────────────────────────

function parseBlocks(text: string): React.ReactNode[] {
  if (!text) return [];

  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Horizontal rule
    if (/^(\s*[-*_]\s*){3,}$/.test(line)) {
      nodes.push(<hr key={key++} className="my-4 border-border/40" />);
      i++;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      nodes.push(renderHeading(level, text, key++));
      i++;
      continue;
    }

    // Table: line with | and next line is separator
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      /^\|?\s*[-:]+[-| :]*$/.test(lines[i + 1])
    ) {
      const tableLines: string[] = [];
      let j = i;
      while (j < lines.length && lines[j].includes("|")) {
        tableLines.push(lines[j]);
        j++;
      }
      nodes.push(renderTable(tableLines, key++));
      i = j;
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const listLines: string[] = [];
      let j = i;
      while (j < lines.length && (/^\s*[-*+]\s+/.test(lines[j]) || /^\s{2,}/.test(lines[j]))) {
        listLines.push(lines[j]);
        j++;
      }
      nodes.push(renderUnorderedList(listLines, key++));
      i = j;
      continue;
    }

    // Ordered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const listLines: string[] = [];
      let j = i;
      while (
        j < lines.length &&
        (/^\s*\d+[.)]\s+/.test(lines[j]) || /^\s{2,}/.test(lines[j]))
      ) {
        listLines.push(lines[j]);
        j++;
      }
      nodes.push(renderOrderedList(listLines, key++));
      i = j;
      continue;
    }

    // Empty line — skip
    if (!line.trim()) {
      i++;
      continue;
    }

    // Paragraph: accumulate consecutive non-empty, non-special lines
    const paraLines: string[] = [];
    let j = i;
    while (
      j < lines.length &&
      lines[j].trim() &&
      !lines[j].match(/^#{1,6}\s+/) &&
      !/^\s*[-*+]\s+/.test(lines[j]) &&
      !/^\s*\d+[.)]\s+/.test(lines[j]) &&
      !/^(\s*[-*_]\s*){3,}$/.test(lines[j]) &&
      !(lines[j].includes("|") && j + 1 < lines.length && /^\|?\s*[-:]+[-| :]*$/.test(lines[j + 1]))
    ) {
      paraLines.push(lines[j]);
      j++;
    }
    if (paraLines.length > 0) {
      nodes.push(
        <p key={key++} className="my-1.5">
          {paraLines.map((l, li) => (
            <span key={li}>
              {li > 0 && <br />}
              {renderInline(l)}
            </span>
          ))}
        </p>
      );
    }
    i = j || i + 1;
  }

  return nodes;
}

// ─── Headings ─────────────────────────────────────────────────────────

function renderHeading(level: number, text: string, key: number): React.ReactNode {
  const styles: Record<number, string> = {
    1: "text-xl font-bold mt-5 mb-2 font-heading text-foreground",
    2: "text-lg font-bold mt-4 mb-2 font-heading text-foreground",
    3: "text-base font-semibold mt-3 mb-1.5 font-heading text-foreground",
    4: "text-sm font-semibold mt-3 mb-1 text-foreground",
    5: "text-sm font-medium mt-2 mb-1 text-foreground/90",
    6: "text-xs font-medium mt-2 mb-1 text-muted-foreground uppercase tracking-wide",
  };
  const className = styles[level];
  switch (level) {
    case 1: return <h1 key={key} className={className}>{renderInline(text)}</h1>;
    case 2: return <h2 key={key} className={className}>{renderInline(text)}</h2>;
    case 3: return <h3 key={key} className={className}>{renderInline(text)}</h3>;
    case 4: return <h4 key={key} className={className}>{renderInline(text)}</h4>;
    case 5: return <h5 key={key} className={className}>{renderInline(text)}</h5>;
    case 6: return <h6 key={key} className={className}>{renderInline(text)}</h6>;
    default: return <p key={key} className={className}>{renderInline(text)}</p>;
  }
}

// ─── Lists ────────────────────────────────────────────────────────────

function renderUnorderedList(lines: string[], key: number): React.ReactNode {
  const items = parseListItems(lines, /^\s*[-*+]\s+/);
  return (
    <ul key={key} className="my-2 list-disc space-y-1 pl-6 marker:text-muted-foreground/50">
      {items.map((item, i) => (
        <li key={i}>
          {renderInline(item.text)}
          {item.children.length > 0 && (
            <ul className="mt-1 list-disc space-y-1 pl-5 marker:text-muted-foreground/40">
              {item.children.map((child, ci) => (
                <li key={ci}>{renderInline(child)}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

function renderOrderedList(lines: string[], key: number): React.ReactNode {
  const items = parseListItems(lines, /^\s*\d+[.)]\s+/);
  return (
    <ol key={key} className="my-2 list-decimal space-y-1 pl-6 marker:text-muted-foreground/50">
      {items.map((item, i) => (
        <li key={i}>
          {renderInline(item.text)}
          {item.children.length > 0 && (
            <ol className="mt-1 list-decimal space-y-1 pl-5 marker:text-muted-foreground/40">
              {item.children.map((child, ci) => (
                <li key={ci}>{renderInline(child)}</li>
              ))}
            </ol>
          )}
        </li>
      ))}
    </ol>
  );
}

interface ListItem {
  text: string;
  children: string[];
}

function parseListItems(lines: string[], marker: RegExp): ListItem[] {
  const items: ListItem[] = [];
  let current: ListItem | null = null;

  for (const line of lines) {
    const isTopLevel = marker.test(line) && !/^\s{2,}/.test(line);
    if (isTopLevel) {
      if (current) items.push(current);
      current = { text: line.replace(marker, ""), children: [] };
    } else if (current) {
      // Nested or continuation line
      const nested = line.replace(/^\s+/, "").replace(/^[-*+]\s+/, "").replace(/^\d+[.)]\s+/, "");
      current.children.push(nested);
    }
  }
  if (current) items.push(current);
  return items;
}

// ─── Tables ───────────────────────────────────────────────────────────

function renderTable(lines: string[], key: number): React.ReactNode {
  const parseRow = (line: string) =>
    line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());

  if (lines.length < 2) return null;

  const headers = parseRow(lines[0]);
  // lines[1] is separator — skip
  const rows = lines.slice(2).map(parseRow);

  return (
    <div key={key} className="my-3 overflow-x-auto rounded-lg border border-border/30">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/40 bg-card/50">
            {headers.map((h, i) => (
              <th
                key={i}
                className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground"
              >
                {renderInline(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-border/20 last:border-0">
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 text-muted-foreground">
                  {renderInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Inline parsing ───────────────────────────────────────────────────

const URL_RE = /(https?:\/\/[^\s)<>]+)/g;

function linkifyText(text: string, keyPrefix: string): React.ReactNode {
  const parts = text.split(URL_RE);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    URL_RE.test(part) ? (
      <a
        key={`${keyPrefix}-${i}`}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2 hover:text-primary/80"
      >
        {part}
      </a>
    ) : (
      <span key={`${keyPrefix}-${i}`}>{part}</span>
    )
  );
}

function renderInline(text: string): React.ReactNode {
  // Split on inline patterns: bold, italic, strikethrough, inline code
  const parts = text.split(/(`[^`]+`|\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~)/g);
  return parts.map((part, i) => {
    // Inline code
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="break-all rounded-md bg-muted px-1.5 py-0.5 text-[13px] text-foreground font-mono border border-border/30"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    // Bold italic
    if (part.startsWith("***") && part.endsWith("***")) {
      return (
        <strong key={i} className="font-semibold italic text-foreground">
          {part.slice(3, -3)}
        </strong>
      );
    }
    // Bold
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    // Italic
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return (
        <em key={i} className="italic text-foreground/90">
          {part.slice(1, -1)}
        </em>
      );
    }
    // Strikethrough
    if (part.startsWith("~~") && part.endsWith("~~")) {
      return (
        <del key={i} className="text-muted-foreground line-through">
          {part.slice(2, -2)}
        </del>
      );
    }
    // Plain text with URL detection
    return <span key={i}>{linkifyText(part, `l${i}`)}</span>;
  });
}
