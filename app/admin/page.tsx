"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

/* ============================================================
   GALTEX Rewards — لوحة تحكم الإدارة (/admin)
   الشكل: تصميم Claude Design الجديد (Admin) — كحلي/ذهبي/بيج
   المنطق: نفس منطق النظام (الصلاحيات + الإحصائيات + الأقسام) — لم يُمَس
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

type PendingCustomer = { id: string };

type AdminCustomer = {
  customer_type: string | null;
  current_points: number;
};

type Permissions = {
  products?: boolean;
  customers?: boolean;
  qr_codes?: boolean;
  label_templates?: boolean;
  settings?: boolean;
};

export default function AdminPage() {
  const router = useRouter();

  const [adminName, setAdminName] = useState("");
  const [role, setRole] = useState<string>("");
  const [permissions, setPermissions] = useState<Permissions>({});
  const [pendingCustomers, setPendingCustomers] = useState<PendingCustomer[]>([]);
  const [allCustomers, setAllCustomers] = useState<AdminCustomer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  const stats = useMemo(() => {
    return {
      totalCustomers: allCustomers.length,
      pendingRequests: pendingCustomers.length,
      mechanics: allCustomers.filter((c) => c.customer_type === "mechanic").length,
      sellers: allCustomers.filter((c) => c.customer_type === "seller").length,
      totalPoints: allCustomers.reduce(
        (total, customer) => total + Number(customer.current_points || 0),
        0
      ),
    };
  }, [allCustomers, pendingCustomers]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setMessage("");

    const [pendingResult, customersResult] = await Promise.all([
      supabase.rpc("get_pending_customers"),
      supabase.rpc("get_admin_customers"),
    ]);

    if (pendingResult.error) {
      setMessage(pendingResult.error.message || "حدث خطأ أثناء تحميل طلبات التسجيل");
      setIsLoading(false);
      return;
    }

    if (customersResult.error) {
      setMessage(customersResult.error.message || "حدث خطأ أثناء تحميل العملاء");
      setIsLoading(false);
      return;
    }

    setPendingCustomers(pendingResult.data || []);
    setAllCustomers(customersResult.data || []);
    setIsLoading(false);
  }, []);

  function handleLogout() {
    localStorage.removeItem("galtex_admin_id");
    localStorage.removeItem("galtex_admin_username");
    localStorage.removeItem("galtex_admin_name");
    localStorage.removeItem("galtex_admin_role");
    localStorage.removeItem("galtex_admin_permissions");

    router.replace("/admin/login");
  }

  useEffect(() => {
    setAdminName(localStorage.getItem("galtex_admin_name") || "");
    setRole(localStorage.getItem("galtex_admin_role") || "");

    try {
      const raw = localStorage.getItem("galtex_admin_permissions");
      setPermissions(raw ? JSON.parse(raw) : {});
    } catch {
      setPermissions({});
    }

    loadData();
  }, [loadData]);

  const isFullAccess = role === "admin" || role === "super_admin";

  function canAccess(key: keyof Permissions) {
    return isFullAccess || Boolean(permissions[key]);
  }

  const navCards = useMemo(() => {
    const cards = [
      {
        key: "customers" as const,
        title: "إدارة العملاء والنقاط",
        description: "طلبات التسجيل، صرف النقاط، إيقاف وتفعيل الحسابات",
        href: "/admin/customers",
        badge: stats.pendingRequests > 0 ? `${stats.pendingRequests} طلب معلق` : undefined,
        accent: "#16407F",
      },
      {
        key: "products" as const,
        title: "المنتجات",
        description: "إضافة وتعديل المنتجات، وتوليد أكواد QR",
        href: "/admin/products",
        accent: "#1F8A5B",
      },
      {
        key: "qr_codes" as const,
        title: "أكواد QR",
        description: "متابعة الأكواد المولدة وحالة استخدامها",
        href: "/admin/qr-codes",
        accent: "#C4952E",
      },
      {
        key: "label_templates" as const,
        title: "قوالب الليبل",
        description: "تصميم وإدارة قوالب طباعة الليبلات",
        href: "/admin/label-templates",
        accent: "#C85A28",
      },
      {
        key: "settings" as const,
        title: "الإعدادات",
        description: "نسب توزيع النقاط بين الميكانيكي والمبيعات",
        href: "/admin/settings",
        accent: "#7A409E",
      },
    ];

    const visible = cards.filter((card) => canAccess(card.key));

    // بطاقة إدارة المستخدمين تظهر للمدير العام فقط، دايمًا، وبنهاية القائمة
    if (isFullAccess) {
      visible.push({
        key: "users" as any,
        title: "إدارة المستخدمين",
        description: "إنشاء حسابات إدارية وتحديد صلاحيات كل موظف",
        href: "/admin/users",
        accent: "#0E2C5C",
      });
    }

    return visible;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats.pendingRequests, role, permissions]);

  return (
    <div dir="rtl" style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif", background: C.beige, color: C.navy, minHeight: "100vh" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <main className="gx-main" style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 32px 60px" }}>

        {/* ===== HERO ===== */}
        <div className="gx-hero" style={{ position: "relative", background: `linear-gradient(130deg, ${C.blue} 0%, ${C.navy} 100%)`, borderRadius: 24, padding: "34px 40px", color: C.beige, overflow: "hidden", boxShadow: "0 26px 54px -30px rgba(18,44,92,0.6)", marginBottom: 24 }}>
          <span style={{ position: "absolute", bottom: -70, insetInlineStart: -40, width: 220, height: 220, background: "rgba(196,149,46,0.1)", clipPath: "polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)", animation: "gxFloat 7s ease-in-out infinite", pointerEvents: "none" }} />
          <div className="gx-hero-row" style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{ display: "inline-flex", background: C.beige, borderRadius: 12, padding: "10px 15px" }}>
                <img src="/galtex-logo.png" alt="GALTEX" style={{ height: 30, width: "auto", display: "block" }} />
              </span>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 4 }}>
                  <span style={{ width: 12, height: 12, background: C.gold, display: "inline-block", clipPath: "polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)" }} />
                  <span style={{ fontSize: 13.5, color: C.gold, fontWeight: 600 }}>لوحة تحكم الإدارة</span>
                </div>
                <h1 style={{ fontSize: "clamp(24px,2.8vw,34px)", fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>GALTEX Rewards</h1>
                {adminName && (
                  <p style={{ fontSize: 14.5, color: "#C6D2EA", margin: "5px 0 0" }}>مرحباً، {adminName} {!isFullAccess && "— موظف"}</p>
                )}
              </div>
            </div>
            <div className="gx-hero-actions" style={{ display: "flex", gap: 12 }}>
              <button
                type="button"
                onClick={loadData}
                disabled={isLoading}
                className="gx-btn"
                style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.22)", color: C.beige, fontFamily: "inherit", fontWeight: 600, fontSize: 14, padding: "11px 20px", borderRadius: 11, cursor: isLoading ? "not-allowed" : "pointer" }}
              >
                {isLoading ? "جاري التحديث..." : "تحديث البيانات"}
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="gx-btn"
                style={{ background: C.gold, color: C.navy, fontFamily: "inherit", fontWeight: 700, fontSize: 14, padding: "11px 20px", borderRadius: 11, border: "none", cursor: "pointer" }}
              >
                تسجيل الخروج
              </button>
            </div>
          </div>
        </div>

        {/* ===== KPIs ===== */}
        <div className="gx-kpis" style={{ display: "grid", gridTemplateColumns: "1.15fr 1fr 1fr 1fr 1fr", gap: 16, marginBottom: 40 }}>
          <StatCard label="إجمالي النقاط" value={stats.totalPoints} variant="dark" />
          <StatCard label="إجمالي العملاء" value={stats.totalCustomers} />
          <StatCard label="الميكانيكيين" value={stats.mechanics} />
          <StatCard label="المبيعات / التجار" value={stats.sellers} />
          <StatCard label="طلبات معلّقة" value={stats.pendingRequests} variant="gold" />
        </div>

        {message && (
          <div style={{ background: "rgba(192,57,43,0.08)", border: "1px solid rgba(192,57,43,0.25)", color: "#C0392B", padding: 16, borderRadius: 16, fontWeight: 600, textAlign: "center", marginBottom: 24 }}>
            {message}
          </div>
        )}

        {/* ===== SECTIONS ===== */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <span style={{ width: 10, height: 10, background: C.gold, transform: "rotate(45deg)", display: "inline-block" }} />
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: C.navy }}>الأقسام</h2>
        </div>

        {navCards.length === 0 ? (
          <div style={{ background: C.cream, border: "1px solid rgba(18,44,92,0.1)", borderRadius: 20, padding: 40, textAlign: "center", color: C.ink }}>
            ما عندك صلاحية وصول لأي قسم حالياً — تواصل مع المدير العام
          </div>
        ) : (
          <div className="gx-secs" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
            {navCards.map((card) => (
              <button
                key={card.href}
                type="button"
                onClick={() => router.push(card.href)}
                className="gx-sec"
                style={{ position: "relative", display: "block", width: "100%", textAlign: "right", background: C.cream, border: "1px solid rgba(18,44,92,0.1)", borderRadius: 20, padding: "26px 24px", overflow: "hidden", color: "inherit", fontFamily: "inherit", cursor: "pointer" }}
              >
                <span style={{ position: "absolute", top: 0, insetInline: 0, height: 5, background: card.accent }} />
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginTop: 6 }}>
                  <div style={{ width: 52, height: 52, borderRadius: 14, background: `${card.accent}1F`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
                    <span style={{ width: 22, height: 22, background: card.accent, display: "inline-block", clipPath: "polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)" }} />
                  </div>
                  {card.badge && (
                    <span style={{ background: "rgba(196,149,46,0.16)", border: "1px solid rgba(196,149,46,0.35)", color: C.goldDark, fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 100, whiteSpace: "nowrap" }}>
                      {card.badge}
                    </span>
                  )}
                </div>
                <h3 style={{ fontSize: 18.5, fontWeight: 700, margin: "0 0 8px", color: C.navy }}>{card.title}</h3>
                <p style={{ fontSize: 14.5, color: C.slate, margin: 0, lineHeight: 1.7 }}>{card.description}</p>
              </button>
            ))}
          </div>
        )}
      </main>

      <footer style={{ borderTop: "1px solid rgba(18,44,92,0.08)", background: "#ECE7DD" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "22px 32px", textAlign: "center" }}>
          <span style={{ fontSize: 13, color: C.ink }}>© ٢٠٢٦ GALTEX — لوحة تحكم الإدارة</span>
        </div>
      </footer>

      <style>{`
        .gx-btn { transition: all .15s; }
        .gx-btn:hover { filter: brightness(0.96); }
        .gx-sec { transition: all .18s; }
        .gx-sec:hover { transform: translateY(-3px); box-shadow: 0 18px 38px -20px rgba(18,44,92,0.4); border-color: rgba(18,44,92,0.2) !important; }
        @keyframes gxFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @media (max-width:900px){
          .gx-kpis { grid-template-columns:1fr 1fr !important; }
          .gx-secs { grid-template-columns:1fr !important; }
          .gx-main { padding:22px 16px 48px !important; }
          .gx-hero { padding:26px 24px !important; }
          .gx-hero-row { flex-direction:column; align-items:flex-start !important; }
          .gx-hero-actions { width:100%; }
        }
      `}</style>
    </div>
  );
}

function StatCard({
  label,
  value,
  variant = "normal",
}: {
  label: string;
  value: number;
  variant?: "normal" | "dark" | "gold";
}) {
  const box: React.CSSProperties =
    variant === "dark"
      ? { background: "linear-gradient(140deg,#16407F,#0E2C5C)", color: "#F5F2EC", border: "none" }
      : variant === "gold"
      ? { background: "#FBF3DC", border: "1px solid rgba(196,149,46,0.35)", color: "#8F6819" }
      : { background: "#FFFDF8", border: "1px solid rgba(18,44,92,0.1)", color: "#0E2C5C" };

  const labelColor = variant === "dark" ? "#C6D2EA" : variant === "gold" ? "#8F6819" : "#7A8498";
  const valueColor = variant === "dark" ? "#F5F2EC" : variant === "gold" ? "#8F6819" : "#0E2C5C";

  return (
    <div style={{ borderRadius: 18, padding: "22px 24px", ...box }}>
      <div style={{ fontSize: 13.5, color: labelColor, marginBottom: 10 }}>{label}</div>
      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 40, lineHeight: 1, color: valueColor }}>{value}</div>
    </div>
  );
}