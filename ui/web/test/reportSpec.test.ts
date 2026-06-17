import test from "node:test";
import assert from "node:assert/strict";
import { htmlToReportSpec } from "../src/lib/html-report-spec.ts";
import {
  normalizeReportComponentType,
  normalizeReportProps,
  normalizeReportSpecForComark,
  parseHtmlMessageContent,
  parseReportMessageContent,
  parseReportSpec,
} from "../src/lib/report-spec.ts";

const spec = {
  root: "root",
  elements: {
    root: {
      type: "Card",
      props: { title: "Work report" },
      children: ["status"],
    },
    status: {
      type: "Badge",
      props: { label: "passing", tone: "success" },
      children: [],
    },
  },
};

test("parseReportSpec accepts json-render root/elements specs", () => {
  const parsed = parseReportSpec(JSON.stringify(spec));

  assert.equal(parsed?.root, "root");
  assert.equal(parsed?.elements.root.type, "Card");
  assert.deepEqual(parsed?.elements.root.children, ["status"]);
});

test("parseReportMessageContent extracts valid spec fences and keeps markdown", () => {
  const content = `Done.\n\n\`\`\`spec\n${JSON.stringify(spec)}\n\`\`\`\n\nNext step.`;
  const segments = parseReportMessageContent(content);

  assert.equal(segments.length, 3);
  assert.deepEqual(segments[0], { kind: "markdown", content: "Done.\n\n" });
  assert.equal(segments[1].kind, "report");
  assert.deepEqual(segments[2], { kind: "markdown", content: "\n\nNext step." });
});

test("parseReportMessageContent accepts json-render fences", () => {
  const content = `Rendered.\n\n\`\`\`json-render\n${JSON.stringify(spec)}\n\`\`\``;
  const segments = parseReportMessageContent(content);

  assert.equal(segments.length, 2);
  assert.deepEqual(segments[0], { kind: "markdown", content: "Rendered.\n\n" });
  assert.equal(segments[1].kind, "report");
});

test("parseReportSpec accepts component tree specs and normalizes chart props", () => {
  const parsed = parseReportSpec(JSON.stringify({
    component: "Card",
    props: {
      title: "Doanh số giải ngân Cash Loan - CAKE",
      subTitle: "Biến động tổng tiền giải ngân (VND) theo tuần",
    },
    children: [
      {
        component: "BarChart",
        props: {
          data: [
            { week: "26/02", principal: 18504000000, loans: 1542 },
            { week: "04/03", principal: 22450000000, loans: 1820 },
          ],
          xAxis: { dataKey: "week" },
          series: [
            {
              dataKey: "principal",
              name: "Tổng tiền giải ngân (VND)",
            },
          ],
        },
      },
    ],
  }));

  assert.equal(parsed?.root, "root");
  assert.equal(parsed?.elements.root.type, "Card");
  assert.equal(parsed?.elements.root.props.description, "Biến động tổng tiền giải ngân (VND) theo tuần");

  const chartId = parsed?.elements.root.children[0];
  assert.ok(chartId);
  const chart = parsed?.elements[chartId];
  assert.equal(chart?.type, "BarChart");
  assert.equal(chart?.props.title, "Tổng tiền giải ngân (VND)");
  assert.deepEqual(chart?.props.data, [
    { label: "26/02", value: 18504000000 },
    { label: "04/03", value: 22450000000 },
  ]);
});

