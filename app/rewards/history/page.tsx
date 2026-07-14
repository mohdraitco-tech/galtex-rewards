"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

/* ============================================================
   GALTEX Rewards — سجل النقاط (/rewards/history)
   الشكل: تصميم Claude Design الجديد (History) — كحلي/ذهبي/بيج
   المنطق: نفس منطق النظام (get_customer_point_history + summary) — لم يُمَس
   ============================================================ */

const C = {
  navy: "#0E2C5C",
  blue: "#16407F",
  gold: "#C4952E",
  goldDark: "#8F6819",
  beige: "#F5F2EC",
  cream: "#FFFDF8",
  slate: "#586377",
  ink: "#7A8498",
};

type PointHistoryItem = {
  id: string;
  product_number: string;
  points: number;
  status: "released" | "pending";
  status_label: string;
  created_at: string;
};

export default function PointsHistoryPage() {
  const router = useRouter();

  const [history, setHistory] = useState<PointHistoryItem[]>([]);
  const [releasedPoints, setReleasedPoints] = useState(0);
  const [pendingPoints, setPendingPoints] = useState(0);

  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    setMessage("");

    const customerId = localStorage.getItem("galtex_customer_id");

    if (!customerId) {
      router.replace("/");
      return;
    }

    const [historyResult, summaryResult] = await Promise.all([
      supabase.rpc("get_customer_point_history", {
        p_customer_id: customerId,
      }),

      supabase.rpc("get_customer_points_summary", {
        p_customer_id: customerId,
      }),
    ]);

    if (historyResult.error) {
      console.error("History error:", historyResult.error);

      setMessage(
        historyResult.error.message ||
          "حدث خطأ أثناء تحميل سجل النقاط"
      );

      setIsLoading(false);
      return;
    }

    if (summaryResult.error) {
      console.error("Summary error:", summaryResult.error);

      setMessage(
        summaryResult.error.message ||
          "حدث خطأ أثناء تحميل ملخص النقاط"
      );

      setIsLoading(false);
      return;
    }

    setHistory(historyResult.data || []);

    setReleasedPoints(
      Number(summaryResult.data?.released_points || 0)
    );

    setPendingPoints(
      Number(summaryResult.data?.pending_points || 0)
    );

    setIsLoading(false);
  }, [router]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return (
    <div dir="rtl" style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif", background: C.beige, color: C.navy, minHeight: "100vh" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* ===== HEADER ===== */}
      <header style={{ background: "rgba(245,242,236,0.85)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(18,44,92,0.08)", position: "sticky", top: 0, zIndex: 40 }}>
        <nav className="gx-nav" style={{ maxWidth: 1080, margin: "0 auto", padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <img src="/galtex-logo.png" alt="GALTEX" style={{ height: 38, width: "auto", display: "block" }} />
            <span style={{ width: 1, height: 28, background: "rgba(18,44,92,0.15)" }} />
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 12, height: 12, background: C.gold, display: "inline-block", clipPath: "polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)" }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: C.goldDark }}>مكافآت</span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => router.push("/rewards")}
            style={{ background: "none", border: "none", color: C.blue, fontFamily: "inherit", fontWeight: 600, fontSize: 14.5, cursor: "pointer" }}
          >
            ‹ لوحة المكافآت
          </button>
        </nav>
      </header>

      <main className="gx-main" style={{ maxWidth: 1080, margin: "0 auto", padding: "40px 28px 64px" }}>
        {/* title */}
        <div style={{ marginBottom: 26 }}>
          <h1 style={{ fontSize: "clamp(26px,3vw,34px)", fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 6px", color: C.navy }}>سجل النقاط</h1>
          <p style={{ fontSize: 16, color: C.slate, margin: 0 }}>تابع عمليات المسح وحالة نقاطك</p>
        </div>

        {message && (
          <div style={{ background: "rgba(192,57,43,0.08)", border: "1px solid rgba(192,57,43,0.25)", color: "#C0392B", borderRadius: 16, padding: 16, textAlign: "center", fontWeight: 600, marginBottom: 22 }}>
            {message}
          </div>
        )}

        {/* summary cards */}
        {!isLoading && (
          <div className="gx-sum" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>
            {/* released (navy) */}
            <div style={{ position: "relative", background: `linear-gradient(140deg, ${C.blue} 0%, ${C.navy} 100%)`, borderRadius: 20, padding: "28px 30px", color: C.beige, overflow: "hidden", boxShadow: "0 24px 46px -28px rgba(18,44,92,0.6)" }}>
              <span style={{ position: "absolute", top: -40, insetInlineStart: -30, width: 150, height: 150, background: "rgba(196,149,46,0.14)", clipPath: "polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)", animation: "gxFloat 6s ease-in-out infinite" }} />
              <div style={{ position: "relative", zIndex: 1, fontSize: 14.5, color: "#C6D2EA", marginBottom: 8 }}>إجمالي النقاط المفرَج عنها</div>
              <div style={{ position: "relative", zIndex: 1, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 52, lineHeight: 1 }}>{releasedPoints}</div>
              <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: C.beige }} />
                <span style={{ fontSize: 14, color: "#C6D2EA" }}>نقاط جاهزة للاستخدام</span>
              </div>
            </div>
            {/* pending (gold tint) */}
            <div style={{ background: "#FBF3DC", border: "1px solid rgba(196,149,46,0.35)", borderRadius: 20, padding: "28px 30px" }}>
              <div style={{ fontSize: 14.5, color: C.goldDark, fontWeight: 600, marginBottom: 8 }}>إجمالي النقاط الموقوفة</div>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 52, lineHeight: 1, color: C.goldDark }}>{pendingPoints}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: C.gold }} />
                <span style={{ fontSize: 14, color: "#9A7A2E" }}>بانتظار قراءة الميكانيكي للرمز</span>
              </div>
            </div>
          </div>
        )}

        {/* table */}
        {isLoading ? (
          <div style={{ textAlign: "center", padding: "64px 0", color: C.blue, fontWeight: 700 }}>جاري تحميل سجل النقاط...</div>
        ) : history.length === 0 ? (
          <div style={{ background: C.cream, border: "1px solid rgba(18,44,92,0.1)", borderRadius: 20, padding: 40, textAlign: "center", color: C.ink, fontWeight: 600 }}>
            لا توجد عمليات نقاط حتى الآن
          </div>
        ) : (
          <div className="gx-tablewrap" style={{ background: C.cream, border: "1px solid rgba(18,44,92,0.1)", borderRadius: 20, overflow: "hidden" }}>
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1.3fr 2fr 1fr 1fr", gap: 16, padding: "16px 26px", background: "rgba(18,44,92,0.04)", fontSize: 13.5, fontWeight: 600, color: C.slate }}>
                <span>رقم الصنف</span>
                <span>تاريخ المسح</span>
                <span style={{ textAlign: "center" }}>عدد النقاط</span>
                <span style={{ textAlign: "center" }}>الحالة</span>
              </div>

              {history.map((item) => {
                const isReleased = item.status === "released";
                return (
                  <div key={`${item.status}-${item.id}`} style={{ display: "grid", gridTemplateColumns: "1.3fr 2fr 1fr 1fr", gap: 16, padding: "20px 26px", borderTop: "1px solid rgba(18,44,92,0.07)", alignItems: "center" }}>
                    <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 17, color: C.navy }}>{item.product_number || "-"}</span>
                    <span style={{ fontSize: 14.5, color: C.slate }}>{new Date(item.created_at).toLocaleString("ar-SA")}</span>
                    <span style={{ textAlign: "center", fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 17, color: isReleased ? C.blue : C.goldDark }}>{item.points}</span>
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: isReleased ? C.blue : C.gold }} />
                      <span style={{ fontSize: 14.5, fontWeight: 600, color: isReleased ? C.blue : C.goldDark }}>{item.status_label}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => router.push("/rewards")}
          style={{ display: "block", width: "100%", textAlign: "center", marginTop: 20, background: C.cream, color: C.blue, fontFamily: "inherit", fontWeight: 700, fontSize: 15, padding: 15, border: "1px solid rgba(18,44,92,0.18)", borderRadius: 13, cursor: "pointer" }}
        >
          العودة إلى لوحة المكافآت
        </button>
      </main>

      <footer style={{ borderTop: "1px solid rgba(18,44,92,0.08)", background: "#ECE7DD" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "22px 28px", textAlign: "center" }}>
          <span style={{ fontSize: 13, color: C.ink }}>© ٢٠٢٦ GALTEX — نظام مكافآت العملاء</span>
        </div>
      </footer>

      <style>{`
        @keyframes gxFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @media (max-width:760px){
          .gx-sum { grid-template-columns:1fr !important; }
          .gx-main { padding:26px 18px 48px !important; }
          .gx-nav { padding:14px 18px !important; }
          .gx-tablewrap { overflow-x:auto !important; -webkit-overflow-scrolling:touch; }
          .gx-tablewrap > div { min-width:520px; }
        }
      `}</style>
    </div>
  );
}