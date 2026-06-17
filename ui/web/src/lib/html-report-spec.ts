import type { ReportSpec } from "@/lib/report-spec";

type LoanStatusReport = {
  title: string;
  fields: Record<string, string>;
  timeline: Array<{ time: string; title: string; status?: string }>;
  summary: string;
};

const dateTimePattern = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\s+UTC)?(?:\s+\([^)]+\))?$/;

export function htmlToReportSpec(html: string): ReportSpec {
  return loanStatusHtmlToReportSpec(html) ?? genericHtmlToReportSpec(html);
}

function loanStatusHtmlToReportSpec(html: string): ReportSpec | null {
  const report = parseLoanStatusReport(html);
  if (!report) return null;

  const status = report.fields.Status ?? "";
  const statusName = status.match(/\(([^)]+)\)/)?.[1] ?? status;
  const partner = report.fields.Partner ?? "";
  const score = report.fields["Score/ZLP Score"] ?? "";
  const { amount, term } = splitAmountTerm(report.fields["Amount/Term"]);
  const finalAmount = amount || report.fields.Amount || "";
  const finalTerm = term || report.fields.Term || "";
  const summaryTone = /error|failed|rejected/i.test(report.summary)
    ? "error"
    : /waiting|query|pending/i.test(report.summary + status)
      ? "warning"
      : "success";

  return {
    root: "root",
    elements: {
      root: {
        type: "LoanStatusCard",
        props: {
          title: "Chi tiết Hồ sơ Vay",
          description: report.summary || report.title,
          statusLabel: statusName ? `IN PROGRESS (Chờ giải ngân: ${statusName})` : status,
          statusTone: summaryTone,
          partner,
          amount: finalAmount,
          term: finalTerm,
          loanId: report.fields["Loan ID"] ?? "",
          zalopayId: report.fields["Zalopay ID"] ?? "",
          contractId: report.fields["Contract ID"] ?? "",
          score,
          steps: timelineItems(report.timeline, statusName, report.summary, finalAmount),
        },
        children: [],
      },
    },
  };
}

function genericHtmlToReportSpec(html: string): ReportSpec {
  const elements: ReportSpec["elements"] = {};
  const children: string[] = [];
  let nextId = 0;

  const addElement = (type: string, props: Record<string, unknown>) => {
    const id = `node_${++nextId}`;
    elements[id] = { type, props, children: [] };
    children.push(id);
  };

  const source = stripUnsafeBlocks(html);
  const blockPattern = /<(h[1-6]|p|li|blockquote|pre|table)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;

  while ((match = blockPattern.exec(source)) != null) {
    const tag = match[1].toLowerCase();
    const body = match[2];

    if (tag.startsWith("h")) {
      const text = cleanInlineHtml(body);
      if (text) addElement("Heading", { level: tag.slice(1), text });
      continue;
    }

    if (tag === "pre") {
      const code = cleanCodeHtml(body);
      if (code) addElement("CodeBlock", { code });
      continue;
    }

    if (tag === "table") {
      const table = parseHtmlTable(body);
      if (table.rows.length > 0) addElement("Table", table);
      continue;
    }

    if (tag === "blockquote") {
      const content = cleanInlineHtml(body);
      if (content) addElement("Callout", { tone: "info", content });
      continue;
    }

    const text = cleanInlineHtml(body);
    if (text) addElement("Text", { content: tag === "li" ? `• ${text}` : text });
  }

  if (children.length === 0) {
    for (const line of htmlToTextLines(source)) {
      addElement("Text", { content: line });
    }
  }

  if (children.length === 0) {
    addElement("Text", { content: "No content" });
  }

  elements.root = {
    type: "Stack",
    props: { gap: "md" },
    children,
  };

  return { root: "root", elements };
}

