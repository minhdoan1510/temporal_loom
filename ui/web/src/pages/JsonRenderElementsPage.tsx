import ReportRenderer, { reportComponents } from "@/components/chat/ReportRenderer";
import type { ReportSpec } from "@/lib/report-spec";
import { cn } from "@/lib/utils";

type ShowcaseItem = {
  name: string;
  purpose: string;
  spec: ReportSpec;
  wide?: boolean;
};

const supportedNames = Object.keys(reportComponents).sort();

const upstreamJsonRenderNames = [
  "Accordion",
  "Alert",
  "Avatar",
  "Badge",
  "BarGraph",
  "Button",
  "ButtonGroup",
  "Card",
  "Carousel",
  "Checkbox",
  "Collapsible",
  "Dialog",
  "Drawer",
  "DropdownMenu",
  "Grid",
  "Heading",
  "Icon",
  "Image",
  "Input",
  "LineGraph",
  "Link",
  "Metric",
  "Pagination",
  "Popover",
  "Progress",
  "Radio",
  "Rating",
  "Select",
  "Separator",
  "Skeleton",
  "Slider",
  "Spinner",
  "Stack",
  "Switch",
  "Table",
  "Tabs",
  "Text",
  "Textarea",
  "Toggle",
  "ToggleGroup",
  "Tooltip",
];

const upstreamNotMapped = upstreamJsonRenderNames.filter((name) => {
  if (name === "BarGraph") return !supportedNames.includes("BarChart");
  if (name === "LineGraph") return !supportedNames.includes("LineChart");
  return !supportedNames.includes(name);
});

