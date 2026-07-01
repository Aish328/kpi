/**
 * charts.js — Real V/I time-series charts with:
 *   • Actual phase values on Y axis, time on X axis
 *   • Static threshold reference lines (HIGH / LOW)
 *   • Anomaly regions shaded via Chart.js plugin
 *   • Tooltip shows value + whether anomaly + episode duration
 *
 * LIGHT-THEME FIX: legend/axis text is now dark ink (readable on the
 * white cards) instead of the near-white colours left over from the
 * dark theme — that's why labels were invisible.
 * GRIDLINES: background grid lines are switched off; axis ticks remain.
 * EXPAND-ON-CLICK: every chart canvas is clickable. Clicking opens a
 * full-screen modal re-rendering the same chart larger, for detailed
 * reading. Click the backdrop, the × button, or press Esc to close.
 */

const _charts = {};
const _chartConfigs = {}; // id -> { type, data, options } for the modal to reuse

const F = "'IBM Plex Mono', monospace";

// ── Colour palette ────────────────────────────────────────────────────────────
const C = {
  // series (kept vivid — still read clearly on white)
  vry:    "#0f9e90",
  vyb:    "#a63fbf",
  vbr:    "#d9762f",
  v_avg:  "#5a9c1f",
  ir:     "#1c78c9",
  iy:     "#c9591c",
  ib:     "#a63fbf",
  i_avg:  "#5a9c1f",

  // anomaly shading + thresholds
  high:   "rgba(168,52,31,0.10)",
  low:    "rgba(28,120,201,0.10)",
  thresh_high: "#a8341f",
  thresh_low:  "#1c78c9",

  // chrome — tuned for the light card surface
  grid:      "rgba(28,26,21,0.06)",  // faint, used only if grid re-enabled
  tick:      "#726c5b",              // axis numbers = --text-mut
  axisTitle: "#4a4536",              // axis titles — darker than ticks
  legend:    "#1c1a15",              // legend labels = --text-pri
};

// ── Anomaly shading plugin ────────────────────────────────────────────────────
const anomalyShadingPlugin = {
  id: "anomalyShading",
  beforeDatasetsDraw(chart) {
    const { ctx, chartArea, scales } = chart;
    if (!chartArea) return;
    const xScale = scales.x;
    const { anomalyFlags, anomalyColor } = chart.options._anomaly || {};
    if (!anomalyFlags || !anomalyFlags.length) return;

    ctx.save();
    ctx.fillStyle = anomalyColor || C.high;

    let inRun = false;
    let runStart = null;

    const drawRect = (startPx, endPx) => {
      ctx.fillRect(
        startPx, chartArea.top,
        endPx - startPx, chartArea.bottom - chartArea.top
      );
    };

    for (let i = 0; i < anomalyFlags.length; i++) {
      const px = xScale.getPixelForValue(i);
      const halfStep = i === 0
        ? 0
        : (px - xScale.getPixelForValue(i - 1)) / 2;

      if (anomalyFlags[i]) {
        if (!inRun) { runStart = px - halfStep; inRun = true; }
      } else {
        if (inRun) { drawRect(runStart, px - halfStep); inRun = false; }
      }
    }
    if (inRun) drawRect(runStart, chartArea.right);
    ctx.restore();
  },
};

Chart.register(anomalyShadingPlugin);