test("parseReportSpec preserves string children in compact tree specs", () => {
  const parsed = parseReportSpec(JSON.stringify({
    type: "Grid",
    props: { columns: 1, gap: 4 },
    children: [
      {
        type: "Callout",
        props: {
          title: "Đánh giá điểm Drop-off chính",
          icon: "AlertTriangle",
          color: "amber",
        },
        children: "1. Bước từ 'Mở App' -> 'Gửi hồ sơ eKYC' rớt nhiều nhất.\n2. Bước từ 'Gửi eKYC' -> 'Phê duyệt' chỉ đạt 40%.",
      },
    ],
  }));

  const calloutId = parsed?.elements.root.children[0];
  assert.ok(calloutId);
  assert.equal(parsed?.elements[calloutId].type, "Callout");
  assert.equal(parsed?.elements[calloutId].props.tone, "warning");

  const textId = parsed?.elements[calloutId].children[0];
  assert.ok(textId);
  assert.equal(parsed?.elements[textId].type, "Text");
  assert.equal(
    parsed?.elements[textId].props.content,
    "1. Bước từ 'Mở App' -> 'Gửi hồ sơ eKYC' rớt nhiều nhất.\n2. Bước từ 'Gửi eKYC' -> 'Phê duyệt' chỉ đạt 40%."
  );
});

test("parseReportSpec normalizes upstream graph aliases", () => {
  const parsed = parseReportSpec(JSON.stringify({
    component: "LineGraph",
    props: {
      data: [
        { day: "Mon", rate: 41.2 },
        { day: "Tue", rate: 43.8 },
      ],
      xAxis: { dataKey: "day" },
      series: [{ dataKey: "rate", name: "Conversion rate" }],
    },
  }));

  assert.equal(parsed?.elements.root.type, "LineGraph");
  assert.equal(parsed?.elements.root.props.title, "Conversion rate");
  assert.deepEqual(parsed?.elements.root.props.data, [
    { label: "Mon", value: 41.2 },
    { label: "Tue", value: 43.8 },
  ]);
});

test("parseReportSpec normalizes bklit chart aliases", () => {
  const aliases = [
    ["area-chart", "AreaChart"],
    ["candlestick", "CandlestickChart"],
    ["choropleth-chart", "ChoroplethChart"],
    ["composed", "ComposedChart"],
    ["funnel-chart", "FunnelChart"],
    ["gauge-chart", "GaugeChart"],
    ["heatmap", "HeatmapChart"],
    ["histogram", "HistogramChart"],
    ["live-line-chart", "LiveLineChart"],
    ["pie", "PieChart"],
    ["profit-loss-line", "ProfitLossLine"],
    ["radar", "RadarChart"],
    ["ring-chart", "RingChart"],
    ["sankey", "SankeyChart"],
    ["scatter-chart", "ScatterChart"],
    ["waterfall", "WaterfallChart"],
  ] as const;

  for (const [alias, expected] of aliases) {
    const parsed = parseReportSpec(JSON.stringify({
      type: alias,
      data: [{ label: "A", value: 10 }],
    }));

    assert.equal(parsed?.elements.root.type, expected);
  }
});

test("parseReportSpec normalizes generic chart type aliases", () => {
  const parsed = parseReportSpec(JSON.stringify({
    type: "chart",
    props: {
      type: "funnel",
      data: [
        { stage: "Visitors", count: 1200 },
        { stage: "Qualified", count: 420 },
      ],
      xAxisKey: "stage",
      series: [{ dataKey: "count", name: "Pipeline" }],
    },
  }));

  assert.equal(parsed?.elements.root.type, "FunnelChart");
  assert.equal(parsed?.elements.root.props.title, "Pipeline");
  assert.deepEqual(parsed?.elements.root.props.data, [
    { label: "Visitors", value: 1200 },
    { label: "Qualified", value: 420 },
  ]);
});

test("parseReportSpec normalizes data-query chart intent aliases", () => {
  const aliases = [
    ["distribution", "HistogramChart"],
    ["delta", "WaterfallChart"],
    ["contribution", "WaterfallChart"],
    ["comparison", "BarChart"],
    ["time-series", "LineChart"],
    ["trend", "LineChart"],
  ] as const;

  for (const [alias, expected] of aliases) {
    const parsed = parseReportSpec(JSON.stringify({
      type: "chart",
      props: {
        type: alias,
        data: [
          { label: "A", value: 10 },
          { label: "B", value: 20 },
        ],
      },
    }));

    assert.equal(parsed?.elements.root.type, expected);
  }
});

