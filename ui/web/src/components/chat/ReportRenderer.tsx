import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  ExternalLink,
  FileMinus,
  FilePen,
  FilePlus,
  Image as ImageIcon,
  Info,
  Loader2,
  MoreHorizontal,
  Star,
  TriangleAlert,
  X,
} from "lucide-react";
import { Children, createElement, type ReactNode } from "react";
import { Area as BklitArea } from "@/components/charts/area";
import { AreaChart as BklitAreaChart } from "@/components/charts/area-chart";
import { Bar as BklitBar } from "@/components/charts/bar";
import { BarChart as BklitBarChart } from "@/components/charts/bar-chart";
import { BarXAxis as BklitBarXAxis } from "@/components/charts/bar-x-axis";
import { Candlestick as BklitCandlestick } from "@/components/charts/candlestick";
import { CandlestickChart as BklitCandlestickChart } from "@/components/charts/candlestick-chart";
import { ComposedChart as BklitComposedChart } from "@/components/charts/composed-chart";
import { FunnelChart as BklitFunnelChart } from "@/components/charts/funnel-chart";
import { Gauge as BklitGauge } from "@/components/charts/gauge";
import { Grid as BklitGrid } from "@/components/charts/grid";
import {
  HeatmapCells as BklitHeatmapCells,
  HeatmapChart as BklitHeatmapChart,
  HeatmapLegend as BklitHeatmapLegend,
  HeatmapTooltip as BklitHeatmapTooltip,
  HeatmapXAxis as BklitHeatmapXAxis,
  HeatmapYAxis as BklitHeatmapYAxis,
  type HeatmapColumn,
} from "@/components/charts/heatmap";
import { Line as BklitLine } from "@/components/charts/line";
import { LineChart as BklitLineChart } from "@/components/charts/line-chart";
import { LiveLine as BklitLiveLine } from "@/components/charts/live-line";
import { LiveLineChart as BklitLiveLineChart } from "@/components/charts/live-line-chart";
import { LiveXAxis as BklitLiveXAxis } from "@/components/charts/live-x-axis";
import { PieCenter as BklitPieCenter } from "@/components/charts/pie-center";
import { PieChart as BklitPieChart } from "@/components/charts/pie-chart";
import { PieSlice as BklitPieSlice } from "@/components/charts/pie-slice";
import { ProfitLossLine as BklitProfitLossLine } from "@/components/charts/profit-loss-line";
import { RadarArea as BklitRadarArea } from "@/components/charts/radar-area";
import { RadarAxis as BklitRadarAxis } from "@/components/charts/radar-axis";
import { RadarChart as BklitRadarChart } from "@/components/charts/radar-chart";
import { RadarGrid as BklitRadarGrid } from "@/components/charts/radar-grid";
import { RadarLabels as BklitRadarLabels } from "@/components/charts/radar-labels";
import { Ring as BklitRing } from "@/components/charts/ring";
import { RingCenter as BklitRingCenter } from "@/components/charts/ring-center";
import { RingChart as BklitRingChart } from "@/components/charts/ring-chart";
import {
  SankeyChart as BklitSankeyChart,
  SankeyLink as BklitSankeyLink,
  SankeyNode as BklitSankeyNode,
  SankeyTooltip as BklitSankeyTooltip,
  type SankeyData,
} from "@/components/charts/sankey";
import { Scatter as BklitScatter } from "@/components/charts/scatter";
import { ScatterChart as BklitScatterChart } from "@/components/charts/scatter-chart";
import { SeriesBar as BklitSeriesBar } from "@/components/charts/series-bar";
import { ChartTooltip as BklitChartTooltip } from "@/components/charts/tooltip";
import {
  ChoroplethChart as BklitChoroplethChart,
  ChoroplethFeatureComponent as BklitChoroplethFeature,
  ChoroplethTooltip as BklitChoroplethTooltip,
  type ChoroplethFeatureProperties,
} from "@/components/charts/choropleth";
import { cn } from "@/lib/utils";
import {
  normalizeReportComponentType,
  normalizeReportProps,
  type ReportElement,
  type ReportSpec,
} from "@/lib/report-spec";
import { formatCompactNumber } from "@/lib/compact-number";
import type { FeatureCollection, Geometry } from "geojson";

const toneStyles = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  error: "bg-destructive/10 text-destructive",
} as const;

const calloutStyles = {
  info: "border-info/25 bg-info/10 text-foreground",
  success: "border-success/25 bg-success/10 text-foreground",
  warning: "border-warning/25 bg-warning/10 text-foreground",
  error: "border-destructive/25 bg-destructive/10 text-foreground",
} as const;

const calloutIcons = {
  info: Info,
  success: Check,
  warning: TriangleAlert,
  error: AlertTriangle,
} as const;

const stepStatusMeta = {
  done: {
    icon: Check,
    iconClassName: "",
    markerClassName: "border-success/60 bg-success/10 text-success",
    titleClassName: "font-medium text-foreground",
  },
  active: {
    icon: Loader2,
    iconClassName: "animate-spin",
    markerClassName: "border-warning/70 bg-warning/15 text-warning",
    titleClassName: "font-semibold text-foreground",
  },
  pending: {
    icon: CircleDashed,
    iconClassName: "",
    markerClassName: "border-muted-foreground/30 bg-muted/30 text-muted-foreground",
    titleClassName: "text-muted-foreground",
  },
  error: {
    icon: X,
    iconClassName: "",
    markerClassName: "border-destructive/70 bg-destructive/10 text-destructive",
    titleClassName: "font-medium text-foreground",
  },
} as const;

const fileChangeMeta = {
  created: { icon: FilePlus, label: "created", className: "text-success" },
  modified: { icon: FilePen, label: "modified", className: "text-primary" },
  deleted: { icon: FileMinus, label: "deleted", className: "text-destructive" },
} as const;

type Tone = keyof typeof toneStyles;
type CalloutTone = keyof typeof calloutStyles;
type StepStatus = keyof typeof stepStatusMeta;
type FileChangeKind = keyof typeof fileChangeMeta;
type ChartPoint = { label: string; value: number };
type ChartSegment = ChartPoint & { color?: string; displayValue?: string; maxValue?: number };
type ChartSeries = { dataKey: string; name: string; fill: string };
type ReportComponentProps = Record<string, unknown> & { children?: ReactNode };

const chartPalette = [
  "var(--chart-line-primary)",
  "var(--chart-line-secondary)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
  "var(--chart-9)",
  "var(--chart-10)",
  "var(--chart-11)",
  "var(--chart-12)",
] as const;

// eslint-disable-next-line react-refresh/only-export-components
export const reportComponents = {
  Accordion: createReportComponent("Accordion"),
  Alert: createReportComponent("Alert"),
  Avatar: createReportComponent("Avatar"),
  Stack: createReportComponent("Stack"),
  Grid: createReportComponent("Grid"),
  Card: createReportComponent("Card"),
  Heading: createReportComponent("Heading"),
  Text: createReportComponent("Text"),
  Badge: createReportComponent("Badge"),
  Button: createReportComponent("Button"),
  ButtonGroup: createReportComponent("ButtonGroup"),
  Callout: createReportComponent("Callout"),
  Carousel: createReportComponent("Carousel"),
  Checkbox: createReportComponent("Checkbox"),
  Collapsible: createReportComponent("Collapsible"),
  Dialog: createReportComponent("Dialog"),
  Drawer: createReportComponent("Drawer"),
  DropdownMenu: createReportComponent("DropdownMenu"),
  Icon: createReportComponent("Icon"),
  Image: createReportComponent("Image"),
  Input: createReportComponent("Input"),
  Link: createReportComponent("Link"),
  LoanStatusCard: createReportComponent("LoanStatusCard"),
  Metric: createReportComponent("Metric"),
  Pagination: createReportComponent("Pagination"),
  Popover: createReportComponent("Popover"),
  Progress: createReportComponent("Progress"),
  Radio: createReportComponent("Radio"),
  Rating: createReportComponent("Rating"),
  Select: createReportComponent("Select"),
  Separator: createReportComponent("Separator"),
  Skeleton: createReportComponent("Skeleton"),
  Slider: createReportComponent("Slider"),
  Spinner: createReportComponent("Spinner"),
  Steps: createReportComponent("Steps"),
  Switch: createReportComponent("Switch"),
  Table: createReportComponent("Table"),
  Tabs: createReportComponent("Tabs"),
  Textarea: createReportComponent("Textarea"),
  Toggle: createReportComponent("Toggle"),
  ToggleGroup: createReportComponent("ToggleGroup"),
  Tooltip: createReportComponent("Tooltip"),
  FileChange: createReportComponent("FileChange"),
  CodeBlock: createReportComponent("CodeBlock"),
  Terminal: createReportComponent("Terminal"),
  TestResults: createReportComponent("TestResults"),
  AreaChart: createReportComponent("AreaChart"),
  Area: createReportComponent("Area"),
  Chart: createReportComponent("Chart"),
  Graph: createReportComponent("Graph"),
  Container: createReportComponent("Container"),
  BarChart: createReportComponent("BarChart"),
  BarGraph: createReportComponent("BarGraph"),
  Bar: createReportComponent("Bar"),
  Candlestick: createReportComponent("Candlestick"),
  CandlestickChart: createReportComponent("CandlestickChart"),
  Choropleth: createReportComponent("Choropleth"),
  ChoroplethChart: createReportComponent("ChoroplethChart"),
  Composed: createReportComponent("Composed"),
  ComposedChart: createReportComponent("ComposedChart"),
  Funnel: createReportComponent("Funnel"),
  FunnelChart: createReportComponent("FunnelChart"),
  Gauge: createReportComponent("Gauge"),
  GaugeChart: createReportComponent("GaugeChart"),
  Heatmap: createReportComponent("Heatmap"),
  HeatmapChart: createReportComponent("HeatmapChart"),
  Histogram: createReportComponent("Histogram"),
  HistogramChart: createReportComponent("HistogramChart"),
  Line: createReportComponent("Line"),
  LineChart: createReportComponent("LineChart"),
  LineGraph: createReportComponent("LineGraph"),
  LiveLine: createReportComponent("LiveLine"),
  LiveLineChart: createReportComponent("LiveLineChart"),
  Pie: createReportComponent("Pie"),
  PieChart: createReportComponent("PieChart"),
  ProfitLoss: createReportComponent("ProfitLoss"),
  ProfitLossLine: createReportComponent("ProfitLossLine"),
  Radar: createReportComponent("Radar"),
  RadarChart: createReportComponent("RadarChart"),
  Ring: createReportComponent("Ring"),
  RingChart: createReportComponent("RingChart"),
  Sankey: createReportComponent("Sankey"),
  SankeyChart: createReportComponent("SankeyChart"),
  Scatter: createReportComponent("Scatter"),
  ScatterChart: createReportComponent("ScatterChart"),
  Waterfall: createReportComponent("Waterfall"),
  WaterfallChart: createReportComponent("WaterfallChart"),
  Legend: createReportComponent("Legend"),
} satisfies Record<string, (props: ReportComponentProps) => ReactNode>;

