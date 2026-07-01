/**
 * ui.js — Dashboard init, filter controls, KPI rendering.
 *
 * NEW BEHAVIOUR:
 *   • On load the map shows ALL substations as clickable markers.
 *   • Charts stay hidden behind a hint until a location is chosen.
 *   • Clicking a marker (or picking the dropdown) reveals + loads that
 *     substation's KPIs and charts.
 *   • updateDashboard() pans the map via focusSubstation() instead of
 *     rebuilding it, so the overview markers survive.
 */

document.addEventListener("DOMContentLoaded", async () => {

  const substationSelect = document.getElementById("substationSelect");
  const feederPills      = document.getElementById("feederPills");
  let currentFilters = { substation: null, feeder: null };
  let _cachedFilters = null;

  /* ── Show / hide the chart sections ───────────────────────────────────── */
  const chartSections = () =>
    document.querySelectorAll(".section-header, .chart-grid, .full-chart");
  function hideCharts()   { chartSections().forEach(el => el.style.display = "none"); }
  function revealCharts() { chartSections().forEach(el => el.style.display = ""); }

  function showHint() {
    if (document.querySelector(".select-hint")) return;
    const h = document.createElement("div");
    h.className = "select-hint";
    h.style.cssText = [
      "color: var(--text-mut)",
      "background: var(--bg-tile)",
      "border: 1px dashed var(--border)",
      "padding: 14px 18px",
      "margin: 0 0 16px",
      "border-radius: 8px",
      "font-family: 'IBM Plex Mono', monospace",
      "font-size: 12px",
      "letter-spacing: .04em",
    ].join(";");
    h.textContent = "◉  Select a substation on the map (or from the dropdown) to load its analytics.";
    document.querySelector(".main").prepend(h);
  }
  function clearHint() { document.querySelectorAll(".select-hint").forEach(e => e.remove()); }

  /* ── Helpers ──────────────────────────────────────────────────────────── */
  function setKpiLoading() {
    document.querySelectorAll(".tile-value").forEach(el => {
      el.textContent = "…";
      el.classList.add("loading");
    });
  }

  function setVal(id, value, suffix = "") {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove("loading");
    if (value == null || value === "") { el.textContent = "—"; return; }
    if (typeof value === "number") {
      el.textContent = (Number.isInteger(value) ? value : value.toFixed(1)) + suffix;
    } else {
      el.textContent = value + suffix;
    }
  }

  function showBanner(msg) {
    document.querySelectorAll(".api-error-banner").forEach(b => b.remove());
    const banner = document.createElement("div");
    banner.className = "api-error-banner";
    banner.style.cssText = [
      "color: #f2564d",
      "background: rgba(242,86,77,0.08)",
      "border: 1px solid rgba(242,86,77,0.35)",
      "padding: 12px 16px",
      "margin: 12px 0",
      "font-family: 'IBM Plex Mono', monospace",
      "font-size: 12px",
      "border-radius: 4px",
      "white-space: pre-wrap",
    ].join(";");
    banner.textContent = `⚠  ${msg}`;
    document.querySelector(".main").prepend(banner);
  }

  /* ── Load filters (once) ──────────────────────────────────────────────── */
  async function loadFilters() {
    if (_cachedFilters) return _cachedFilters;

    console.log("[ui] Fetching /filters/...");
    const filters = await ApiService.getFilters();

    if (!filters.substations || !Array.isArray(filters.substations)) {
      throw new Error(
        `/filters/ response missing 'substations' array.\n` +
        `Got: ${JSON.stringify(filters).slice(0, 200)}`
      );
    }
    if (!filters.feeders_by_substation || typeof filters.feeders_by_substation !== "object") {
      throw new Error(
        `/filters/ response missing 'feeders_by_substation' object.\n` +
        `Got: ${JSON.stringify(filters).slice(0, 200)}`
      );
    }

    _cachedFilters = filters;

    // Populate dropdown with a placeholder first (nothing is auto-selected).
    substationSelect.innerHTML = "";
    const ph = document.createElement("option");
    ph.value = "";
    ph.textContent = "— Select substation —";
    ph.disabled = true;
    ph.selected = true;
    substationSelect.appendChild(ph);

    filters.substations.forEach(sub => {
      const opt = document.createElement("option");
      opt.value = sub; opt.textContent = sub;
      substationSelect.appendChild(opt);
    });

    console.log(`[ui] Loaded ${filters.substations.length} substations`);
    return filters;
  }

  /* ── Feeder pills ─────────────────────────────────────────────────────── */
  function renderFeeders(substation, filters) {
    feederPills.innerHTML = "";
    const feeders = (filters.feeders_by_substation[substation] || []);

    const allPill = _pill("All", true, async () => {
      _activatePill(allPill);
      currentFilters.feeder = null;
      await updateDashboard(substation, null);
    });
    feederPills.appendChild(allPill);

    feeders.forEach(feeder => {
      const pill = _pill(feeder, false, async () => {
        _activatePill(pill);
        currentFilters.feeder = feeder;
        await updateDashboard(substation, feeder);
      });
      feederPills.appendChild(pill);
    });

    currentFilters.feeder = null;
    console.log(`[ui] Rendered ${feeders.length} feeder pills for ${substation}`);
  }

  function _pill(label, active, onClick) {
    const el = document.createElement("div");
    el.className = active ? "pill active" : "pill";
    el.textContent = label;
    el.addEventListener("click", onClick);
    return el;
  }
  function _activatePill(target) {
    document.querySelectorAll(".pill").forEach(p => p.classList.remove("active"));
    target.classList.add("active");
  }

  /* ── KPI update ───────────────────────────────────────────────────────── */
  async function updateKpis(substation, feeder, limit = 96) {
    setKpiLoading();
    let k;
    try {
      k = await ApiService.getKpis(substation, feeder, limit);
    } catch (err) {
      console.error("[ui] KPI fetch failed:", err);
      document.querySelectorAll(".tile-value").forEach(el => {
        el.textContent = "ERR";
        el.classList.remove("loading");
        el.style.color = "#f2564d";
      });
      showBanner(`KPI fetch failed: ${err.message}`);
      return;
    }

    // Voltage
    setVal("fvhi", k.fvhi_count,  " surges");
    setVal("fvhd", k.fvhd_total,  " min");
    setVal("fvli", k.fvli_count,  " dips");
    setVal("fvld", k.fvld_total,  " min");
    setVal("fvsm", k.avg_voltage, " V");

    // Current
    setVal("fchi", k.fchi_count,  " surges");
    setVal("fchd", k.fchd_total,  " min");
    setVal("fcli", k.fcli_count,  " dips");
    setVal("fcld", k.fcld_total,  " min");
    setVal("fcsm", k.avg_current, " A");

    // Aggregated
    setVal("avg_feeder_voltage", k.avg_voltage, " V");
    setVal("avg_feeder_current", k.avg_current, " A");
    setVal("max_voltage",        k.max_voltage, " V");
    setVal("max_current",        k.max_current, " A");
    setVal("total_records",      k.total_records);
  }

  /* ── Full refresh ─────────────────────────────────────────────────────── */
  async function updateDashboard(substation, feeder) {
    const limit = 96;
    await Promise.all([
      updateKpis(substation, feeder, limit),
      createCharts(substation, feeder),
    ]);
    focusSubstation(substation);   // pan + panel, keeps overview markers
  }

  /* ── Select a substation (from map click OR dropdown) ─────────────────── */
  async function onSelectSubstation(name) {
    if (!name) return;
    substationSelect.value    = name;
    currentFilters.substation = name;
    currentFilters.feeder     = null;
    clearHint();
    revealCharts();
    renderFeeders(name, _cachedFilters);
    await updateDashboard(name, null);
  }

  /* ── Clock ────────────────────────────────────────────────────────────── */
  function updateClock() {
    const now = new Date();
    document.getElementById("clock").textContent =
      now.toLocaleDateString() + "  " + now.toLocaleTimeString();
  }
  updateClock();
  setInterval(updateClock, 1000);

  /* ── Init ─────────────────────────────────────────────────────────────── */
  try {
    const filters = await loadFilters();
    hideCharts();
    showHint();
    updateMapAll(filters.substations);          // overview of all locations
    setMarkerSelectHandler(onSelectSubstation); // marker click → load charts
  } catch (err) {
    console.error("[ui] Init error:", err);
    showBanner(
      `Initialisation failed: ${err.message}\n\n` +
      `Check:\n` +
      `  1. FastAPI server is running  (uvicorn main:app --reload)\n` +
      `  2. PostgreSQL is reachable    (check database.py credentials)\n` +
      `  3. /filters/ returns { substations: [...], feeders_by_substation: {...} }\n` +
      `  4. Open DevTools → Network tab and check the failed request`
    );
  }

  /* ── Events ───────────────────────────────────────────────────────────── */
  substationSelect.addEventListener("change", e => onSelectSubstation(e.target.value));

  document.getElementById("refreshBtn").addEventListener("click", async () => {
    _cachedFilters = null;
    try {
      const filters = await loadFilters();
      updateMapAll(filters.substations);
      setMarkerSelectHandler(onSelectSubstation);
      if (currentFilters.substation) {
        substationSelect.value = currentFilters.substation;
        renderFeeders(currentFilters.substation, filters);
        clearHint();
        revealCharts();
        await updateDashboard(currentFilters.substation, currentFilters.feeder);
      } else {
        hideCharts();
        showHint();
      }
    } catch (err) {
      showBanner(`Refresh failed: ${err.message}`);
    }
  });

});
