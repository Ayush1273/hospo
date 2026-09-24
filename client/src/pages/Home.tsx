import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useTransform, useMotionValue } from "framer-motion";
import Lenis from "lenis";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  BedDouble,
  BrainCircuit,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Download,
  Fan,
  FileSpreadsheet,
  FileText,
  Gauge,
  HeartPulse,
  Info,
  Loader2,
  Moon,
  Pill,
  RefreshCw,
  Sparkles,
  Stethoscope,
  Sun,
  TrendingDown,
  TrendingUp,
  UploadCloud,
  X,
} from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";
import PharmacyView from "@/components/PharmacyView";


// ================================================================
// DATA TYPES
// ================================================================

export interface HospitalObservation {
  timestamp: string;
  icu_occupied_beds: number;
  icu_available_beds: number;
  icu_occupancy_pct: number;
  hdu_occupied_beds: number;
  general_occupied_beds: number;
  private_occupied_beds: number;
  total_occupied_beds: number;
  hospital_occupancy_pct: number;
  ventilators_in_use: number;
  ventilators_available: number;
  icu_staff_available: number;
  staff_shortage_flag: number;
  staff_shortage: string;
  elective_surgeries: number;
  er_arrivals: number;
  ambulance_arrivals: number;
  general_admissions: number;
  icu_admissions: number;
  icu_discharges: number;
  icu_transfers_in: number;
  icu_transfers_out: number;
}

export interface HMSFileSummary {
  filename: string;
  is_default: boolean;
  total_records: number;
  earliest_timestamp: string;
  latest_timestamp: string;
  hours_covered: number;
  is_valid_72h: boolean;
  latest_observation: HospitalObservation;
}

export interface PolicyResult {
  document: string;
  category: string;
  content: string;
  similarity: number;
}

export interface HospitalState {
  icu_beds_available: number;
  ventilators_available: number;
  icu_staff_available: number;
  staff_shortage: string;
}

export interface AnalysisResponse {
  current_occupancy: number;
  predicted_occupancy_24h: number;
  delta: number;
  risk_score: number;
  risk_level: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  risk_components: Record<string, number>;
  risk_factors: string[];
  positive_trends: string[];
  forecast_change: number;
  hospital_state: HospitalState;
  latest_observation?: HospitalObservation;
  dataset_name?: string;
  retrieved_policies: PolicyResult[];
  ai_response: string;
  timestamp: string;
}

// ================================================================
// AMBIENT FLUID KEXSIO CANVAS BACKGROUND
// ================================================================

function FluidCanvas({ scrollYProgress }: { scrollYProgress?: any }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let currentScroll = 0;
    let unsub: (() => void) | undefined;
    if (scrollYProgress && typeof scrollYProgress.on === "function") {
      unsub = scrollYProgress.on("change", (latest: number) => {
        currentScroll = latest;
      });
    }

    let raf = 0;
    let width = 0;
    let height = 0;
    const dpr = window.devicePixelRatio || 1;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const THREAD_COUNT = 34;
    const POINTS_PER_LINE = 44;
    const colorPalette = [
      { r: 5, g: 150, b: 105 },
      { r: 16, g: 185, b: 129 },
      { r: 13, g: 148, b: 136 },
      { r: 4, g: 120, b: 87 },
      { r: 52, g: 211, b: 153 },
    ];

    const threads: any[] = [];
    for (let i = 0; i < THREAD_COUNT; i++) {
      const p = i / (THREAD_COUNT - 1);
      const colorIdx = Math.floor(p * (colorPalette.length - 1));
      const nextIdx = Math.min(colorIdx + 1, colorPalette.length - 1);
      const blend = p * (colorPalette.length - 1) - colorIdx;
      const c1 = colorPalette[colorIdx];
      const c2 = colorPalette[nextIdx];
      const r = Math.round(c1.r + (c2.r - c1.r) * blend);
      const g = Math.round(c1.g + (c2.g - c1.g) * blend);
      const b = Math.round(c1.b + (c2.b - c1.b) * blend);
      const distFromCenter = Math.abs(p - 0.5) * 2;
      const baseAlpha = 0.30 * (1 - Math.pow(distFromCenter, 1.4)) + 0.05;
      const lineWidth = 0.85 + (1 - distFromCenter) * 0.7;

      threads.push({
        p,
        r,
        g,
        b,
        baseAlpha,
        lineWidth,
        phaseOffset: p * Math.PI * 1.85,
        freqMultiplier: 0.85 + p * 0.3,
        speedMultiplier: 0.9 + p * 0.2,
      });
    }

    const updateGradients = () => {
      for (let i = 0; i < threads.length; i++) {
        const th = threads[i];
        const grad = ctx.createLinearGradient(0, 0, width, 0);
        grad.addColorStop(0, `rgba(${th.r},${th.g},${th.b},0)`);
        grad.addColorStop(0.15, `rgba(${th.r},${th.g},${th.b},${th.baseAlpha * 0.6})`);
        grad.addColorStop(0.5, `rgba(${th.r},${th.g},${th.b},${th.baseAlpha})`);
        grad.addColorStop(0.85, `rgba(${th.r},${th.g},${th.b},${th.baseAlpha * 0.6})`);
        grad.addColorStop(1, `rgba(${th.r},${th.g},${th.b},0)`);
        th.grad = grad;
      }
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      updateGradients();
    };
    resize();
    window.addEventListener("resize", resize);

    const mouse = { x: width * 0.5, y: height * 0.5, active: false };
    const handleMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.active = true;
    };
    const handleLeave = () => {
      mouse.active = false;
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseleave", handleLeave);

    updateGradients();

    const startTime = performance.now();

    const animate = (now: number) => {
      raf = requestAnimationFrame(animate);
      const elapsed = reduced ? 1.5 : (now - startTime) * 0.001;
      ctx.clearRect(0, 0, width, height);

      const centerY = height * 0.48;
      const baseWaveSpeed = reduced ? 0 : 0.38;

      for (let i = 0; i < THREAD_COUNT; i++) {
        const th = threads[i];
        const p = th.p;
        const centeredP = (p - 0.5) * 2;

        // Wave lines: alternate left and right horizontal drift with scroll
        const threadDir = i % 2 === 0 ? 1 : -1;
        const scrollShift = threadDir * currentScroll * 180;

        ctx.beginPath();
        for (let s = 0; s <= POINTS_PER_LINE; s++) {
          const u = s / POINTS_PER_LINE;
          const x = u * (width + 160) - 80 + scrollShift;
          const w1 =
            Math.sin(u * Math.PI * 2.2 + elapsed * baseWaveSpeed * th.speedMultiplier + th.phaseOffset) * 55;
          const w2 = Math.cos(u * Math.PI * 3.4 - elapsed * 0.26 + th.phaseOffset * 0.6) * 30;
          const spreadEnvelope = 35 + (Math.sin(Math.abs(u - 0.3) * Math.PI * 1.4) + 1.0) * 75;
          const threadSpreadY = centeredP * spreadEnvelope;

          let mouseDisplacement = 0;
          if (mouse.active) {
            const dx = x - mouse.x;
            const dy = centerY - mouse.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < 280 * 280) {
              const dist = Math.sqrt(distSq);
              mouseDisplacement = (mouse.y - centerY) * (1 - dist / 280) * 0.28;
            }
          }

          const y = centerY + w1 + w2 + threadSpreadY + mouseDisplacement;
          if (s === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        ctx.strokeStyle = th.grad || "#10b981";
        ctx.lineWidth = th.lineWidth;
        ctx.stroke();
      }
    };

    raf = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(raf);
      unsub?.();
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseleave", handleLeave);
    };
  }, [scrollYProgress]);

  return <canvas ref={ref} className="fluid-canvas" aria-hidden="true" />;
}