export default function ReportRenderer({ spec }: { spec: ReportSpec }) {
  return (
    //dont edit this div, it is required for charts to render correctly due to a quirk in the underlying chart library that requires a stable container size. Removing this div will cause charts to not render or update correctly.
    <div className="my-3 w-full">
      <RenderedElement spec={spec} id={spec.root} seen={new Set<string>()} depth={0} />
    </div>
  );
}

function createReportComponent(type: string) {
  return function ReportComponent({ children, ...props }: ReportComponentProps) {
    const normalizedType = normalizeReportComponentType(type, props);
    const normalizedProps = normalizeReportProps(normalizedType, props);
    return renderComponent(
      { type: normalizedType, props: normalizedProps, children: [] },
      Children.toArray(children)
    );
  };
}

function RenderedElement({
  spec,
  id,
  seen,
  depth,
}: {
  spec: ReportSpec;
  id: string;
  seen: Set<string>;
  depth: number;
}) {
  const element = spec.elements[id];
  if (!element) return <Fallback type={`missing:${id}`} />;
  if (seen.has(id) || depth > 30) return <Fallback type="recursive" />;

  const nextSeen = new Set(seen);
  nextSeen.add(id);
  const children = element.children.map((childId) => (
    <RenderedElement key={childId} spec={spec} id={childId} seen={nextSeen} depth={depth + 1} />
  ));

  return renderComponent(element, children);
}

