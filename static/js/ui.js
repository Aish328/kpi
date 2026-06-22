/**
 * ui.js — Dashboard initialisation, filter controls, KPI rendering.
 *
 * FIX 1: getFilters() is now called ONCE at startup and the result is
 *         passed into renderFeeders() — no second API call on every
 *         substation change.
 * FIX 2: Error banner now shows the full error message + which endpoint
 *         failed, making backend issues immediately visible.
 * FIX 3: updateKpis() has a try/catch that shows a per-section error
 *         instead of leaving all tiles stuck on "…".
 */

document.addEventListener("DOMContentLoaded", async () => {

  const substationSelect = document.getElementById("substationSelect");
  const feederPills      = document.getElementById("feederPills");
  let currentFilters = { substation: null, feeder: null };
  let _cachedFilters  = null;   // loaded once, reused everywhere

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

  function showBanner(msg, type = "error") {
    // Remove any existing banner first
    document.querySelectorAll(".api-error-banner").forEach(b => b.remove());
    const banner = document.createElement("div");
    banner.className = "api-error-banner";
    banner.style.cssText = [
      "color: #ff5252",
      "background: rgba(255,82,82,0.08)",
      "border: 1px solid rgba(255,82,82,0.35)",
      "padding: 12px 16px",
      "margin: 12px 0",
      "font-family: 'Share Tech Mono', monospace",
      "font-size: 12px",
      "border-radius: 4px",
      "white-space: pre-wrap",
    ].join(";");
    banner.textContent = `⚠  ${msg}`;
    document.querySelector(".main").prepend(banner);
  }

  /* ── Load filters (once) ──────────────────────────────────────────────── */
  async function loadFilters() {
    // Return cached result on subsequent calls
    if (_cachedFilters) return _cachedFilters;

    console.log("[ui] Fetching /filters/...");
    const filters = await ApiService.getFilters();   // throws on error

    // Validate shape — helps catch backend response mismatches early
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

    // Populate substation dropdown
    substationSelect.innerHTML = "";
    filters.substations.forEach(sub => {
      const opt = document.createElement("option");
      opt.value = sub; opt.textContent = sub;
      substationSelect.appendChild(opt);
    });

    if (filters.substations.length > 0) {
      substationSelect.value    = filters.substations[0];
      currentFilters.substation = filters.substations[0];
    }

    console.log(`[ui] Loaded ${filters.substations.length} substations`);
    return filters;
  }

  /* ── Feeder pills ─────────────────────────────────────────────────────── */
  // FIX: accepts filters object instead of re-fetching
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
  async function updateKpis(substation, feeder) {
    setKpiLoading();
    let k;
    try {
      k = await ApiService.getKpis(substation, feeder);
    } catch (err) {
      console.error("[ui] KPI fetch failed:", err);
      document.querySelectorAll(".tile-value").forEach(el => {
        el.textContent = "ERR";
        el.classList.remove("loading");
        el.style.color = "#ff5252";
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
    setVal("avg_feeder_voltage", k.avg_voltage,   " V");
    setVal("avg_feeder_current", k.avg_current,   " A");
    setVal("max_voltage",        k.max_voltage,   " V");
    setVal("max_current",        k.max_current,   " A");
    setVal("total_records",      k.total_records);
  }

  /* ── Full refresh ─────────────────────────────────────────────────────── */
  async function updateDashboard(substation, feeder) {
    await Promise.all([
      updateKpis(substation, feeder),
      createCharts(substation, feeder),
    ]);
    updateMap(substation);
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
    const sub = substationSelect.value;
    renderFeeders(sub, filters);          // uses cached filters, no extra fetch
    await updateDashboard(sub, null);
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
  substationSelect.addEventListener("change", async e => {
    const sub = e.target.value;
    currentFilters.substation = sub;
    currentFilters.feeder     = null;
    renderFeeders(sub, _cachedFilters);   // no extra fetch
    await updateDashboard(sub, null);
  });

  document.getElementById("refreshBtn").addEventListener("click", async () => {
    _cachedFilters = null;   // force re-fetch of filters on manual refresh
    try {
      const filters = await loadFilters();
      renderFeeders(substationSelect.value, filters);
    } catch (err) {
      showBanner(`Refresh failed: ${err.message}`);
      return;
    }
    await updateDashboard(substationSelect.value, currentFilters.feeder);
  });

});