// ── Base chart options ────────────────────────────────────────────────────────
function _baseOpts(yLabel, anomalyFlags, anomalyColor, extraAnnotations) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    interaction: { mode: "index", intersect: false },
    _anomaly: { anomalyFlags, anomalyColor },
    plugins: {
      legend: {
        labels: { color: C.legend, font: { family: F, size: 11 }, boxWidth: 12 },
      },
      tooltip: {
        titleFont: { family: F },
        bodyFont:  { family: F },
        callbacks: {
          afterBody(items) {
            const idx = items[0]?.dataIndex;
            if (idx == null) return [];
            const flags  = anomalyFlags || [];
            const dur    = extraAnnotations?.durations || [];
            const lines  = [];
            if (flags[idx]) {
              lines.push(`⚠ ANOMALY`);
              if (dur[idx]) lines.push(`Episode duration: ${dur[idx]} min`);
            }
            return lines;
          },
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: C.tick,
          font: { size: 10, family: F },
          maxRotation: 45,
          autoSkip: true,
          maxTicksLimit: 10,
        },
        grid: { display: false },
      },
      y: {
        title: { display: true, text: yLabel, color: C.axisTitle, font: { size: 11, family: F, weight: "600" } },
        ticks: { color: C.tick, font: { size: 10, family: F } },
        grid: { display: false },
      },
    },
  };
}

// ── Dataset builder ───────────────────────────────────────────────────────────
function _ds(label, data, color, { fill = false, dashed = false, pointRadius = 1.5 } = {}) {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: color + "22",
    borderWidth: dashed ? 1 : 1.8,
    borderDash: dashed ? [6, 3] : [],
    pointRadius,
    pointHoverRadius: 4,
    tension: 0.25,
    fill,
  };
}

// Flat threshold line dataset
function _threshLine(label, value, count, color) {
  return {
    label,
    data: Array(count).fill(value),
    borderColor: color,
    backgroundColor: "transparent",
    borderWidth: 1.2,
    borderDash: [4, 4],
    pointRadius: 0,
    tension: 0,
  };
}

// ── Destroy + create (also records config + wires click-to-expand) ───────────
function _make(id, datasets, labels, opts) {
  if (_charts[id]) _charts[id].destroy();
  const ctx = document.getElementById(id);
  if (!ctx) return;
  _chartConfigs[id] = { type: "line", data: { labels, datasets }, options: opts };
  _charts[id] = new Chart(ctx, { type: "line", data: { labels, datasets }, options: opts });
  _wireExpand(id);
}