test("parseReportSpec accepts lower-case json-render chart trees", () => {
  const parsed = parseReportSpec(JSON.stringify({
    type: "container",
    direction: "vertical",
    children: [
      {
        type: "card",
        title: "Giải ngân CAKE hàng tuần (Q1/2026)",
        content: "Tổng giá trị tiền giải ngân qua đối tác CAKE",
        children: [
          {
            type: "chart",
            props: {
              type: "bar",
              xAxisKey: "week",
              series: [
                { dataKey: "volume_vnd", name: "Giá trị giải ngân (VNĐ)", color: "blue" },
              ],
              data: [
                { week: "29 Dec", volume_vnd: 2130000000, loans: 142 },
                { week: "05 Jan", volume_vnd: 3225000000, loans: 215 },
              ],
            },
          },
        ],
      },
    ],
  }));

  assert.equal(parsed?.elements.root.type, "Stack");
  assert.equal(parsed?.elements.root.props.direction, "vertical");

  const cardId = parsed?.elements.root.children[0];
  assert.ok(cardId);
  const card = parsed?.elements[cardId];
  assert.equal(card?.type, "Card");
  assert.equal(card?.props.title, "Giải ngân CAKE hàng tuần (Q1/2026)");
  assert.equal(card?.props.description, "Tổng giá trị tiền giải ngân qua đối tác CAKE");

  const chartId = card?.children[0];
  assert.ok(chartId);
  const chart = parsed?.elements[chartId];
  assert.equal(chart?.type, "BarChart");
  assert.equal(chart?.props.title, "Giá trị giải ngân (VNĐ)");
  assert.deepEqual(chart?.props.data, [
    { label: "29 Dec", value: 2130000000 },
    { label: "05 Jan", value: 3225000000 },
  ]);
});

test("parseReportSpec normalizes loan check shorthand aliases", () => {
  const parsed = parseReportSpec(JSON.stringify({
    type: "Card",
    title: "Kết quả check tự động - Mã hồ sơ: 20260610-08022fa7...",
    badges: [
      {
        text: "Status 6 - Chờ giải ngân",
        color: "yellow",
      },
    ],
    children: [
      {
        type: "Grid",
        columns: 2,
        items: [
          { label: "ZaloPay ID", value: "260608000000032" },
          { label: "Đối tác", value: "TNEX" },
          { label: "Số tiền vay", value: "15,000,000đ" },
          { label: "Kỳ hạn", value: "9 tháng" },
        ],
      },
      {
        type: "Steps",
        items: [
          { title: "Tạo hồ sơ", status: "completed", description: "10/06 - 09:44" },
          { title: "Phê duyệt", status: "completed", description: "10/06 - 09:59" },
          { title: "Ký hợp đồng", status: "completed", description: "10/06 - 10:01" },
          { title: "Giải ngân khoản vay", status: "in-progress", description: "Đang đợi phản hồi từ TNEX" },
        ],
      },
      {
        type: "Callout",
        variant: "warning",
        title: "Nhắc nhở nhẹ",
        content: "Giao dịch chưa có biến động mới.",
      },
    ],
  }));

  assert.equal(parsed?.elements.root.type, "Card");
  assert.deepEqual(parsed?.elements.root.props.badges, [
    { text: "Status 6 - Chờ giải ngân", color: "yellow", label: "Status 6 - Chờ giải ngân", tone: "warning" },
  ]);

  const [gridId, stepsId, calloutId] = parsed?.elements.root.children ?? [];
  assert.ok(gridId);
  assert.equal(parsed?.elements[gridId].type, "Grid");
  assert.equal(parsed?.elements[gridId].props.columns, "2");

  assert.ok(stepsId);
  const stepItems = parsed?.elements[stepsId].props.items as Array<Record<string, unknown>>;
  assert.equal(stepItems[0].status, "done");
  assert.equal(stepItems[0].detail, "10/06 - 09:44");
  assert.equal(stepItems[3].status, "active");
  assert.equal(stepItems[3].detail, "Đang đợi phản hồi từ TNEX");

  assert.ok(calloutId);
  assert.equal(parsed?.elements[calloutId].type, "Callout");
  assert.equal(parsed?.elements[calloutId].props.tone, "warning");
});