const showcaseItems: ShowcaseItem[] = [
  {
    name: "Stack",
    purpose: "Layout doc, ngang/doc va spacing.",
    spec: {
      root: "root",
      elements: {
        root: {
          type: "Stack",
          props: { direction: "horizontal", gap: "sm" },
          children: ["a", "b", "c"],
        },
        a: { type: "Badge", props: { label: "neutral", tone: "neutral" }, children: [] },
        b: { type: "Badge", props: { label: "success", tone: "success" }, children: [] },
        c: { type: "Badge", props: { label: "warning", tone: "warning" }, children: [] },
      },
    },
  },
  {
    name: "Grid",
    purpose: "Grid responsive 2-3 cot.",
    wide: true,
    spec: {
      root: "root",
      elements: {
        root: {
          type: "Grid",
          props: { columns: "3" },
          children: ["m1", "m2", "m3"],
        },
        m1: { type: "Metric", props: { label: "Approved", value: "128", detail: "+12 today" }, children: [] },
        m2: { type: "Metric", props: { label: "Pending", value: "9", detail: "2 urgent" }, children: [] },
        m3: { type: "Metric", props: { label: "Error", value: "1", detail: "needs check" }, children: [] },
      },
    },
  },
  {
    name: "Card",
    purpose: "Group noi dung co title va description.",
    wide: true,
    spec: {
      root: "root",
      elements: {
        root: {
          type: "Card",
          props: { title: "Kết luận", description: "Renderer card dang hoat dong." },
          children: ["text", "badge"],
        },
        text: { type: "Text", props: { content: "Card co the chua text, badge, metric, chart hoac status." }, children: [] },
        badge: { type: "Badge", props: { label: "rendered", tone: "success" }, children: [] },
      },
    },
  },
  {
    name: "Heading",
    purpose: "Tieu de cap 1-3.",
    spec: {
      root: "root",
      elements: {
        root: {
          type: "Stack",
          props: { direction: "vertical", gap: "sm" },
          children: ["h1", "h2", "h3"],
        },
        h1: { type: "Heading", props: { text: "Heading level 1", level: "1" }, children: [] },
        h2: { type: "Heading", props: { text: "Heading level 2", level: "2" }, children: [] },
        h3: { type: "Heading", props: { text: "Heading level 3", level: "3" }, children: [] },
      },
    },
  },
  {
    name: "Text",
    purpose: "Doan text thuong va muted.",
    spec: {
      root: "root",
      elements: {
        root: {
          type: "Stack",
          props: { direction: "vertical", gap: "sm" },
          children: ["body", "muted"],
        },
        body: { type: "Text", props: { content: "Text body dung cho noi dung ngan." }, children: [] },
        muted: { type: "Text", props: { content: "Muted text dung cho ghi chu.", muted: true }, children: [] },
      },
    },
  },
  {
    name: "Badge",
    purpose: "Status tone.",
    spec: {
      root: "root",
      elements: {
        root: {
          type: "Stack",
          props: { direction: "horizontal", gap: "sm" },
          children: ["neutral", "success", "warning", "error"],
        },
        neutral: { type: "Badge", props: { label: "neutral", tone: "neutral" }, children: [] },
        success: { type: "Badge", props: { label: "success", tone: "success" }, children: [] },
        warning: { type: "Badge", props: { label: "warning", tone: "warning" }, children: [] },
        error: { type: "Badge", props: { label: "error", tone: "error" }, children: [] },
      },
    },
  },
  {
    name: "Callout",
    purpose: "Thong bao info/success/warning/error.",
    wide: true,
    spec: {
      root: "root",
      elements: {
        root: {
          type: "Stack",
          props: { direction: "vertical", gap: "sm" },
          children: ["info", "success", "warning", "error"],
        },
        info: { type: "Callout", props: { title: "Info", content: "Thong tin bo sung.", tone: "info" }, children: [] },
        success: { type: "Callout", props: { title: "Success", content: "Tat ca check da pass.", tone: "success" }, children: [] },
        warning: { type: "Callout", props: { title: "Warning", content: "Can them bang chung truoc khi ket luan.", tone: "warning" }, children: [] },
        error: { type: "Callout", props: { title: "Error", content: "Tool hoac query dang loi.", tone: "error" }, children: [] },
      },
    },
  },
  {
    name: "Metric",
    purpose: "KPI/card so lieu.",
    spec: {
      root: "root",
      elements: {
        root: {
          type: "Metric",
          props: { label: "Disbursement", value: "42,5 tỷ", detail: "+13,4% vs last week" },
          children: [],
        },
      },
    },
  },
  {
    name: "Steps",
    purpose: "Checklist/trang thai flow.",
    wide: true,
    spec: {
      root: "root",
      elements: {
        root: {
          type: "Steps",
          props: {
            items: [
              { title: "Lay ticket facts", detail: "Da co Zalo ID va time range.", status: "done" },
              { title: "Query loan records", detail: "Dang doi ket qua.", status: "active" },
              { title: "Doi soat partner log", detail: "Chua co input.", status: "pending" },
              { title: "Check OTP trace", detail: "Trace bi timeout.", status: "error" },
            ],
          },
          children: [],
        },
      },
    },
  },
  {
    name: "FileChange",
    purpose: "File row created/modified/deleted.",
    wide: true,
    spec: {
      root: "root",
      elements: {
        root: {
          type: "Stack",
          props: { direction: "vertical", gap: "sm" },
          children: ["created", "modified", "deleted"],
        },
        created: { type: "FileChange", props: { path: "skills/chat-json-render-output/SKILL.md", kind: "created", additions: 112, deletions: 0, summary: "Add JSON Render output skill." }, children: [] },
        modified: { type: "FileChange", props: { path: "ui/web/src/components/chat/ReportRenderer.tsx", kind: "modified", additions: 24, deletions: 4, summary: "Expose report component map." }, children: [] },
        deleted: { type: "FileChange", props: { path: "migrations/000029_chat_json_render_output_skill.up.sql", kind: "deleted", additions: 0, deletions: 180, summary: "Remove SQL skill seed." }, children: [] },
      },
    },
  },
  {
    name: "CodeBlock",
    purpose: "Code snippet.",
    wide: true,
    spec: {
      root: "root",
      elements: {
        root: {
          type: "CodeBlock",
          props: {
            title: "json-render",
            language: "json",
            code: "{\n  \"type\": \"Text\",\n  \"props\": { \"content\": \"Hello\" }\n}",
          },
          children: [],
        },
      },
    },
  },
  {
    name: "Terminal",
    purpose: "Command output.",
    wide: true,
    spec: {
      root: "root",
      elements: {
        root: {
          type: "Terminal",
          props: {
            command: "pnpm build",
            output: "tsc -b && vite build\n✓ 4058 modules transformed\n✓ built in 2.90s",
            exitCode: 0,
          },
          children: [],
        },
      },
    },
  },
  {
    name: "TestResults",
    purpose: "Test summary va failure list.",
    wide: true,
    spec: {
      root: "root",
      elements: {
        root: {
          type: "TestResults",
          props: {
            passed: 14,
            failed: 1,
            skipped: 2,
            failures: [
              { name: "chart labels", message: "Expected compact value label near bar top." },
            ],
          },
          children: [],
        },
      },
    },
  },
  {
    name: "BarChart",
    purpose: "Bar chart category/value.",
    wide: true,
    spec: {
      root: "root",
      elements: {
        root: {
          type: "BarChart",
          props: {
            title: "Tổng tiền giải ngân (VND)",
            data: [
              { label: "26/02", value: 18504000000 },
              { label: "04/03", value: 22450000000 },
              { label: "11/03", value: 24800000000 },
              { label: "18/03", value: 26550000000 },
              { label: "25/03", value: 25100000000 },
              { label: "01/04", value: 28950000000 },
            ],
          },
          children: [],
        },
      },
    },
  },
  {
    name: "Grouped BarChart",
    purpose: "Bklit-style grouped bars with xAxisKey and bars[].",
    wide: true,
    spec: {
      root: "root",
      elements: {
        root: {
          type: "BarChart",
          props: {
            title: "Doanh số giải ngân theo tuần (Tỷ VNĐ)",
            data: [
              { week: "03/07/2023", EASYCREDIT: 1.25, FECREDIT: 3.45, SHBFINANCE: 0.85 },
              { week: "10/07/2023", EASYCREDIT: 1.32, FECREDIT: 3.60, SHBFINANCE: 0.91 },
              { week: "17/07/2023", EASYCREDIT: 1.18, FECREDIT: 3.10, SHBFINANCE: 0.88 },
              { week: "24/07/2023", EASYCREDIT: 1.45, FECREDIT: 0, SHBFINANCE: 0 },
            ],
            xAxisKey: "week",
            bars: [
              { dataKey: "FECREDIT", name: "FE Credit", fill: "#3b82f6" },
              { dataKey: "EASYCREDIT", name: "Easy Credit", fill: "#10b981" },
              { dataKey: "SHBFINANCE", name: "SHB Finance", fill: "#f59e0b" },
            ],
          },
          children: [],
        },
      },
    },
  },
  {
    name: "LineChart",
    purpose: "Line chart trend.",
    wide: true,
    spec: {
      root: "root",
      elements: {
        root: {
          type: "LineChart",
          props: {
            title: "Conversion rate",
            unit: "%",
            data: [
              { label: "Mon", value: 41.2 },
              { label: "Tue", value: 43.8 },
              { label: "Wed", value: 42.1 },
              { label: "Thu", value: 46.4 },
              { label: "Fri", value: 49.7 },
              { label: "Sat", value: 47.9 },
            ],
          },
          children: [],
        },
      },
    },
  },
  {
    name: "Multi-series LineChart",
    purpose: "Raw rows with label and inferred numeric series.",
    wide: true,
    spec: {
      root: "root",
      elements: {
        root: {
          type: "LineChart",
          props: {
            title: "Tỉ lệ lỗi (%) theo tuần",
            data: [
              { label: "2023-10-09", FE_CREDIT: 1.70, SHB_FINANCE: 0, EASY_CREDIT: 1.54, LOTE_FINANCE: 0 },
              { label: "2023-10-16", FE_CREDIT: 1.95, SHB_FINANCE: 1.85, EASY_CREDIT: 1.02, LOTE_FINANCE: 0.94 },
              { label: "2023-10-23", FE_CREDIT: 1.89, SHB_FINANCE: 2.00, EASY_CREDIT: 1.20, LOTE_FINANCE: 0.56 },
            ],
          },
          children: [],
        },
      },
    },
  },
];

