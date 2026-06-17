export type ReportElement = {
  type: string;
  props: Record<string, unknown>;
  children: string[];
};

export type ReportSpec = {
  root: string;
  elements: Record<string, ReportElement>;
  state?: Record<string, unknown>;
};

export type ReportMessageSegment =
  | { kind: "markdown"; content: string }
  | { kind: "report"; spec: ReportSpec }
  | { kind: "html"; content: string };

export type HtmlMessageSegment =
  | { kind: "markdown"; content: string }
  | { kind: "html"; content: string };

const fencePattern = /```([^\n`]*)\n?([\s\S]*?)```/g;

export function parseReportMessageContent(content: string): ReportMessageSegment[] {
  const segments: ReportMessageSegment[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  fencePattern.lastIndex = 0;

  while ((match = fencePattern.exec(content)) != null) {
    const [fence, rawLang, rawCode] = match;
    pushMarkdown(segments, content.slice(cursor, match.index));

    const spec = isSpecFence(rawLang) ? parseReportSpec(rawCode) : null;
    if (spec) {
      segments.push({ kind: "report", spec });
    } else if (isHtmlFence(rawLang)) {
      segments.push({ kind: "html", content: rawCode.trim() });
    } else {
      pushMarkdown(segments, fence);
    }

    cursor = match.index + fence.length;
  }

  pushMarkdown(segments, content.slice(cursor));
  return segments.length > 0 ? segments : [{ kind: "markdown", content }];
}

export function parseHtmlMessageContent(content: string): HtmlMessageSegment[] {
  const segments: HtmlMessageSegment[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  fencePattern.lastIndex = 0;

  while ((match = fencePattern.exec(content)) != null) {
    const [fence, rawLang, rawCode] = match;
    pushMarkdown(segments, content.slice(cursor, match.index));

    if (isHtmlFence(rawLang)) {
      segments.push({ kind: "html", content: rawCode.trim() });
    } else {
      pushMarkdown(segments, fence);
    }

    cursor = match.index + fence.length;
  }

  const tail = content.slice(cursor);
  if (!pushIncompleteHtmlFence(segments, tail)) {
    pushMarkdown(segments, tail);
  }
  return segments.length > 0 ? segments : [{ kind: "markdown", content }];
}

export function parseReportSpec(raw: string): ReportSpec | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return null;
  }

  if (!isRecord(parsed)) {
    return null;
  }

  if (typeof parsed.root === "string" && isRecord(parsed.elements)) {
    return parseNormalizedSpec(parsed);
  }

  if (typeof parsed.component === "string" || typeof parsed.type === "string") {
    return parseTreeSpec(parsed);
  }

  return null;
}

export function normalizeReportSpecForComark(raw: string): string | null {
  const spec = parseReportSpec(raw);
  return spec ? JSON.stringify(spec, null, 2) : null;
}

function parseNormalizedSpec(parsed: Record<string, unknown>): ReportSpec | null {
  const elements: Record<string, ReportElement> = {};
  const rawElements = parsed.elements;
  if (!isRecord(rawElements) || typeof parsed.root !== "string") {
    return null;
  }

  for (const [id, value] of Object.entries(rawElements)) {
    if (!isRecord(value) || typeof value.type !== "string") {
      return null;
    }
    const type = normalizeReportComponentType(value.type, isRecord(value.props) ? value.props : {});
    elements[id] = {
      type,
      props: normalizeReportProps(type, value.props),
      children: Array.isArray(value.children)
        ? value.children.filter((child): child is string => typeof child === "string")
        : [],
    };
  }

  if (!elements[parsed.root]) {
    return null;
  }

  return {
    root: parsed.root,
    elements,
    state: isRecord(parsed.state) ? parsed.state : undefined,
  };
}

function parseTreeSpec(rootNode: Record<string, unknown>): ReportSpec | null {
  const elements: Record<string, ReportElement> = {};
  let nextId = 0;

  const addNode = (node: unknown, id?: string): string | null => {
    if (typeof node === "string") {
      const textId = id ?? `node_${++nextId}`;
      elements[textId] = {
        type: "Text",
        props: { content: node },
        children: [],
      };
      return textId;
    }

    if (!isRecord(node)) {
      return null;
    }

    const type = typeof node.component === "string"
      ? node.component
      : typeof node.type === "string"
        ? node.type
        : "";
    if (!type) {
      return null;
    }

    const props = extractTreeProps(node);
    const normalizedType = normalizeReportComponentType(type, props);
    const nodeId = id ?? `node_${++nextId}`;
    const children: string[] = [];
    if (typeof node.children === "string") {
      const childId = addNode(node.children);
      if (childId) {
        children.push(childId);
      }
    } else if (Array.isArray(node.children)) {
      for (const child of node.children) {
        const childId = addNode(child);
        if (childId) {
          children.push(childId);
        }
      }
    }

    elements[nodeId] = {
      type: normalizedType,
      props: normalizeReportProps(normalizedType, props),
      children,
    };
    return nodeId;
  };

  const root = addNode(rootNode, "root");
  if (!root || !elements[root]) {
    return null;
  }

  return { root, elements };
}

function extractTreeProps(node: Record<string, unknown>): Record<string, unknown> {
  const props = isRecord(node.props) ? { ...node.props } : {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "component" || key === "type" || key === "children" || key === "props") {
      continue;
    }
    props[key] = value;
  }
  return props;
}

export function normalizeReportComponentType(type: string, props: Record<string, unknown>): string {
  const normalized = type.trim().replace(/[\s_-]+/g, "").toLowerCase();
  if (normalized === "chart" || normalized === "graph") {
    const chartType = typeof props.type === "string"
      ? props.type.trim().replace(/[\s_-]+/g, "").toLowerCase()
      : "";
    return normalizeChartType(chartType) ?? (chartType.includes("line") ? "LineChart" : "BarChart");
  }

  const aliases: Record<string, string> = {
    alert: "Alert",
    area: "AreaChart",
    areachart: "AreaChart",
    avatar: "Avatar",
    badge: "Badge",
    bar: "BarChart",
    barchart: "BarChart",
    bargraph: "BarGraph",
    button: "Button",
    buttongroup: "ButtonGroup",
    callout: "Callout",
    card: "Card",
    carousel: "Carousel",
    checkbox: "Checkbox",
    candlestick: "CandlestickChart",
    candlestickchart: "CandlestickChart",
    choropleth: "ChoroplethChart",
    choroplethchart: "ChoroplethChart",
    collapsible: "Collapsible",
    composed: "ComposedChart",
    composedchart: "ComposedChart",
    comparison: "BarChart",
    comparisonchart: "BarChart",
    container: "Stack",
    delta: "WaterfallChart",
    deltabreakdown: "WaterfallChart",
    distribution: "HistogramChart",
    distributionchart: "HistogramChart",
    dialog: "Dialog",
    drawer: "Drawer",
    dropdownmenu: "DropdownMenu",
    funnel: "FunnelChart",
    funnelchart: "FunnelChart",
    gauge: "Gauge",
    gaugechart: "GaugeChart",
    grid: "Grid",
    heatmap: "HeatmapChart",
    heatmapchart: "HeatmapChart",
    histogram: "HistogramChart",
    histogramchart: "HistogramChart",
    heading: "Heading",
    icon: "Icon",
    image: "Image",
    input: "Input",
    legend: "Legend",
    line: "LineChart",
    linechart: "LineChart",
    linegraph: "LineGraph",
    link: "Link",
    liveline: "LiveLineChart",
    livelinechart: "LiveLineChart",
    metric: "Metric",
    pagination: "Pagination",
    pie: "PieChart",
    piechart: "PieChart",
    popover: "Popover",
    profitloss: "ProfitLossLine",
    profitlossline: "ProfitLossLine",
    progress: "Progress",
    radio: "Radio",
    radar: "RadarChart",
    radarchart: "RadarChart",
    rating: "Rating",
    ring: "RingChart",
    ringchart: "RingChart",
    sankey: "SankeyChart",
    sankeychart: "SankeyChart",
    scatter: "ScatterChart",
    scatterchart: "ScatterChart",
    select: "Select",
    separator: "Separator",
    skeleton: "Skeleton",
    slider: "Slider",
    spinner: "Spinner",
    stack: "Stack",
    steps: "Steps",
    switch: "Switch",
    table: "Table",
    tabs: "Tabs",
    text: "Text",
    textarea: "Textarea",
    timeseries: "LineChart",
    timeserieschart: "LineChart",
    toggle: "Toggle",
    togglegroup: "ToggleGroup",
    tooltip: "Tooltip",
    trend: "LineChart",
    trendchart: "LineChart",
    waterfall: "WaterfallChart",
    waterfallchart: "WaterfallChart",
  };

  return aliases[normalized] ?? type;
}

function normalizeChartType(chartType: string): string | null {
  const aliases: Record<string, string> = {
    area: "AreaChart",
    areachart: "AreaChart",
    bar: "BarChart",
    barchart: "BarChart",
    bargraph: "BarGraph",
    candlestick: "CandlestickChart",
    candlestickchart: "CandlestickChart",
    choropleth: "ChoroplethChart",
    choroplethchart: "ChoroplethChart",
    composed: "ComposedChart",
    composedchart: "ComposedChart",
    comparison: "BarChart",
    contribution: "WaterfallChart",
    delta: "WaterfallChart",
    deltabreakdown: "WaterfallChart",
    distribution: "HistogramChart",
    funnel: "FunnelChart",
    funnelchart: "FunnelChart",
    gauge: "Gauge",
    gaugechart: "GaugeChart",
    heatmap: "HeatmapChart",
    heatmapchart: "HeatmapChart",
    histogram: "HistogramChart",
    histogramchart: "HistogramChart",
    line: "LineChart",
    linechart: "LineChart",
    linegraph: "LineGraph",
    liveline: "LiveLineChart",
    livelinechart: "LiveLineChart",
    pie: "PieChart",
    piechart: "PieChart",
    profitloss: "ProfitLossLine",
    profitlossline: "ProfitLossLine",
    radar: "RadarChart",
    radarchart: "RadarChart",
    ring: "RingChart",
    ringchart: "RingChart",
    sankey: "SankeyChart",
    sankeychart: "SankeyChart",
    scatter: "ScatterChart",
    scatterchart: "ScatterChart",
    timeseries: "LineChart",
    trend: "LineChart",
    waterfall: "WaterfallChart",
    waterfallchart: "WaterfallChart",
  };
  return aliases[chartType] ?? null;
}

export function normalizeReportProps(type: string, value: unknown): Record<string, unknown> {
  const props = isRecord(value) ? { ...value } : {};

  if (type === "Card" && props.description == null) {
    if (typeof props.subTitle === "string") {
      props.description = props.subTitle;
    } else if (typeof props.subtitle === "string") {
      props.description = props.subtitle;
    } else if (typeof props.content === "string") {
      props.description = props.content;
    }
  }

  if (type === "Card") {
    normalizeBadges(props);
  }

  if (type === "Badge") {
    if (props.label == null && typeof props.text === "string") {
      props.label = props.text;
    }
    normalizeToneProp(props, "tone");
  }

  if (type === "Callout") {
    normalizeToneProp(props, "tone");
  }

  if (type === "Grid" && typeof props.columns === "number" && Number.isFinite(props.columns)) {
    props.columns = String(props.columns);
  }

  if (type === "Steps" || type === "LoanStatusCard") {
    normalizeStepItems(props);
  }

  if (isChartType(type)) {
    normalizeChartProps(props);
  }

  return props;
}

function normalizeBadges(props: Record<string, unknown>) {
  if (!Array.isArray(props.badges)) return;
  props.badges = props.badges
    .map((badge) => {
      const record = isRecord(badge) ? { ...badge } : {};
      if (record.label == null && typeof record.text === "string") {
        record.label = record.text;
      }
      normalizeToneProp(record, "tone");
      return record;
    })
    .filter((badge) => typeof badge.label === "string" && badge.label.trim());
}

function normalizeStepItems(props: Record<string, unknown>) {
  if (!Array.isArray(props.items) && !Array.isArray(props.steps)) return;
  const key = Array.isArray(props.items) ? "items" : "steps";
  props[key] = (props[key] as unknown[]).map((item) => {
    const record = isRecord(item) ? { ...item } : {};
    const normalizedStatus = normalizeStepStatus(record.status);
    if (normalizedStatus) {
      record.status = normalizedStatus;
    }
    if (record.detail == null && typeof record.description === "string") {
      record.detail = record.description;
    }
    return record;
  });
}

function normalizeStepStatus(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/[\s_-]+/g, "").toLowerCase();
  const aliases: Record<string, string> = {
    active: "active",
    current: "active",
    doing: "active",
    inprogress: "active",
    loading: "active",
    processing: "active",
    running: "active",
    waiting: "active",
    done: "done",
    complete: "done",
    completed: "done",
    ok: "done",
    passed: "done",
    success: "done",
    successful: "done",
    error: "error",
    failed: "error",
    failure: "error",
    rejected: "error",
    timeout: "error",
    pending: "pending",
    queued: "pending",
    todo: "pending",
    waitinginput: "pending",
  };
  return aliases[normalized] ?? null;
}

function normalizeToneProp(props: Record<string, unknown>, key: string) {
  if (props[key] == null && typeof props.variant === "string") {
    props[key] = props.variant;
  }
  if (props[key] == null && typeof props.color === "string") {
    props[key] = props.color;
  }
  const tone = normalizeTone(props[key]);
  if (tone) {
    props[key] = tone;
  }
}

function normalizeTone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/[\s_-]+/g, "").toLowerCase();
  const aliases: Record<string, string> = {
    amber: "warning",
    blue: "info",
    danger: "error",
    destructive: "error",
    error: "error",
    fail: "error",
    failed: "error",
    gray: "neutral",
    green: "success",
    grey: "neutral",
    info: "info",
    neutral: "neutral",
    orange: "warning",
    red: "error",
    success: "success",
    warn: "warning",
    warning: "warning",
    yellow: "warning",
  };
  return aliases[normalized] ?? null;
}

function isChartType(type: string): boolean {
  return [
    "AreaChart",
    "BarChart",
    "BarGraph",
    "CandlestickChart",
    "ChoroplethChart",
    "ComposedChart",
    "FunnelChart",
    "Gauge",
    "GaugeChart",
    "HeatmapChart",
    "HistogramChart",
    "LineChart",
    "LineGraph",
    "LiveLineChart",
    "PieChart",
    "ProfitLossLine",
    "RadarChart",
    "RingChart",
    "SankeyChart",
    "ScatterChart",
    "WaterfallChart",
  ].includes(type);
}

function normalizeChartProps(props: Record<string, unknown>) {
  const data = props.data;
  if (!Array.isArray(data)) return;

  const xAxis = isRecord(props.xAxis) ? props.xAxis : {};
  const xKey = firstStringValue(props, ["xDataKey", "xAxisKey", "xKey", "categoryKey", "labelKey", "index"])
    || (typeof xAxis.dataKey === "string" ? xAxis.dataKey : "")
    || inferChartXKey(data);
  if (xKey) {
    props.xDataKey = xKey;
  }

  const alreadyRenderable = data.every((point) => {
    const record = isRecord(point) ? point : null;
    return record && typeof record.label === "string" && typeof record.value === "number";
  });
  if (alreadyRenderable) return;

  const series = normalizeChartSeries(props, data, xKey);
  if (series.length > 0) {
    props.series = series;
  }

  const firstSeries = isRecord(series[0]) ? series[0] : {};
  if (series.length > 1 && xKey) {
    return;
  }

  const yKey = firstStringValue(firstSeries, ["dataKey", "yAxisKey", "valueKey"])
    || firstStringValue(props, ["dataKey", "yAxisKey", "valueKey"]);

  if (!xKey || !yKey) return;

  const normalizedData = data
    .map((point) => {
      const record = isRecord(point) ? point : {};
      const labelValue = record[xKey];
      const dataValue = record[yKey];
      return {
        label: labelValue == null ? "" : String(labelValue),
        value: typeof dataValue === "number" && Number.isFinite(dataValue) ? dataValue : null,
      };
    })
    .filter((point): point is { label: string; value: number } => point.label.length > 0 && point.value != null);

  if (normalizedData.length > 0) {
    props.data = normalizedData;
  }
  if (props.title == null && typeof firstSeries.name === "string") {
    props.title = firstSeries.name;
  }
}

function normalizeChartSeries(
  props: Record<string, unknown>,
  data: unknown[],
  xKey: string
): Record<string, unknown>[] {
  const rawSeries = Array.isArray(props.series)
    ? props.series
    : Array.isArray(props.bars)
      ? props.bars
      : Array.isArray(props.yKeys)
        ? seriesFromYKeys(props.yKeys)
        : seriesFromCategories(props.categories, props.colors);

  const normalizedSeries = rawSeries
    .map((item) => {
      const record = isRecord(item) ? { ...item } : {};
      if (record.fill == null && typeof record.color === "string") {
        record.fill = record.color;
      }
      return record;
    })
    .filter((item) => typeof item.dataKey === "string" && item.dataKey.trim());

  if (normalizedSeries.length > 0 || !xKey) {
    return normalizedSeries;
  }

  return inferChartSeries(data, xKey);
}

function seriesFromYKeys(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const series: Record<string, unknown>[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim()) {
      series.push({ dataKey: item.trim(), name: item.trim() });
      continue;
    }

    const record = isRecord(item) ? { ...item } : {};
    const dataKey = firstStringValue(record, ["dataKey", "key", "valueKey"]);
    if (!dataKey) {
      continue;
    }

    series.push({
      ...record,
      dataKey,
      name: firstStringValue(record, ["name", "label", "title"]) || dataKey,
    });
  }
  return series;
}

function seriesFromCategories(categoriesValue: unknown, colorsValue: unknown): Record<string, unknown>[] {
  if (!Array.isArray(categoriesValue)) {
    return [];
  }

  const colors = Array.isArray(colorsValue) ? colorsValue : [];
  return categoriesValue
    .map((item, index) => {
      if (typeof item !== "string" || !item.trim()) {
        return null;
      }

      const color = colors[index];
      const series: Record<string, unknown> = {
        dataKey: item.trim(),
        name: item.trim(),
      };
      if (typeof color === "string" && color.trim()) {
        series.color = color.trim();
      }
      return series;
    })
    .filter((item): item is Record<string, unknown> => item != null);
}

function inferChartXKey(data: unknown[]): string {
  const candidates = ["label", "date", "week", "month", "name", "category"];
  for (const key of candidates) {
    if (data.some((point) => {
      const record = isRecord(point) ? point : {};
      const value = record[key];
      return typeof value === "string" || typeof value === "number";
    })) {
      return key;
    }
  }
  return "";
}

function inferChartSeries(data: unknown[], xKey: string): Record<string, unknown>[] {
  const keys = new Set<string>();
  for (const point of data) {
    const record = isRecord(point) ? point : {};
    for (const [key, value] of Object.entries(record)) {
      if (key === xKey) continue;
      if (typeof value === "number" && Number.isFinite(value)) {
        keys.add(key);
      }
    }
  }
  return Array.from(keys).map((dataKey) => ({ dataKey, name: dataKey }));
}

function firstStringValue(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return "";
}

function isSpecFence(rawLang: string): boolean {
  const labels = rawLang
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return labels.includes("spec") || labels.includes("json-render");
}

function isHtmlFence(rawLang: string): boolean {
  const labels = rawLang
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return labels.includes("chat-html") || labels.includes("html-render") || labels.includes("render-html");
}

function pushIncompleteHtmlFence(segments: HtmlMessageSegment[], content: string): boolean {
  if (!content.includes("```")) return false;

  const openFencePattern = /```([^\n`]*)\n?/g;
  let match: RegExpExecArray | null;
  while ((match = openFencePattern.exec(content)) != null) {
    const rawLang = match[1] ?? "";
    const bodyStart = match.index + match[0].length;
    const body = content.slice(bodyStart);
    const contentOffset = htmlFenceContentOffset(rawLang, body);
    if (contentOffset == null) continue;

    pushMarkdown(segments, content.slice(0, match.index));
    segments.push({ kind: "html", content: body.slice(contentOffset).trim() });
    return true;
  }

  return false;
}

function htmlFenceContentOffset(rawLang: string, body: string): number | null {
  if (isHtmlFence(rawLang)) return 0;
  if (rawLang.trim() !== "") return null;

  const firstLine = body.match(/^([^\n`]*)\n?/);
  if (!firstLine || !isHtmlFence(firstLine[1] ?? "")) return null;
  return firstLine[0].length;
}

function pushMarkdown(segments: { kind: string; content?: string }[], content: string) {
  if (!content) return;
  const last = segments[segments.length - 1];
  if (last?.kind === "markdown") {
    last.content += content;
    return;
  }
  segments.push({ kind: "markdown", content });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
