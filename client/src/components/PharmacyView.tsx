import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  Edit2,
  FileSpreadsheet,
  Info,
  Layers,
  Loader2,
  Package,
  Pill,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
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
// TYPES & INTERFACES
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
  // Part 1 Telemetry:
  current_stock: number;
  past_month_total_consumed: number;
  last_month_avg_daily_consumed: number;
  days_of_stock_remaining: number;
  stockout_projected_date: string | null;
  stock_status_signal: string;
  // Part 2 Forecast:
  peak_day: PeakUsageDay;
  lowest_day: PeakUsageDay;
  month_wise: MonthWiseForecast[];
  daily_forecast: DailyForecastPoint[];
  recent_history: RecentHistoryPoint[];
  features_used: number;
  model_name: string;
}

// ================================================================
// THEME-ALIGNED CUSTOM MEDICINE DROPDOWN COMPONENT
// ================================================================

function MedicineDropdown({
  medicines,
  selectedMedicine,
  onSelect,
  disabled,
  onOpenChange,
}: {
  medicines: PredictiveMedicineSummary[];
  selectedMedicine?: PredictiveMedicineSummary;
  onSelect: (medName: string) => void;
  disabled?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const setOpenState = (next: boolean) => {
    setIsOpen(next);
    onOpenChange?.(next);
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenState(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenState(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return medicines;
    const q = search.toLowerCase();
    return medicines.filter(
      (m) =>
        m.medicine_name.toLowerCase().includes(q) ||
        m.medicine_id.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q)
    );
  }, [medicines, search]);

  return (
    <div ref={dropdownRef} className="relative w-full z-50">
      {/* TRIGGER BUTTON */}
      <button
        type="button"
        onClick={() => !disabled && setOpenState(!isOpen)}
        disabled={disabled}
        className={`w-full px-4 py-3 rounded-xl border transition-all text-left flex items-center justify-between gap-3 cursor-pointer ${
          isOpen
            ? "border-emerald-500 ring-2 ring-emerald-500/25 bg-white dark:bg-emerald-950/90 shadow-md"
            : "border-slate-300 dark:border-emerald-500/30 bg-white dark:bg-emerald-950/50 hover:border-emerald-500/50 shadow-xs"
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0 text-emerald-600 dark:text-emerald-400">
            <Pill size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-900 dark:text-white truncate flex items-center gap-2">
              <span>{selectedMedicine?.medicine_name || "Select Medicine"}</span>
              {selectedMedicine && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase tracking-wider bg-slate-100 dark:bg-emerald-900/60 text-slate-600 dark:text-emerald-300 border border-slate-200 dark:border-emerald-500/20">
                  {selectedMedicine.medicine_id}
                </span>
              )}
            </div>
            {selectedMedicine && (
              <div className="text-xs text-slate-500 dark:text-emerald-300/70 truncate flex items-center gap-1.5 mt-0.5">
                <span>{selectedMedicine.category}</span>
                <span>·</span>
                <span
                  className={
                    selectedMedicine.criticality.toUpperCase() === "CRITICAL"
                      ? "text-rose-600 dark:text-rose-400 font-semibold"
                      : "text-amber-600 dark:text-amber-400 font-semibold"
                  }
                >
                  {selectedMedicine.criticality}
                </span>
                <span>·</span>
                <span>{selectedMedicine.record_count} historical records</span>
              </div>
            )}
          </div>
        </div>

        <ChevronDown
          size={18}
          className={`text-slate-400 dark:text-emerald-400 shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-emerald-500" : ""
          }`}
        />
      </button>

      {/* DROPDOWN POPUP */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute left-0 right-0 top-full mt-2 z-[100] rounded-2xl border border-emerald-500/40 bg-white dark:bg-[#0c1813] shadow-2xl p-2.5 space-y-2 overflow-hidden"
            style={{
              boxShadow:
                "0 25px 50px -12px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(16, 185, 129, 0.3)",
            }}
          >
            {/* SEARCH INPUT IF MULTIPLE MEDICINES */}
            {medicines.length > 3 && (
              <div className="relative">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search medicine name, ID, or class..."
                  className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-200 dark:border-emerald-500/25 bg-slate-50 dark:bg-emerald-950/70 text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  autoFocus
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer p-0.5"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}

            {/* OPTIONS LIST */}
            <div className="max-h-72 overflow-y-auto overscroll-contain space-y-1 pr-1">
              {filtered.length === 0 ? (
                <div className="py-5 text-center text-xs text-slate-500 dark:text-emerald-400/60">
                  No matching medicines found for "{search}"
                </div>
              ) : (
                filtered.map((m) => {
                  const isSelected = m.medicine_name === selectedMedicine?.medicine_name;
                  return (
                    <button
                      key={m.medicine_name}
                      type="button"
                      onClick={() => {
                        onSelect(m.medicine_name);
                        setOpenState(false);
                        setSearch("");
                      }}
                      className={`w-full px-3 py-2.5 rounded-xl text-left flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-emerald-500/15 text-emerald-950 dark:text-white font-bold border border-emerald-500/30"
                          : "hover:bg-slate-100 dark:hover:bg-emerald-900/30 text-slate-700 dark:text-emerald-200 border border-transparent"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Pill
                          size={15}
                          className={
                            isSelected
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-slate-400 dark:text-emerald-500/60"
                          }
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {m.medicine_name}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-emerald-400/70 truncate flex items-center gap-1.5">
                            <span>{m.category}</span>
                            <span>·</span>
                            <span className="font-mono">{m.medicine_id}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ${
                            m.criticality.toUpperCase() === "CRITICAL"
                              ? "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/40"
                              : m.criticality.toUpperCase() === "ESSENTIAL"
                              ? "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/40"
                              : "bg-slate-100 text-slate-700 border-slate-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-500/20"
                          }`}
                        >
                          {m.criticality}
                        </span>
                        {isSelected && (
                          <Check size={15} className="text-emerald-600 dark:text-emerald-400" />
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* MEDICINES COUNT FOOTER */}
            <div className="pt-2 px-1 border-t border-slate-200 dark:border-emerald-500/15 flex items-center justify-between text-[11px] text-slate-500 dark:text-emerald-400/70">
              <span>{filtered.length} medicine{filtered.length !== 1 ? "s" : ""} available</span>
              <span>Click to analyze</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ================================================================
// MAIN PHARMACY VIEW COMPONENT
// ================================================================

export default function PharmacyView() {
  const [dataset, setDataset] = useState<DatasetSummaryResponse | null>(null);
  const [loadingDataset, setLoadingDataset] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedMedName, setSelectedMedName] = useState<string>("");
  const [forecast, setForecast] = useState<PredictDemandResponse | null>(null);
  const [predicting, setPredicting] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Stock edit state for Part 1
  const [isEditingStock, setIsEditingStock] = useState(false);
  const [stockInputVal, setStockInputVal] = useState<string>("");

  // Chart view modes
  const [viewMode, setViewMode] = useState<"forecast_only" | "with_history">("forecast_only");
  const [tablePage, setTablePage] = useState(1);
  const [isDragOver, setIsDragOver] = useState(false);
  const [hoveredMonthIndex, setHoveredMonthIndex] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check dataset on mount (does not auto-load default data)
  useEffect(() => {
    async function checkDataset() {
      try {
        setLoadingDataset(true);
        const res = await fetch("/api/pharmacy/dataset-summary");
        if (!res.ok) throw new Error("Failed to check active dataset");
        const data: DatasetSummaryResponse = await res.json();
        setDataset(data);
        if (data.total_records > 0 && data.medicines.length > 0) {
          const defaultMed =
            data.medicines.find((m) => m.medicine_name.toLowerCase() === "paracetamol") ||
            data.medicines[0];
          setSelectedMedName(defaultMed.medicine_name);
          handleRunForecast(defaultMed.medicine_name);
        }
      } catch (err: any) {
        console.error(err);
      } finally {
        setLoadingDataset(false);
      }
    }
    checkDataset();
  }, []);

  // Forecast runner
  const handleRunForecast = async (medName: string, customStock?: number) => {
    if (!medName) return;
    try {
      setPredicting(true);
      const payload: { medicine_name: string; horizon_days: number; current_stock?: number } = {
        medicine_name: medName,
        horizon_days: 90,
      };
      if (customStock !== undefined && customStock >= 0) {
        payload.current_stock = customStock;
      }
      const res = await fetch("/api/pharmacy/predict-90d", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail || "Forecasting failed");
      }

      const forecastData: PredictDemandResponse = await res.json();
      setForecast(forecastData);
      setStockInputVal(forecastData.current_stock.toString());
      setTablePage(1);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to compute 90-day prediction trajectory.");
    } finally {
      setPredicting(false);
    }
  };

  // Upload custom Excel or CSV dataset
  const handleFileUpload = async (file: File) => {
    if (!file) return;
    try {
      setUploading(true);
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/pharmacy/upload-dataset", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail || "Failed to upload file");
      }

      const summaryData: DatasetSummaryResponse = await res.json();
      setDataset(summaryData);
      toast.success(
        `Successfully ingested ${summaryData.total_records.toLocaleString()} records across ${summaryData.medicines_count} medicines!`
      );

      if (summaryData.medicines.length > 0) {
        const firstMed = summaryData.medicines[0].medicine_name;
        setSelectedMedName(firstMed);
        handleRunForecast(firstMed);
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to ingest dataset.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Load sample dataset
  const handleLoadSample = async () => {
    try {
      setUploading(true);
      const res = await fetch("/api/pharmacy/load-sample", { method: "POST" });
      if (!res.ok) throw new Error("Failed to load sample dataset");
      const summaryData: DatasetSummaryResponse = await res.json();
      setDataset(summaryData);
      toast.success("Loaded baseline formulary dataset (21,930 records, 30 medicines).");
      if (summaryData.medicines.length > 0) {
        const defaultMed =
          summaryData.medicines.find((m) => m.medicine_name.toLowerCase() === "paracetamol") ||
          summaryData.medicines[0];
        setSelectedMedName(defaultMed.medicine_name);
        handleRunForecast(defaultMed.medicine_name);
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Could not load sample dataset.");
    } finally {
      setUploading(false);
    }
  };

  // Clear active dataset
  const handleClearDataset = async () => {
    try {
      setUploading(true);
      const res = await fetch("/api/pharmacy/clear-dataset", { method: "POST" });
      if (!res.ok) throw new Error("Failed to clear dataset");
      const summaryData: DatasetSummaryResponse = await res.json();
      setDataset(summaryData);
      setSelectedMedName("");
      setForecast(null);
      setIsEditingStock(false);
      toast.success("Dataset cleared. Please upload an Excel or CSV file to continue.");
    } catch (err: any) {
      console.error(err);
      toast.error("Could not clear dataset.");
    } finally {
      setUploading(false);
    }
  };

  // Apply custom stock update
  const handleApplyCustomStock = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(stockInputVal);
    if (isNaN(val) || val < 0) {
      toast.error("Please enter a valid non-negative number for current stock.");
      return;
    }
    setIsEditingStock(false);
    handleRunForecast(selectedMedName, val);
    toast.success(`Updated current stock to ${val.toLocaleString()} units. Recalculated Days of Stock.`);
  };

  // Export CSV
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

  // Chart data for @bklit/line-chart
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

  // Month palette & pie chart data for @bklit/pie-chart
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

  const hasUploadedData = Boolean(dataset && dataset.total_records > 0 && dataset.medicines.length > 0);

  const selectedMedicineMeta = useMemo(() => {
    if (!dataset?.medicines) return undefined;
    return (
      dataset.medicines.find(
        (m) => m.medicine_name.toLowerCase() === selectedMedName.toLowerCase()
      ) || dataset.medicines[0]
    );
  }, [dataset, selectedMedName]);

  return (
    <div className="max-w-5xl mx-auto space-y-10 sm:space-y-12 pb-24">
      {/* ============================================================== */}
      {/* PAGE HEADER */}
      {/* ============================================================== */}
      <div className="mt-6">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="eyebrow mint">Hospital Pharmacy Intelligence</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
          Medicine Demand & Inventory Forecasting
        </h1>
        <p className="text-sm text-slate-600 dark:text-emerald-200/80 mt-1 max-w-2xl">
          Clinical formulary monitoring, consumption velocity, and 90-day recursive XGBoost demand forecasting.
        </p>
      </div>

      {/* ============================================================== */}
      {/* FIRST BLOCK: EXCEL / CSV DATA INGESTION & MEDICINE FILTER */}
      {/* ============================================================== */}
      <section className={`relative transition-all duration-150 scroll-mt-24 ${isDropdownOpen ? "z-50" : "z-30"}`}>
        <div className="bezel-outer">
          <div className="bezel-inner p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-emerald-500/15 gap-3">
              <div>
                <span className="eyebrow mint">First Block · Operational Data Ingestion</span>
                <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
                  Excel / CSV Data Ingestion
                </h3>
                <p className="text-xs text-slate-500 dark:text-emerald-400/70 mt-0.5">
                  Upload daily dispensing logs to unlock Part 1 Inventory Telemetry and Part 2 90-Day Predictive Forecasting.
                </p>
              </div>

              {/* ACTION BUTTONS (WHEN EMPTY) */}
              {!hasUploadedData && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleLoadSample}
                    disabled={uploading}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-300 dark:border-emerald-500/30 bg-slate-50 hover:bg-slate-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-slate-700 dark:text-emerald-300 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw size={13} className={uploading ? "animate-spin" : ""} />
                    Load Sample Data
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
                </div>
              )}
            </div>

            {/* HIDDEN FILE INPUT */}
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

            {/* VISUAL INDICATOR: IF FILE IS UPLOADED, SHOW PROMINENT ACTIVE DATASET CARD */}
            {hasUploadedData && dataset ? (
              <div className="space-y-5">
                {/* PROMINENT ACTIVE INGESTED DATASET CARD */}
                <div className="p-6 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/35 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
                  
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
                    <div className="flex items-start sm:items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0 text-emerald-600 dark:text-emerald-400 shadow-sm">
                        <FileSpreadsheet size={28} />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            File Uploaded & Active
                          </span>
                          <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-slate-100 dark:bg-emerald-950/60 text-slate-700 dark:text-emerald-200 border border-slate-200 dark:border-emerald-500/20">
                            ✓ {dataset.total_records.toLocaleString()} Records Verified
                          </span>
                          <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-teal-100 dark:bg-teal-950/60 text-teal-800 dark:text-teal-200 border border-teal-500/20">
                            {dataset.medicines_count} Formulary Medicine{dataset.medicines_count > 1 ? "s" : ""}
                          </span>
                        </div>

                        <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white mt-1.5">
                          {dataset.filename}
                        </h3>

                        <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-600 dark:text-emerald-300/80">
                          <span className="flex items-center gap-1">
                            <Calendar size={13} className="text-emerald-500" />
                            Span: <strong>{dataset.min_date}</strong> → <strong>{dataset.max_date}</strong> ({dataset.days_covered} days)
                          </span>
                          <span>·</span>
                          <span className="text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1">
                            <CheckCircle2 size={13} />
                            Ingested & Preprocessed
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* REPLACE / CLEAR ACTIONS */}
                    <div className="flex items-center gap-2.5 shrink-0 self-start md:self-center">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="px-4 py-2.5 rounded-xl text-xs font-bold border border-slate-300 dark:border-emerald-500/30 bg-white hover:bg-slate-50 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-slate-800 dark:text-emerald-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                      >
                        <UploadCloud size={14} className="text-emerald-500" />
                        Upload Different File
                      </button>
                      <button
                        type="button"
                        onClick={handleClearDataset}
                        disabled={uploading}
                        className="px-3.5 py-2.5 rounded-xl text-xs font-semibold border border-rose-300/60 dark:border-rose-800/40 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <X size={14} />
                        Clear
                      </button>
                    </div>
                  </div>
                </div>

                {/* FILTER MEDICINE: THEME-ALIGNED CUSTOM DROPDOWN */}
                <div className="p-5 rounded-2xl bg-slate-50/80 dark:bg-emerald-950/30 border border-slate-200 dark:border-emerald-500/20 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                    <div>
                      <span className="eyebrow mint flex items-center gap-1.5">
                        <Pill size={13} />
                        Select Active Medicine
                      </span>
                      <h4 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                        Target Formulary Medicine Filter
                      </h4>
                    </div>
                    <span className="text-xs text-slate-500 dark:text-emerald-400/70">
                      {dataset.medicines.length} medicine{dataset.medicines.length > 1 ? "s" : ""} available in uploaded dataset
                    </span>
                  </div>

                  {/* CUSTOM ANIMATED THEMED DROPDOWN */}
                  <MedicineDropdown
                    medicines={dataset.medicines}
                    selectedMedicine={selectedMedicineMeta}
                    onSelect={(medName) => {
                      setSelectedMedName(medName);
                      handleRunForecast(medName);
                    }}
                    onOpenChange={setIsDropdownOpen}
                    disabled={predicting}
                  />
                </div>
              </div>
            ) : (
              /* IF NO FILE UPLOADED YET: DISPLAY EMPTY DRAG AND DROP ZONE */
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
                className={`p-8 rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center text-center cursor-pointer ${
                  isDragOver
                    ? "border-emerald-500 bg-emerald-500/10"
                    : "border-slate-300/80 dark:border-emerald-500/25 bg-slate-50/50 dark:bg-emerald-950/20 hover:border-emerald-500/50"
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                <FileSpreadsheet size={36} className="text-emerald-600 dark:text-emerald-400 mb-2" />
                <p className="text-sm sm:text-base font-bold text-slate-800 dark:text-white">
                  Drag and drop your hospital pharmacy Excel or CSV dataset here, or click to browse
                </p>
                <p className="text-xs text-slate-500 dark:text-emerald-300/70 mt-1 max-w-xl">
                  Required columns: <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-emerald-950/60 font-mono text-emerald-800 dark:text-emerald-300 font-semibold">Date</code>, <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-emerald-950/60 font-mono text-emerald-800 dark:text-emerald-300 font-semibold">Medicine_Name</code> (or <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-emerald-950/60 font-mono text-emerald-800 dark:text-emerald-300 font-semibold">Medicine_ID</code>), and <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-emerald-950/60 font-mono text-emerald-800 dark:text-emerald-300 font-semibold">Consumed_Units</code>. Optional: <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-emerald-950/60 font-mono text-emerald-800 dark:text-emerald-300 font-semibold">Current_Stock</code>.
                </p>
              </div>
            )}

            {/* EMPTY STATE HELPER MESSAGE */}
            {!hasUploadedData && !loadingDataset && (
              <div className="py-6 text-center text-slate-500 dark:text-emerald-400/80 space-y-1">
                <p className="text-xs font-medium text-slate-500 dark:text-emerald-300/70">
                  Tip: You can test with your <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-emerald-950/60 font-mono text-emerald-700 dark:text-emerald-300">test.csv</code> file or click "Load Sample Data" above to explore the 30-medicine training dataset.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ============================================================== */}
      {/* LOADING FORECAST STATE */}
      {/* ============================================================== */}
      {predicting && (
        <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-emerald-300/80">
          <Loader2 size={32} className="animate-spin text-emerald-500" />
          <span className="text-sm font-semibold text-slate-800 dark:text-white">
            Computing 90-day predictive trajectory for {selectedMedName}…
          </span>
          <p className="text-xs text-slate-500 dark:text-emerald-400/60 max-w-md text-center">
            Running XGBoost autoregression with calendar features, 10 lag series (L1–L90), and 7 rolling window statistics.
          </p>
        </div>
      )}

      {/* ============================================================== */}
      {/* ONLY AFTER UPLOAD: PART 1 & PART 2 COME HERE */}
      {/* ============================================================== */}
      {!predicting && hasUploadedData && forecast && (
        <>
          {/* ========================================================== */}
          {/* PART 1: FORMULARY TELEMETRY & HISTORICAL USAGE */}
          {/* ========================================================== */}
          <section className="relative z-10 scroll-mt-24">
            <div className="bezel-outer">
              <div className="bezel-inner p-6 sm:p-8 space-y-6">
                {/* PART 1 HEADER */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-emerald-500/15 gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="eyebrow mint">Part 1 · Formulary Telemetry & Historical Usage</span>
                    </div>
                    <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-1">
                      {forecast.medicine_name} — Inventory Telemetry
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-emerald-200/80 mt-0.5">
                      Past month consumption metrics, on-hand storage balance, and forecast-simulated days of stock.
                    </p>
                  </div>

                  {/* ACTIVE MEDICINE BADGES */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-500/30">
                      {forecast.category}
                    </span>
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider border ${
                        forecast.criticality.toUpperCase() === "CRITICAL"
                          ? "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/40"
                          : "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/40"
                      }`}
                    >
                      {forecast.criticality}
                    </span>
                    <span className="text-xs font-mono font-bold px-2 py-1 rounded-md bg-slate-100 dark:bg-emerald-950/50 text-slate-600 dark:text-emerald-300">
                      {forecast.medicine_id}
                    </span>
                  </div>
                </div>

                {/* CORE TELEMETRY METRICS GRID (4 CARDS) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* CARD 1: CURRENT STOCK (GLITCH-FREE WITH SLENDER ADJUST BUTTON) */}
                  <div className="glass-card stat-card mint">
                    <div className="stat-top flex items-center justify-between">
                      <span className="eyebrow">Current Stock</span>
                      <div className="flex items-center gap-2">
                        {!isEditingStock && (
                          <button
                            type="button"
                            onClick={() => setIsEditingStock(true)}
                            className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 border border-emerald-500/20 transition-all flex items-center gap-1 cursor-pointer"
                            title="Adjust current stock count"
                          >
                            <Edit2 size={10} />
                            <span>Adjust</span>
                          </button>
                        )}
                        <Package size={16} className="text-emerald-600 dark:text-emerald-400" />
                      </div>
                    </div>

                    {!isEditingStock ? (
                      <>
                        <div className="stat-value">
                          {forecast.current_stock.toLocaleString()}
                          <small>units</small>
                        </div>
                        <div className="stat-hint">
                          <CheckCircle2 size={13} className="text-emerald-500" />
                          <span>Status: {forecast.stock_status_signal.replace(/_/g, " ")}</span>
                        </div>
                      </>
                    ) : (
                      <form onSubmit={handleApplyCustomStock} className="my-3 space-y-2">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={stockInputVal}
                            onChange={(e) => setStockInputVal(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-emerald-500/50 bg-white dark:bg-emerald-950/90 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                            placeholder="New units..."
                            autoFocus
                          />
                          <button
                            type="submit"
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shrink-0 cursor-pointer shadow-xs"
                          >
                            Set
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsEditingStock(false);
                              setStockInputVal(forecast.current_stock.toString());
                            }}
                            className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-slate-600 dark:text-emerald-300 text-xs font-semibold shrink-0 cursor-pointer border border-slate-200 dark:border-emerald-500/20"
                          >
                            ✕
                          </button>
                        </div>
                      </form>
                    )}
                  </div>

                  {/* CARD 2: PAST MONTH USAGE (WHAT HAS BEEN USED) */}
                  <div className="glass-card stat-card neutral">
                    <div className="stat-top flex items-center justify-between">
                      <span className="eyebrow">Past Month Usage</span>
                      <Clock size={16} />
                    </div>
                    <div className="stat-value">
                      {forecast.past_month_total_consumed.toLocaleString()}
                      <small>units</small>
                    </div>
                    <div className="stat-hint">
                      <Clock size={13} className="text-slate-400" />
                      Total units consumed in last 30 days
                    </div>
                  </div>

                  {/* CARD 3: AVERAGE DAILY USAGE (LAST MONTH) */}
                  <div className="glass-card stat-card neutral">
                    <div className="stat-top flex items-center justify-between">
                      <span className="eyebrow">Average Daily Usage</span>
                      <TrendingUp size={16} />
                    </div>
                    <div className="stat-value">
                      {forecast.last_month_avg_daily_consumed.toFixed(1)}
                      <small>units/day</small>
                    </div>
                    <div className="stat-hint">
                      <TrendingUp size={13} className="text-teal-500" />
                      Average past month consumption pace
                    </div>
                  </div>

                  {/* CARD 4: DAYS OF STOCK (CALCULATED FROM PREDICTED 90-DAY VALUES) */}
                  <div
                    className={`glass-card stat-card ${
                      forecast.days_of_stock_remaining <= 14
                        ? "rose"
                        : forecast.days_of_stock_remaining <= 30
                        ? "orange"
                        : "mint"
                    }`}
                  >
                    <div className="stat-top flex items-center justify-between">
                      <span className="eyebrow">Days of Stock</span>
                      <Calendar size={16} />
                    </div>
                    <div className="stat-value">
                      {forecast.days_of_stock_remaining > 999
                        ? "∞"
                        : forecast.days_of_stock_remaining.toFixed(1)}
                      <small>days</small>
                    </div>
                    <div className="stat-hint">
                      {forecast.stockout_projected_date ? (
                        <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold truncate">
                          <AlertTriangle size={13} className="shrink-0" />
                          Stockout: {forecast.stockout_projected_date}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 truncate">
                          <ShieldCheck size={13} className="shrink-0" />
                          Covers 90d horizon
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ========================================================== */}
          {/* PART 2: 90-DAY PREDICTIVE INTELLIGENCE (ML FORECASTING) */}
          {/* ========================================================== */}
          <section className="relative z-0 scroll-mt-24">
            <div className="bezel-outer">
              <div className="bezel-inner p-6 sm:p-8 space-y-8">
                {/* PART 2 HEADER */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-emerald-500/15 gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-teal-500 animate-pulse" />
                      <span className="eyebrow mint">Part 2 · Predictive Intelligence</span>
                    </div>
                    <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-1">
                      90-Day ML Demand Forecasting Pipeline
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-emerald-200/80 mt-0.5">
                      Recursive forward XGBoost predictions across calendar, 10 lag series (L1–L90), and 7 rolling window statistics.
                    </p>
                  </div>

                  <div className="text-xs font-semibold px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-500/20">
                    Horizon: {forecast.horizon_start} → {forecast.horizon_end}
                  </div>
                </div>

                {/* 1. 3-MONTH MONTH-WISE CONSUMPTION (DONUT CHART) */}
                <div className="glass-card p-6 sm:p-7 space-y-6">
                  <div>
                    <span className="eyebrow mint">Part-to-Whole Allocation</span>
                    <h4 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mt-0.5">
                      3-Month Month-Wise Consumption Forecast
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-emerald-400/70 mt-0.5">
                      Predicted consumption share across the forward 90-day horizon for {forecast.medicine_name}.
                    </p>
                  </div>

                  {/* TWO-COLUMN GRID: DONUT CHART ON LEFT, MONTH BREAKDOWN ON RIGHT */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                    {/* LEFT: PURE DONUT CHART (NO SLIDER) */}
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
                          <PieCenter defaultLabel="90d Total" suffix=" u" />
                        </PieChart>
                      </div>
                    </div>

                    {/* RIGHT: 3 MONTH DETAIL CARDS + 90-DAY TOTAL STRIP */}
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
                              style={
                                isHovered
                                  ? { borderColor: pal.stroke, boxShadow: `0 0 0 2px ${pal.stroke}` }
                                  : {}
                              }
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
                                  <span className="text-xs font-normal text-slate-500 dark:text-emerald-400/60 ml-1">
                                    units
                                  </span>
                                </div>
                              </div>

                              <div className="space-y-1 mt-2.5 pt-2 border-t border-slate-200/80 dark:border-emerald-500/15 text-xs text-slate-500 dark:text-emerald-400/70">
                                <div className="flex justify-between">
                                  <span>Daily Pace:</span>
                                  <strong className="text-slate-800 dark:text-white">
                                    {m.avg_daily_units.toFixed(1)} u/d
                                  </strong>
                                </div>
                                <div className="flex justify-between">
                                  <span>Share:</span>
                                  <strong style={{ color: pal.stroke }} className="font-bold">
                                    {m.pct_of_total}%
                                  </strong>
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
                              <span className="text-xs font-normal text-slate-500 dark:text-emerald-400/70">
                                total units
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-amber-200/90 sm:border-l sm:border-amber-500/20 sm:pl-4">
                          <div>
                            <span className="text-slate-500 dark:text-amber-400/70 block">
                              Daily Average
                            </span>
                            <strong className="text-slate-800 dark:text-white font-semibold">
                              {forecast.avg_daily_demand.toFixed(1)} u/d
                            </strong>
                          </div>
                          <div>
                            <span className="text-slate-500 dark:text-amber-400/70 block">
                              Peak Usage Day
                            </span>
                            <strong className="text-amber-700 dark:text-amber-300 font-semibold">
                              {forecast.peak_day.units.toFixed(0)}u ({forecast.peak_day.date.slice(5)})
                            </strong>
                          </div>
                          <div>
                            <span className="text-slate-500 dark:text-amber-400/70 block">
                              Lowest Day
                            </span>
                            <strong className="text-slate-700 dark:text-white font-semibold">
                              {forecast.lowest_day.units.toFixed(0)}u ({forecast.lowest_day.date.slice(5)})
                            </strong>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. 90-DAY PREDICTIVE GRAPH (@BKLIT/LINE-CHART) */}
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

                  {/* BKLIT LINE-CHART */}
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
                                label: "Consumption Units",
                                value: `${Number(point.units).toFixed(1)} units`,
                              },
                            ]}
                          />
                        </LineChart>
                      </div>

                      {/* CHART METADATA */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-emerald-500/10 text-xs text-slate-600 dark:text-emerald-300/80">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full bg-emerald-500" />
                          <span className="font-semibold text-slate-700 dark:text-emerald-200">
                            {viewMode === "with_history"
                              ? "Historical Consumption & 90-Day Predictive Trajectory (Units)"
                              : "Predicted Consumption Units"}
                          </span>
                        </div>

                        <span className="text-[11px] text-slate-400 dark:text-emerald-400/60 font-mono">
                          {forecast.features_used} Engineered Features · Recursive XGBoost
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. STEP-BY-STEP TELEMETRY LOG TABLE */}
                <div className="glass-card p-6 overflow-x-auto space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <span className="eyebrow">Data Inspection</span>
                      <h4 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                        90-Day Step-by-Step Predictive Telemetry Log
                      </h4>
                    </div>

                    {/* PAGINATION */}
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
                                    delta >= 0
                                      ? "text-amber-600 dark:text-amber-400"
                                      : "text-emerald-600 dark:text-emerald-400"
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
            </div>
          </section>
        </>
      )}
    </div>
  );
}