test("report component normalizers support Comark chart aliases", () => {
  const type = normalizeReportComponentType("Chart", { type: "bar" });
  const props = normalizeReportProps(type, {
    data: [
      { week: "29 Dec", volume_vnd: 2130000000, loans: 142 },
      { week: "05 Jan", volume_vnd: 3225000000, loans: 215 },
    ],
    xAxisKey: "week",
    series: [
      { dataKey: "volume_vnd", name: "Giá trị giải ngân (VNĐ)" },
    ],
  });

  assert.equal(type, "BarChart");
  assert.equal(props.title, "Giá trị giải ngân (VNĐ)");
  assert.deepEqual(props.data, [
    { label: "29 Dec", value: 2130000000 },
    { label: "05 Jan", value: 3225000000 },
  ]);
});

test("parseReportSpec preserves grouped BarChart data from Bklit-style bars", () => {
  const parsed = parseReportSpec(JSON.stringify({
    type: "BarChart",
    props: {
      title: "Doanh số giải ngân theo tuần (Tỷ VNĐ)",
      data: [
        { week: "03/07/2023", EASYCREDIT: 1.25, FECREDIT: 3.45, SHBFINANCE: 0.85 },
        { week: "10/07/2023", EASYCREDIT: 1.32, FECREDIT: 3.60, SHBFINANCE: 0.91 },
      ],
      xAxisKey: "week",
      bars: [
        { dataKey: "FECREDIT", name: "FE Credit", fill: "#3b82f6" },
        { dataKey: "EASYCREDIT", name: "Easy Credit", fill: "#10b981" },
        { dataKey: "SHBFINANCE", name: "SHB Finance", fill: "#f59e0b" },
      ],
      yAxisFormat: "number",
    },
  }));

  assert.equal(parsed?.elements.root.type, "BarChart");
  assert.equal(parsed?.elements.root.props.xDataKey, "week");
  assert.deepEqual(parsed?.elements.root.props.series, [
    { dataKey: "FECREDIT", name: "FE Credit", fill: "#3b82f6" },
    { dataKey: "EASYCREDIT", name: "Easy Credit", fill: "#10b981" },
    { dataKey: "SHBFINANCE", name: "SHB Finance", fill: "#f59e0b" },
  ]);
  assert.deepEqual(parsed?.elements.root.props.data, [
    { week: "03/07/2023", EASYCREDIT: 1.25, FECREDIT: 3.45, SHBFINANCE: 0.85 },
    { week: "10/07/2023", EASYCREDIT: 1.32, FECREDIT: 3.60, SHBFINANCE: 0.91 },
  ]);
});

test("parseReportSpec uses yKeys order for legacy multi-series BarChart data", () => {
  const parsed = parseReportSpec(JSON.stringify({
    type: "BarChart",
    data: [
      {
        disburse_week: "2023-10-02",
        EASY_CREDIT: 12500000000,
        FE_CREDIT: 28400000000,
        SHB_FINANCE: 0,
      },
      {
        disburse_week: "2023-10-09",
        EASY_CREDIT: 14200000000,
        FE_CREDIT: 31000000000,
        SHB_FINANCE: 8500000000,
      },
    ],
    xKey: "disburse_week",
    yKeys: ["FE_CREDIT", "EASY_CREDIT", "SHB_FINANCE"],
    stacked: true,
  }));

  const chart = parsed?.elements.root;
  assert.equal(chart?.type, "BarChart");
  assert.equal(chart?.props.xDataKey, "disburse_week");
  assert.equal(chart?.props.title, undefined);
  assert.deepEqual(chart?.props.series, [
    { dataKey: "FE_CREDIT", name: "FE_CREDIT" },
    { dataKey: "EASY_CREDIT", name: "EASY_CREDIT" },
    { dataKey: "SHB_FINANCE", name: "SHB_FINANCE" },
  ]);
});

