"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

/* ============================================================
   GALTEX Rewards — لوحة العميل بعد تسجيل الدخول (/rewards)
   الشكل: تصميم Claude Design الجديد (Dashboard) — كحلي/ذهبي/بيج
   المنطق: نفس منطق النظام (get_customer_dashboard + تسجيل الخروج) — لم يُمَس
   ============================================================ */

const C = {
  navy: "#0E2C5C",
  blue: "#16407F",
  gold: "#C4952E",
  goldDark: "#8F6819",
  beige: "#F5F2EC",
  cream: "#FFFDF8",
  slate: "#586377",
  slate3: "#33405A",
  ink: "#7A8498",
};

export default function RewardsPage() {
  const router = useRouter();

  const [name, setName] = useState("عميل GALTEX");
  const [points, setPoints] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setMessage("");

    const customerId = localStorage.getItem("galtex_customer_id");

    if (!customerId) {
      router.replace("/");
      return;
    }

    const { data, error } = await supabase.rpc("get_customer_dashboard", {
      p_customer_id: customerId,
    });

    if (error || !data?.success) {
      setMessage(
        data?.message ||
          error?.message ||
          "تعذر تحميل بيانات الحساب"
      );

      setIsLoading(false);
      return;
    }

    setName(
      `${data.first_name || ""} ${data.last_name || ""}`.trim() ||
        "عميل GALTEX"
    );

    setPoints(Number(data.points || 0));

    localStorage.setItem(
      "galtex_customer_points",
      String(data.points || 0)
    );

    setIsLoading(false);
  }, [router]);

  useEffect(() => {
    loadDashboard();

    function handlePageFocus() {
      loadDashboard();
    }

    window.addEventListener("focus", handlePageFocus);

    return () => {
      window.removeEventListener("focus", handlePageFocus);
    };
  }, [loadDashboard]);

  function handleLogout() {
    localStorage.removeItem("galtex_customer_id");
    localStorage.removeItem("galtex_customer_name");
    localStorage.removeItem("galtex_customer_points");

    router.replace("/");
  }

  const initial = name.trim().charAt(0) || "ع";

  return (
    <div dir="rtl" style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif", background: C.beige, color: C.navy, minHeight: "100vh" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* ===== HEADER ===== */}
      <header style={{ background: "rgba(245,242,236,0.85)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(18,44,92,0.08)", position: "sticky", top: 0, zIndex: 40 }}>
        <nav className="gx-nav" style={{ maxWidth: 1120, margin: "0 auto", padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <img src="/galtex-logo.png" alt="GALTEX" style={{ height: 38, width: "auto", display: "block" }} />
            <span style={{ width: 1, height: 28, background: "rgba(18,44,92,0.15)" }} />
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 12, height: 12, background: C.gold, display: "inline-block", clipPath: "polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)" }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: C.goldDark }}>مكافآت</span>
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ width: 34, height: 34, borderRadius: "50%", background: C.blue, color: C.beige, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif" }}>{initial}</span>
              <span className="gx-username" style={{ fontSize: 14.5, fontWeight: 600, color: C.slate3 }}>{name}</span>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              style={{ background: "rgba(192,57,43,0.08)", color: "#C0392B", fontFamily: "inherit", fontWeight: 600, fontSize: 14, padding: "9px 18px", borderRadius: 10, border: "none", cursor: "pointer" }}
            >
              تسجيل الخروج
            </button>
          </div>
        </nav>
      </header>

      <main className="gx-main" style={{ maxWidth: 1120, margin: "0 auto", padding: "40px 28px 64px" }}>
        {/* welcome */}
        <div style={{ marginBottom: 30 }}>
          <h1 style={{ fontSize: "clamp(26px,3vw,36px)", fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 8px", color: C.navy }}>مرحباً، {name} 👋</h1>
          <p style={{ fontSize: 16.5, color: C.slate, margin: 0 }}>أهلاً بك في عالم مكافآت GALTEX — تابع نقاطك واستبدلها بمكافآت حصرية.</p>
        </div>

        {message && (
          <div style={{ background: "rgba(192,57,43,0.08)", border: "1px solid rgba(192,57,43,0.25)", color: "#C0392B", borderRadius: 16, padding: 16, textAlign: "center", fontWeight: 600, marginBottom: 22 }}>
            {message}
          </div>
        )}

        {/* top grid: balance + start */}
        <div className="gx-top" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 22, marginBottom: 22 }}>
          {/* balance card */}
          <div style={{ position: "relative", background: `linear-gradient(140deg, ${C.blue} 0%, ${C.navy} 100%)`, borderRadius: 22, padding: "34px 34px", color: C.beige, overflow: "hidden", boxShadow: "0 26px 50px -28px rgba(18,44,92,0.6)" }}>
            <span style={{ position: "absolute", top: -50, insetInlineStart: -40, width: 200, height: 200, background: "rgba(196,149,46,0.14)", clipPath: "polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)", animation: "gxFloat 6s ease-in-out infinite" }} />
            <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 15, color: "#C6D2EA" }}>رصيد النقاط الحالي</span>
            </div>
            <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 72, lineHeight: 1 }}>{isLoading ? "..." : points}</span>
              <span style={{ fontSize: 16, color: "#C6D2EA" }}>نقطة</span>
            </div>
            <p style={{ position: "relative", zIndex: 1, fontSize: 14.5, color: "#9FB2D6", margin: "10px 0 24px" }}>نقطة مفرَج عنها وجاهزة للاستخدام</p>
            <div style={{ position: "relative", zIndex: 1, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => router.push("/rewards")}
                style={{ background: C.gold, color: C.navy, fontFamily: "inherit", fontWeight: 700, fontSize: 14.5, padding: "12px 22px", borderRadius: 11, border: "none", cursor: "pointer" }}
              >
                استبدل نقاطك
              </button>
              <button
                type="button"
                onClick={loadDashboard}
                disabled={isLoading}
                style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: C.beige, fontFamily: "inherit", fontWeight: 600, fontSize: 14.5, padding: "12px 22px", borderRadius: 11, cursor: isLoading ? "not-allowed" : "pointer" }}
              >
                {isLoading ? "جاري التحديث..." : "تحديث الرصيد"}
              </button>
            </div>
          </div>

          {/* start easily card */}
          <div style={{ background: C.cream, border: "1px solid rgba(18,44,92,0.1)", borderRadius: 22, padding: "30px 28px", display: "flex", flexDirection: "column" }}>
            <div style={{ width: 46, height: 46, borderRadius: 13, background: "rgba(196,149,46,0.15)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
              <span style={{ width: 20, height: 20, background: C.gold, display: "inline-block", clipPath: "polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)" }} />
            </div>
            <h3 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px", color: C.navy }}>ابدأ بسهولة</h3>
            <p style={{ fontSize: 15, color: C.slate, margin: "0 0 20px", lineHeight: 1.7 }}>امسح رمز QR الموجود على منتج GALTEX لتسجيل نقاط المكافآت في حسابك.</p>
            <button
              type="button"
              onClick={() => router.push("/rewards/scan")}
              style={{ marginTop: "auto", width: "100%", background: C.blue, color: C.beige, fontFamily: "inherit", fontWeight: 700, fontSize: 15, padding: 13, borderRadius: 12, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 9 }}
            >
              <span style={{ width: 9, height: 9, background: C.gold, transform: "rotate(45deg)", display: "inline-block" }} />
              مسح رمز QR
            </button>
          </div>
        </div>

        {/* action tiles */}
        <div className="gx-tiles" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 22 }}>
          <button
            type="button"
            onClick={() => router.push("/rewards/profile")}
            className="gx-action"
            style={{ background: C.cream, border: "1px solid rgba(18,44,92,0.1)", borderRadius: 18, padding: "26px 22px", cursor: "pointer", textAlign: "right", display: "flex", alignItems: "center", gap: 16, fontFamily: "inherit" }}
          >
            <span style={{ flex: "none", width: 48, height: 48, borderRadius: 13, background: "rgba(22,64,127,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ width: 20, height: 20, border: `2.5px solid ${C.blue}`, borderRadius: "50%", display: "inline-block" }} />
            </span>
            <span>
              <span style={{ display: "block", fontSize: 16.5, fontWeight: 600, color: C.navy, marginBottom: 2 }}>الملف الشخصي</span>
              <span style={{ fontSize: 13, color: C.ink }}>بياناتك ومعلومات الورشة</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => router.push("/rewards/history")}
            className="gx-action"
            style={{ background: C.cream, border: "1px solid rgba(18,44,92,0.1)", borderRadius: 18, padding: "26px 22px", cursor: "pointer", textAlign: "right", display: "flex", alignItems: "center", gap: 16, fontFamily: "inherit" }}
          >
            <span style={{ flex: "none", width: 48, height: 48, borderRadius: 13, background: "rgba(22,64,127,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 20 }}>
                <span style={{ width: 4, height: 10, background: C.blue, borderRadius: 1 }} />
                <span style={{ width: 4, height: 16, background: C.blue, borderRadius: 1 }} />
                <span style={{ width: 4, height: 13, background: C.blue, borderRadius: 1 }} />
              </span>
            </span>
            <span>
              <span style={{ display: "block", fontSize: 16.5, fontWeight: 600, color: C.navy, marginBottom: 2 }}>سجل النقاط</span>
              <span style={{ fontSize: 13, color: C.ink }}>كل عمليات الكسب والاستبدال</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => router.push("/rewards/scan")}
            className="gx-action"
            style={{ background: C.cream, border: "1px solid rgba(18,44,92,0.1)", borderRadius: 18, padding: "26px 22px", cursor: "pointer", textAlign: "right", display: "flex", alignItems: "center", gap: 16, fontFamily: "inherit" }}
          >
            <span style={{ flex: "none", width: 48, height: 48, borderRadius: 13, background: "rgba(22,64,127,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ width: 20, height: 20, background: "repeating-conic-gradient(#16407F 0% 25%, transparent 0% 50%) 0 0 / 7px 7px", display: "inline-block" }} />
            </span>
            <span>
              <span style={{ display: "block", fontSize: 16.5, fontWeight: 600, color: C.navy, marginBottom: 2 }}>مسح QR</span>
              <span style={{ fontSize: 13, color: C.ink }}>أضف نقاطاً من منتج جديد</span>
            </span>
          </button>
        </div>
      </main>

      <footer style={{ borderTop: "1px solid rgba(18,44,92,0.08)", background: "#ECE7DD" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "22px 28px", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <span style={{ fontSize: 13, color: C.ink }}>© ٢٠٢٦ GALTEX — نظام مكافآت العملاء</span>
          <a href="/" style={{ fontSize: 13, fontWeight: 600, color: C.blue }}>العودة إلى الموقع ›</a>
        </div>
      </footer>

      <style>{`
        .gx-action { transition: all .18s; }
        .gx-action:hover { border-color: #16407F !important; box-shadow: 0 10px 24px -14px rgba(22,64,127,0.4); transform: translateY(-2px); }
        @keyframes gxFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @media (max-width:760px){
          .gx-top, .gx-tiles { grid-template-columns:1fr !important; }
          .gx-main { padding:26px 18px 48px !important; }
          .gx-nav { padding:14px 18px !important; }
          .gx-username { display:none !important; }
        }
      `}</style>
    </div>
  );
}