const allShowcaseItems = [
  ...showcaseItems,
  ...supportedNames
    .filter((name) => !showcaseItems.some((item) => item.name === name))
    .map(createAutoShowcase),
];
const showcasedNames = new Set(allShowcaseItems.map((item) => item.name));
const missingShowcaseNames = supportedNames.filter((name) => !showcasedNames.has(name));

function createAutoShowcase(name: string): ShowcaseItem {
  const wideNames = new Set([
    "Accordion",
    "AreaChart",
    "BarGraph",
    "CandlestickChart",
    "ButtonGroup",
    "Carousel",
    "ChoroplethChart",
    "ComposedChart",
    "Dialog",
    "Drawer",
    "DropdownMenu",
    "FunnelChart",
    "HeatmapChart",
    "HistogramChart",
    "LineGraph",
    "LiveLineChart",
    "LoanStatusCard",
    "Popover",
    "ProfitLossLine",
    "RadarChart",
    "RingChart",
    "SankeyChart",
    "ScatterChart",
    "Table",
    "Tabs",
    "Textarea",
    "ToggleGroup",
    "WaterfallChart",
  ]);
  return {
    name,
    purpose: "Auto sample cho component map moi.",
    wide: wideNames.has(name),
    spec: {
      root: "root",
      elements: {
        root: {
          type: name,
          props: samplePropsFor(name),
          children: [],
        },
      },
    },
  };
}