// ── Main entry point ──────────────────────────────────────────────────────────
async function createCharts(substation, feeder) {
  let s;
  try {
    s = await ApiService.getChartSeries(substation, feeder, 96);
  } catch (e) {
    console.error("Chart series error:", e);
    return;
  }

  const lbl = s.categories || [];
  const n   = lbl.length;
  const VH  = s.voltage_high ?? 10.98;
  const VL  = s.voltage_low  ?? 10;
  const IH  = s.current_high ?? 10.98;
  const IL  = s.current_low  ??  10.5;

  // Chart 1: Voltage — FVHI (high surge)
  _make("chart1",
    [
      _ds("VRY", s.vry, C.vry),
      _ds("VYB", s.vyb, C.vyb),
      _ds("VBR", s.vbr, C.vbr),
      _ds("V avg", s.v_avg, C.v_avg, { dashed: true }),
      _threshLine(`High (${VH}V)`, VH, n, C.thresh_high),
    ],
    lbl,
    _baseOpts("Voltage (V)", s.fvhi_flag, C.high, { durations: s.fvhd })
  );

  // Chart 2: FVHD duration bars
  _makeBar("chart2", lbl, s.fvhd, "FVHD (min)", C.thresh_high,
    "High-voltage duration shown per row — non-zero rows = part of a surge episode");

  // Chart 3: Voltage — FVLI (low dip)
  _make("chart3",
    [
      _ds("VRY", s.vry, C.vry),
      _ds("VYB", s.vyb, C.vyb),
      _ds("VBR", s.vbr, C.vbr),
      _ds("V avg", s.v_avg, C.v_avg, { dashed: true }),
      _threshLine(`Low (${VL}V)`, VL, n, C.thresh_low),
    ],
    lbl,
    _baseOpts("Voltage (V)", s.fvli_flag, C.low, { durations: s.fvld })
  );

  // Chart 4: FVLD
  _makeBar("chart4", lbl, s.fvld, "FVLD (min)", C.thresh_low,
    "Low-voltage duration shown per row");

  // Chart 5: Voltage combined
  {
    const both = (s.fvhi_flag || []).map((v, i) => v || (s.fvli_flag || [])[i] || 0);
    _make("chart5",
      [
        _ds("VRY", s.vry, C.vry),
        _ds("VYB", s.vyb, C.vyb),
        _ds("VBR", s.vbr, C.vbr),
        _ds("V avg", s.v_avg, C.v_avg, { dashed: true }),
        _threshLine(`High (${VH}V)`, VH, n, C.thresh_high),
        _threshLine(`Low (${VL}V)`,  VL, n, C.thresh_low),
      ],
      lbl,
      _baseOpts("Voltage (V)", both, C.high)
    );
  }

  // Chart 6: Current — FCHI (high surge)
  _make("chart6",
    [
      _ds("IR", s.ir, C.ir),
      _ds("IY", s.iy, C.iy),
      _ds("IB", s.ib, C.ib),
      _ds("I avg", s.i_avg, C.i_avg, { dashed: true }),
      _threshLine(`High (${IH}A)`, IH, n, C.thresh_high),
    ],
    lbl,
    _baseOpts("Current (A)", s.fchi_flag, C.high, { durations: s.fchd })
  );

  // Chart 7: FCHD
  _makeBar("chart7", lbl, s.fchd, "FCHD (min)", C.thresh_high,
    "High-current duration shown per row");

  // Chart 8: Current — FCLI (low dip)
  _make("chart8",
    [
      _ds("IR", s.ir, C.ir),
      _ds("IY", s.iy, C.iy),
      _ds("IB", s.ib, C.ib),
      _ds("I avg", s.i_avg, C.i_avg, { dashed: true }),
      _threshLine(`Low (${IL}A)`, IL, n, C.thresh_low),
    ],
    lbl,
    _baseOpts("Current (A)", s.fcli_flag, C.low, { durations: s.fcld })
  );

  // Chart 9: FCLD
  _makeBar("chart9", lbl, s.fcld, "FCLD (min)", C.thresh_low,
    "Low-current duration shown per row");

  // Chart 10: Current combined
  {
    const both = (s.fchi_flag || []).map((v, i) => v || (s.fcli_flag || [])[i] || 0);
    _make("chart10",
      [
        _ds("IR", s.ir, C.ir),
        _ds("IY", s.iy, C.iy),
        _ds("IB", s.ib, C.ib),
        _ds("I avg", s.i_avg, C.i_avg, { dashed: true }),
        _threshLine(`High (${IH}A)`, IH, n, C.thresh_high),
        _threshLine(`Low (${IL}A)`,  IL, n, C.thresh_low),
      ],
      lbl,
      _baseOpts("Current (A)", both, C.high)
    );
  }
}

// ── Duration bar chart helper ─────────────────────────────────────────────────
function _makeBar(id, labels, data, label, color, title) {
  const maxVal = Math.max(...(data && data.length ? data : [0]), 10);
  if (_charts[id]) _charts[id].destroy();
  const ctx = document.getElementById(id);
  if (!ctx) return;

  const type = "bar";
  const cfgData = {
    labels,
    datasets: [{
      label,
      data,
      backgroundColor: color + "88",
      borderColor: color,
      borderWidth: 1,
      borderRadius: 2,
    }],
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    plugins: {
      legend: { labels: { color: C.legend, font: { family: F, size: 11 } } },
      tooltip: {
        titleFont: { family: F },
        bodyFont:  { family: F },
        callbacks: {
          label: (item) => {
            const v = item.raw;
            return v > 0 ? `${label}: ${v} min (part of ${v}-min episode)` : "No anomaly";
          },
        },
      },
    },
    scales: {
      x: {
        ticks: { color: C.tick, font: { size: 10, family: F }, maxRotation: 45, autoSkip: true, maxTicksLimit: 10 },
        grid: { display: false },
      },
      y: {
        title: { display: true, text: "Duration (min)", color: C.axisTitle, font: { size: 11, family: F, weight: "600" } },
        ticks: { color: C.tick, font: { size: 10, family: F } },
        grid: { display: false },
        beginAtZero: true,
        suggestedMax: maxVal * 1.15,
      },
    },
  };

  _chartConfigs[id] = { type, data: cfgData, options };
  _charts[id] = new Chart(ctx, { type, data: cfgData, options });
  _wireExpand(id);
}