test("parseReportSpec infers LineChart series from multi-column numeric data", () => {
  const parsed = parseReportSpec(JSON.stringify({
    root: "partner-error-report",
    elements: {
      "partner-error-report": {
        type: "Stack",
        props: { direction: "vertical", gap: "md" },
        children: ["chart"],
      },
      chart: {
        type: "LineChart",
        props: {
          title: "Tỉ lệ lỗi (%) theo tuần",
          data: [
            {
              label: "2023-10-09",
              FE_CREDIT: 1.70,
              SHB_FINANCE: 0,
              EASY_CREDIT: 1.54,
              LOTE_FINANCE: 0,
            },
            {
              label: "2023-10-16",
              FE_CREDIT: 1.95,
              SHB_FINANCE: 1.85,
              EASY_CREDIT: 1.02,
              LOTE_FINANCE: 0.94,
            },
          ],
        },
        children: [],
      },
    },
  }));

  const chart = parsed?.elements.chart;
  assert.equal(chart?.type, "LineChart");
  assert.equal(chart?.props.xDataKey, "label");
  assert.deepEqual(chart?.props.series, [
    { dataKey: "FE_CREDIT", name: "FE_CREDIT" },
    { dataKey: "SHB_FINANCE", name: "SHB_FINANCE" },
    { dataKey: "EASY_CREDIT", name: "EASY_CREDIT" },
    { dataKey: "LOTE_FINANCE", name: "LOTE_FINANCE" },
  ]);
  assert.deepEqual(chart?.props.data, [
    {
      label: "2023-10-09",
      FE_CREDIT: 1.70,
      SHB_FINANCE: 0,
      EASY_CREDIT: 1.54,
      LOTE_FINANCE: 0,
    },
    {
      label: "2023-10-16",
      FE_CREDIT: 1.95,
      SHB_FINANCE: 1.85,
      EASY_CREDIT: 1.02,
      LOTE_FINANCE: 0.94,
    },
  ]);
});

test("parseReportSpec supports Tremor-style LineChart index and categories", () => {
  const parsed = parseReportSpec(JSON.stringify({
    type: "LineChart",
    props: {
      data: [
        {
          txn_week: "2023-07-03",
          EASYCREDIT: 450000000,
          FE_CREDIT: 620000000,
          LOTE_FINANCE: 0,
        },
        {
          txn_week: "2023-07-10",
          EASYCREDIT: 380000000,
          FE_CREDIT: 510000000,
          LOTE_FINANCE: 120000000,
        },
      ],
      index: "txn_week",
      categories: ["EASYCREDIT", "FE_CREDIT", "LOTE_FINANCE"],
      colors: ["blue", "emerald", "orange"],
    },
  }));

  const chart = parsed?.elements.root;
  assert.equal(chart?.type, "LineChart");
  assert.equal(chart?.props.xDataKey, "txn_week");
  assert.deepEqual(chart?.props.series, [
    { dataKey: "EASYCREDIT", name: "EASYCREDIT", color: "blue", fill: "blue" },
    { dataKey: "FE_CREDIT", name: "FE_CREDIT", color: "emerald", fill: "emerald" },
    { dataKey: "LOTE_FINANCE", name: "LOTE_FINANCE", color: "orange", fill: "orange" },
  ]);
  assert.deepEqual(chart?.props.data, [
    {
      txn_week: "2023-07-03",
      EASYCREDIT: 450000000,
      FE_CREDIT: 620000000,
      LOTE_FINANCE: 0,
    },
    {
      txn_week: "2023-07-10",
      EASYCREDIT: 380000000,
      FE_CREDIT: 510000000,
      LOTE_FINANCE: 120000000,
    },
  ]);
});

test("normalizeReportSpecForComark emits full json-render specs", () => {
  const normalized = normalizeReportSpecForComark(JSON.stringify({
    component: "Card",
    props: { title: "Demo", subTitle: "Subtitle" },
    children: ["Body"],
  }));

  assert.ok(normalized);
  const parsed = JSON.parse(normalized);
  assert.equal(parsed.root, "root");
  assert.equal(parsed.elements.root.type, "Card");
  assert.equal(parsed.elements.root.props.description, "Subtitle");
  assert.equal(parsed.elements.node_1.type, "Text");
  assert.equal(parsed.elements.node_1.props.content, "Body");
});