function renderComponent(element: ReportElement, children: ReactNode[]) {
  const props = element.props;

    switch (element.type) {
    case "Accordion":
      return <DisclosureList props={props} slotChildren={children} mode="accordion" />;

    case "Stack": {
      const direction = enumProp(props, "direction", ["horizontal", "vertical"], "vertical");
      const gap = enumProp(props, "gap", ["sm", "md", "lg"], "md");
      return (
        <div
          className={cn(
            "flex",
            direction === "horizontal" ? "flex-row flex-wrap items-start" : "flex-col",
            gap === "sm" && "gap-2",
            gap === "md" && "gap-4",
            gap === "lg" && "gap-6"
          )}
        >
          {children}
        </div>
      );
    }

    case "Grid": {
      const columns = enumProp(props, "columns", ["2", "3"], "2");
      const items = arrayProp(props, "items").map(asRecord);
      const renderedChildren = children.length > 0
        ? children
        : items.map((item) => {
          const label = firstStringProp(item, ["label", "title", "name"]);
          const value = firstStringProp(item, ["value", "text"]);
          const detail = firstStringProp(item, ["detail", "description"]);
          return (
            <div key={`${label}:${value}:${detail}`} className="rounded-[10px] border border-border/70 bg-background/50 px-3.5 py-3 shadow-sm">
              <div className="text-xs font-medium text-muted-foreground">{label}</div>
              <div className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">
                {value}
              </div>
              {detail && (
                <div className="text-xs text-muted-foreground tabular-nums">{detail}</div>
              )}
            </div>
          );
        });
      return (
        <div className={cn("grid gap-3", columns === "3" ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
          {renderedChildren}
        </div>
      );
    }

    case "Card": {
      const title = stringProp(props, "title");
      const description = stringProp(props, "description");
      const badges = arrayProp(props, "badges").map(asRecord);
      return (
        <section className="rounded-[10px] border border-border/70 bg-card p-4 text-card-foreground shadow-sm">
          {(title || badges.length > 0) && (
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
              {title && <h3 className="text-sm font-semibold text-card-foreground">{title}</h3>}
              {badges.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {badges.map((badge) => {
                    const tone = enumProp<Tone>(badge, "tone", ["neutral", "success", "warning", "error"], "neutral");
                    const label = firstStringProp(badge, ["label", "text"]);
                    return (
                      <span
                        key={`${label}:${tone}`}
                        className={cn("inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium", toneStyles[tone])}
                      >
                        {label}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {description && <p className="mb-3 text-sm text-muted-foreground">{description}</p>}
          <div className="flex flex-col gap-3">{children}</div>
        </section>
      );
    }

    case "Heading": {
      const level = enumProp(props, "level", ["1", "2", "3"], "2");
      const size = level === "1" ? "text-xl" : level === "2" ? "text-lg" : "text-base";
      return <div className={cn("font-semibold text-foreground", size)}>{stringProp(props, "text")}</div>;
    }

    case "Text":
      return (
        <p className={cn("text-sm leading-relaxed", boolProp(props, "muted") ? "text-muted-foreground" : "text-foreground")}>
          {stringProp(props, "content")}
        </p>
      );

    case "Badge": {
      const tone = enumProp<Tone>(props, "tone", ["neutral", "success", "warning", "error"], "neutral");
      return (
        <span className={cn("inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium", toneStyles[tone])}>
          {stringProp(props, "label")}
        </span>
      );
    }

    case "Alert":
      return <AlertBlock props={props} />;

    case "Avatar":
      return <AvatarBlock props={props} />;

    case "Button":
      return <ButtonPreview props={props} />;

    case "ButtonGroup":
      return <ChoiceGroup props={props} type="button" />;

    case "Callout": {
      const tone = enumProp<CalloutTone>(props, "tone", ["info", "success", "warning", "error"], "info");
      const Icon = calloutIcons[tone];
      const title = stringProp(props, "title");
      const content = stringProp(props, "content");
      return (
        <div className={cn("rounded-lg border px-3 py-2.5", calloutStyles[tone])}>
          <div className="flex gap-2">
            <Icon className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0 text-sm">
              {title && <div className="font-medium text-foreground">{title}</div>}
              {content && <div className="text-muted-foreground">{content}</div>}
              {children.length > 0 && (
                <div className={cn("flex flex-col gap-1.5", content && "mt-1.5")}>
                  {children}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    case "Carousel":
      return <CarouselPreview props={props} slotChildren={children} />;

    case "Checkbox":
      return <CheckPreview props={props} type="checkbox" />;

    case "Collapsible":
      return <DisclosureList props={props} slotChildren={children} mode="collapsible" />;

    case "Dialog":
      return <PanelPreview props={props} slotChildren={children} type="dialog" />;

    case "Drawer":
      return <PanelPreview props={props} slotChildren={children} type="drawer" />;

    case "DropdownMenu":
      return <DropdownPreview props={props} />;

    case "Icon":
      return <IconPreview props={props} />;

    case "Image":
      return <ImagePreview props={props} />;

    case "Input":
      return <InputPreview props={props} multiline={false} />;

    case "Link":
      return <LinkPreview props={props} />;

    case "LoanStatusCard":
      return <LoanStatusCard props={props} />;

    case "Metric":
      return (
        <div className="rounded-[10px] border border-border/70 bg-background/50 px-3.5 py-3 shadow-sm">
          <div className="text-xs font-medium text-muted-foreground">{stringProp(props, "label")}</div>
          <div className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">
            {stringProp(props, "value")}
          </div>
          {stringProp(props, "detail") && (
            <div className="text-xs text-muted-foreground tabular-nums">{stringProp(props, "detail")}</div>
          )}
        </div>
      );

    case "Pagination":
      return <PaginationPreview props={props} />;

    case "Popover":
      return <FloatingPreview props={props} slotChildren={children} type="popover" />;

    case "Progress":
      return <ProgressPreview props={props} />;

    case "Radio":
      return <CheckPreview props={props} type="radio" />;

    case "Rating":
      return <RatingPreview props={props} />;

    case "Select":
      return <SelectPreview props={props} />;

    case "Separator":
      return <SeparatorPreview props={props} />;

    case "Skeleton":
      return <SkeletonPreview props={props} />;

    case "Slider":
      return <SliderPreview props={props} />;

    case "Spinner":
      return <Loader2 className="size-5 animate-spin text-primary" aria-label={stringProp(props, "label") || "Loading"} />;

    case "Steps":
      return <Steps items={arrayProp(props, "items")} />;

    case "Switch":
      return <SwitchPreview props={props} />;

    case "Table":
      return <TablePreview props={props} />;

    case "Tabs":
      return <TabsPreview props={props} slotChildren={children} />;

    case "Textarea":
      return <InputPreview props={props} multiline />;

    case "Toggle":
      return <TogglePreview props={props} />;

    case "ToggleGroup":
      return <ChoiceGroup props={props} type="toggle" />;

    case "Tooltip":
      return <FloatingPreview props={props} slotChildren={children} type="tooltip" />;

    case "FileChange":
      return <FileChange props={props} />;

    case "CodeBlock":
      return <CodeBlock props={props} />;

    case "Terminal":
      return <Terminal props={props} />;

    case "TestResults":
      return <TestResults props={props} />;

    case "AreaChart":
      return <ReportAreaChart props={props} />;

    case "BarChart":
    case "BarGraph":
      return <ReportBarChart props={props} />;

    case "CandlestickChart":
      return <ReportCandlestickChart props={props} />;

    case "ChoroplethChart":
      return <ReportChoroplethChart props={props} />;

    case "ComposedChart":
      return <ReportComposedChart props={props} />;

    case "FunnelChart":
      return <ReportFunnelChart props={props} />;

    case "Gauge":
    case "GaugeChart":
      return <ReportGauge props={props} />;

    case "HeatmapChart":
      return <ReportHeatmapChart props={props} />;

    case "HistogramChart":
      return <ReportHistogramChart props={props} />;

    case "LineChart":
    case "LineGraph":
      return <ReportLineChart props={props} />;

    case "LiveLineChart":
      return <ReportLiveLineChart props={props} />;

    case "PieChart":
      return <ReportPieChart props={props} />;

    case "ProfitLossLine":
      return <ReportProfitLossLine props={props} />;

    case "RadarChart":
      return <ReportRadarChart props={props} />;

    case "RingChart":
      return <ReportRingChart props={props} />;

    case "SankeyChart":
      return <ReportSankeyChart props={props} />;

    case "ScatterChart":
      return <ReportScatterChart props={props} />;

    case "WaterfallChart":
      return <ReportWaterfallChart props={props} />;

    case "Legend":
      return <LegendPreview props={props} />;

    default:
      return <Fallback type={element.type} />;
  }
}

function Steps({ items }: { items: unknown[] }) {
  return (
    <ol className="flex flex-col gap-2">
      {items.map((item) => {
        const record = asRecord(item);
        const status = enumProp<StepStatus>(record, "status", ["done", "active", "pending", "error"], "pending");
        const detail = firstStringProp(record, ["detail", "description", "content", "message"]);
        const title = stringProp(record, "title");
        const meta = stepStatusMeta[status];
        const Icon = meta.icon;
        return (
          <li key={`${title}:${detail}:${status}`} className="flex items-start gap-2.5 text-sm">
            <span
              className={cn(
                "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                meta.markerClassName
              )}
            >
              <Icon className={cn("size-3.5", meta.iconClassName)} />
            </span>
            <span className="min-w-0">
              <span className={cn("leading-tight", meta.titleClassName)}>
                {title}
              </span>
              {detail && <span className="block text-xs text-muted-foreground">{detail}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function LoanStatusCard({ props }: { props: Record<string, unknown> }) {
  const title = stringProp(props, "title") || "Chi tiết Hồ sơ Vay";
  const description = stringProp(props, "description");
  const statusTone = enumProp<Tone>(props, "statusTone", ["neutral", "success", "warning", "error"], "neutral");
  const statusLabel = stringProp(props, "statusLabel");
  const partner = stringProp(props, "partner");
  const amount = stringProp(props, "amount");
  const term = stringProp(props, "term");
  const loanId = stringProp(props, "loanId");
  const zalopayId = stringProp(props, "zalopayId");
  const contractId = stringProp(props, "contractId");
  const score = stringProp(props, "score");
  const steps = arrayProp(props, "steps").map(asRecord);

  const cards: Array<{ label: string; value: string; detail: string }> = [];
  if (partner) cards.push({ label: "Đối tác", value: partner, detail: score ? `Score: ${score}` : "" });
  if (amount) cards.push({ label: "Số tiền", value: amount, detail: term ? `Kỳ hạn: ${term}` : "" });
  if (loanId || zalopayId) {
    cards.push({
      label: "App ID",
      value: compactIdentifier(loanId || zalopayId),
      detail: contractId ? `HĐ: ${contractId}` : zalopayId ? `Zalopay ID: ${zalopayId}` : "",
    });
  }

  return (
    <div className="min-w-0">
      <div className="rounded-[10px] border border-border/70 bg-background/60 p-4">
        <h3 className="text-lg font-semibold leading-tight text-foreground">{title}</h3>
        {description && (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
        )}
        {statusLabel && (
          <span className={cn("mt-3 inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-semibold", toneStyles[statusTone])}>
            {statusLabel}
          </span>
        )}
      </div>

      {cards.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {cards.map((card) => (
            <div key={`${card.label}:${card.value}:${card.detail}`} className="min-w-0 rounded-[10px] border border-border/70 bg-background/50 p-3.5">
              <div className="text-xs font-semibold text-muted-foreground">{card.label}</div>
              <div className="mt-1 truncate text-2xl font-semibold tabular-nums text-foreground">
                {card.value}
              </div>
              {card.detail && (
                <div className="mt-1 truncate text-xs text-muted-foreground">{card.detail}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {steps.length > 0 && (
        <ol className="mt-4 flex flex-col gap-3">
          {steps.map((step) => {
            const status = enumProp<StepStatus>(step, "status", ["done", "active", "pending", "error"], "pending");
            const stepTitle = stringProp(step, "title");
            const stepDetail = firstStringProp(step, ["detail", "description"]);
            return (
              <li key={`${stepTitle}:${stepDetail}:${status}`} className="grid grid-cols-[28px_minmax(0,1fr)] gap-2.5 text-sm">
                <LoanStepIcon status={status} />
                <div className="min-w-0">
                  <div className="font-semibold leading-tight text-foreground">{stepTitle}</div>
                  {stepDetail && (
                    <div className="mt-0.5 text-muted-foreground">{stepDetail}</div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function LoanStepIcon({ status }: { status: StepStatus }) {
  const meta = stepStatusMeta[status];
  const Icon = meta.icon;
  return (
    <span className={cn("flex size-5 items-center justify-center rounded-full border", meta.markerClassName)}>
      <Icon className={cn("size-3.5", meta.iconClassName)} />
    </span>
  );
}

function FileChange({ props }: { props: Record<string, unknown> }) {
  const kind = enumProp<FileChangeKind>(props, "kind", ["created", "modified", "deleted"], "modified");
  const meta = fileChangeMeta[kind];
  const Icon = meta.icon;
  const additions = numberProp(props, "additions");
  const deletions = numberProp(props, "deletions");
  const summary = stringProp(props, "summary");

  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-card px-3 py-2">
      <Icon className={cn("mt-0.5 size-4 shrink-0", meta.className)} />
      <div className="min-w-0 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <code className="font-mono text-xs">{stringProp(props, "path")}</code>
          <span className={cn("text-xs", meta.className)}>{meta.label}</span>
          {(additions != null || deletions != null) && (
            <span className="text-xs tabular-nums">
              {additions != null && <span className="text-success">+{additions} </span>}
              {deletions != null && <span className="text-destructive">-{deletions}</span>}
            </span>
          )}
        </div>
        {summary && <div className="text-xs text-muted-foreground">{summary}</div>}
      </div>
    </div>
  );
}

function CodeBlock({ props }: { props: Record<string, unknown> }) {
  const title = stringProp(props, "title") || stringProp(props, "language");
  return (
    <div className="overflow-hidden rounded-lg border border-border/60">
      {title && (
        <div className="border-b border-border/60 bg-muted/40 px-3 py-1.5 font-mono text-xs text-muted-foreground">
          {title}
        </div>
      )}
      <pre className="overflow-x-auto bg-card p-3 text-xs leading-relaxed text-foreground">
        <code>{stringProp(props, "code")}</code>
      </pre>
    </div>
  );
}

function Terminal({ props }: { props: Record<string, unknown> }) {
  const exitCode = numberProp(props, "exitCode");
  const output = stringProp(props, "output");
  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-muted/40 text-foreground">
      <div className="flex items-center justify-between gap-2 border-b border-border/70 px-3 py-1.5">
        <code className="truncate font-mono text-xs text-muted-foreground">$ {stringProp(props, "command")}</code>
        {exitCode != null && (
          <span className={cn("shrink-0 text-xs tabular-nums", exitCode === 0 ? "text-success" : "text-destructive")}>
            exit {exitCode}
          </span>
        )}
      </div>
      {output && (
        <pre className="max-h-64 overflow-auto p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-foreground">
          {output}
        </pre>
      )}
    </div>
  );
}

function TestResults({ props }: { props: Record<string, unknown> }) {
  const passed = numberProp(props, "passed") ?? 0;
  const failed = numberProp(props, "failed") ?? 0;
  const skipped = numberProp(props, "skipped") ?? 0;
  const failures = arrayProp(props, "failures").map(asRecord);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <span className={cn("rounded-md px-2 py-1 text-xs", toneStyles.success)}>{passed} passed</span>
        <span className={cn("rounded-md px-2 py-1 text-xs", failed > 0 ? toneStyles.error : toneStyles.neutral)}>
          {failed} failed
        </span>
        {skipped > 0 && <span className={cn("rounded-md px-2 py-1 text-xs", toneStyles.warning)}>{skipped} skipped</span>}
      </div>
      {failures.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {failures.map((failure) => (
            <li key={itemKey(failure)} className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs">
              <div className="font-mono font-medium">{stringProp(failure, "name")}</div>
              <div className="text-muted-foreground">{stringProp(failure, "message")}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AlertBlock({ props }: { props: Record<string, unknown> }) {
  const tone = enumProp<CalloutTone>(props, "tone", ["info", "success", "warning", "error"], "info");
  const Icon = calloutIcons[tone];
  const title = firstStringProp(props, ["title", "label"]);
  const content = firstStringProp(props, ["content", "description", "message"]);
  return (
    <div className={cn("rounded-[10px] border px-3 py-2.5", calloutStyles[tone])}>
      <div className="flex gap-2">
        <Icon className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 text-sm">
          {title && <div className="font-medium text-foreground">{title}</div>}
          {content && <div className="text-muted-foreground">{content}</div>}
        </div>
      </div>
    </div>
  );
}

function AvatarBlock({ props }: { props: Record<string, unknown> }) {
  const name = firstStringProp(props, ["name", "label", "alt"]) || "User";
  const src = safeImageSrc(stringProp(props, "src"));
  const fallback = (stringProp(props, "fallback") || name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return (
    <div className="flex items-center gap-2">
      <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/70 bg-muted text-sm font-semibold text-foreground">
        {src ? <img src={src} alt={name} className="size-full object-cover" /> : fallback}
      </span>
      {name && <span className="text-sm font-medium text-foreground">{name}</span>}
    </div>
  );
}

function ButtonPreview({ props }: { props: Record<string, unknown> }) {
  const variant = enumProp(props, "variant", ["default", "primary", "secondary", "outline", "ghost", "link", "destructive"], "default");
  const label = firstStringProp(props, ["label", "text", "children"]) || "Button";
  const className = cn(
    "inline-flex min-h-8 w-fit items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors",
    (variant === "default" || variant === "primary") && "bg-primary text-primary-foreground",
    variant === "secondary" && "bg-secondary text-secondary-foreground",
    variant === "outline" && "border border-border/70 bg-background text-foreground",
    variant === "ghost" && "bg-transparent text-foreground",
    variant === "link" && "px-0 text-primary",
    variant === "destructive" && "bg-destructive text-destructive-foreground",
    boolProp(props, "disabled") && "opacity-50"
  );
  return <span className={className}>{label}</span>;
}

function ChoiceGroup({ props, type }: { props: Record<string, unknown>; type: "button" | "toggle" }) {
  const items = arrayProp(props, "items").map(asRecord);
  const value = firstStringProp(props, ["value", "selected", "defaultValue"]);
  const fallbackLabel = firstStringProp(props, ["label", "text"]);
  const options = items.length > 0 ? items : fallbackLabel ? [{ label: fallbackLabel, value: fallbackLabel }] : [];
  return (
    <div className="inline-flex w-fit flex-wrap items-center gap-1 rounded-full border border-border/70 bg-background p-1">
      {options.map((item, i) => {
        const label = itemLabel(item, i);
        const itemValue = stringProp(item, "value") || label;
        const active = boolProp(item, "active") || boolProp(item, "selected") || itemValue === value;
        return (
          <span
            key={`${label}:${itemValue}`}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              type === "toggle" && "border border-transparent"
            )}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}

function CarouselPreview({ props, slotChildren }: { props: Record<string, unknown>; slotChildren: ReactNode[] }) {
  const items = arrayProp(props, "items").map(asRecord);
  if (items.length === 0 && slotChildren.length > 0) {
    return <div className="flex gap-3 overflow-x-auto pb-1">{slotChildren}</div>;
  }
  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {items.map((item, i) => (
        <div key={itemKey(item)} className="min-w-48 rounded-[10px] border border-border/70 bg-background/50 p-3 shadow-sm">
          <div className="text-sm font-semibold text-foreground">{itemLabel(item, i)}</div>
          <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{itemContent(item)}</div>
        </div>
      ))}
    </div>
  );
}

function CheckPreview({ props, type }: { props: Record<string, unknown>; type: "checkbox" | "radio" }) {
  const checked = boolProp(props, "checked") || boolProp(props, "selected");
  const label = firstStringProp(props, ["label", "text"]) || (checked ? "Selected" : "Option");
  return (
    <span className="inline-flex items-center gap-2 text-sm text-foreground">
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center border",
          type === "radio" ? "rounded-full" : "rounded-[4px]",
          checked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"
        )}
        role={type}
        aria-checked={checked}
      >
        {checked && (type === "radio" ? <span className="size-1.5 rounded-full bg-primary-foreground" /> : <Check className="size-3" />)}
      </span>
      {label}
    </span>
  );
}

function DisclosureList({
  props,
  slotChildren,
  mode,
}: {
  props: Record<string, unknown>;
  slotChildren: ReactNode[];
  mode: "accordion" | "collapsible";
}) {
  const items = arrayProp(props, "items").map(asRecord);
  if (items.length === 0) {
    return (
      <div className="rounded-[10px] border border-border/70 bg-background/50 p-3">
        <div className="mb-2 flex items-center justify-between text-sm font-medium text-foreground">
          {firstStringProp(props, ["title", "label"]) || (mode === "accordion" ? "Accordion" : "Collapsible")}
          <ChevronDown className="size-4 text-muted-foreground" />
        </div>
        <div className="text-sm text-muted-foreground">{slotChildren}</div>
      </div>
    );
  }
  const selected = firstStringProp(props, ["value", "selected", "defaultValue"]);
  return (
    <div className="divide-y divide-border/70 overflow-hidden rounded-[10px] border border-border/70 bg-background/50">
      {items.map((item, i) => {
        const label = itemLabel(item, i);
        const open = boolProp(item, "open") || boolProp(item, "active") || stringProp(item, "value") === selected || i === 0;
        return (
          <div key={`${label}:${stringProp(item, "value")}:${itemContent(item)}`}>
            <div className="flex items-center justify-between px-3 py-2 text-sm font-medium text-foreground">
              {label}
              <ChevronDown className={cn("size-4 text-muted-foreground", open && "rotate-180")} />
            </div>
            {open && <div className="px-3 pb-3 text-sm leading-relaxed text-muted-foreground">{itemContent(item)}</div>}
          </div>
        );
      })}
    </div>
  );
}

function PanelPreview({ props, slotChildren, type }: { props: Record<string, unknown>; slotChildren: ReactNode[]; type: "dialog" | "drawer" }) {
  const title = firstStringProp(props, ["title", "label"]) || (type === "dialog" ? "Dialog" : "Drawer");
  const content = firstStringProp(props, ["content", "description", "message"]);
  return (
    <div className="rounded-[10px] border border-border/70 bg-muted/30 p-3 shadow-sm">
      <div className="rounded-[10px] border border-border/70 bg-background p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-foreground">{title}</div>
            {content && <div className="mt-1 text-sm text-muted-foreground">{content}</div>}
          </div>
          <X className="size-4 text-muted-foreground" />
        </div>
        {slotChildren.length > 0 && <div className="mt-3 text-sm text-muted-foreground">{slotChildren}</div>}
      </div>
    </div>
  );
}

function DropdownPreview({ props }: { props: Record<string, unknown> }) {
  const items = arrayProp(props, "items").map(asRecord);
  return (
    <div className="inline-flex flex-col gap-2">
      <span className="inline-flex h-8 w-fit items-center gap-2 rounded-full border border-border/70 bg-background px-3 text-sm font-medium text-foreground">
        {firstStringProp(props, ["trigger", "label", "title"]) || "Menu"}
        <ChevronDown className="size-4 text-muted-foreground" />
      </span>
      <div className="min-w-40 rounded-[10px] border border-border/70 bg-popover p-1 text-popover-foreground shadow-sm">
        {(items.length > 0 ? items : [{ label: "Action" }]).map((item, i) => (
          <div key={itemKey(item)} className="rounded-md px-2 py-1.5 text-sm">
            {itemLabel(item, i)}
          </div>
        ))}
      </div>
    </div>
  );
}

function IconPreview({ props }: { props: Record<string, unknown> }) {
  const iconName = firstStringProp(props, ["name", "icon"]);
  const label = firstStringProp(props, ["label", "title"]);
  return (
    <span className="inline-flex items-center gap-2 text-sm text-foreground">
      <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
        {createElement(iconFor(iconName), { className: "size-4" })}
      </span>
      {label}
    </span>
  );
}

function ImagePreview({ props }: { props: Record<string, unknown> }) {
  const src = safeImageSrc(stringProp(props, "src"));
  const alt = firstStringProp(props, ["alt", "title", "label"]) || "Image";
  return (
    <div className="overflow-hidden rounded-[10px] border border-border/70 bg-muted/30">
      {src ? (
        <img src={src} alt={alt} className="max-h-64 w-full object-cover" />
      ) : (
        <div className="flex aspect-video items-center justify-center gap-2 text-sm text-muted-foreground">
          <ImageIcon className="size-5" />
          {alt}
        </div>
      )}
    </div>
  );
}

function InputPreview({ props, multiline }: { props: Record<string, unknown>; multiline: boolean }) {
  const label = firstStringProp(props, ["label", "name"]);
  const value = firstStringProp(props, ["value", "defaultValue"]);
  const placeholder = stringProp(props, "placeholder");
  return (
    <label className="block text-sm text-foreground">
      {label && <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>}
      {multiline ? (
        <textarea
          readOnly
          value={value}
          placeholder={placeholder}
          className="min-h-20 w-full resize-none rounded-[10px] border border-border/70 bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      ) : (
        <input
          readOnly
          value={value}
          placeholder={placeholder}
          className="h-9 w-full rounded-[10px] border border-border/70 bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      )}
    </label>
  );
}

function LinkPreview({ props }: { props: Record<string, unknown> }) {
  const href = safeHref(stringProp(props, "href") || stringProp(props, "url"));
  const label = firstStringProp(props, ["label", "text", "title"]) || href || "Link";
  if (!href) {
    return <span className="text-sm font-medium text-primary">{label}</span>;
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline">
      {label}
      <ExternalLink className="size-3.5" />
    </a>
  );
}

function PaginationPreview({ props }: { props: Record<string, unknown> }) {
  const current = Math.max(1, numberProp(props, "currentPage") ?? numberProp(props, "page") ?? 1);
  const total = Math.max(current, numberProp(props, "totalPages") ?? numberProp(props, "pageCount") ?? 3);
  const pages = Array.from({ length: Math.min(total, 5) }, (_, i) => i + 1);
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background p-1">
      <span className="flex size-7 items-center justify-center rounded-full text-muted-foreground"><ChevronLeft className="size-4" /></span>
      {pages.map((page) => (
        <span key={page} className={cn("flex size-7 items-center justify-center rounded-full text-xs font-medium", page === current ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
          {page}
        </span>
      ))}
      <span className="flex size-7 items-center justify-center rounded-full text-muted-foreground"><ChevronRight className="size-4" /></span>
    </div>
  );
}

function FloatingPreview({ props, slotChildren, type }: { props: Record<string, unknown>; slotChildren: ReactNode[]; type: "popover" | "tooltip" }) {
  const trigger = firstStringProp(props, ["trigger", "label", "title"]) || (type === "tooltip" ? "Hover target" : "Open");
  const content = firstStringProp(props, ["content", "description", "message"]);
  return (
    <span className="inline-flex flex-col items-start gap-2">
      <span className="inline-flex h-8 items-center rounded-full border border-border/70 bg-background px-3 text-sm font-medium text-foreground">{trigger}</span>
      <span className="rounded-[10px] border border-border/70 bg-popover px-3 py-2 text-sm text-popover-foreground shadow-sm">
        {content || slotChildren}
      </span>
    </span>
  );
}

function ProgressPreview({ props }: { props: Record<string, unknown> }) {
  const value = clamp(numberProp(props, "value") ?? 0, 0, 100);
  const label = firstStringProp(props, ["label", "title"]);
  return (
    <div className="w-full">
      {label && <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>}
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} />
      </div>
      <div className="mt-1 text-xs tabular-nums text-muted-foreground">{value}%</div>
    </div>
  );
}

function RatingPreview({ props }: { props: Record<string, unknown> }) {
  const value = clamp(numberProp(props, "value") ?? numberProp(props, "rating") ?? 0, 0, 5);
  return (
    <div className="inline-flex items-center gap-1" aria-label={`${value} out of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={cn("size-4", i < value ? "fill-warning text-warning" : "text-muted-foreground/60")} />
      ))}
    </div>
  );
}

function SelectPreview({ props }: { props: Record<string, unknown> }) {
  const label = firstStringProp(props, ["label", "name"]);
  const value = firstStringProp(props, ["value", "selected", "defaultValue"]) || firstStringProp(asRecord(arrayProp(props, "options")[0]), ["label", "value"]);
  return (
    <label className="block text-sm text-foreground">
      {label && <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>}
      <span className="flex h-9 w-full items-center justify-between rounded-[10px] border border-border/70 bg-background px-3 text-sm text-foreground">
        {value || "Select"}
        <ChevronDown className="size-4 text-muted-foreground" />
      </span>
    </label>
  );
}

function SeparatorPreview({ props }: { props: Record<string, unknown> }) {
  const orientation = enumProp(props, "orientation", ["horizontal", "vertical"], "horizontal");
  return (
    <hr
      aria-orientation={orientation}
      className={orientation === "vertical" ? "h-10 w-px border-0 bg-border" : "h-px w-full border-0 bg-border"}
    />
  );
}

function SkeletonPreview({ props }: { props: Record<string, unknown> }) {
  const lines = clamp(numberProp(props, "lines") ?? 1, 1, 6);
  return (
    <div className="flex w-full flex-col gap-2" aria-label="Loading preview">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-3 animate-pulse rounded-full bg-muted" style={{ width: `${100 - i * 14}%` }} />
      ))}
    </div>
  );
}

function SliderPreview({ props }: { props: Record<string, unknown> }) {
  const value = clamp(numberProp(props, "value") ?? numberProp(props, "defaultValue") ?? 50, 0, 100);
  return (
    <div className="w-full py-2">
      <div className="relative h-2 rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} />
        <span className="absolute top-1/2 size-4 -translate-y-1/2 rounded-full border border-border bg-background shadow-sm" style={{ left: `calc(${value}% - 0.5rem)` }} />
      </div>
    </div>
  );
}

function SwitchPreview({ props }: { props: Record<string, unknown> }) {
  const checked = boolProp(props, "checked") || boolProp(props, "on");
  const label = firstStringProp(props, ["label", "text"]);
  return (
    <span className="inline-flex items-center gap-2 text-sm text-foreground">
      <span className={cn("relative inline-flex h-5 w-9 rounded-full transition-colors", checked ? "bg-primary" : "bg-muted")}>
        <span className={cn("absolute top-0.5 size-4 rounded-full bg-background transition-transform", checked ? "translate-x-4" : "translate-x-0.5")} />
      </span>
      {label}
    </span>
  );
}

function TablePreview({ props }: { props: Record<string, unknown> }) {
  const columns = arrayProp(props, "columns");
  const rows = arrayProp(props, "rows").map((row) => Array.isArray(row) ? row : asRecord(row));
  const headers = columns.map((column, i) => {
    const record = asRecord(column);
    return Object.keys(record).length > 0 ? itemLabel(record, i) : String(column);
  });
  const dataRows = rows.length > 0 ? rows : arrayProp(props, "data").map(asRecord);
  const keys = headers.length > 0 ? headers : Object.keys(asRecord(dataRows[0]));
  return (
    <div className="overflow-x-auto rounded-[10px] border border-border/70 bg-background/50">
      <table className="w-full min-w-80 text-left text-sm">
        {stringProp(props, "caption") && <caption className="px-3 py-2 text-xs text-muted-foreground">{stringProp(props, "caption")}</caption>}
        <thead className="bg-muted/50 text-xs font-medium text-muted-foreground">
          <tr>{keys.map((key) => <th key={key} className="px-3 py-2">{key}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-border/70 text-foreground">
          {dataRows.map((row) => {
            const record = asRecord(row);
            return (
              <tr key={rowKey(row, keys)}>
                {keys.map((key, cellIndex) => (
                  <td key={key} className="px-3 py-2">
                    {Array.isArray(row) ? String(row[cellIndex] ?? "") : String(record[key] ?? "")}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TabsPreview({ props, slotChildren }: { props: Record<string, unknown>; slotChildren: ReactNode[] }) {
  const items = arrayProp(props, "items").map(asRecord);
  const selected = firstStringProp(props, ["value", "selected", "defaultValue"]);
  const activeIndex = Math.max(0, items.findIndex((item) => stringProp(item, "value") === selected || boolProp(item, "active")));
  const activeItem = items[activeIndex] ?? items[0];
  return (
    <div className="rounded-[10px] border border-border/70 bg-background/50 p-2">
      <div className="flex flex-wrap gap-1">
        {(items.length > 0 ? items : [{ label: "Tab" }]).map((item, i) => (
          <span key={itemKey(item)} className={cn("rounded-full px-3 py-1 text-xs font-medium", i === activeIndex ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
            {itemLabel(item, i)}
          </span>
        ))}
      </div>
      <div className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {activeItem ? itemContent(activeItem) : slotChildren}
      </div>
    </div>
  );
}

function TogglePreview({ props }: { props: Record<string, unknown> }) {
  const pressed = boolProp(props, "pressed") || boolProp(props, "selected");
  return (
    <span className={cn("inline-flex h-8 w-fit items-center rounded-full border px-3 text-sm font-medium", pressed ? "border-primary bg-primary text-primary-foreground" : "border-border/70 bg-background text-foreground")}>
      {firstStringProp(props, ["label", "text"]) || "Toggle"}
    </span>
  );
}

function LegendPreview({ props }: { props: Record<string, unknown> }) {
  const items = legendItems(props);
  const title = stringProp(props, "title");
  return (
    <div className="flex flex-col gap-2">
      {title && <div className="text-xs font-medium text-muted-foreground">{title}</div>}
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {items.map((item, i) => (
          <div key={`${item.label}-${i}`} className="flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: chartSegmentColor(item.color, i) }}
            />
            <span className="truncate">{item.label}</span>
            {item.value != null && (
              <span className="font-medium tabular-nums text-foreground">
                {formatChartValue(item.value, stringProp(props, "unit"))}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportAreaChart({ props }: { props: Record<string, unknown> }) {
  const data = timeSeriesRows(props);
  const unit = stringProp(props, "unit");
  const title = stringProp(props, "title");

  return (
    <ChartFrame title={title}>
      {data.length === 0 ? (
        <div className="text-xs text-muted-foreground">No data</div>
      ) : (
        <BklitAreaChart
          aspectRatio="5 / 1"
          data={data}
          margin={{ top: 12, right: 12, bottom: 12, left: 12 }}
          xDataKey="x"
        >
          <BklitGrid horizontal vertical={false} />
          <BklitArea dataKey="value" fill="var(--chart-line-primary)" showMarkers />
          <BklitChartTooltip
            showDatePill={false}
            rows={(point) => [
              {
                color: "var(--chart-line-primary)",
                label: typeof point.label === "string" ? point.label : title || "Giá trị",
                value: formatChartValue(numberProp(point, "value") ?? 0, unit),
              },
            ]}
          />
        </BklitAreaChart>
      )}
    </ChartFrame>
  );
}

function ReportBarChart({ props }: { props: Record<string, unknown> }) {
  const xDataKey = chartXDataKey(props);
  const series = chartSeries(props, xDataKey);
  const seriesData = series.length > 0 && xDataKey ? rawSeriesChartData(props, xDataKey, series) : [];
  const data = seriesData.length > 0 ? seriesData : chartSegments(props);
  const unit = stringProp(props, "unit");
  const title = stringProp(props, "title");
  const isSeriesChart = seriesData.length > 0;

  return (
    <ChartFrame title={title}>
      {data.length === 0 ? (
        <div className="text-xs text-muted-foreground">No data</div>
      ) : (
        <div className="relative pt-5">
          {isSeriesChart ? (
            <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1">
              {series.map((item) => (
                <span key={item.dataKey} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="size-2 rounded-full" style={{ backgroundColor: item.fill }} />
                  {item.name}
                </span>
              ))}
            </div>
          ) : (
            <div className="pointer-events-none absolute inset-x-0 top-0 grid gap-2.5" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>
              {(data as ChartPoint[]).map((point) => (
                <div key={point.label} className="truncate text-center text-[11px] text-muted-foreground tabular-nums">
                  {formatChartValue(point.value, unit)}
                </div>
              ))}
            </div>
          )}
          <BklitBarChart
            aspectRatio="5 / 1"
            barGap={0.28}
            data={data}
            margin={{ top: 12, right: 12, bottom: 32, left: 12 }}
            xDataKey={isSeriesChart ? xDataKey : "label"}
          >
            <BklitGrid horizontal vertical={false} />
            {isSeriesChart ? (
              series.map((item) => (
                <BklitBar key={item.dataKey} dataKey={item.dataKey} fill={item.fill} lineCap={6} />
              ))
            ) : (
              <BklitBar
                dataKey="value"
                fill={(point, index) => chartSegmentColor(stringProp(point, "color"), index)}
                lineCap={6}
              />
            )}
            <BklitBarXAxis showAllLabels />
            <BklitChartTooltip
              rows={(point) =>
                isSeriesChart
                  ? series.map((item) => ({
                    color: item.fill,
                    label: item.name,
                    value: formatChartValue(numberProp(point, item.dataKey) ?? 0, unit),
                  }))
                  : [
                    {
                      color: chartSegmentColor(stringProp(point, "color"), 0),
                      label: title || "Giá trị",
                      value: formatChartValue(numberProp(point, "value") ?? 0, unit),
                    },
                  ]
              }
            />
          </BklitBarChart>
        </div>
      )}
    </ChartFrame>
  );
}

function ReportCandlestickChart({ props }: { props: Record<string, unknown> }) {
  const data = candlestickData(props);
  const title = stringProp(props, "title");
  const unit = stringProp(props, "unit");

  return (
    <ChartFrame title={title}>
      {data.length === 0 ? (
        <div className="text-xs text-muted-foreground">No data</div>
      ) : (
        <BklitCandlestickChart
          aspectRatio="5 / 1"
          data={data}
          margin={{ top: 12, right: 12, bottom: 12, left: 12 }}
        >
          <BklitGrid horizontal vertical={false} />
          <BklitCandlestick />
          <BklitChartTooltip
            showDatePill={false}
            rows={(point) => [
              { color: "var(--chart-2)", label: "Open", value: formatChartValue(numberProp(point, "open") ?? 0, unit) },
              { color: "var(--chart-3)", label: "High", value: formatChartValue(numberProp(point, "high") ?? 0, unit) },
              { color: "var(--chart-4)", label: "Low", value: formatChartValue(numberProp(point, "low") ?? 0, unit) },
              { color: "var(--chart-1)", label: "Close", value: formatChartValue(numberProp(point, "close") ?? 0, unit) },
            ]}
          />
        </BklitCandlestickChart>
      )}
    </ChartFrame>
  );
}

function ReportChoroplethChart({ props }: { props: Record<string, unknown> }) {
  const data = choroplethData(props);
  const title = stringProp(props, "title");

  return (
    <ChartFrame title={title}>
      {!data ? (
        <div className="text-xs text-muted-foreground">No GeoJSON data</div>
      ) : (
        <BklitChoroplethChart
          aspectRatio={stringProp(props, "aspectRatio") || "16 / 9"}
          center={tupleNumberProp(props, "center")}
          data={data}
          scale={numberProp(props, "scale") ?? undefined}
          zoomEnabled={boolProp(props, "zoomEnabled")}
        >
          <BklitChoroplethFeature />
          <BklitChoroplethTooltip />
        </BklitChoroplethChart>
      )}
    </ChartFrame>
  );
}

function ReportComposedChart({ props }: { props: Record<string, unknown> }) {
  const data = timeSeriesRows(props);
  const unit = stringProp(props, "unit");
  const title = stringProp(props, "title");

  return (
    <ChartFrame title={title}>
      {data.length === 0 ? (
        <div className="text-xs text-muted-foreground">No data</div>
      ) : (
        <BklitComposedChart
          aspectRatio="5 / 1"
          data={data}
          margin={{ top: 12, right: 12, bottom: 12, left: 12 }}
          xDataKey="x"
        >
          <BklitGrid horizontal vertical={false} />
          <BklitSeriesBar dataKey="value" fill="var(--chart-line-secondary)" />
          <BklitLine dataKey="value" showMarkers stroke="var(--chart-line-primary)" />
          <BklitChartTooltip
            showDatePill={false}
            rows={(point) => [
              {
                color: "var(--chart-line-primary)",
                label: typeof point.label === "string" ? point.label : title || "Giá trị",
                value: formatChartValue(numberProp(point, "value") ?? 0, unit),
              },
            ]}
          />
        </BklitComposedChart>
      )}
    </ChartFrame>
  );
}

function ReportFunnelChart({ props }: { props: Record<string, unknown> }) {
  const data = chartSegments(props);
  const title = stringProp(props, "title");

  return (
    <ChartFrame title={title}>
      {data.length === 0 ? (
        <div className="text-xs text-muted-foreground">No data</div>
      ) : (
        <div className="min-h-48">
          <BklitFunnelChart
            color={stringProp(props, "color") || "var(--chart-line-primary)"}
            data={data}
            edges={enumProp(props, "edges", ["curved", "straight"] as const, "curved")}
            grid={boolProp(props, "grid")}
            orientation={enumProp(props, "orientation", ["horizontal", "vertical"] as const, "horizontal")}
          />
        </div>
      )}
    </ChartFrame>
  );
}

function ReportGauge({ props }: { props: Record<string, unknown> }) {
  const title = stringProp(props, "title");
  const gauge = gaugeValue(props);
  const unit = stringProp(props, "unit");

  return (
    <ChartFrame title={title}>
      <div className="mx-auto h-56 max-w-80">
        <BklitGauge
          centerValue={gauge.centerValue}
          defaultLabel={firstStringProp(props, ["label", "description"]) || title || "Value"}
          suffix={unit === "%" ? "%" : unit ? ` ${unit}` : undefined}
          value={gauge.percent}
        />
      </div>
    </ChartFrame>
  );
}

function ReportHeatmapChart({ props }: { props: Record<string, unknown> }) {
  const data = heatmapData(props);
  const title = stringProp(props, "title");

  return (
    <ChartFrame title={title}>
      {data.length === 0 ? (
        <div className="text-xs text-muted-foreground">No data</div>
      ) : (
        <div className="min-h-28">
          <BklitHeatmapChart
            data={data}
            layout="fluid"
            margin={{ top: 20, right: 12, bottom: 6, left: 28 }}
          >
            <BklitHeatmapCells />
            <BklitHeatmapXAxis />
            <BklitHeatmapYAxis />
            <BklitHeatmapTooltip />
            <BklitHeatmapLegend className="mt-2 justify-end" />
          </BklitHeatmapChart>
        </div>
      )}
    </ChartFrame>
  );
}

function ReportHistogramChart({ props }: { props: Record<string, unknown> }) {
  const data = chartData(props);
  const title = stringProp(props, "title");
  const unit = stringProp(props, "unit");
  const maxValue = Math.max(...data.map((point) => point.value), 1);

  return (
    <ChartFrame title={title}>
      {data.length === 0 ? (
        <div className="text-xs text-muted-foreground">No data</div>
      ) : (
        <div className="min-w-0">
          <div className="flex h-40 items-end gap-2 border-b border-border/70 px-1 pb-1">
            {data.map((point, index) => (
              <div key={`${point.label}-${index}`} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                <div className="text-[10px] font-medium tabular-nums text-muted-foreground">
                  {formatChartValue(point.value, unit)}
                </div>
                <div
                  className="w-full max-w-12 rounded-t-md bg-primary/75"
                  style={{ height: `${Math.max(6, (point.value / maxValue) * 100)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 grid gap-2 px-1" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>
            {data.map((point, index) => (
              <div key={`${point.label}-label-${index}`} className="truncate text-center text-[10px] text-muted-foreground">
                {point.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </ChartFrame>
  );
}

function ReportLineChart({ props }: { props: Record<string, unknown> }) {
  const xDataKey = chartXDataKey(props);
  const series = chartSeries(props, xDataKey);
  const seriesData = series.length > 0 && xDataKey ? rawSeriesChartData(props, xDataKey, series) : [];
  const data = seriesData.length > 0 ? seriesData : chartData(props);
  const first = data[0];
  const last = data[data.length - 1];
  const unit = stringProp(props, "unit");
  const title = stringProp(props, "title");
  const isSeriesChart = seriesData.length > 0;
  const chartRows = data.map((point, index) => ({
    ...(asRecord(point)),
    ...point,
    x: index,
  }));
  const firstLabel = isSeriesChart ? chartCategoryLabel(first, xDataKey) : (first as ChartPoint | undefined)?.label;
  const lastLabel = isSeriesChart ? chartCategoryLabel(last, xDataKey) : (last as ChartPoint | undefined)?.label;

  return (
    <ChartFrame title={title}>
      {!first || !last ? (
        <div className="text-xs text-muted-foreground">No data</div>
      ) : (
        <>
          {isSeriesChart && (
            <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1">
              {series.map((item) => (
                <span key={item.dataKey} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="size-2 rounded-full" style={{ backgroundColor: item.fill }} />
                  {item.name}
                </span>
              ))}
            </div>
          )}
          <BklitLineChart
            aspectRatio="5 / 1"
            data={chartRows}
            margin={{ top: 12, right: 12, bottom: 12, left: 12 }}
            xDataKey="x"
          >
            <BklitGrid horizontal vertical={false} />
            {isSeriesChart ? (
              series.map((item) => (
                <BklitLine key={item.dataKey} dataKey={item.dataKey} showMarkers stroke={item.fill} />
              ))
            ) : (
              <BklitLine dataKey="value" showMarkers stroke="var(--chart-line-primary)" />
            )}
            <BklitChartTooltip
              showDatePill={false}
              rows={(point) =>
                isSeriesChart
                  ? series.map((item) => ({
                    color: item.fill,
                    label: item.name,
                    value: formatChartValue(numberProp(point, item.dataKey) ?? 0, unit),
                  }))
                  : [
                    {
                      color: "var(--chart-line-primary)",
                      label: typeof point.label === "string" ? point.label : title || "Giá trị",
                      value: formatChartValue(numberProp(point, "value") ?? 0, unit),
                    },
                  ]
              }
            />
          </BklitLineChart>
          <div className="mt-1 flex justify-between gap-3 text-[10px] text-muted-foreground">
            <span className="truncate">
              {firstLabel}
              {!isSeriesChart && <span className="tabular-nums"> - {formatChartValue((first as ChartPoint).value, unit)}</span>}
            </span>
            {data.length > 1 && (
              <span className="truncate">
                {lastLabel}
                {!isSeriesChart && <span className="tabular-nums"> - {formatChartValue((last as ChartPoint).value, unit)}</span>}
              </span>
            )}
          </div>
        </>
      )}
    </ChartFrame>
  );
}

function ReportLiveLineChart({ props }: { props: Record<string, unknown> }) {
  const data = liveLineData(props);
  const latest = data.at(-1)?.value ?? 0;
  const title = stringProp(props, "title");
  const unit = stringProp(props, "unit");

  return (
    <ChartFrame title={title}>
      {data.length === 0 ? (
        <div className="text-xs text-muted-foreground">No data</div>
      ) : (
        <BklitLiveLineChart data={data} style={{ height: 180 }} value={latest} window={Math.max(10, data.length + 4)}>
          <BklitGrid horizontal vertical={false} />
          <BklitLiveLine dataKey="value" formatValue={(value) => formatChartValue(value, unit)} />
          <BklitLiveXAxis />
          <BklitChartTooltip
            showDatePill={false}
            rows={(point) => [
              {
                color: "var(--chart-line-primary)",
                label: title || "Live",
                value: formatChartValue(numberProp(point, "value") ?? 0, unit),
              },
            ]}
          />
        </BklitLiveLineChart>
      )}
    </ChartFrame>
  );
}

function ReportPieChart({ props }: { props: Record<string, unknown> }) {
  const data = chartSegments(props);
  const title = stringProp(props, "title");
  const unit = stringProp(props, "unit");
  const donut = props.donut !== false;

  return (
    <ChartFrame title={title}>
      {data.length === 0 ? (
        <div className="text-xs text-muted-foreground">No data</div>
      ) : (
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <BklitPieChart
            cornerRadius={4}
            data={data}
            hoverOffset={6}
            innerRadius={donut ? 58 : 0}
            padAngle={0.018}
            size={220}
          >
            {data.map((point, index) => (
              <BklitPieSlice color={chartSegmentColor(point.color, index)} index={index} key={point.label} />
            ))}
            {donut && <BklitPieCenter defaultLabel={title || "Total"} suffix={unit === "%" ? "%" : undefined} />}
          </BklitPieChart>
          <MiniLegend items={data} unit={unit} />
        </div>
      )}
    </ChartFrame>
  );
}

function ReportProfitLossLine({ props }: { props: Record<string, unknown> }) {
  const data = timeSeriesRows(props);
  const title = stringProp(props, "title");
  const unit = stringProp(props, "unit");

  return (
    <ChartFrame title={title}>
      {data.length === 0 ? (
        <div className="text-xs text-muted-foreground">No data</div>
      ) : (
        <BklitLineChart
          aspectRatio="5 / 1"
          data={data}
          margin={{ top: 12, right: 12, bottom: 12, left: 12 }}
          xDataKey="x"
        >
          <BklitGrid horizontal vertical={false} />
          <BklitProfitLossLine dataKey="value" />
          <BklitChartTooltip
            showDatePill={false}
            rows={(point) => [
              {
                color: (numberProp(point, "value") ?? 0) >= 0 ? "var(--color-emerald-500)" : "var(--color-red-500)",
                label: typeof point.label === "string" ? point.label : title || "P/L",
                value: formatChartValue(numberProp(point, "value") ?? 0, unit),
              },
            ]}
          />
        </BklitLineChart>
      )}
    </ChartFrame>
  );
}

function ReportRadarChart({ props }: { props: Record<string, unknown> }) {
  const radar = radarData(props);
  const title = stringProp(props, "title");

  return (
    <ChartFrame title={title}>
      {radar.data.length === 0 || radar.metrics.length < 3 ? (
        <div className="text-xs text-muted-foreground">No radar data</div>
      ) : (
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <BklitRadarChart data={radar.data} metrics={radar.metrics} size={250}>
            <BklitRadarGrid />
            <BklitRadarAxis />
            {radar.data.map((item, index) => (
              <BklitRadarArea index={index} key={item.label} />
            ))}
            <BklitRadarLabels />
          </BklitRadarChart>
          <MiniLegend items={radar.data.map((item, index) => ({ label: item.label, value: null, color: chartSegmentColor(item.color, index) }))} />
        </div>
      )}
    </ChartFrame>
  );
}

function ReportRingChart({ props }: { props: Record<string, unknown> }) {
  const data = ringData(props);
  const title = stringProp(props, "title");
  const unit = stringProp(props, "unit");

  return (
    <ChartFrame title={title}>
      {data.length === 0 ? (
        <div className="text-xs text-muted-foreground">No data</div>
      ) : (
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <BklitRingChart data={data} size={220}>
            {data.map((point, index) => (
              <BklitRing color={chartSegmentColor(point.color, index)} index={index} key={point.label} />
            ))}
            <BklitRingCenter defaultLabel={title || "Total"} suffix={unit === "%" ? "%" : undefined} />
          </BklitRingChart>
          <MiniLegend items={data} unit={unit} />
        </div>
      )}
    </ChartFrame>
  );
}

function ReportSankeyChart({ props }: { props: Record<string, unknown> }) {
  const data = sankeyData(props);
  const title = stringProp(props, "title");

  return (
    <ChartFrame title={title}>
      {!data ? (
        <div className="text-xs text-muted-foreground">No sankey data</div>
      ) : (
        <BklitSankeyChart
          aspectRatio={stringProp(props, "aspectRatio") || "2 / 1"}
          data={data}
          margin={{ top: 24, right: 100, bottom: 24, left: 100 }}
        >
          <BklitSankeyLink />
          <BklitSankeyNode />
          <BklitSankeyTooltip />
        </BklitSankeyChart>
      )}
    </ChartFrame>
  );
}

function ReportScatterChart({ props }: { props: Record<string, unknown> }) {
  const data = scatterData(props);
  const title = stringProp(props, "title");
  const unit = stringProp(props, "unit");

  return (
    <ChartFrame title={title}>
      {data.length === 0 ? (
        <div className="text-xs text-muted-foreground">No data</div>
      ) : (
        <BklitScatterChart
          aspectRatio="5 / 1"
          data={data}
          margin={{ top: 12, right: 12, bottom: 12, left: 12 }}
          xDataKey="x"
        >
          <BklitGrid horizontal vertical={false} />
          <BklitScatter dataKey="value" fill="var(--chart-line-primary)" />
          <BklitChartTooltip
            showDatePill={false}
            rows={(point) => [
              {
                color: "var(--chart-line-primary)",
                label: typeof point.label === "string" ? point.label : title || "Giá trị",
                value: formatChartValue(numberProp(point, "value") ?? 0, unit),
              },
            ]}
          />
        </BklitScatterChart>
      )}
    </ChartFrame>
  );
}

function ReportWaterfallChart({ props }: { props: Record<string, unknown> }) {
  const data = chartData(props);
  const title = stringProp(props, "title");
  const unit = stringProp(props, "unit");
  const maxAbs = Math.max(...data.map((point) => Math.abs(point.value)), 1);

  return (
    <ChartFrame title={title}>
      {data.length === 0 ? (
        <div className="text-xs text-muted-foreground">No data</div>
      ) : (
        <div className="min-w-0">
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>
            {data.map((point, index) => {
              const positive = point.value >= 0;
              const height = `${Math.max(8, (Math.abs(point.value) / maxAbs) * 100)}%`;
              return (
                <div key={`${point.label}-${index}`} className="min-w-0">
                  <div className="flex h-24 items-end justify-center">
                    {positive && (
                      <div className="w-full max-w-12 rounded-t-md bg-success/75" style={{ height }} />
                    )}
                  </div>
                  <div className="border-t border-border/70" />
                  <div className="flex h-16 items-start justify-center">
                    {!positive && (
                      <div className="w-full max-w-12 rounded-b-md bg-destructive/70" style={{ height }} />
                    )}
                  </div>
                  <div className="mt-1 truncate text-center text-[10px] text-muted-foreground">{point.label}</div>
                  <div className={cn("truncate text-center text-[10px] font-medium tabular-nums", positive ? "text-success" : "text-destructive")}>
                    {positive ? "+" : ""}
                    {formatChartValue(point.value, unit)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </ChartFrame>
  );
}

function MiniLegend({ items, unit = "" }: { items: Array<{ label: string; value: number | null; color?: string }>; unit?: string }) {
  return (
    <div className="flex min-w-40 flex-col gap-1.5">
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`} className="flex items-center justify-between gap-3 text-xs">
          <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: chartSegmentColor(item.color, index) }} />
            <span className="truncate">{item.label}</span>
          </span>
          {item.value != null && (
            <span className="font-medium tabular-nums text-foreground">
              {formatChartValue(item.value, unit)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function ChartFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      {title && <div className="mb-2.5 text-xs font-medium text-muted-foreground">{title}</div>}
      {children}
    </div>
  );
}

function Fallback({ type }: { type: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border/70 px-3 py-2 text-xs text-muted-foreground">
      Unknown report component: {type}
    </div>
  );
}

function chartData(props: Record<string, unknown>): ChartPoint[] {
  const points: ChartPoint[] = [];
  for (const rawPoint of arrayProp(props, "data")) {
    const point = asRecord(rawPoint);
    const label = stringProp(point, "label");
    const value = numberProp(point, "value");
    if (label && value != null) {
      points.push({ label, value });
    }
  }
  return points;
}

function rawSeriesChartData(
  props: Record<string, unknown>,
  xDataKey: string,
  series: ChartSeries[]
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const rawPoint of arrayProp(props, "data")) {
    const point = asRecord(rawPoint);
    const xValue = point[xDataKey];
    const hasXValue = typeof xValue === "string" || typeof xValue === "number" || xValue instanceof Date;
    const hasSeriesValue = series.some((item) => numberProp(point, item.dataKey) != null);
    if (hasXValue && hasSeriesValue) {
      rows.push(point);
    }
  }
  return rows;
}

function chartSeries(props: Record<string, unknown>, xDataKey: string): ChartSeries[] {
  const rawSeries = chartSeriesSource(props);
  const series = rawSeries
    .map((item, index) => {
      const record = asRecord(item);
      const dataKey = firstStringProp(record, ["dataKey", "key", "valueKey"]);
      if (!dataKey) return null;
      const explicitFill = firstStringProp(record, ["fill", "color", "stroke"]);
      const fallbackFill = chartPalette[index % chartPalette.length];
      return {
        dataKey,
        name: firstStringProp(record, ["name", "label", "title"]) || dataKey,
        fill: explicitFill
          ? chartColor(explicitFill, fallbackFill)
          : fallbackFill,
      };
    })
    .filter((item): item is ChartSeries => item != null);
  return series.length > 0 ? series : inferChartSeries(props, xDataKey);
}

function chartSeriesSource(props: Record<string, unknown>): unknown[] {
  const series = arrayProp(props, "series");
  if (series.length > 0) return series;
  const bars = arrayProp(props, "bars");
  if (bars.length > 0) return bars;
  const categories = arrayProp(props, "categories");
  if (categories.length > 0) {
    const colors = arrayProp(props, "colors");
    return categories.map((item, index) => {
      if (typeof item !== "string") return item;
      const color = colors[index];
      return {
        dataKey: item,
        name: item,
        color: typeof color === "string" ? color : undefined,
      };
    });
  }
  return arrayProp(props, "yKeys").map((item) => {
    if (typeof item === "string") {
      return { dataKey: item, name: item };
    }
    return item;
  });
}

function isLegacyNeutralChartColor(value: string): boolean {
  return /^oklch\(\s*(?:0?\.\d+|\d+(?:\.\d+)?%)\s+0(?:%|\b)\s+(?:none|0)\s*(?:\/[^)]*)?\)$/i.test(value.trim());
}

function chartColor(value: string, fallback: string): string {
  if (isLegacyNeutralChartColor(value)) return fallback;
  const normalized = value.trim().replace(/[\s_-]+/g, "").toLowerCase();
  const neutralColorNames = new Set([
    "black",
    "gray",
    "grey",
    "neutral",
    "slate",
    "stone",
    "white",
    "zinc",
  ]);
  if (neutralColorNames.has(normalized)) return fallback;
  const namedColors: Record<string, string> = {
    amber: "var(--chart-3)",
    blue: "var(--chart-1)",
    cyan: "var(--chart-6)",
    emerald: "var(--chart-2)",
    fuchsia: "var(--chart-4)",
    green: "var(--chart-2)",
    indigo: "var(--chart-8)",
    lime: "var(--chart-7)",
    orange: "var(--chart-3)",
    pink: "var(--chart-11)",
    purple: "var(--chart-4)",
    red: "var(--chart-5)",
    rose: "var(--chart-5)",
    sky: "var(--chart-6)",
    teal: "var(--chart-9)",
    violet: "var(--chart-8)",
    yellow: "var(--chart-3)",
  };
  return namedColors[normalized] ?? value;
}

function chartXDataKey(props: Record<string, unknown>): string {
  const xAxis = asRecord(props.xAxis);
  return firstStringProp(props, ["xDataKey", "xAxisKey", "xKey", "categoryKey", "labelKey", "index"])
    || stringProp(xAxis, "dataKey")
    || inferChartXDataKey(props);
}

function inferChartXDataKey(props: Record<string, unknown>): string {
  const data = arrayProp(props, "data").map(asRecord);
  for (const key of ["label", "date", "week", "month", "name", "category"]) {
    if (data.some((point) => firstStringProp(point, [key]))) {
      return key;
    }
  }
  return "";
}

function inferChartSeries(props: Record<string, unknown>, xDataKey: string): ChartSeries[] {
  if (!xDataKey) return [];
  const keys = new Set<string>();
  for (const point of arrayProp(props, "data").map(asRecord)) {
    for (const [key, value] of Object.entries(point)) {
      if (key === xDataKey) continue;
      if (typeof value === "number" && Number.isFinite(value)) {
        keys.add(key);
      }
    }
  }
  if (keys.size <= 1) return [];
  return Array.from(keys).map((dataKey, index) => ({
    dataKey,
    name: dataKey,
    fill: chartPalette[index % chartPalette.length],
  }));
}

function chartCategoryLabel(point: unknown, xDataKey: string): string {
  return firstStringProp(asRecord(point), [xDataKey, "label", "date", "week", "month", "name", "category"]);
}

function chartSegments(props: Record<string, unknown>): ChartSegment[] {
  const segments: ChartSegment[] = [];
  arrayProp(props, "data").forEach((rawPoint, index) => {
    const point = asRecord(rawPoint);
    const label = stringProp(point, "label");
    const value = numberProp(point, "value");
    if (!label || value == null) return;

    const segment: ChartSegment = { label, value };
    const color = firstStringProp(point, ["color", "fill"]);
    const displayValue = stringProp(point, "displayValue");
    const maxValue = numberProp(point, "maxValue");
    segment.color = chartSegmentColor(color, index);
    if (displayValue) segment.displayValue = displayValue;
    if (maxValue != null) segment.maxValue = maxValue;
    segments.push(segment);
  });
  return segments;
}

function timeSeriesRows(props: Record<string, unknown>) {
  return chartData(props).map((point, index) => ({
    ...point,
    x: index,
  }));
}

function candlestickData(props: Record<string, unknown>) {
  const rows = arrayProp(props, "data").map(asRecord);
  const points = chartData(props);
  if (rows.length === 0 && points.length === 0) return [];

  const sourceRows: Record<string, unknown>[] = rows.length > 0 ? rows : points.map((point) => ({ ...point }));
  let previousClose: number | null = null;

  return sourceRows
    .map((row, index) => {
      const close = numberProp(row, "close") ?? numberProp(row, "value");
      if (close == null) return null;
      const open = numberProp(row, "open") ?? previousClose ?? close;
      const high = numberProp(row, "high") ?? Math.max(open, close) * 1.02;
      const low = numberProp(row, "low") ?? Math.min(open, close) * 0.98;
      const date = dateFromValue(row.date ?? row.x ?? row.label, index);
      previousClose = close;
      return { date, open, high, low, close };
    })
    .filter((row): row is { date: Date; open: number; high: number; low: number; close: number } => row != null);
}

function choroplethData(props: Record<string, unknown>): FeatureCollection<Geometry, ChoroplethFeatureProperties> | null {
  const data = asRecord(props.data);
  if (data.type !== "FeatureCollection" || !Array.isArray(data.features)) {
    return null;
  }
  return data as unknown as FeatureCollection<Geometry, ChoroplethFeatureProperties>;
}

function gaugeValue(props: Record<string, unknown>) {
  const points = chartData(props);
  const value = numberProp(props, "value") ?? points.at(-1)?.value ?? 0;
  const maxValue = numberProp(props, "maxValue");
  const percent = maxValue && maxValue > 0 ? (value / maxValue) * 100 : value;
  return {
    centerValue: value,
    percent: clamp(percent, 0, 100),
  };
}

function heatmapData(props: Record<string, unknown>): HeatmapColumn[] {
  const rows = arrayProp(props, "data").map(asRecord);
  const nativeColumns = rows
    .map((column, columnIndex) => {
      const rawBins = arrayProp(column, "bins").map(asRecord);
      if (rawBins.length === 0) return null;
      return {
        bin: numberProp(column, "bin") ?? columnIndex,
        bins: rawBins
          .map((bin, rowIndex) => {
            const count = numberProp(bin, "count") ?? numberProp(bin, "value");
            if (count == null) return null;
            return {
              bin: numberProp(bin, "bin") ?? rowIndex,
              count,
              date: dateFromValue(bin.date ?? column.date ?? column.label, columnIndex),
            };
          })
          .filter((bin): bin is { bin: number; count: number; date: Date } => bin != null),
      };
    })
    .filter((column): column is HeatmapColumn => column != null && column.bins.length > 0);

  if (nativeColumns.length > 0) {
    return nativeColumns;
  }

  return chartData(props).map((point, index) => ({
    bin: index,
    bins: [
      {
        bin: 0,
        count: point.value,
        date: dateFromValue(point.label, index),
      },
    ],
  }));
}

function liveLineData(props: Record<string, unknown>) {
  const baseTime = 1_700_000_000;
  return chartData(props).map((point, index) => ({
    time: baseTime + index,
    value: point.value,
  }));
}

function radarData(props: Record<string, unknown>): {
  data: Array<{ label: string; color?: string; values: Record<string, number> }>;
  metrics: Array<{ key: string; label: string }>;
} {
  const records = arrayProp(props, "data").map(asRecord);
  const metrics: Array<{ key: string; label: string }> = [];
  for (const rawMetric of arrayProp(props, "metrics")) {
    const metric = asRecord(rawMetric);
    const key = firstStringProp(metric, ["key", "value", "name"]);
    if (!key) continue;
    metrics.push({ key, label: firstStringProp(metric, ["label", "title", "name"]) || key });
  }

  const nativeData: Array<{ label: string; color?: string; values: Record<string, number> }> = [];
  for (const row of records) {
    const values = asRecord(row.values);
    if (Object.keys(values).length === 0) continue;
    const label = firstStringProp(row, ["label", "name", "title"]);
    if (!label) continue;
    const color = stringProp(row, "color");
    const normalizedValues = Object.fromEntries(
      Object.entries(values)
        .map(([key, value]) => [key, typeof value === "number" && Number.isFinite(value) ? clamp(value, 0, 100) : null])
        .filter((entry): entry is [string, number] => entry[1] != null)
    );
    nativeData.push(color ? { label, color, values: normalizedValues } : { label, values: normalizedValues });
  }

  if (nativeData.length > 0 && metrics.length > 0) {
    return { data: nativeData, metrics };
  }

  const points = chartData(props);
  const maxValue = Math.max(...points.map((point) => point.value), 1);
  return {
    metrics: points.map((point, index) => ({ key: `m${index}`, label: point.label })),
    data: points.length > 0
      ? [
          {
            label: stringProp(props, "seriesLabel") || stringProp(props, "title") || "Values",
            values: Object.fromEntries(points.map((point, index) => [`m${index}`, clamp((point.value / maxValue) * 100, 0, 100)])),
          },
        ]
      : [],
  };
}

function ringData(props: Record<string, unknown>) {
  const segments = chartSegments(props);
  const maxFromData = Math.max(...segments.map((point) => point.maxValue ?? point.value), 100);
  return segments.map((point) => ({
    label: point.label,
    value: point.value,
    maxValue: point.maxValue ?? maxFromData,
    color: point.color,
  }));
}

function sankeyData(props: Record<string, unknown>): SankeyData | null {
  const nativeData = asRecord(props.data);
  const nodesSource = Array.isArray(nativeData.nodes) ? nativeData.nodes : arrayProp(props, "nodes");
  const linksSource = Array.isArray(nativeData.links) ? nativeData.links : arrayProp(props, "links");
  const nodes: Array<{ name: string; [key: string]: unknown }> = [];
  for (const rawNode of nodesSource) {
    const node = asRecord(rawNode);
    const name = firstStringProp(node, ["name", "label", "title"]);
    if (name) {
      nodes.push({ ...node, name });
    }
  }
  const links: Array<{ source: number; target: number; value: number; [key: string]: unknown }> = [];
  for (const rawLink of linksSource) {
    const link = asRecord(rawLink);
    const source = numberProp(link, "source");
    const target = numberProp(link, "target");
    const value = numberProp(link, "value");
    if (source != null && target != null && value != null) {
      links.push({ ...link, source, target, value });
    }
  }

  if (nodes.length > 0 && links.length > 0) {
    return { nodes, links };
  }

  const points = chartData(props);
  if (points.length < 2) return null;
  return {
    nodes: points.map((point) => ({ name: point.label })),
    links: points.slice(0, -1).map((point, index) => ({
      source: index,
      target: index + 1,
      value: Math.max(0, Math.min(point.value, points[index + 1]?.value ?? point.value)),
    })),
  };
}

function scatterData(props: Record<string, unknown>) {
  const rows = arrayProp(props, "data").map(asRecord);
  const nativeRows = rows
    .map((row, index) => {
      const value = numberProp(row, "value") ?? numberProp(row, "y");
      if (value == null) return null;
      return {
        label: firstStringProp(row, ["label", "name", "title"]) || `Point ${index + 1}`,
        value,
        x: dateFromValue(row.x ?? row.date ?? row.label, index),
      };
    })
    .filter((row): row is { label: string; value: number; x: Date } => row != null);

  if (nativeRows.length > 0) {
    return nativeRows;
  }

  return chartData(props).map((point, index) => ({
    ...point,
    x: dateFromValue(point.label, index),
  }));
}

function legendItems(props: Record<string, unknown>) {
  const explicit: Array<{ label: string; value: number | null; color: string }> = [];
  for (const [index, rawItem] of arrayProp(props, "items").entries()) {
    const item = asRecord(rawItem);
    explicit.push({
      label: itemLabel(item, index),
      value: numberProp(item, "value"),
      color: stringProp(item, "color"),
    });
  }
  return explicit.length > 0 ? explicit : chartSegments(props);
}

function chartPaletteColor(index: number): string {
  return chartPalette[index % chartPalette.length] ?? chartPalette[0];
}

function chartSegmentColor(value: string | undefined, index: number): string {
  const fallback = chartPaletteColor(index);
  return value ? chartColor(value, fallback) : fallback;
}

function dateFromValue(value: unknown, index: number): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date(index);
}

function tupleNumberProp(props: Record<string, unknown>, key: string): [number, number] | undefined {
  const value = props[key];
  if (!Array.isArray(value) || value.length < 2) return undefined;
  const first = value[0];
  const second = value[1];
  return typeof first === "number" && Number.isFinite(first) && typeof second === "number" && Number.isFinite(second)
    ? [first, second]
    : undefined;
}

function formatChartValue(value: number, unit: string): string {
  const formatted = formatCompactNumber(value);
  if (!unit) return formatted;
  return unit === "%" ? `${formatted}${unit}` : `${formatted} ${unit}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringProp(props: Record<string, unknown>, key: string): string {
  const value = props[key];
  return typeof value === "string" ? value : "";
}

function boolProp(props: Record<string, unknown>, key: string): boolean {
  return props[key] === true;
}

function numberProp(props: Record<string, unknown>, key: string): number | null {
  const value = props[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function arrayProp(props: Record<string, unknown>, key: string): unknown[] {
  const value = props[key];
  return Array.isArray(value) ? value : [];
}

function firstStringProp(props: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = props[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function compactIdentifier(value: string): string {
  return value.length > 12 ? `${value.slice(0, 8)}...` : value;
}

function itemLabel(item: Record<string, unknown>, index: number): string {
  return firstStringProp(item, ["label", "title", "text", "name", "value"]) || `Item ${index + 1}`;
}

function itemContent(item: Record<string, unknown>): string {
  return firstStringProp(item, ["content", "description", "message", "detail", "body"]);
}

function itemKey(item: Record<string, unknown>): string {
  return firstStringProp(item, ["id", "key", "value", "label", "title", "text", "name", "content", "description", "detail", "href", "url"])
    || stableValueKey(item);
}

function rowKey(row: unknown, keys: string[]): string {
  if (Array.isArray(row)) {
    return row.map((cell) => String(cell ?? "")).join("|");
  }
  const record = asRecord(row);
  return firstStringProp(record, ["id", "key"])
    || keys.map((key) => String(record[key] ?? "")).join("|")
    || stableValueKey(row);
}

function stableValueKey(value: unknown): string {
  try {
    return JSON.stringify(value) || String(value);
  } catch {
    return String(value);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function safeHref(value: string): string {
  if (!value) return "";
  if (value.startsWith("#") || value.startsWith("/")) return value;
  try {
    const url = new URL(value);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? value : "";
  } catch {
    return "";
  }
}

function safeImageSrc(value: string): string {
  if (!value) return "";
  if (value.startsWith("data:image/")) return value;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? value : "";
  } catch {
    return "";
  }
}

function iconFor(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.includes("check") || normalized.includes("success")) return Check;
  if (normalized.includes("alert") || normalized.includes("warning")) return TriangleAlert;
  if (normalized.includes("error") || normalized.includes("x")) return X;
  if (normalized.includes("image")) return ImageIcon;
  if (normalized.includes("external") || normalized.includes("link")) return ExternalLink;
  if (normalized.includes("star") || normalized.includes("rating")) return Star;
  if (normalized.includes("more") || normalized.includes("menu")) return MoreHorizontal;
  return Info;
}

function enumProp<T extends string>(
  props: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  fallback: T
): T {
  const value = props[key];
  return typeof value === "string" && allowed.includes(value as T) ? value as T : fallback;
}
