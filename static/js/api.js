/**
 * ApiService — all backend calls for the SCADA dashboard.
 * Assumes the FastAPI server is running on the same origin.
 *
 * FIX 1: Removed stray fetchKPIData() debug call that was firing before
 *         ApiService was defined, potentially halting JS execution.
 * FIX 2: Added verbose error logging — HTTP status + FastAPI detail body
 *         are now printed so you can see *why* a call failed.
 * FIX 3: Trailing-slash normalisation on all paths to avoid FastAPI 307
 *         redirects that fetch() silently fails to follow in some browsers.
 */

console.log("[api.js] ApiService loaded");

const ApiService = (() => {

  // Same-origin by default.
  // If running frontend separately from backend, change to:
  //   const BASE = "http://localhost:8000";
  const BASE = "";

  async function _get(path) {
    let res;
    try {
      res = await fetch(BASE + path);
    } catch (networkErr) {
      // Server down, CORS pre-flight blocked, or no network.
      console.error(`[ApiService] ❌ Network error on GET ${path}:`, networkErr);
      throw new Error(`Network error on ${path}: ${networkErr.message}`);
    }

    if (!res.ok) {
      // Read FastAPI's error body for a useful message.
      let detail = "";
      try {
        const body = await res.json();
        detail = body.detail ?? JSON.stringify(body);
      } catch (_) {
        detail = await res.text().catch(() => "");
      }
      console.error(`[ApiService] ❌ HTTP ${res.status} on GET ${path}:`, detail);
      throw new Error(`HTTP ${res.status} on ${path}${detail ? " — " + detail : ""}`);
    }

    const data = await res.json();
    console.log(`[ApiService] ✅ GET ${path}`, data);
    return data;
  }

  return {

    /**
     * GET /filters/
     * Expected response:
     * {
     *   substations: ["Sub A", "Sub B"],
     *   feeders_by_substation: { "Sub A": ["FDR_001"], "Sub B": ["FDR_002"] }
     * }
     */
    getFilters() {
      return _get("/filters/");
    },

    /** GET /kpi/?substation=X&feeder=Y&limit=N */
    getKpis(substation, feeder, limit = 96) {
      const p = new URLSearchParams({ limit });
      if (substation) p.set("substation", substation);
      if (feeder)     p.set("feeder", feeder);
      return _get(`/kpi/?${p}`);
    },

    /** GET /data/series?substation=X&feeder=Y&limit=N */
    getChartSeries(substation, feeder, limit = 96) {
      const p = new URLSearchParams({ limit });
      if (substation) p.set("substation", substation);
      if (feeder)     p.set("feeder", feeder);
      return _get(`/data/series?${p}`);
    },

    /** GET /spikes/?spike_type=all&substation=X&feeder=Y */
    getSpikes(substation, feeder, spikeType = "all") {
      const p = new URLSearchParams({ spike_type: spikeType });
      if (substation) p.set("substation", substation);
      if (feeder)     p.set("feeder", feeder);
      return _get(`/spikes/?${p}`);
    },
  };

})(); 