test("parseHtmlMessageContent leaves json-render fences for Comark", () => {
  const content = `Before\n\n\`\`\`json-render\n${JSON.stringify(spec)}\n\`\`\`\nAfter`;
  const segments = parseHtmlMessageContent(content);

  assert.equal(segments.length, 1);
  assert.equal(segments[0]?.kind, "markdown");
  assert.equal(segments[0]?.content, content);
});

test("parseHtmlMessageContent extracts chat-html fences only", () => {
  const content = "Before\n```chat-html\n<section>Hi</section>\n```\nAfter";
  const segments = parseHtmlMessageContent(content);

  assert.equal(segments.length, 3);
  assert.deepEqual(segments[0], { kind: "markdown", content: "Before\n" });
  assert.deepEqual(segments[1], { kind: "html", content: "<section>Hi</section>" });
  assert.deepEqual(segments[2], { kind: "markdown", content: "\nAfter" });
});

test("parseHtmlMessageContent hides incomplete streaming chat-html fences", () => {
  const content = "Before\n```chat-html\n<section><style>.x { color: red; }</style>";
  const segments = parseHtmlMessageContent(content);

  assert.equal(segments.length, 2);
  assert.deepEqual(segments[0], { kind: "markdown", content: "Before\n" });
  assert.deepEqual(segments[1], {
    kind: "html",
    content: "<section><style>.x { color: red; }</style>",
  });
});

test("parseHtmlMessageContent accepts streaming chat-html label on next line", () => {
  const content = "Before\n```\nchat-html\n<section>Hi</section>";
  const segments = parseHtmlMessageContent(content);

  assert.equal(segments.length, 2);
  assert.deepEqual(segments[0], { kind: "markdown", content: "Before\n" });
  assert.deepEqual(segments[1], { kind: "html", content: "<section>Hi</section>" });
});

test("htmlToReportSpec promotes loan status HTML to rich report components", () => {
  const html = `
    <section>
      <strong>Loan Approved and Submitted</strong><br />
      <strong>Loan ID:</strong> 20260610-08022fa7-a266-4526-938e-ddb60e5aa15c<br />
      <strong>Zalopay ID:</strong> 260608000000032<br />
      <strong>Partner:</strong> TNEX<br />
      <strong>Status:</strong> 6 (QUERY_DISBURSEMENT)<br />
      <strong>Amount/Term:</strong> 15,000,000 VND / 9 months<br />
      <strong>Score/ZLP Score:</strong> 1<br />
      2026-06-10 09:44:02<br />
      Created<br />
      2026-06-10 10:01:01<br />
      Contract Signed<br />
      <strong>Status:</strong> The loan has successfully passed TNEX onboarding, received approval, and the contract has been signed. It is currently in the QUERY_DISBURSEMENT step waiting for funds to be transferred to the user.
    </section>
  `;

  const spec = htmlToReportSpec(html);

  assert.ok(spec);
  assert.equal(spec.elements.root.type, "LoanStatusCard");
  assert.equal(spec.elements.root.props.title, "Chi tiết Hồ sơ Vay");
  assert.equal(spec.elements.root.props.statusLabel, "IN PROGRESS (Chờ giải ngân: QUERY_DISBURSEMENT)");
  assert.equal(spec.elements.root.props.statusTone, "warning");
  assert.equal(spec.elements.root.props.partner, "TNEX");
  assert.equal(spec.elements.root.props.amount, "15,000,000 VND");
  assert.equal(spec.elements.root.props.term, "9 months");
  assert.equal(Array.isArray(spec.elements.root.props.steps), true);
  assert.match(JSON.stringify(spec.elements.root.props.steps), /Chờ Giải ngân/);
});