function parseLoanStatusReport(html: string): LoanStatusReport | null {
  const lines = htmlToTextLines(html);
  if (lines.length === 0) return null;

  const fields: Record<string, string> = {};
  const timeline: Array<{ time: string; title: string; status?: string }> = [];
  let title = "";
  let summary = "";

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (!title && !line.includes(":") && /loan|vay|hồ sơ/i.test(line)) {
      title = line;
      continue;
    }

    const inlineStatus = line.match(/^Status\s+(\d+)\s*[-:]\s*(.+)$/i);
    if (inlineStatus) {
      fields.Status = `${inlineStatus[1]} (${inlineStatus[2].trim()})`;
      continue;
    }

    if (isCheckLine(line)) {
      const stepTitle = lines[index + 1];
      const stepTime = lines[index + 2];
      if (stepTitle) {
        timeline.push({
          title: stepTitle,
          time: stepTime && !isCheckLine(stepTime) ? stepTime : "",
          status: "done",
        });
        index += stepTime && !isCheckLine(stepTime) ? 2 : 1;
      }
      continue;
    }

    if (/^\.{3,}$/.test(line)) continue;

    if (dateTimePattern.test(line)) {
      const nextLine = lines[index + 1];
      if (nextLine && !dateTimePattern.test(nextLine)) {
        timeline.push({ time: line, title: nextLine, status: "done" });
        index += 1;
      }
      continue;
    }

    const field = parseFieldLine(line);
    if (field) {
      const label = canonicalFieldLabel(field.label);
      if (label === "Summary") {
        summary = field.value;
      } else if (label === "Status" && field.value.length > 60) {
        summary = field.value;
      } else if (label) {
        fields[label] = field.value;
      }
      continue;
    }

    if (/đang chờ giải ngân|dang cho giai ngan|chờ giải ngân|query_disbursement/i.test(line)) {
      const stepTime = lines[index + 1] && !isCheckLine(lines[index + 1]) ? lines[index + 1] : "";
      const stepDetail = lines[index + 2] && !parseFieldLine(lines[index + 2]) ? lines[index + 2] : "";
      timeline.push({
        title: "Chờ Giải ngân",
        time: stepDetail || stepTime || "Hệ thống đang truy vấn trạng thái giải ngân từ partner.",
        status: "active",
      });
      if (stepTime) index += 1;
      continue;
    }
  }

  if (!title) title = lines[0] ?? "";
  const hasLoanSignals = Boolean(fields["Loan ID"] || fields["Zalopay ID"] || fields["Amount/Term"] || fields.Amount);
  if (!title || !hasLoanSignals) return null;

  return { title, fields, timeline, summary };
}

function htmlToTextLines(html: string): string[] {
  return decodeHtmlEntities(
    stripUnsafeBlocks(html)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|section|article|header|footer|h[1-6]|li|tr|table|dl|dt|dd)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function stripUnsafeBlocks(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "");
}

function cleanInlineHtml(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|section|article|header|footer|h[1-6]|li|tr|table|dl|dt|dd)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");
}

function cleanCodeHtml(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, "")).trim();
}

function parseHtmlTable(html: string): { columns: string[]; rows: string[][] } {
  const rawRows = Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi));
  const rows = rawRows.map((rowMatch) =>
    Array.from(rowMatch[1].matchAll(/<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi))
      .map((cellMatch) => cleanInlineHtml(cellMatch[2]))
  ).filter((row) => row.some(Boolean));

  if (rows.length === 0) return { columns: [], rows: [] };

  const firstRowHasHeaders = /<th\b/i.test(rawRows[0]?.[1] ?? "");
  const maxColumns = Math.max(...rows.map((row) => row.length));
  const columns = firstRowHasHeaders
    ? rows[0]
    : Array.from({ length: maxColumns }, (_, index) => `Column ${index + 1}`);

  return {
    columns,
    rows: firstRowHasHeaders ? rows.slice(1) : rows,
  };
}

function parseFieldLine(line: string): { label: string; value: string } | null {
  const match = line.match(/^([^:]{2,60}):\s*(.+)$/);
  if (!match) return null;
  return { label: match[1].trim(), value: match[2].trim() };
}