function samplePropsFor(name: string): Record<string, unknown> {
  const chartData = [
    { label: "W1", value: 12 },
    { label: "W2", value: 18 },
    { label: "W3", value: 15 },
    { label: "W4", value: 24 },
  ];

  switch (name) {
    case "Accordion":
    case "Collapsible":
      return {
        items: [
          { label: "Overview", content: "Noi dung duoc mo san de scan nhanh.", open: true },
          { label: "Evidence", content: "Dong thu hai trong disclosure." },
        ],
      };
    case "Alert":
      return { title: "Heads up", description: "Thong bao ngan theo style Family.", tone: "warning" };
    case "Avatar":
      return { name: "Cash Loan Bot" };
    case "AreaChart":
      return { title: "Balance trend", data: chartData };
    case "BarGraph":
      return {
        title: "Weekly volume",
        data: chartData,
      };
    case "Button":
      return { label: "Get Started", variant: "primary" };
    case "ButtonGroup":
      return { items: [{ label: "Daily", selected: true }, { label: "Weekly" }, { label: "Monthly" }] };
    case "Carousel":
      return { items: [{ title: "Card one", content: "Carousel item preview." }, { title: "Card two", content: "Second item." }] };
    case "CandlestickChart":
      return {
        title: "Daily OHLC",
        data: [
          { label: "2026-06-12", open: 42, high: 51, low: 39, close: 48 },
          { label: "2026-06-13", open: 48, high: 52, low: 44, close: 45 },
          { label: "2026-06-14", open: 45, high: 57, low: 43, close: 55 },
        ],
      };
    case "Checkbox":
      return { label: "Include resolved tickets", checked: true };
    case "ChoroplethChart":
      return {
        title: "Geo coverage",
        data: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: { name: "Demo region", value: 1 },
              geometry: {
                type: "Polygon",
                coordinates: [[[102, 8], [110, 8], [110, 16], [102, 16], [102, 8]]],
              },
            },
          ],
        },
        center: [106, 12],
        scale: 750,
      };
    case "ComposedChart":
      return { title: "Volume and trend", data: chartData };
    case "Dialog":
      return { title: "Confirm action", description: "Dialog renders as a static safe preview." };
    case "Drawer":
      return { title: "Run details", description: "Drawer preview keeps content inline." };
    case "DropdownMenu":
      return { label: "Actions", items: [{ label: "View" }, { label: "Export" }, { label: "Archive" }] };
    case "FunnelChart":
      return {
        title: "Application funnel",
        data: [
          { label: "Submitted", value: 1200 },
          { label: "Qualified", value: 640 },
          { label: "Approved", value: 320 },
          { label: "Disbursed", value: 210 },
        ],
      };
    case "Gauge":
    case "GaugeChart":
      return { title: "SLA", label: "On time", value: 76, unit: "%" };
    case "HeatmapChart":
      return { title: "Weekly intensity", data: chartData };
    case "HistogramChart":
      return {
        title: "Ticket age distribution",
        unit: "tickets",
        data: [
          { label: "0-1d", value: 18 },
          { label: "1-2d", value: 31 },
          { label: "2-3d", value: 22 },
          { label: "3-5d", value: 9 },
          { label: ">5d", value: 4 },
        ],
      };
    case "Icon":
      return { name: "success", label: "Mapped icon" };
    case "Image":
      return { alt: "Image placeholder" };
    case "Input":
      return { label: "Ticket ID", value: "CLAW-123" };
    case "LineGraph":
      return {
        title: "Conversion",
        unit: "%",
        data: [
          { label: "Mon", value: 41.2 },
          { label: "Tue", value: 43.8 },
          { label: "Wed", value: 42.1 },
        ],
      };
    case "Link":
      return { label: "Open reference", href: "https://styles.refero.design/style/1bcae895-2245-4d33-aa43-1c1e80719554" };
    case "LoanStatusCard":
      return {
        title: "Chi tiết Hồ sơ Vay",
        description: "Hồ sơ đã được TNEX duyệt và user đã ký hợp đồng. Đang chờ giải ngân.",
        statusLabel: "IN PROGRESS (Chờ giải ngân: QUERY_DISBURSEMENT)",
        statusTone: "warning",
        partner: "TNEX",
        amount: "15,000,000 VND",
        term: "9 tháng",
        loanId: "20260610-08022fa7-a266-4526-938e-ddb60e5aa15c",
        zalopayId: "260608000000032",
        score: "1",
        steps: [
          { title: "Tạo hồ sơ & Pass Rules", detail: "Hoàn tất lúc 09:44:02", status: "done" },
          { title: "Gửi dữ liệu qua TNEX", detail: "Submit thành công lúc 09:45:18", status: "done" },
          { title: "TNEX Phê duyệt", detail: "Duyệt hạn mức 15,000,000 VND lúc 09:59:58", status: "done" },
          { title: "Ký Hợp đồng", detail: "Khách hàng xác nhận và ký hợp đồng thành công lúc 10:01:01", status: "done" },
          { title: "Chờ Giải ngân", detail: "Hệ thống đang truy vấn trạng thái giải ngân từ partner (Polling).", status: "active" },
        ],
      };
    case "LiveLineChart":
      return { title: "Live conversion", unit: "%", data: chartData };
    case "Pagination":
      return { currentPage: 2, totalPages: 5 };
    case "PieChart":
      return { title: "Approval mix", data: chartData };
    case "Popover":
      return { trigger: "Details", content: "Popover preview content." };
    case "ProfitLossLine":
      return {
        title: "Profit/loss",
        data: [
          { label: "Jan", value: 12 },
          { label: "Feb", value: -4 },
          { label: "Mar", value: 9 },
          { label: "Apr", value: -2 },
        ],
      };
    case "Progress":
      return { label: "Completion", value: 68 };
    case "Radio":
      return { label: "Use schedule trigger", checked: true };
    case "RadarChart":
      return { title: "Quality score", data: chartData };
    case "Rating":
      return { value: 4 };
    case "RingChart":
      return { title: "Quota usage", unit: "%", data: chartData.map((point) => ({ ...point, maxValue: 30 })) };
    case "SankeyChart":
      return {
        title: "Lead flow",
        nodes: [{ name: "Submitted" }, { name: "Reviewed" }, { name: "Approved" }],
        links: [{ source: 0, target: 1, value: 120 }, { source: 1, target: 2, value: 72 }],
      };
    case "ScatterChart":
      return { title: "Value scatter", data: chartData };
    case "Select":
      return { label: "Status", value: "Approved", options: [{ label: "Approved" }, { label: "Pending" }] };
    case "Separator":
      return { orientation: "horizontal" };
    case "Skeleton":
      return { lines: 3 };
    case "Slider":
      return { value: 72 };
    case "Spinner":
      return { label: "Loading" };
    case "Switch":
      return { label: "Enabled", checked: true };
    case "Table":
      return { columns: ["Metric", "Value"], rows: [["Approved", "128"], ["Pending", "9"]] };
    case "Tabs":
      return { items: [{ label: "Summary", content: "Summary panel." }, { label: "Logs", content: "Logs panel." }], selected: "Summary" };
    case "Textarea":
      return { label: "Instructions", value: "Summarize ticket evidence." };
    case "Toggle":
      return { label: "Pinned", pressed: true };
    case "ToggleGroup":
      return { items: [{ label: "CS", selected: true }, { label: "Risk" }, { label: "Ops" }] };
    case "Tooltip":
      return { trigger: "Hover target", content: "Tooltip text." };
    case "WaterfallChart":
      return {
        title: "Approval rate delta",
        unit: "%",
        data: [
          { label: "Base", value: 42 },
          { label: "KYC", value: 8 },
          { label: "Risk", value: -5 },
          { label: "Partner", value: 3 },
          { label: "Final", value: 48 },
        ],
      };
    default:
      return { label: name, content: `${name} is mapped.` };
  }
}

