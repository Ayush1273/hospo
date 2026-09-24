import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Layers,
  Loader2,
  Pill,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
  UploadCloud,
  X,
} from "lucide-react";
import {
  LineChart,
  Line,
  Grid,
  XAxis,
  ChartTooltip,
  PieChart,
  PieSlice,
  PieCenter,
  type PieData,
} from "@/components/charts";

// ================================================================
// DATA TYPES
// ================================================================

export interface PredictiveMedicineSummary {
  medicine_name: string;
  medicine_id: string;
  category: string;
  criticality: string;
  record_count: number;
  min_date: string;
  max_date: string;
  total_consumed: number;
  avg_daily_consumed: number;
}

export interface DatasetSummaryResponse {
  filename: string;
  is_default: boolean;
  total_records: number;
  min_date: string;
  max_date: string;
  days_covered: number;
  medicines_count: number;
  medicines: PredictiveMedicineSummary[];
  message: string;
}

export interface DailyForecastPoint {
  date: string;
  day_index: number;
  day_name: string;
  predicted_units: number;
  rolling_7d_avg: number;
}

export interface RecentHistoryPoint {
  date: string;
  consumed_units: number;
}

export interface MonthWiseForecast {
  month_key: string;
  month_label: string;
  total_units: number;
  avg_daily_units: number;
  days_count: number;
  pct_of_total: number;
}

export interface PeakUsageDay {
  date: string;
  units: number;
  day_name: string;
}

export interface PredictDemandResponse {
  medicine_name: string;
  medicine_id: string;
  category: string;
  criticality: string;
  dataset_filename: string;
  historical_days_used: number;
  last_historical_date: string;
  horizon_start: string;
  horizon_end: string;
  total_90d_demand: number;
  avg_daily_demand: number;
  peak_day: PeakUsageDay;
  lowest_day: PeakUsageDay;
  month_wise: MonthWiseForecast[];
  daily_forecast: DailyForecastPoint[];
  recent_history: RecentHistoryPoint[];
  features_used: number;
  model_name: string;
}

// Module-level caches for instant tab switching
let cachedDatasetSummary: DatasetSummaryResponse | null = null;
let cachedForecastResult: PredictDemandResponse | null = null;
let cachedSelectedMedName: string = "Paracetamol";

