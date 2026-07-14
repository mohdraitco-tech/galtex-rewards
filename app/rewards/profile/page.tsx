"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

/* ============================================================
   GALTEX Rewards — الملف الشخصي (/rewards/profile)
   الشكل: تصميم Claude Design الجديد (Profile) — كحلي/ذهبي/بيج
   المنطق: نفس منطق النظام (get_customer_profile + تسجيل الخروج) — لم يُمَس
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

type ProfileData = {
  first_name: string;
  last_name: string;
  username: string;
  customer_number: string | null;
  customer_type: string | null;
  city: string | null;
  country: string | null;
  phone_international: string | null;
  points: number;
  status: string;
  created_at: string;
};

export default function CustomerProfilePage() {
  const router = useRouter();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  const loadProfile = useCallback(async () => {
    setIsLoading(true);
    setMessage("");

    const customerId = localStorage.getItem("galtex_customer_id");

    if (!customerId) {
      router.replace("/");
      return;
    }

    const { data, error } = await supabase.rpc("get_customer_profile", {
      p_customer_id: customerId,
    });

    if (error || !data?.success) {
      setMessage(data?.message || error?.message || "تعذر تحميل بيانات الحساب");
      setIsLoading(false);
      return;
    }

    setProfile(data as ProfileData);
    setIsLoading(false);
  }, [router]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  function handleLogout() {
    localStorage.removeItem("galtex_customer_id");
    localStorage.removeItem("galtex_customer_number");
    localStorage.removeItem("galtex_customer_name");
    localStorage.removeItem("galtex_customer_points");

    router.replace("/");
  }

  const typeLabel =
    profile?.customer_type === "seller"
      ? "مبيعات / تاجر"
      : profile?.customer_type === "mechanic"
      ? "ميكانيكي"
      : "-";

  const initial = (profile?.first_name || "ع").trim().charAt(0) || "ع";

  return (
    <div dir="rtl" style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif", background: C.beige, color: C.navy, minHeight: "100vh" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* ===== HEADER ===== */}
      <header style={{ background: "rgba(245,242,236,0.85)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(18,44,92,0.08)", position: "sticky", top: 0, zIndex: 40 }}>
        <nav className="gx-nav" style={{ maxWidth: 1020, margin: "0 auto", padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
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

      <main className="gx-main" style={{ maxWidth: 1020, margin: "0 auto", padding: "40px 28px 64px" }}>
        {/* title */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: "clamp(26px,3vw,34px)", fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 6px", color: C.navy }}>الملف الشخصي</h1>
          <p style={{ fontSize: 16, color: C.slate, margin: 0 }}>بيانات حسابك في GALTEX Rewards</p>
        </div>

        {message && (
          <div style={{ background: "rgba(192,57,43,0.08)", border: "1px solid rgba(192,57,43,0.25)", color: "#C0392B", borderRadius: 16, padding: 16, textAlign: "center", fontWeight: 600, marginBottom: 22 }}>
            {message}
          </div>
        )}

        {isLoading ? (
          <div style={{ background: C.cream, border: "1px solid rgba(18,44,92,0.1)", borderRadius: 22, padding: 40, textAlign: "center", color: C.ink }}>
            جاري تحميل البيانات...
          </div>
        ) : profile ? (
          <>
            {/* identity card */}
            <div style={{ position: "relative", background: `linear-gradient(140deg, ${C.blue} 0%, ${C.navy} 100%)`, borderRadius: 22, padding: 34, color: C.beige, overflow: "hidden", boxShadow: "0 26px 50px -28px rgba(18,44,92,0.6)", marginBottom: 22 }}>
              <span style={{ position: "absolute", top: -50, insetInlineStart: -40, width: 200, height: 200, background: "rgba(196,149,46,0.14)", clipPath: "polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)", animation: "gxFloat 6s ease-in-out infinite" }} />
              <div className="gx-idcard" style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
                <span style={{ flex: "none", width: 74, height: 74, borderRadius: 20, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 30 }}>{initial}</span>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 13.5, color: "#9FB2D6", marginBottom: 3 }}>مرحباً</div>
                  <div style={{ fontSize: 26, fontWeight: 700, marginBottom: 12 }}>{profile.first_name} {profile.last_name}</div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {profile.customer_number && (
                      <span style={{ background: "rgba(255,255,255,0.12)", fontSize: 13, fontWeight: 600, padding: "6px 14px", borderRadius: 100 }}>رقم العميل: {profile.customer_number}</span>
                    )}
                    <span style={{ background: "rgba(255,255,255,0.12)", fontSize: 13, fontWeight: 600, padding: "6px 14px", borderRadius: 100 }}>{typeLabel}</span>
                  </div>
                </div>
                <div className="gx-idpoints" style={{ textAlign: "center", paddingInlineStart: 22, borderInlineStart: "1px solid rgba(255,255,255,0.15)" }}>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 52, lineHeight: 1, color: C.beige }}>{profile.points}</div>
                  <div style={{ fontSize: 13.5, color: "#C6D2EA", marginTop: 4 }}>نقطة في رصيدك</div>
                </div>
              </div>
            </div>

            {/* account data */}
            <div style={{ background: C.cream, border: "1px solid rgba(18,44,92,0.1)", borderRadius: 22, padding: 32, marginBottom: 22 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 22px", color: C.navy }}>بيانات الحساب</h2>
              <div className="gx-acct" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <InfoBox label="اسم المستخدم" value={profile.username} ltr />
                <InfoBox label="المدينة" value={profile.city || "-"} />
                <InfoBox label="الدولة" value={profile.country || "-"} />
                <InfoBox label="رقم الجوال" value={profile.phone_international || "-"} ltr />
                <InfoBox label="حالة الحساب" value={profile.status === "active" ? "مفعّل" : profile.status} />
                <InfoBox label="تاريخ الانضمام" value={new Date(profile.created_at).toLocaleDateString("ar-SA")} />
              </div>
            </div>

            {/* actions */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <button
                type="button"
                onClick={() => router.push("/rewards")}
                style={{ textAlign: "center", background: C.blue, color: C.beige, fontFamily: "inherit", fontWeight: 700, fontSize: 15.5, padding: 15, borderRadius: 13, border: "none", cursor: "pointer" }}
              >
                العودة إلى لوحة المكافآت
              </button>

              <a href="/forgot-password" style={{ textAlign: "center", background: C.cream, color: C.blue, fontFamily: "inherit", fontWeight: 700, fontSize: 15, padding: 14, border: "1px solid rgba(18,44,92,0.18)", borderRadius: 13, display: "block" }}>
                تغيير كلمة المرور
              </a>

              <button
                type="button"
                onClick={handleLogout}
                style={{ textAlign: "center", background: "rgba(192,57,43,0.07)", color: "#C0392B", fontFamily: "inherit", fontWeight: 700, fontSize: 15, padding: 14, borderRadius: 13, border: "none", cursor: "pointer" }}
              >
                تسجيل الخروج
              </button>
            </div>
          </>
        ) : null}
      </main>

      <footer style={{ borderTop: "1px solid rgba(18,44,92,0.08)", background: "#ECE7DD" }}>
        <div style={{ maxWidth: 1020, margin: "0 auto", padding: "22px 28px", textAlign: "center" }}>
          <span style={{ fontSize: 13, color: C.ink }}>© ٢٠٢٦ GALTEX — نظام مكافآت العملاء</span>
        </div>
      </footer>

      <style>{`
        @keyframes gxFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @media (max-width:760px){
          .gx-acct { grid-template-columns:1fr !important; }
          .gx-main { padding:26px 18px 48px !important; }
          .gx-nav { padding:14px 18px !important; }
          .gx-idcard { flex-direction:column !important; align-items:flex-start !important; }
          .gx-idpoints { padding-inline-start:0 !important; border-inline-start:none !important; border-top:1px solid rgba(255,255,255,0.15) !important; padding-top:16px !important; text-align:start !important; width:100%; }
        }
      `}</style>
    </div>
  );
}

function InfoBox({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div style={{ background: "#F5F2EC", border: "1px solid rgba(18,44,92,0.08)", borderRadius: 14, padding: "16px 18px" }}>
      <div style={{ fontSize: 13, color: "#7A8498", marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 16.5, fontWeight: 600, color: "#0E2C5C", ...(ltr ? { fontFamily: "'Space Grotesk',sans-serif", direction: "ltr", textAlign: "right" } : {}) }}>
        {value}
      </div>
    </div>
  );
}