export default function JsonRenderElementsPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="border-b border-border bg-muted/20">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 py-8 md:px-8">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              JSON Render catalog
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              cs-tool renderable elements
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Page nay render truc tiep bang ReportRenderer de thay component nao
              dang support, component nao can bo sung mapping.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {supportedNames.map((name) => (
              <span
                key={name}
                className="rounded-md border border-border bg-background px-2 py-1 font-mono text-xs"
              >
                {name}
              </span>
            ))}
          </div>
          {missingShowcaseNames.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
              Missing showcase sample: {missingShowcaseNames.join(", ")}
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-4 px-5 py-6 md:grid-cols-2 md:px-8 xl:grid-cols-3">
        {allShowcaseItems.map((item) => (
          <article
            key={item.name}
            className={cn(
              "min-w-0 rounded-lg border border-border bg-card p-4 shadow-sm",
              item.wide && "md:col-span-2 xl:col-span-2"
            )}
          >
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-mono text-sm font-semibold">{item.name}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{item.purpose}</p>
              </div>
              <details className="group relative">
                <summary className="cursor-pointer rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted">
                  JSON
                </summary>
                <pre className="absolute right-0 z-10 mt-2 max-h-80 w-[min(80vw,520px)] overflow-auto rounded-lg border border-border bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-200 shadow-xl">
                  {JSON.stringify(item.spec, null, 2)}
                </pre>
              </details>
            </div>
            <div className="min-w-0">
              <ReportRenderer spec={item.spec} />
            </div>
          </article>
        ))}
      </section>

      <section className="mx-auto w-full max-w-7xl px-5 pb-10 md:px-8">
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4">
          <h2 className="text-sm font-semibold">Upstream mapping coverage</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Day la danh sach tu JSON Render/shadcn hoac playground chua render
            duoc trong cs-tool. Neu rong nghia la tat ca ten upstream dang duoc
            map trong ReportRenderer.
          </p>
          {upstreamNotMapped.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {upstreamNotMapped.map((name) => (
                <span
                  key={name}
                  className="rounded-md border border-border bg-background px-2 py-1 font-mono text-xs text-muted-foreground"
                >
                  {name}
                </span>
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-300">
              All tracked upstream names are mapped.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