export default function PredictiveIntelligenceSection() {
  const [dataset, setDataset] = useState<DatasetSummaryResponse | null>(() => cachedDatasetSummary);
  const [loadingDataset, setLoadingDataset] = useState(() => !cachedDatasetSummary);
  const [uploading, setUploading] = useState(false);
  const [selectedMedName, setSelectedMedName] = useState<string>(() => cachedSelectedMedName);
  const [forecast, setForecast] = useState<PredictDemandResponse | null>(() => cachedForecastResult);
  const [predicting, setPredicting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [viewMode, setViewMode] = useState<"forecast_only" | "with_history">("forecast_only");
  const [tablePage, setTablePage] = useState(1);
  const [isDragOver, setIsDragOver] = useState(false);
  const [hoveredMonthIndex, setHoveredMonthIndex] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Load active dataset summary on mount
  useEffect(() => {
    async function loadSummary() {
      try {
        if (!cachedDatasetSummary) setLoadingDataset(true);
        const res = await fetch("/api/pharmacy/dataset-summary");
        if (!res.ok) throw new Error("Failed to load dataset summary");
        const data: DatasetSummaryResponse = await res.json();
        cachedDatasetSummary = data;
        setDataset(data);

        // Default to Paracetamol or first medicine
        if (data.medicines.length > 0 && !selectedMedName) {
          const defaultMed =
            data.medicines.find((m) => m.medicine_name.toLowerCase() === "paracetamol") ||
            data.medicines[0];
          setSelectedMedName(defaultMed.medicine_name);
          cachedSelectedMedName = defaultMed.medicine_name;
        }
      } catch (err: any) {
        console.error(err);
        toast.error("Could not load pharmacy demand dataset metadata.");
      } finally {
        setLoadingDataset(false);
      }
    }
    loadSummary();
  }, []);

  // 2. Automatically run forecast for default medicine if no forecast is cached yet
  useEffect(() => {
    if (dataset && selectedMedName && !forecast && !predicting) {
      handleRunForecast(selectedMedName);
    }
  }, [dataset]);

  // Handle file upload
  const handleFileUpload = async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["xlsx", "xls", "csv", "txt"].includes(ext)) {
      toast.error("Please upload an Excel (.xlsx/.xls) or CSV file.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      setUploading(true);
      toast.info(`Uploading and validating ${file.name}…`);
      const res = await fetch("/api/pharmacy/upload-dataset", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail || "Failed to parse uploaded dataset");
      }

      const summaryData: DatasetSummaryResponse = await res.json();
      cachedDatasetSummary = summaryData;
      setDataset(summaryData);
      toast.success(
        `Successfully loaded ${summaryData.total_records.toLocaleString()} records across ${summaryData.medicines_count} medicines!`
      );

      // Select first medicine in new dataset and trigger forecast
      if (summaryData.medicines.length > 0) {
        const firstMed = summaryData.medicines[0].medicine_name;
        setSelectedMedName(firstMed);
        cachedSelectedMedName = firstMed;
        handleRunForecast(firstMed);
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to upload dataset.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Handle reset to sample data
  const handleResetToSample = async () => {
    try {
      setUploading(true);
      const res = await fetch("/api/pharmacy/reset-dataset", { method: "POST" });
      if (!res.ok) throw new Error("Failed to reset dataset");
      const summaryData: DatasetSummaryResponse = await res.json();
      cachedDatasetSummary = summaryData;
      setDataset(summaryData);
      toast.success("Reset to baseline training dataset (21,930 records, 30 medicines).");
      const defaultMed =
        summaryData.medicines.find((m) => m.medicine_name.toLowerCase() === "paracetamol") ||
        summaryData.medicines[0];
      setSelectedMedName(defaultMed.medicine_name);
      cachedSelectedMedName = defaultMed.medicine_name;
      handleRunForecast(defaultMed.medicine_name);
    } catch (err: any) {
      console.error(err);
      toast.error("Could not reset dataset.");
    } finally {
      setUploading(false);
    }
  };

  // Handle 90-day forecast generation
  const handleRunForecast = async (medName: string) => {
    if (!medName) return;
    try {
      setPredicting(true);
      const res = await fetch("/api/pharmacy/predict-90d", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ medicine_name: medName, horizon_days: 90 }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail || "Forecasting failed");
      }

      const forecastData: PredictDemandResponse = await res.json();
      cachedForecastResult = forecastData;
      setForecast(forecastData);
      setTablePage(1);
      toast.success(`Generated 90-day ML forecast for ${forecastData.medicine_name}`);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to compute 90-day prediction trajectory.");
    } finally {
      setPredicting(false);
    }
  };

  // Extract categories for filter
  const categories = useMemo(() => {
    if (!dataset?.medicines) return ["ALL"];
    const cats = new Set<string>();
    dataset.medicines.forEach((m) => {
      if (m.category) cats.add(m.category);
    });
    return ["ALL", ...Array.from(cats).sort()];
  }, [dataset]);

  // Filtered medicines list
  const filteredMedicines = useMemo(() => {
    if (!dataset?.medicines) return [];
    return dataset.medicines.filter((m) => {
      const matchesSearch =
        m.medicine_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.medicine_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.category.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCat = categoryFilter === "ALL" || m.category.toLowerCase() === categoryFilter.toLowerCase();
      return matchesSearch && matchesCat;
    });
  }, [dataset, searchQuery, categoryFilter]);

  // Current selected medicine metadata
  const selectedMedMeta = useMemo(() => {
    if (!dataset?.medicines) return null;
    return (
      dataset.medicines.find(
        (m) => m.medicine_name.toLowerCase() === selectedMedName.toLowerCase()
      ) || dataset.medicines[0]
    );
  }, [dataset, selectedMedName]);

  // Chart data formatted for @bklit/line-chart
  const bklitChartData = useMemo(() => {
    if (!forecast) return [];

    if (viewMode === "with_history" && forecast.recent_history.length > 0) {
      return [
        ...forecast.recent_history.map((h) => ({
          date: h.date,
          units: h.consumed_units,
          seriesLabel: "Historical Consumption Units",
        })),
        ...forecast.daily_forecast.map((d) => ({
          date: d.date,
          units: d.predicted_units,
          seriesLabel: "Consumption Units",
        })),
      ];
    }

    return forecast.daily_forecast.map((d) => ({
      date: d.date,
      units: d.predicted_units,
      seriesLabel: "Consumption Units",
    }));
  }, [forecast, viewMode]);

  // Month palette & pie chart data for bklit/pie-chart
  const MONTH_PALETTE = useMemo(
    () => [
      { stroke: "#10b981", bg: "rgba(16, 185, 129, 0.15)", border: "border-emerald-500/40" },
      { stroke: "#06b6d4", bg: "rgba(6, 182, 212, 0.15)", border: "border-cyan-500/40" },
      { stroke: "#8b5cf6", bg: "rgba(139, 92, 246, 0.15)", border: "border-purple-500/40" },
    ],
    []
  );

  const monthWisePieData: PieData[] = useMemo(() => {
    if (!forecast?.month_wise) return [];
    return forecast.month_wise.map((m, idx) => ({
      label: m.month_label,
      value: Math.round(m.total_units),
      color: MONTH_PALETTE[idx % MONTH_PALETTE.length].stroke,
    }));
  }, [forecast, MONTH_PALETTE]);

  // Download CSV
  const handleDownloadCSV = () => {
    if (!forecast) return;
    const headers = ["Day_Index,Date,Day_Name,Medicine_Name,Medicine_ID,Predicted_Units,Rolling_7D_Avg"];
    const rows = forecast.daily_forecast.map(
      (d) =>
        `${d.day_index},"${d.date}","${d.day_name}","${forecast.medicine_name}","${forecast.medicine_id}",${d.predicted_units},${d.rolling_7d_avg}`
    );
    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `${forecast.medicine_name.replace(/\s+/g, "_")}_90day_demand_forecast.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("90-day forecast CSV exported successfully.");
  };

  return (
    <section className="relative z-20 mt-12 scroll-mt-24">
      <div className="bezel-outer">
        <div className="bezel-inner p-6 sm:p-8 space-y-8">
          {/* ============================================================== */}
          {/* PART 2 HEADER */}
          {/* ============================================================== */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-emerald-500/15 gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-teal-500 animate-pulse" />
                <span className="eyebrow mint">Part 2 · Predictive Intelligence</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mt-1">
                90-Day ML Demand Forecasting Pipeline
              </h2>
              <p className="text-sm text-slate-600 dark:text-emerald-200/80 mt-1 max-w-2xl">
                Upload hospital dispensing Excel/CSV data, select target medicine, and execute recursive XGBoost inference across calendar, 10 lag variables, and 7 rolling lookback windows.
              </p>
            </div>
          </div>

          {/* ============================================================== */}
          {/* 1. FILE UPLOAD & DATASET SOURCE MANAGER */}
          {/* ============================================================== */}
          <div className="glass-card p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="eyebrow">1. Operational Consumption Dataset</span>
                <h4 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                  Excel / CSV Data Ingestion
                </h4>
                <p className="text-xs text-slate-500 dark:text-emerald-400/60 mt-0.5">
                  Must include <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-emerald-950/50 font-mono text-emerald-800 dark:text-emerald-300 font-semibold">Date</code>, <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-emerald-950/50 font-mono text-emerald-800 dark:text-emerald-300 font-semibold">Medicine_Name</code> (or <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-emerald-950/50 font-mono text-emerald-800 dark:text-emerald-300 font-semibold">Medicine_ID</code>), and <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-emerald-950/50 font-mono text-emerald-800 dark:text-emerald-300 font-semibold">Consumed_Units</code>.
                </p>
              </div>

              {/* ACTION BUTTONS */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleResetToSample}
                  disabled={uploading}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-300 dark:border-emerald-500/30 bg-slate-50 hover:bg-slate-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-slate-700 dark:text-emerald-300 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw size={13} className={uploading ? "animate-spin" : ""} />
                  Reset to Baseline
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {uploading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <UploadCloud size={14} />
                  )}
                  Upload Excel / CSV
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                  }}
                />
              </div>
            </div>

            {/* DRAG AND DROP ZONE */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleFileUpload(file);
              }}
              className={`p-5 rounded-xl border-2 border-dashed transition-all flex flex-col items-center justify-center text-center cursor-pointer ${
                isDragOver
                  ? "border-emerald-500 bg-emerald-500/10"
                  : "border-slate-300/80 dark:border-emerald-500/25 bg-slate-50/50 dark:bg-emerald-950/20 hover:border-emerald-500/50"
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <FileSpreadsheet size={28} className="text-emerald-600 dark:text-emerald-400 mb-2" />
              <p className="text-xs font-semibold text-slate-800 dark:text-white">
                Drag and drop your hospital pharmacy dispensing spreadsheet here, or click to browse
              </p>
              <p className="text-[11px] text-slate-500 dark:text-emerald-300/70 mt-0.5">
                Supports Microsoft Excel (.xlsx, .xls) and CSV datasets with daily or periodic consumption logs
              </p>
            </div>

            {/* ACTIVE DATASET STATUS BADGES */}
            {dataset && (
              <div className="pt-3 border-t border-emerald-500/10 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-600 dark:text-emerald-400/80">
                    Active Dataset:
                  </span>
                  <span className="px-2.5 py-1 rounded-md font-mono font-bold bg-slate-100 dark:bg-emerald-950/60 text-slate-800 dark:text-emerald-200 border border-slate-200 dark:border-emerald-500/20">
                    {dataset.filename}
                  </span>
                  <span className="px-2.5 py-1 rounded-md font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300">
                    {dataset.total_records.toLocaleString()} rows
                  </span>
                  <span className="px-2.5 py-1 rounded-md font-semibold bg-slate-100 dark:bg-emerald-950/50 text-slate-700 dark:text-emerald-300">
                    {dataset.min_date} → {dataset.max_date} ({dataset.days_covered} days)
                  </span>
                  <span className="px-2.5 py-1 rounded-md font-semibold bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-300">
                    {dataset.medicines_count} medicines indexed
                  </span>
                </div>

                <div className="text-[11px] text-emerald-800 dark:text-emerald-400 font-medium flex items-center gap-1">
                  <CheckCircle2 size={13} className="text-emerald-500" />
                  Validated & Preprocessed
                </div>
              </div>
            )}
          </div>

          {/* ============================================================== */}
          {/* 2. TARGET MEDICINE SELECTOR BAR */}
          {/* ============================================================== */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
              {/* SEARCH */}
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter target medicine (e.g. Paracetamol, Meropenem, Insulin, Vancomycin)…"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 dark:border-emerald-500/25 bg-slate-50 dark:bg-emerald-950/30 text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </div>

              {/* SELECT DROPDOWN */}
              <div className="sm:w-72">
                <select
                  value={selectedMedName}
                  onChange={(e) => {
                    const newMed = e.target.value;
                    setSelectedMedName(newMed);
                    cachedSelectedMedName = newMed;
                    handleRunForecast(newMed);
                  }}
                  disabled={loadingDataset || predicting}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-emerald-500/25 bg-slate-50 dark:bg-emerald-950/40 text-sm font-semibold text-slate-900 dark:text-emerald-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                >
                  {filteredMedicines.map((m) => (
                    <option key={m.medicine_name} value={m.medicine_name}>
                      {m.medicine_name} ({m.medicine_id} · {m.category})
                    </option>
                  ))}
                </select>
              </div>

              {/* TRIGGER PREDICTION BUTTON */}
              <button
                type="button"
                onClick={() => handleRunForecast(selectedMedName)}
                disabled={predicting || !selectedMedName}
                className="px-5 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
              >
                {predicting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Computing 90d Trajectory…</span>
                  </>
                ) : (
                  <>
                    <TrendingUp size={16} />
                    <span>Predict Next 90 Days</span>
                  </>
                )}
              </button>
            </div>

            {/* CATEGORY FILTER PILLS */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              <span className="text-slate-500 dark:text-emerald-400/60 font-semibold mr-1 shrink-0">
                Therapeutic Class:
              </span>
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    categoryFilter === cat
                      ? "bg-teal-600 text-white shadow-sm"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 dark:text-emerald-300"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* ============================================================== */}
          {/* SELECTED MEDICINE ML PROFILE CARD */}
          {/* ============================================================== */}
          {selectedMedMeta && (
            <div className="active-file-card">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center shrink-0 text-teal-600 dark:text-teal-400">
                    <Pill size={26} />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-300 border border-teal-500/30">
                        {selectedMedMeta.category}
                      </span>
                      <span
                        className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider border ${
                          selectedMedMeta.criticality.toUpperCase() === "CRITICAL"
                            ? "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/40"
                            : "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/40"
                        }`}
                      >
                        {selectedMedMeta.criticality}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-emerald-400/60 font-mono font-bold">
                        {selectedMedMeta.medicine_id}
                      </span>
                    </div>
                    <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-1">
                      {selectedMedMeta.medicine_name}
                    </h3>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <div className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-emerald-950/50 border border-slate-300/80 dark:border-emerald-500/25">
                    <span className="text-slate-500 dark:text-emerald-400/70 mr-1.5">Historical Range:</span>
                    <strong className="text-slate-800 dark:text-white">
                      {selectedMedMeta.min_date} → {selectedMedMeta.max_date}
                    </strong>
                  </div>
                  <div className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-emerald-950/50 border border-slate-300/80 dark:border-emerald-500/25">
                    <span className="text-slate-500 dark:text-emerald-400/70 mr-1.5">Historical Baseline:</span>
                    <strong className="text-slate-800 dark:text-white">
                      {selectedMedMeta.avg_daily_consumed.toFixed(1)} units/day
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* LOADING STATE */}
          {/* ============================================================== */}
          {predicting && (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-emerald-300/80">
              <Loader2 size={32} className="animate-spin text-teal-500" />
              <span className="text-sm font-semibold text-slate-800 dark:text-white">
                Running 90-day recursive autoregression for {selectedMedName}…
              </span>
              <p className="text-xs text-slate-500 dark:text-emerald-400/60 max-w-md text-center">
                Computing calendar features, 10 lag series (L1–L90), 7 rolling window statistics (7d–90d), and feeding iterative forward predictions into next-day inputs.
              </p>
            </div>
          )}

          {/* ============================================================== */}
          {/* LOADED PREDICTION RESULTS */}
          {/* ============================================================== */}
          {!predicting && forecast && (
            <div className="space-y-8">
              {/* ========================================================== */}
              {/* 3. 3-MONTH MONTH-WISE CONSUMPTION (DONUT CHART) */}
              {/* ========================================================== */}
              <div className="glass-card p-6 sm:p-7 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-emerald-500/15 gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="eyebrow mint">Part-to-Whole Allocation</span>
                    </div>
                    <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
                      3-Month Month-Wise Consumption Forecast
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-emerald-400/70 mt-0.5">
                      Predicted consumption share across the forward 90-day horizon for {forecast.medicine_name}.
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-500/20">
                      {forecast.horizon_start} → {forecast.horizon_end}
                    </span>
                  </div>
                </div>

                {/* TWO-COLUMN GRID: DONUT CHART ON LEFT, MONTH BREAKDOWN ON RIGHT */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                  {/* LEFT: DONUT CHART */}
                  <div className="lg:col-span-5 flex flex-col items-center justify-center p-6 bg-slate-50/70 dark:bg-emerald-950/30 rounded-2xl border border-slate-200/80 dark:border-emerald-500/15">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-emerald-400/80 mb-2">
                      Monthly Demand Share
                    </div>

                    <div className="w-[260px] h-[260px] flex items-center justify-center my-2 relative">
                      <PieChart
                        data={monthWisePieData}
                        size={260}
                        innerRadius={68}
                        padAngle={0.03}
                        cornerRadius={4}
                        hoveredIndex={hoveredMonthIndex}
                        onHoverChange={setHoveredMonthIndex}
                        hoverOffset={10}
                      >
                        {monthWisePieData.map((slice, idx) => (
                          <PieSlice
                            key={slice.label}
                            index={idx}
                            color={slice.color}
                            showGlow={true}
                            hoverEffect="translate"
                          />
                        ))}
                        <PieCenter
                          defaultLabel="90d Total"
                          suffix=" u"
                        />
                      </PieChart>
                    </div>
                  </div>

                  {/* RIGHT: MONTH DETAIL CARDS + 90-DAY TOTAL STRIP */}
                  <div className="lg:col-span-7 space-y-3.5">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {forecast.month_wise.map((m, idx) => {
                        const pal = MONTH_PALETTE[idx % MONTH_PALETTE.length];
                        const isHovered = hoveredMonthIndex === idx;
                        return (
                          <div
                            key={m.month_key}
                            onMouseEnter={() => setHoveredMonthIndex(idx)}
                            onMouseLeave={() => setHoveredMonthIndex(null)}
                            className={`p-4 rounded-xl border transition-all cursor-pointer ${
                              isHovered
                                ? "bg-white dark:bg-emerald-900/40 shadow-md ring-2"
                                : "bg-slate-50/80 dark:bg-emerald-950/30 hover:bg-white dark:hover:bg-emerald-950/50"
                            } ${pal.border}`}
                            style={isHovered ? { borderColor: pal.stroke, boxShadow: `0 0 0 2px ${pal.stroke}` } : {}}
                          >
                            <div className="flex items-center justify-between text-xs mb-1.5">
                              <span
                                className="px-2 py-0.5 rounded-md font-bold text-[10px] uppercase tracking-wider"
                                style={{ backgroundColor: pal.bg, color: pal.stroke }}
                              >
                                Month {idx + 1}
                              </span>
                              <Calendar size={13} style={{ color: pal.stroke }} />
                            </div>

                            <div className="text-sm font-bold text-slate-800 dark:text-white truncate">
                              {m.month_label}
                            </div>

                            <div className="mt-2">
                              <div className="text-xl font-extrabold text-slate-900 dark:text-white">
                                {Math.round(m.total_units).toLocaleString()}
                                <span className="text-xs font-normal text-slate-500 dark:text-emerald-400/60 ml-1">units</span>
                              </div>
                            </div>

                            <div className="space-y-1 mt-2.5 pt-2 border-t border-slate-200/80 dark:border-emerald-500/15 text-xs text-slate-500 dark:text-emerald-400/70">
                              <div className="flex justify-between">
                                <span>Pace:</span>
                                <strong className="text-slate-800 dark:text-white">{m.avg_daily_units.toFixed(1)} u/d</strong>
                              </div>
                              <div className="flex justify-between">
                                <span>Share:</span>
                                <strong style={{ color: pal.stroke }} className="font-bold">{m.pct_of_total}%</strong>
                              </div>
                              <div className="h-1.5 w-full bg-slate-200 dark:bg-emerald-950/80 rounded-full overflow-hidden mt-1.5">
                                <div
                                  className="h-full rounded-full transition-all duration-300"
                                  style={{
                                    width: `${m.pct_of_total}%`,
                                    backgroundColor: pal.stroke,
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* TOTAL 90-DAY ACCUMULATED DEMAND STRIP */}
                    <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0 text-amber-600 dark:text-amber-400">
                          <Layers size={18} />
                        </div>
                        <div>
                          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                            Cumulative 90-Day Projected Demand
                          </span>
                          <div className="text-lg font-extrabold text-slate-900 dark:text-white">
                            {Math.round(forecast.total_90d_demand).toLocaleString()}{" "}
                            <span className="text-xs font-normal text-slate-500 dark:text-emerald-400/70">total units</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-amber-200/90 sm:border-l sm:border-amber-500/20 sm:pl-4">
                        <div>
                          <span className="text-slate-500 dark:text-amber-400/70 block">Daily Average</span>
                          <strong className="text-slate-800 dark:text-white font-semibold">{forecast.avg_daily_demand.toFixed(1)} u/d</strong>
                        </div>
                        <div>
                          <span className="text-slate-500 dark:text-amber-400/70 block">Peak Usage Day</span>
                          <strong className="text-amber-700 dark:text-amber-300 font-semibold">
                            {forecast.peak_day.units.toFixed(0)}u ({forecast.peak_day.date.slice(5)})
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-500 dark:text-amber-400/70 block">Lowest Day</span>
                          <strong className="text-slate-700 dark:text-white font-semibold">
                            {forecast.lowest_day.units.toFixed(0)}u ({forecast.lowest_day.date.slice(5)})
                          </strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ========================================================== */}
              {/* 4. 90-DAY PREDICTIVE GRAPH */}
              {/* ========================================================== */}
              <div className="glass-card p-6 sm:p-7 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-emerald-500/15 gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="eyebrow mint">Usage Trajectory Graph</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300">
                        Daily ML Curve
                      </span>
                    </div>
                    <h4 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mt-0.5">
                      90-Day Daily Consumption Forecast — {forecast.medicine_name}
                    </h4>
                  </div>

                  {/* CHART CONTROLS */}
                  <div className="flex items-center gap-2">
                    <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-emerald-950/60 border border-slate-200 dark:border-emerald-500/20 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => setViewMode("forecast_only")}
                        className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                          viewMode === "forecast_only"
                            ? "bg-white dark:bg-emerald-800 text-slate-900 dark:text-white shadow-xs font-bold"
                            : "text-slate-600 dark:text-emerald-300 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        90-Day Forecast Only
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode("with_history")}
                        className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                          viewMode === "with_history"
                            ? "bg-white dark:bg-emerald-800 text-slate-900 dark:text-white shadow-xs font-bold"
                            : "text-slate-600 dark:text-emerald-300 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        Include Last 30d History
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleDownloadCSV}
                      className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-emerald-500/30 bg-slate-50 hover:bg-slate-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-slate-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                      title="Download 90-Day Forecast CSV"
                    >
                      <Download size={13} />
                      Export CSV
                    </button>
                  </div>
                </div>

                {/* BKLIT LINE-CHART CONTAINER */}
                {bklitChartData.length > 0 && (
                  <div className="pt-2 space-y-4">
                    <div className="w-full h-80 sm:h-96">
                      <LineChart
                        data={bklitChartData}
                        xDataKey="date"
                        className="w-full h-full"
                      >
                        <Grid horizontal />
                        <Line
                          dataKey="units"
                          stroke="#10b981"
                          strokeWidth={2.5}
                        />
                        <XAxis numTicks={6} />
                        <ChartTooltip
                          rows={(point) => [
                            {
                              color: "#10b981",
                              label: (point.seriesLabel as string) || "Consumption Units",
                              value: `${Number(point.units).toFixed(1)} units`,
                            },
                          ]}
                        />
                      </LineChart>
                    </div>

                    {/* CHART METADATA PILL */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-emerald-500/10 text-xs text-slate-600 dark:text-emerald-300/80">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-emerald-500" />
                        <span className="font-semibold text-slate-700 dark:text-emerald-200">
                          {viewMode === "with_history" ? "Actual History & Forecast Consumption (Units)" : "Predicted Consumption Units"}
                        </span>
                      </div>

                      <span className="text-[11px] text-slate-400 dark:text-emerald-400/60 font-mono">
                        {forecast.features_used} Engineered Input Features
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* ========================================================== */}
              {/* 5. DETAILED DAY-BY-DAY 90-DAY PREDICTION TABLE */}
              {/* ========================================================== */}
              <div className="glass-card p-6 overflow-x-auto space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="eyebrow">Data Inspection</span>
                    <h4 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                      90-Day Step-by-Step Predictive Telemetry Log
                    </h4>
                  </div>

                  {/* PAGINATION / EXPORT */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={tablePage === 1}
                      onClick={() => setTablePage((p) => Math.max(p - 1, 1))}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-emerald-500/30 text-xs font-semibold disabled:opacity-40 cursor-pointer"
                    >
                      Previous 30
                    </button>
                    <span className="text-xs font-semibold px-2 text-slate-600 dark:text-emerald-300">
                      Days {(tablePage - 1) * 30 + 1}–{Math.min(tablePage * 30, 90)} of 90
                    </span>
                    <button
                      type="button"
                      disabled={tablePage === 3}
                      onClick={() => setTablePage((p) => Math.min(p + 1, 3))}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-emerald-500/30 text-xs font-semibold disabled:opacity-40 cursor-pointer"
                    >
                      Next 30
                    </button>
                  </div>
                </div>

                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-emerald-500/20 text-slate-500 dark:text-emerald-400/70">
                      <th className="pb-2.5 font-semibold">Forecast Day</th>
                      <th className="pb-2.5 font-semibold">Date</th>
                      <th className="pb-2.5 font-semibold">Day of Week</th>
                      <th className="pb-2.5 font-semibold">Predicted Consumption</th>
                      <th className="pb-2.5 font-semibold">7-Day Trajectory Mean</th>
                      <th className="pb-2.5 font-semibold">Variance from Mean</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-emerald-500/10">
                    {forecast.daily_forecast
                      .slice((tablePage - 1) * 30, tablePage * 30)
                      .map((d) => {
                        const delta = d.predicted_units - forecast.avg_daily_demand;
                        return (
                          <tr key={d.day_index} className="hover:bg-emerald-500/5 transition-colors">
                            <td className="py-2.5 font-bold text-slate-900 dark:text-white">
                              Day {d.day_index}
                            </td>
                            <td className="py-2.5 font-mono text-slate-700 dark:text-emerald-200">
                              {d.date}
                            </td>
                            <td className="py-2.5 text-slate-600 dark:text-emerald-300/80">
                              {d.day_name}
                            </td>
                            <td className="py-2.5 font-bold text-emerald-700 dark:text-emerald-400 text-sm">
                              {d.predicted_units.toFixed(1)} units
                            </td>
                            <td className="py-2.5 text-teal-700 dark:text-teal-300 font-medium">
                              {d.rolling_7d_avg.toFixed(1)} units/day
                            </td>
                            <td className="py-2.5 font-medium">
                              <span
                                className={
                                  delta >= 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
                                }
                              >
                                {delta >= 0 ? "+" : ""}
                                {delta.toFixed(1)} u
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