// ================================================================
// STAT CARD COMPONENT
// ================================================================

function StatCard({
  label,
  value,
  suffix,
  hint,
  tone = "neutral",
  icon: Icon,
}: {
  label: string;
  value: string;
  suffix?: string;
  hint?: React.ReactNode;
  tone?: string;
  icon: any;
}) {
  return (
    <div className={`glass-card stat-card ${tone}`}>
      <div className="stat-top">
        <span className="eyebrow">{label}</span>
        <Icon size={16} />
      </div>
      <div className="stat-value">
        {value}
        {suffix && <small>{suffix}</small>}
      </div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

// ================================================================
// CLEAN FORMATTED AI BRIEFING RENDERER
// ================================================================

function FormattedAIResponse({ content }: { content: string }) {
  const sanitizedContent = useMemo(() => {
    if (!content) return "";
    // Clean up rogue orphan "#" lines (e.g. lines with just '#' or '# ' with nothing else)
    return content
      .replace(/^#\s*$/gm, "")
      .trim();
  }, [content]);

  if (!sanitizedContent) return null;

  return (
    <div className="ai-markdown-prose text-sm sm:text-[15px] leading-relaxed text-slate-700 dark:text-emerald-100/90 space-y-4">
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h3 className="text-sm sm:text-base font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-400 mt-6 first:mt-0 mb-2.5 pb-2 border-b border-emerald-500/20">
              {children}
            </h3>
          ),
          h2: ({ children }) => (
            <h3 className="text-sm sm:text-base font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-400 mt-6 first:mt-0 mb-2.5 pb-2 border-b border-emerald-500/20">
              {children}
            </h3>
          ),
          h3: ({ children }) => (
            <h4 className="text-sm sm:text-[15px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 mt-5 first:mt-0 mb-2 pb-1.5 border-b border-emerald-500/20">
              {children}
            </h4>
          ),
          h4: ({ children }) => (
            <h5 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 mt-4 mb-2">
              {children}
            </h5>
          ),
          p: ({ children }) => (
            <p className="text-sm sm:text-[15px] leading-relaxed text-slate-700 dark:text-emerald-100/90 mb-3 last:mb-0">
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="space-y-2 mb-3.5 pl-5 list-disc marker:text-emerald-600 dark:marker:text-emerald-400 text-sm sm:text-[15px] text-slate-700 dark:text-emerald-100/90">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="space-y-2 mb-3.5 pl-5 list-decimal marker:text-emerald-600 dark:marker:text-emerald-400 text-sm sm:text-[15px] text-slate-700 dark:text-emerald-100/90">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed pl-1">
              {children}
            </li>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-slate-900 dark:text-emerald-200">
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic text-slate-700 dark:text-emerald-200/90">
              {children}
            </em>
          ),
          hr: () => (
            <hr className="my-5 border-emerald-500/20" />
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-emerald-600 dark:border-emerald-400/40 pl-3.5 py-2 my-3 bg-emerald-50/90 dark:bg-emerald-950/30 rounded-r text-sm italic text-slate-800 dark:text-emerald-200/90">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-emerald-950/60 border border-slate-300 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300 font-mono text-xs sm:text-[13px]">
              {children}
            </code>
          ),
        }}
      >
        {sanitizedContent}
      </ReactMarkdown>
    </div>
  );
}

// ================================================================
// MAIN HOSP-AI COMMAND APPLICATION
// ================================================================