// ================================================================
// CLICK-TO-EXPAND MODAL
// ================================================================
let _modalChart = null;

function _ensureModal() {
  if (document.getElementById("chartModalOverlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "chartModalOverlay";
  overlay.className = "chart-modal-overlay";
  overlay.innerHTML = `
    <div class="chart-modal" role="dialog" aria-modal="true">
      <div class="chart-modal-header">
        <span class="chart-modal-title" id="chartModalTitle"></span>
        <button class="chart-modal-close" id="chartModalClose" aria-label="Close">✕</button>
      </div>
      <div class="chart-modal-body">
        <canvas id="chartModalCanvas"></canvas>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeChartModal();
  });
  document.getElementById("chartModalClose").addEventListener("click", closeChartModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeChartModal();
  });
}

function openChartModal(id) {
  const cfg = _chartConfigs[id];
  if (!cfg) return;
  _ensureModal();

  const overlay = document.getElementById("chartModalOverlay");
  const titleEl = document.getElementById("chartModalTitle");
  const card = document.getElementById(id)?.closest(".chart-card, .full-chart");
  const titleText = card?.querySelector(".chart-title")?.textContent || "Chart detail";
  titleEl.textContent = titleText;

  overlay.classList.add("open");
  document.body.style.overflow = "hidden";

  if (_modalChart) { _modalChart.destroy(); _modalChart = null; }
  const modalCtx = document.getElementById("chartModalCanvas");

  // Clone options, scale up font sizes slightly for the larger canvas.
  const bigOptions = JSON.parse(JSON.stringify(cfg.options));
  bigOptions._anomaly = cfg.options._anomaly; // functions/arrays lost in JSON clone — restore
  if (bigOptions.plugins?.legend?.labels) bigOptions.plugins.legend.labels.font.size = 13;
  if (bigOptions.scales?.x?.ticks) bigOptions.scales.x.ticks.font.size = 12;
  if (bigOptions.scales?.y?.ticks) bigOptions.scales.y.ticks.font.size = 12;
  if (bigOptions.scales?.y?.title) bigOptions.scales.y.title.font.size = 13;
  // tooltip callbacks are functions — JSON clone drops them, restore from original
  if (cfg.options.plugins?.tooltip?.callbacks) {
    bigOptions.plugins.tooltip.callbacks = cfg.options.plugins.tooltip.callbacks;
  }

  // PERFORMANCE: the modal canvas is much larger than the inline one, and on
  // high-DPI screens Chart.js multiplies that again by devicePixelRatio —
  // meaning every hover redraw (and the anomaly-shading plugin's fillRects)
  // does several times more pixel work than the small chart. Cap the DPR and
  // drop the entrance animation so interaction stays snappy.
  bigOptions.devicePixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  bigOptions.animation = false;
  bigOptions.hover = { ...(bigOptions.hover || {}), animationDuration: 0 };
  bigOptions.responsiveAnimationDuration = 0;

  _modalChart = new Chart(modalCtx, {
    type: cfg.type,
    data: cfg.data,
    options: bigOptions,
  });
}

function closeChartModal() {
  const overlay = document.getElementById("chartModalOverlay");
  if (!overlay) return;
  overlay.classList.remove("open");
  document.body.style.overflow = "";
  if (_modalChart) { _modalChart.destroy(); _modalChart = null; }
}

function _wireExpand(id) {
  const canvas = document.getElementById(id);
  if (!canvas || canvas.dataset.expandWired) return;
  canvas.dataset.expandWired = "1";
  canvas.style.cursor = "zoom-in";
  canvas.addEventListener("click", () => openChartModal(id));
}