test("htmlToReportSpec accepts Vietnamese trace lookup loan card HTML", () => {
  const html = `
    <section>
      <h1>Kết Quả Tra Cứu Trace ID / Hồ Sơ Vay</h1>
      <p>Status 6 - QUERY_DISBURSEMENT</p>
      <p>Loan ID: 20260610-08022fa7-a266-4526-938e-ddb60e5aa15c</p>
      <p>ZaloPay ID: 260608000000032</p>
      <p>Đối tác (Partner): TNEX</p>
      <p>Mã hợp đồng: 0101.02.0000022518</p>
      <p>Số tiền duyệt: 15,000,000 VND</p>
      <p>Kỳ hạn: 9 tháng</p>
      <p>✓</p>
      <p>Tạo hồ sơ</p>
      <p>2026-06-10 09:44:02 UTC</p>
      <p>✓</p>
      <p>Phê duyệt hồ sơ</p>
      <p>2026-06-10 09:59:58 UTC</p>
      <p>✓</p>
      <p>Ký hợp đồng thành công</p>
      <p>2026-06-10 10:01:00 UTC (VerifyOtp)</p>
      <p>...</p>
      <p>Đang chờ giải ngân</p>
      <p>10:01 - Hiện tại</p>
      <p>Hệ thống chuyển sang bước QUERY_DISBURSEMENT để đợi trạng thái giải ngân từ đối tác TNEX.</p>
      <p><strong>Kết luận & Hướng xử lý:</strong> User đã hoàn thành việc tạo hồ sơ và ký hợp đồng thành công với TNEX.</p>
    </section>
  `;

  const spec = htmlToReportSpec(html);

  assert.ok(spec);
  assert.equal(spec.elements.root.type, "LoanStatusCard");
  assert.equal(spec.elements.root.props.statusLabel, "IN PROGRESS (Chờ giải ngân: QUERY_DISBURSEMENT)");
  assert.equal(spec.elements.root.props.partner, "TNEX");
  assert.equal(spec.elements.root.props.amount, "15,000,000 VND");
  assert.equal(spec.elements.root.props.term, "9 tháng");
  assert.equal(spec.elements.root.props.contractId, "0101.02.0000022518");
  assert.match(JSON.stringify(spec.elements.root.props.steps), /Tạo hồ sơ & Pass Rules/);
  assert.match(JSON.stringify(spec.elements.root.props.steps), /TNEX Phê duyệt/);
  assert.match(JSON.stringify(spec.elements.root.props.steps), /Ký Hợp đồng/);
  assert.match(JSON.stringify(spec.elements.root.props.steps), /Chờ Giải ngân/);
});

test("htmlToReportSpec converts unrelated HTML to report components", () => {
  const spec = htmlToReportSpec("<section><h1>Plain HTML</h1><p>No loan fields.</p></section>");

  assert.equal(spec.elements.root.type, "Stack");
  assert.equal(spec.elements.node_1.type, "Heading");
  assert.equal(spec.elements.node_1.props.text, "Plain HTML");
  assert.equal(spec.elements.node_2.type, "Text");
  assert.equal(spec.elements.node_2.props.content, "No loan fields.");
});

test("htmlToReportSpec converts HTML tables to report tables", () => {
  const spec = htmlToReportSpec(`
    <table>
      <tr><th>Name</th><th>Status</th></tr>
      <tr><td>TNEX</td><td>QUERY_DISBURSEMENT</td></tr>
    </table>
  `);

  assert.equal(spec.elements.root.type, "Stack");
  assert.equal(spec.elements.node_1.type, "Table");
  assert.deepEqual(spec.elements.node_1.props.columns, ["Name", "Status"]);
  assert.deepEqual(spec.elements.node_1.props.rows, [["TNEX", "QUERY_DISBURSEMENT"]]);
});

test("parseReportMessageContent leaves invalid spec fences as markdown", () => {
  const content = "Before\n```spec\nnot json\n```\nAfter";
  const segments = parseReportMessageContent(content);

  assert.equal(segments.length, 1);
  assert.equal(segments[0]?.kind, "markdown");
  assert.equal(segments[0]?.content, content);
});