export default function Home() {
  const { theme, toggleTheme } = useTheme();
  const [hmsSummary, setHmsSummary] = useState<HMSFileSummary | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [activeTab, setActiveTab] = useState<"hospital" | "pharmacy">("hospital");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lenisRef = useRef<Lenis | null>(null);
  const smoothScrollY = useMotionValue(0);

  const hasUploadedFile = Boolean(uploadedFile || (hmsSummary && !hmsSummary.is_default));
  const activeFilename = uploadedFile?.name || (hmsSummary && !hmsSummary.is_default ? hmsSummary.filename : "Hospital_Telemetry.xlsx");

  // Fetch active dataset summary on initial load
  const fetchHmsStatus = async () => {
    try {
      const res = await fetch("/api/hms/status");
      if (res.ok) {
        const data: HMSFileSummary = await res.json();
        setHmsSummary(data);
      }
    } catch (e) {
      console.error("Failed to fetch initial HMS status", e);
    }
  };

  useEffect(() => {
    fetchHmsStatus();
  }, []);

  const handleFileUpload = async (file?: File) => {
    if (!file) return;
    const ext = file.name.toLowerCase();
    if (!ext.endsWith(".xlsx") && !ext.endsWith(".xls") && !ext.endsWith(".csv")) {
      toast.error("Please upload an Excel (.xlsx, .xls) or CSV (.csv) HMS export.");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/hms/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail || `Upload failed with status ${res.status}`);
      }
      const data: HMSFileSummary = await res.json();
      setHmsSummary(data);
      setUploadedFile(file);
      toast.success(`Successfully uploaded "${data.filename}" (${data.total_records.toLocaleString()} records).`);
    } catch (err: any) {
      setUploadedFile(null);
      toast.error(err.message || "Failed to upload and validate HMS file.");
    } finally {
      setUploading(false);
    }
  };

  const handleClearFile = async () => {
    setUploading(true);
    try {
      const res = await fetch("/api/hms/reset", { method: "POST" });
      if (res.ok) {
        const data: HMSFileSummary = await res.json();
        setHmsSummary(data);
        setUploadedFile(null);
        setResult(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        toast.info("Uploaded Excel file cleared.");
      }
    } catch (err: any) {
      toast.error("Failed to clear uploaded file.");
    } finally {
      setUploading(false);
    }
  };

  // Initialize Lenis luxury smooth scroll and synchronously drive Framer Motion
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: "vertical",
      gestureOrientation: "vertical",
      smoothWheel: true,
      syncTouch: false,
    });
    lenisRef.current = lenis;

    const handleScroll = (e: any) => {
      smoothScrollY.set(e.scroll);
    };
    lenis.on("scroll", handleScroll);

    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    const reqId = requestAnimationFrame(raf);

    smoothScrollY.set(window.scrollY || 0);

    const onNativeScroll = () => {
      if (!lenisRef.current) {
        smoothScrollY.set(window.scrollY);
      }
    };
    window.addEventListener("scroll", onNativeScroll, { passive: true });

    return () => {
      cancelAnimationFrame(reqId);
      window.removeEventListener("scroll", onNativeScroll);
      lenis.off("scroll", handleScroll);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [smoothScrollY]);

  // Multi-line alternating horizontal motion on scroll:
  const line1X = useTransform(smoothScrollY, [0, 480], ["0vw", "-120vw"]);
  const line1Opacity = useTransform(smoothScrollY, [0, 380], [1, 0]);

  const line2X = useTransform(smoothScrollY, [0, 480], ["0vw", "120vw"]);
  const line2Opacity = useTransform(smoothScrollY, [0, 380], [1, 0]);

  const line3X = useTransform(smoothScrollY, [0, 480], ["0vw", "-120vw"]);
  const line3Opacity = useTransform(smoothScrollY, [0, 380], [1, 0]);

  const line4X = useTransform(smoothScrollY, [0, 480], ["0vw", "120vw"]);
  const line4Opacity = useTransform(smoothScrollY, [0, 380], [1, 0]);

  const line5X = useTransform(smoothScrollY, [0, 480], ["0vw", "-120vw"]);
  const line5Opacity = useTransform(smoothScrollY, [0, 380], [1, 0]);

  const canvasScrollProgress = useTransform(smoothScrollY, [0, 600], [0, 1]);

  const now = useMemo(() => new Date(), []);

  const scrollToSnapshot = () => {
    if (lenisRef.current) {
      lenisRef.current.scrollTo("#snapshot-section", { offset: -30 });
    } else {
      document.getElementById("snapshot-section")?.scrollIntoView({ behavior: "smooth" });
    }
  };

  const scrollToTop = () => {
    if (lenisRef.current) {
      lenisRef.current.scrollTo(0, { duration: 1.25 });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const scrollToResults = () => {
    const tryScroll = (attempts = 0) => {
      const elem = document.getElementById("results-section");
      if (elem) {
        if (lenisRef.current) {
          lenisRef.current.scrollTo(elem, { offset: -80, duration: 1.25 });
        } else {
          elem.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      } else if (attempts < 8) {
        setTimeout(() => tryScroll(attempts + 1), 50);
      }
    };
    setTimeout(() => tryScroll(), 60);
  };

  const handleTabSwitch = (tab: "hospital" | "pharmacy") => {
    if (tab === activeTab) return;
    if (lenisRef.current) {
      lenisRef.current.scrollTo(0, { immediate: true });
    } else {
      window.scrollTo({ top: 0 });
    }
    setActiveTab(tab);
  };

  const handleAnalyze = async () => {
    if (!hasUploadedFile) {
      toast.warning("Please upload a 72-hour operational Excel file before running analysis.");
      fileInputRef.current?.click();
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.detail || `Analysis request failed with status ${response.status}`);
      }

      const data: AnalysisResponse = await response.json();
      setResult(data);
      toast.success("Condition analysis & 24h risk forecast completed.");

      // Smooth scroll to the top of the results section
      scrollToResults();
    } catch (err: any) {
      console.error("[Analysis Error]", err);
      toast.error(err.message || "Unable to complete analysis. Check server connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <FluidCanvas scrollYProgress={canvasScrollProgress} />
      <div className="ambient-grid" />
      <div className="app-shell relative z-10">
        {/* FLOATING CLINICAL TOPBAR */}
        <header className="topbar">
          <div
            className="brand cursor-pointer select-none"
            onClick={scrollToTop}
            title="Return to Top"
          >
            <div className="brand-mark">
              <img
                src="/assets/logo.png"
                alt="HOSP-AI Logo"
                className="w-8 h-8 object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            </div>
            <div>
              <strong>
                HOSP<span className="text-emerald-400">-AI</span> COMMAND
              </strong>
              <small>
                {activeTab === "hospital"
                  ? "Hospital Operational Decision Support"
                  : "Pharmacy Formulary & Demand Intelligence"}
              </small>
            </div>
          </div>

          <div className="flex-1" />

          {/* TOP NAVBAR OPTIONS: HOSPITAL & PHARMACY */}
          <div className="nav-segment-switcher">
            <button
              type="button"
              onClick={() => handleTabSwitch("hospital")}
              className={`nav-tab-btn ${activeTab === "hospital" ? "text-white" : ""}`}
            >
              {activeTab === "hospital" && (
                <motion.div
                  layoutId="activeNavPill"
                  className="nav-active-pill"
                  transition={{ type: "spring", stiffness: 460, damping: 36 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                <Building2 size={13} />
                <span>Hospital</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleTabSwitch("pharmacy")}
              className={`nav-tab-btn ${activeTab === "pharmacy" ? "text-white" : ""}`}
            >
              {activeTab === "pharmacy" && (
                <motion.div
                  layoutId="activeNavPill"
                  className="nav-active-pill"
                  transition={{ type: "spring", stiffness: 460, damping: 36 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                <Pill size={13} />
                <span>Pharmacy</span>
              </span>
            </button>
          </div>

          <div className="flex-1" />

          <div className="top-actions flex items-center gap-2.5 sm:gap-3">
            <span className="text-xs text-emerald-800 dark:text-emerald-300/80 hidden md:inline font-medium">
              {now.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            {activeTab === "hospital" && (
              <button
                onClick={scrollToSnapshot}
                className="text-xs font-semibold text-emerald-800 hover:text-emerald-900 bg-emerald-100/70 border border-emerald-500/25 px-3.5 py-1.5 rounded-full transition-all hover:bg-emerald-200/60 dark:text-emerald-400 dark:hover:text-emerald-300 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50"
              >
                Snapshot ↓
              </button>
            )}
            <button
              type="button"
              onClick={toggleTheme}
              className="theme-toggle-btn"
              title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
              aria-label="Toggle light/dark theme"
            >
              {theme === "dark" ? (
                <Sun size={15} className="text-amber-300" />
              ) : (
                <Moon size={15} className="text-emerald-800" />
              )}
            </button>
          </div>

        </header>

        <main className="relative z-10">
          {activeTab === "hospital" ? (
            <>
              {/* ============================================================== */}
              {/* MODERN MINIMAL HERO SECTION (LINES PART LEFT & RIGHT ON SCROLL) */}
              {/* ============================================================== */}
          <section className="hero-minimal">
            {/* HEADING (LINE 1 SLIDES LEFT, LINE 2 SLIDES RIGHT) */}
            <div className="hero-h1 max-w-4xl mx-auto flex flex-col items-center">
              {/* LINE 1: SLIDES LEFT ON SCROLL */}
              <motion.div
                style={{ x: line1X, opacity: line1Opacity }}
                className="hero-motion-line text-center"
              >
                Predict ICU capacity pressure.
              </motion.div>

              {/* LINE 2: SLIDES RIGHT ON SCROLL */}
              <motion.div
                style={{ x: line2X, opacity: line2Opacity }}
                className="hero-motion-line text-center mint-line mt-1"
              >
                Before critical thresholds are breached.
              </motion.div>
            </div>

            {/* LINE 3 (SUBTITLE): SLIDES LEFT ON SCROLL */}
            <motion.p
              style={{ x: line3X, opacity: line3Opacity }}
              className="hero-subtitle hero-motion-line mt-4"
            >
              Deterministic 24-hour predictive census velocity, arithmetic risk scoring, and policy-grounded
              guidance engineered for hospital leadership and bed management huddles.
            </motion.p>

            {/* INTERACTIVE CONTROLS */}
            <div className="flex flex-col items-center gap-5 mt-2">
              {/* LINE 4 (CTA BUTTON): SLIDES RIGHT ON SCROLL */}
              <motion.div
                style={{ x: line4X, opacity: line4Opacity }}
                className="hero-motion-line"
              >
                <button onClick={scrollToSnapshot} className="cta-island group">
                  <span>Configure Operational Conditions</span>
                  <span className="cta-icon-nest">
                    <ArrowDown size={14} />
                  </span>
                </button>
              </motion.div>

              {/* LINE 5 (TELEMETRY SPECS STRIP): SLIDES LEFT ON SCROLL */}
              <motion.div
                style={{ x: line5X, opacity: line5Opacity }}
                className="hero-motion-line flex flex-wrap justify-center items-center gap-2.5 sm:gap-3.5 text-xs text-emerald-800 dark:text-emerald-400/80 uppercase tracking-wider font-semibold pt-2"
              >
                <span className="px-3 py-1.5 rounded-md bg-emerald-100/70 border border-emerald-500/25 text-emerald-900 dark:bg-emerald-950/50 dark:border-emerald-500/20 dark:text-emerald-300">
                  39-Feature XGBoost ML
                </span>
                <span className="text-emerald-600/40 dark:text-emerald-500/40">·</span>
                <span className="px-3 py-1.5 rounded-md bg-emerald-100/70 border border-emerald-500/25 text-emerald-900 dark:bg-emerald-950/50 dark:border-emerald-500/20 dark:text-emerald-300">
                  Deterministic 0–10 Risk Engine
                </span>
                <span className="text-emerald-600/40 dark:text-emerald-500/40">·</span>
                <span className="px-3 py-1.5 rounded-md bg-emerald-100/70 border border-emerald-500/25 text-emerald-900 dark:bg-emerald-950/50 dark:border-emerald-500/20 dark:text-emerald-300">
                  RAG Policy Retrieval
                </span>
                <span className="text-emerald-600/40 dark:text-emerald-500/40">·</span>
                <span className="px-3 py-1.5 rounded-md bg-emerald-100/70 border border-emerald-500/25 text-emerald-900 dark:bg-emerald-950/50 dark:border-emerald-500/20 dark:text-emerald-300">
                  Gemini 3.6 Flash Grounding
                </span>
              </motion.div>
            </div>
          </section>

          {/* ============================================================== */}
          {/* HMS OPERATIONAL DATA SOURCE & OBSERVATION SNAPSHOT */}
          {/* ============================================================== */}
          <section
            id="snapshot-section"
            className="relative z-20 max-w-5xl mx-auto mt-6 mb-16 scroll-mt-24"
          >
            <div className="bezel-outer">
              <div className="bezel-inner p-6 sm:p-8">
                {/* ENCLOSURE HEADER */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 mb-6 border-b border-emerald-500/15 gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="eyebrow mint">HMS Operational Data Source</span>
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                      Hospital Census & Telemetry Export
                    </h2>
                    <p className="text-sm text-slate-600 dark:text-emerald-200/80 mt-1">
                      Ingests 72+ continuous hours of operational records. Automatically uses the latest observation to forecast 24-hour ahead ICU occupancy.
                    </p>
                  </div>
                  {hasUploadedFile && (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-emerald-100/90 border border-emerald-500/30 text-emerald-900 dark:bg-emerald-950/70 dark:border-emerald-500/30 dark:text-emerald-300">
                        <CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400" />
                        Dataset Active
                      </span>
                    </div>
                  )}
                </div>

                {/* HIDDEN FILE INPUT */}
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      handleFileUpload(e.target.files[0]);
                    }
                  }}
                />

                {/* VISUAL STATE 1: ACTIVE UPLOADED FILE CARD (HIGH VISIBILITY) */}
                {hasUploadedFile ? (
                  <div className="active-file-card mb-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-start sm:items-center gap-3.5">
                        <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0 text-emerald-600 dark:text-emerald-400">
                          <FileSpreadsheet size={24} />
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-500/30">
                              <CheckCircle2 size={12} className="text-emerald-500" />
                              Excel Uploaded & Active
                            </span>
                            {hmsSummary?.is_valid_72h ? (
                              <span className="text-[11px] px-2.5 py-0.5 rounded-full font-semibold bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border border-emerald-500/25">
                                ✓ 72+ Hours Verified
                              </span>
                            ) : (
                              <span className="text-[11px] px-2.5 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border border-amber-500/30">
                                ⚠ Minimum 72 Hours Required
                              </span>
                            )}
                          </div>
                          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-1 break-all">
                            {activeFilename}
                          </h3>
                          <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-600 dark:text-emerald-300/70">
                            {uploadedFile && (
                              <span>{(uploadedFile.size / 1024).toFixed(1)} KB ·</span>
                            )}
                            <span>
                              <strong>{hmsSummary?.total_records.toLocaleString()}</strong> continuous records
                            </span>
                            {hmsSummary?.latest_timestamp && (
                              <>
                                <span>·</span>
                                <span className="flex items-center gap-1">
                                  <Clock size={12} /> Latest: <strong>{hmsSummary.latest_timestamp}</strong>
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* ACTIONS: REPLACE OR CLEAR EXCEL */}
                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            fileInputRef.current?.click();
                          }}
                          disabled={uploading}
                          className="flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium rounded-lg text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 dark:text-emerald-300 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 border border-slate-300/80 dark:border-emerald-500/20 transition-all cursor-pointer"
                          title="Upload a different Excel file"
                        >
                          <UploadCloud size={14} /> Replace
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleClearFile();
                          }}
                          disabled={uploading}
                          className="flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 dark:text-rose-300 dark:bg-rose-950/40 dark:border-rose-800/40 dark:hover:bg-rose-900/40 transition-all cursor-pointer shadow-sm hover:shadow"
                          title="Clear uploaded Excel file and reset"
                        >
                          <X size={15} /> Clear Excel
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* VISUAL STATE 2: EMPTY DROPZONE WHEN NO FILE UPLOADED */
                  <div
                    className={`hms-upload-dropzone mb-6 ${dragOver ? "drag-active" : ""}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(false);
                      if (e.dataTransfer.files?.[0]) {
                        handleFileUpload(e.dataTransfer.files[0]);
                      }
                    }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className="flex flex-col items-center justify-center gap-2.5 py-3">
                      <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                        {uploading ? (
                          <Loader2 size={24} className="animate-spin text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <UploadCloud size={24} className="text-emerald-600 dark:text-emerald-400" />
                        )}
                      </div>
                      <div>
                        <p className="text-base font-semibold text-slate-800 dark:text-slate-200">
                          {uploading
                            ? "Ingesting & validating HMS operational dataset…"
                            : "Upload 72-Hour Operational Dataset (Excel / CSV)"}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-emerald-400/60 mt-1">
                          Click or drag & drop .xlsx, .xls, or .csv export containing at least 72 continuous hours
                        </p>
                      </div>
                      <span className="text-[11px] px-3 py-1 rounded-full font-medium bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/20">
                        Minimum 72 continuous hours required for predictive modeling
                      </span>
                    </div>
                  </div>
                )}

                {/* LATEST HMS OBSERVATION SNAPSHOT GRID (ONLY SHOWN AFTER UPLOAD) */}
                {hasUploadedFile && hmsSummary?.latest_observation && (
                  <div className="space-y-3 mb-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-1">
                      <span className="text-xs uppercase tracking-wider font-bold text-slate-700 dark:text-emerald-400">
                        Observation Telemetry Snapshot ({activeFilename} · {hmsSummary.latest_observation.timestamp})
                      </span>
                      <span className="text-xs text-slate-500 dark:text-emerald-400/60 font-medium">
                        Extracted from latest observation record
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* 1. INTAKE INFLOW */}
                      <div className="form-group-box">
                        <div className="group-title-clean">
                          <Activity size={14} className="text-emerald-400" />
                          <span>Intake Inflow</span>
                        </div>
                        <div className="space-y-1.5">
                          <div className="telemetry-indicator-row">
                            <span className="telemetry-indicator-label">Emergency Room Arrivals</span>
                            <span className="telemetry-indicator-val">
                              {hmsSummary.latest_observation.er_arrivals} patients
                            </span>
                          </div>
                          <div className="telemetry-indicator-row">
                            <span className="telemetry-indicator-label">Ambulance Deliveries</span>
                            <span className="telemetry-indicator-val">
                              {hmsSummary.latest_observation.ambulance_arrivals} deliveries
                            </span>
                          </div>
                          <div className="telemetry-indicator-row">
                            <span className="telemetry-indicator-label">General Admissions</span>
                            <span className="telemetry-indicator-val">
                              {hmsSummary.latest_observation.general_admissions} patients
                            </span>
                          </div>
                          <div className="telemetry-indicator-row">
                            <span className="telemetry-indicator-label">Direct ICU Admissions</span>
                            <span className="telemetry-indicator-val">
                              {hmsSummary.latest_observation.icu_admissions} patients
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* 2. PATIENT FLOW */}
                      <div className="form-group-box">
                        <div className="group-title-clean">
                          <HeartPulse size={14} className="text-emerald-400" />
                          <span>ICU Patient Flow</span>
                        </div>
                        <div className="space-y-1.5">
                          <div className="telemetry-indicator-row">
                            <span className="telemetry-indicator-label">ICU Discharges</span>
                            <span className="telemetry-indicator-val">
                              {hmsSummary.latest_observation.icu_discharges}
                            </span>
                          </div>
                          <div className="telemetry-indicator-row">
                            <span className="telemetry-indicator-label">ICU Transfers In</span>
                            <span className="telemetry-indicator-val">
                              {hmsSummary.latest_observation.icu_transfers_in}
                            </span>
                          </div>
                          <div className="telemetry-indicator-row">
                            <span className="telemetry-indicator-label">ICU Transfers Out</span>
                            <span className="telemetry-indicator-val">
                              {hmsSummary.latest_observation.icu_transfers_out}
                            </span>
                          </div>
                          <div className="telemetry-indicator-row">
                            <span className="telemetry-indicator-label">Total Hospital Occupied Beds</span>
                            <span className="telemetry-indicator-val">
                              {hmsSummary.latest_observation.total_occupied_beds}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* 3. BED CAPACITY & CENSUS */}
                      <div className="form-group-box">
                        <div className="group-title-clean">
                          <BedDouble size={14} className="text-emerald-400" />
                          <span>Bed Capacity & Census</span>
                        </div>
                        <div className="space-y-1.5">
                          <div className="telemetry-indicator-row">
                            <span className="telemetry-indicator-label">Current ICU Occupancy</span>
                            <span className="telemetry-indicator-val text-emerald-600 dark:text-emerald-400 font-bold">
                              {hmsSummary.latest_observation.icu_occupancy_pct.toFixed(1)}%
                            </span>
                          </div>
                          <div className="telemetry-indicator-row">
                            <span className="telemetry-indicator-label">ICU Available Beds</span>
                            <span className="telemetry-indicator-val font-semibold">
                              {hmsSummary.latest_observation.icu_available_beds} beds ready
                            </span>
                          </div>
                          <div className="telemetry-indicator-row">
                            <span className="telemetry-indicator-label">HDU Occupied Beds</span>
                            <span className="telemetry-indicator-val">
                              {hmsSummary.latest_observation.hdu_occupied_beds}
                            </span>
                          </div>
                          <div className="telemetry-indicator-row">
                            <span className="telemetry-indicator-label">General & Private Ward Beds</span>
                            <span className="telemetry-indicator-val">
                              {hmsSummary.latest_observation.general_occupied_beds} gen / {hmsSummary.latest_observation.private_occupied_beds} pvt
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* 4. CRITICAL RESOURCES & STAFFING */}
                      <div className="form-group-box">
                        <div className="group-title-clean">
                          <Fan size={14} className="text-emerald-400" />
                          <span>Critical Resources & Staffing</span>
                        </div>
                        <div className="space-y-1.5">
                          <div className="telemetry-indicator-row">
                            <span className="telemetry-indicator-label">Ventilators</span>
                            <span className="telemetry-indicator-val">
                              {hmsSummary.latest_observation.ventilators_in_use} in use / {hmsSummary.latest_observation.ventilators_available} reserve
                            </span>
                          </div>
                          <div className="telemetry-indicator-row">
                            <span className="telemetry-indicator-label">ICU Staff on Duty</span>
                            <span className="telemetry-indicator-val">
                              {hmsSummary.latest_observation.icu_staff_available} nurses
                            </span>
                          </div>
                          <div className="telemetry-indicator-row">
                            <span className="telemetry-indicator-label">Scheduled Surgeries</span>
                            <span className="telemetry-indicator-val">
                              {hmsSummary.latest_observation.elective_surgeries}
                            </span>
                          </div>
                          <div className="telemetry-indicator-row">
                            <span className="telemetry-indicator-label">Staff Shortage Flag</span>
                            <span
                              className={`text-xs px-2 py-0.5 rounded font-bold ${
                                hmsSummary.latest_observation.staff_shortage === "YES"
                                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                  : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                              }`}
                            >
                              {hmsSummary.latest_observation.staff_shortage === "YES"
                                ? "ACTIVE SHORTAGE"
                                : "NORMAL STAFFING"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* CENTERED ACTION BUTTON */}
                <div className="text-center pt-2">
                  <Button
                    className={`analyze-btn group ${loading ? "is-loading" : ""}`}
                    onClick={hasUploadedFile ? handleAnalyze : () => fileInputRef.current?.click()}
                    disabled={loading || uploading}
                  >
                    {loading ? (
                      <>
                        <Loader2 size={16} className="animate-spin text-white shrink-0" />
                        <span>Running 72h Predictive Pipeline…</span>
                      </>
                    ) : hasUploadedFile ? (
                      <>
                        <Sparkles size={16} className="text-emerald-200 shrink-0" />
                        <span>ANALYZE HOSPITAL CONDITION</span>
                        <ArrowRight
                          size={14}
                          className="text-white/80 shrink-0 transition-transform group-hover:translate-x-1"
                        />
                      </>
                    ) : (
                      <>
                        <UploadCloud size={16} className="text-emerald-200 shrink-0" />
                        <span>UPLOAD 72H EXCEL TO ANALYZE</span>
                      </>
                    )}
                  </Button>
                  {!hasUploadedFile && (
                    <p className="text-xs text-slate-500 dark:text-emerald-400/60 mt-2.5">
                      Upload an Excel or CSV file containing 72+ continuous hours to run predictions
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>

        {/* ============================================================== */}
        {/* RESULTS SECTION (ONLY APPEARS AFTER ANALYSIS) */}
        {/* ============================================================== */}
        <AnimatePresence>
          {result && (
            <motion.section
              id="results-section"
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 30 }}
              transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
              className="max-w-5xl mx-auto space-y-10 sm:space-y-12 scroll-mt-28 mt-20 sm:mt-28 mb-24 pt-4 sm:pt-6"
            >
              {/* CAPACITY OUTLOOK CARDS */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-7 sm:mb-9 pb-5 border-b border-emerald-500/15">
                  <div>
                    <span className="eyebrow mint inline-block mb-2">Capacity Outlook & Decision Signal</span>
                    <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                      24-Hour Forecast & Risk Level
                    </h3>
                    {result.dataset_name && (
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-3 text-xs text-slate-600 dark:text-emerald-300/80 font-medium">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300">
                          Dataset: <strong className="text-slate-800 dark:text-white font-semibold">{result.dataset_name}</strong>
                        </span>
                        {result.latest_observation?.timestamp && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-slate-100 dark:bg-emerald-950/40 border border-slate-200 dark:border-emerald-500/20 text-slate-600 dark:text-emerald-300/80">
                            <Clock size={12} /> Observation: <strong className="text-slate-800 dark:text-white font-semibold">{result.latest_observation.timestamp}</strong>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="self-start sm:self-auto shrink-0 pb-0.5">
                    <span className={`status-badge ${result.risk_level.toLowerCase()} px-4 py-1.5 text-xs sm:text-sm font-bold`}>
                      {result.risk_level} RISK
                    </span>
                  </div>
                </div>

                <div className="stats-grid">
                  <StatCard
                    label="Current ICU Occupancy"
                    value={`${result.current_occupancy.toFixed(1)}`}
                    suffix="%"
                    hint={
                      <>
                        <BedDouble size={14} /> Real-time census
                      </>
                    }
                    tone="mint"
                    icon={BedDouble}
                  />
                  <StatCard
                    label="24h Predicted Occupancy"
                    value={`${result.predicted_occupancy_24h.toFixed(1)}`}
                    suffix="%"
                    hint={
                      result.delta >= 0 ? (
                        <>
                          <TrendingUp size={14} className="text-amber-500 dark:text-amber-400" /> +{result.delta.toFixed(1)} pp shift
                        </>
                      ) : (
                        <>
                          <TrendingDown size={14} className="text-emerald-600 dark:text-emerald-400" /> {result.delta.toFixed(1)} pp shift
                        </>
                      )
                    }
                    tone={result.delta > 0 ? "orange" : "neutral"}
                    icon={Activity}
                  />
                  <StatCard
                    label="Operational Risk Score"
                    value={result.risk_score.toFixed(1)}
                    suffix=" / 10"
                    hint="Deterministic arithmetic"
                    tone={result.risk_level.toLowerCase()}
                    icon={Gauge}
                  />
                  <StatCard
                    label="Risk Classification"
                    value={result.risk_level}
                    hint="Human review required"
                    tone={result.risk_level.toLowerCase()}
                    icon={AlertTriangle}
                  />
                </div>
              </div>

              {/* CURRENT HOSPITAL STATE */}
              <div className="glass-card p-6 sm:p-8">
                <div className="flex items-center justify-between mb-5 pb-3 border-b border-emerald-500/10">
                  <span className="eyebrow">Hospital State Telemetry</span>
                  <span className="text-xs sm:text-sm text-emerald-800 dark:text-emerald-400/80 font-medium">Critical Care Resources</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-5">
                  <div className="p-4 sm:p-5 rounded-xl bg-slate-50 border border-emerald-500/20 text-center shadow-sm dark:bg-[#0a1711] dark:border-emerald-500/25">
                    <small className="text-xs text-emerald-800 dark:text-emerald-400/80 uppercase tracking-wider font-semibold block mb-1">
                      ICU Available
                    </small>
                    <strong className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-emerald-200">
                      {result.hospital_state.icu_beds_available}
                    </strong>
                    <span className="text-xs text-slate-500 dark:text-emerald-500/80 block mt-1 font-medium">beds ready</span>
                  </div>
                  <div className="p-4 sm:p-5 rounded-xl bg-slate-50 border border-emerald-500/20 text-center shadow-sm dark:bg-[#0a1711] dark:border-emerald-500/25">
                    <small className="text-xs text-emerald-800 dark:text-emerald-400/80 uppercase tracking-wider font-semibold block mb-1">
                      Ventilators
                    </small>
                    <strong className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-emerald-200">
                      {result.hospital_state.ventilators_available}
                    </strong>
                    <span className="text-xs text-slate-500 dark:text-emerald-500/80 block mt-1 font-medium">in reserve</span>
                  </div>
                  <div className="p-4 sm:p-5 rounded-xl bg-slate-50 border border-emerald-500/20 text-center shadow-sm dark:bg-[#0a1711] dark:border-emerald-500/25">
                    <small className="text-xs text-emerald-800 dark:text-emerald-400/80 uppercase tracking-wider font-semibold block mb-1">
                      ICU Staff
                    </small>
                    <strong className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-emerald-200">
                      {result.hospital_state.icu_staff_available}
                    </strong>
                    <span className="text-xs text-slate-500 dark:text-emerald-500/80 block mt-1 font-medium">nurses on duty</span>
                  </div>
                  <div className="p-4 sm:p-5 rounded-xl bg-slate-50 border border-emerald-500/20 text-center shadow-sm dark:bg-[#0a1711] dark:border-emerald-500/25">
                    <small className="text-xs text-emerald-800 dark:text-emerald-400/80 uppercase tracking-wider font-semibold block mb-1">
                      Staff Shortage
                    </small>
                    <strong
                      className={`text-2xl sm:text-3xl font-bold ${
                        result.hospital_state.staff_shortage === "YES" ? "text-amber-500" : "text-emerald-700 dark:text-emerald-300"
                      }`}
                    >
                      {result.hospital_state.staff_shortage}
                    </strong>
                    <span className="text-xs text-slate-500 dark:text-emerald-500/80 block mt-1 font-medium">escalation</span>
                  </div>
                </div>
              </div>

              {/* KEY RISK FACTORS & FORECAST TREND */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
                {/* BOTTLENECK ALERTS */}
                <div className="glass-card p-6 sm:p-8">
                  <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-emerald-500/10">
                    <span className="eyebrow">Triggered Risk Factors</span>
                    <span className="text-xs sm:text-sm text-emerald-800 dark:text-emerald-400 font-semibold">
                      {result.risk_factors.length} identified
                    </span>
                  </div>
                  {result.risk_factors.length > 0 ? (
                    result.risk_factors.map((factor, i) => (
                      <div
                        key={factor}
                        className={`alert-chip ${i === 0 && result.risk_score >= 6 ? "critical" : ""}`}
                      >
                        <AlertTriangle size={17} />
                        <span>{factor}</span>
                      </div>
                    ))
                  ) : (
                    <div className="clear-chip">
                      <Check size={17} /> No major operational bottlenecks triggered.
                    </div>
                  )}
                </div>

                {/* 24-HOUR TRAJECTORY */}
                <div className="glass-card p-6 sm:p-8">
                  <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-emerald-500/10">
                    <span className="eyebrow">24-Hour Predictive Velocity</span>
                    <span className="text-xs sm:text-sm text-emerald-800 dark:text-emerald-400 font-bold">
                      {result.forecast_change >= 0 ? `+${result.forecast_change} pp` : `${result.forecast_change} pp`}
                    </span>
                  </div>
                  {result.positive_trends.length > 0 ? (
                    result.positive_trends.map((trend, i) => (
                      <div key={i} className="clear-chip mb-2">
                        <Check size={16} /> {trend}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-700 dark:text-emerald-100/90 leading-relaxed mt-2">
                      {result.forecast_change > 0
                        ? "The 24-hour forecast indicates an increase in ICU occupancy pressure."
                        : result.forecast_change < 0
                        ? "The 24-hour forecast indicates a decrease in ICU occupancy pressure."
                        : "The 24-hour forecast indicates stable ICU census over the next day."}
                    </p>
                  )}
                </div>
              </div>

              {/* AI GROUNDED DECISION SUPPORT */}
              <div className="glass-card p-6 sm:p-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-5 border-b border-emerald-500/15 gap-2">
                  <div>
                    <span className="eyebrow mint">AI Decision Support Briefing</span>
                    <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-1">
                      Synthesized Guidance Grounded in Hospital SOPs
                    </h3>
                  </div>
                  <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-100/80 border border-emerald-500/25 text-emerald-900 dark:bg-emerald-950/50 dark:border-emerald-500/25 text-xs font-semibold dark:text-emerald-300">
                    <BrainCircuit size={14} /> Gemini 3.6 Flash
                  </span>
                </div>

                <FormattedAIResponse content={result.ai_response} />
              </div>

            </motion.section>
          )}
        </AnimatePresence>
            </>
          ) : (
            <PharmacyView />
          )}
      </main>

      {/* MINIMAL CLINICAL FOOTER */}
      <footer>
        <span>
          <Stethoscope size={13} /> Administrative resource-management only · Not clinical diagnostic advice
        </span>
        <span>
          <Info size={13} /> Human hospital administrator review required for every signal
        </span>
      </footer>
    </div>
  </>
);
}