function canonicalFieldLabel(label: string): string {
  const normalized = normalizeLabel(label);
  if (normalized.includes("loan id")) return "Loan ID";
  if (normalized.includes("zalopay id")) return "Zalopay ID";
  if (normalized.includes("partner") || normalized.includes("doi tac")) return "Partner";
  if (normalized === "status") return "Status";
  if (normalized.includes("amount/term")) return "Amount/Term";
  if (normalized.includes("amount") || normalized.includes("so tien")) return "Amount";
  if (normalized.includes("term") || normalized.includes("ky han")) return "Term";
  if (normalized.includes("score")) return "Score/ZLP Score";
  if (normalized.includes("ma hop dong") || normalized.includes("contract")) return "Contract ID";
  if (normalized.includes("ket luan") || normalized.includes("huong xu ly")) return "Summary";
  return "";
}

function normalizeLabel(label: string): string {
  return label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isCheckLine(line: string): boolean {
  return /^[✓✔☑✅]$/.test(line.trim());
}

function splitAmountTerm(value: string | undefined): { amount: string; term: string } {
  if (!value) return { amount: "", term: "" };
  const [amount = "", term = ""] = value.split("/").map((part) => part.trim());
  return { amount, term };
}

function timelineItems(
  timeline: Array<{ time: string; title: string }>,
  statusName: string,
  summary: string,
  amount: string
) {
  const items = milestoneItems(timeline, amount);

  if (statusName && !items.some((item) => item.title === "Chờ Giải ngân")) {
    items.push({
      title: statusName === "QUERY_DISBURSEMENT" ? "Chờ Giải ngân" : statusName,
      detail: summary || "Hệ thống đang truy vấn trạng thái giải ngân từ partner.",
      status: /error|failed|rejected/i.test(summary) ? "error" : "active",
    });
  }

  return items;
}

function milestoneItems(timeline: Array<{ time: string; title: string; status?: string }>, amount: string) {
  const seen = new Set<string>();
  const items: Array<{ title: string; detail: string; status: string }> = [];

  for (const item of timeline) {
    const normalized = normalizeTimelineItem(item, amount);
    if (!normalized || seen.has(normalized.title)) continue;
    seen.add(normalized.title);
    items.push(normalized);
  }

  return items;
}

function normalizeTimelineItem(
  item: { time: string; title: string; status?: string },
  amount: string
): { title: string; detail: string; status: string } | null {
  const title = normalizeLabel(item.title);
  const status = item.status ?? "done";
  const time = timeOnly(item.time);

  if (/created|pass|kyc|nfc|income|tao ho so/.test(title)) {
    return { title: "Tạo hồ sơ & Pass Rules", detail: time ? `Hoàn tất lúc ${time}` : item.title, status };
  }
  if (/submit|partner submission|handle submit|gui du lieu/.test(title)) {
    return { title: "Gửi dữ liệu qua TNEX", detail: time ? `Submit thành công lúc ${time}` : item.title, status };
  }
  if (/approved|phe duyet/.test(title)) {
    return { title: "TNEX Phê duyệt", detail: time ? `Duyệt hạn mức ${amount || "khoản vay"} lúc ${time}` : item.title, status };
  }
  if (/contract signed|signed|ky hop dong/.test(title)) {
    return { title: "Ký Hợp đồng", detail: time ? `Khách hàng xác nhận và ký hợp đồng thành công lúc ${time}` : item.title, status };
  }
  if (/cho giai ngan|query_disbursement/.test(title)) {
    return { title: "Chờ Giải ngân", detail: item.time || "Hệ thống đang truy vấn trạng thái giải ngân từ partner.", status: "active" };
  }

  return null;
}

function timeOnly(value: string): string {
  const match = value.match(/\b\d{2}:\d{2}(?::\d{2})?\b/);
  return match?.[0] ?? value;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}
