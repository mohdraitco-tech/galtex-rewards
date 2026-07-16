"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

/* ============================================================
   GALTEX Rewards — تسجيل دخول الإدارة (/admin/login)
   الشكل: مطابق لتصميم المصمم (كرت مركزي على خلفية بيج بنجمتين)
   المنطق: نُسخ حرفياً من الملف الأصلي (login_admin) — لم يتغيّر
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
  border: "rgba(18,44,92,0.18)",
};

export default function AdminLoginPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage("");
    setIsLoading(true);

    const { data, error } = await supabase.rpc("login_admin", {
      p_username: username.trim(),
      p_password: password,
    });

    if (error) {
      setMessage("حدث خطأ أثناء تسجيل الدخول");
      setIsLoading(false);
      return;
    }

    if (!data?.success) {
      setMessage(data?.message || "تعذر تسجيل الدخول");
      setIsLoading(false);
      return;
    }

    localStorage.setItem("galtex_admin_id", data.admin_id);
    localStorage.setItem("galtex_admin_username", data.username);
    localStorage.setItem("galtex_admin_name", data.full_name);
    localStorage.setItem("galtex_admin_role", data.role);
    // صلاحيات الموظف المرنة (كائن JSON) — تُستخدم لإخفاء/إظهار الأقسام
    // بلوحة الإدارة. المدير العام ما يحتاجها لأن عنده كل الصلاحيات دائمًا.
    localStorage.setItem("galtex_admin_permissions", JSON.stringify(data.permissions || {}));

    router.push("/admin");
  }

  const star =
    "polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)";

  return (
    <div
      dir="rtl"
      style={{
        fontFamily: "'IBM Plex Sans Arabic', sans-serif",
        background: "linear-gradient(160deg,#F5F2EC 0%,#ECE7DD 100%)",
        color: C.navy,
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 20px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* نجمتان زخرفيتان في الخلفية */}
      <span style={{ position: "absolute", top: -90, insetInlineEnd: -70, width: 320, height: 320, background: "rgba(22,64,127,0.06)", clipPath: star, animation: "gxFloat 8s ease-in-out infinite", pointerEvents: "none" }} />
      <span style={{ position: "absolute", bottom: -80, insetInlineStart: -60, width: 240, height: 240, background: "rgba(196,149,46,0.08)", clipPath: star, animation: "gxFloat 9s ease-in-out infinite", pointerEvents: "none" }} />

      {/* الكرت المركزي */}
      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 440, background: C.cream, border: "1px solid rgba(18,44,92,0.1)", borderRadius: 24, padding: "44px 40px", boxShadow: "0 34px 70px -34px rgba(18,44,92,0.4)" }}>

        {/* الشعار + العنوان */}
        <div style={{ textAlign: "center", marginBottom: 34 }}>
          <span style={{ display: "inline-flex", background: C.beige, border: "1px solid rgba(18,44,92,0.08)", borderRadius: 18, padding: "16px 22px", marginBottom: 22 }}>
            <img src="/galtex-logo.png" alt="GALTEX" style={{ height: 38, width: "auto", display: "block" }} />
          </span>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, marginBottom: 8 }}>
            <span style={{ width: 12, height: 12, background: C.gold, display: "inline-block", clipPath: star }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: C.goldDark }}>GALTEX Rewards</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", margin: 0, color: C.navy }}>لوحة تحكم الإدارة</h1>
          <p style={{ fontSize: 14.5, color: C.slate, margin: "8px 0 0" }}>سجّل الدخول للوصول إلى إدارة النظام</p>
        </div>

        {/* النموذج */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: C.slate3, marginBottom: 7 }}>اسم المستخدم</label>
            <input
              className="gx-in"
              type="text"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="أدخل اسم المستخدم"
              autoFocus
              style={{ width: "100%", fontFamily: "inherit", fontSize: 15, color: C.navy, background: "#FFFFFF", border: `1px solid ${C.border}`, borderRadius: 12, padding: "13px 15px", transition: "border-color .15s, box-shadow .15s" }}
            />
          </div>

          <div style={{ marginBottom: 26 }}>
            <label style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: C.slate3, marginBottom: 7 }}>كلمة المرور</label>
            <input
              className="gx-in"
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="أدخل كلمة المرور"
              style={{ width: "100%", fontFamily: "inherit", fontSize: 15, color: C.navy, background: "#FFFFFF", border: `1px solid ${C.border}`, borderRadius: 12, padding: "13px 15px", transition: "border-color .15s, box-shadow .15s" }}
            />
          </div>

          {message && (
            <div style={{ textAlign: "center", fontSize: 14, fontWeight: 600, color: "#C0392B", background: "rgba(192,57,43,0.08)", borderRadius: 11, padding: 12, marginBottom: 18 }}>
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="gx-btn"
            style={{ display: "block", width: "100%", textAlign: "center", background: isLoading ? "#9AA3B5" : C.blue, color: C.beige, fontWeight: 700, fontSize: 16, padding: 15, borderRadius: 13, border: "none", fontFamily: "inherit", cursor: isLoading ? "not-allowed" : "pointer" }}
          >
            {isLoading ? "جاري تسجيل الدخول..." : "تسجيل الدخول"}
          </button>
        </form>

        <p style={{ textAlign: "center", fontSize: 12.5, color: "#9AA3B5", margin: "26px 0 0" }}>© ٢٠٢٦ GALTEX — دخول الإدارة فقط</p>
      </div>

      <style>{`
        .gx-in::placeholder { color: #9AA3B5; }
        .gx-in:focus { outline: none; border-color: #16407F; box-shadow: 0 0 0 3px rgba(22,64,127,0.12); }
        .gx-btn { transition: all .15s; }
        .gx-btn:hover { filter: brightness(0.96); }
        @keyframes gxFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-9px); } }
      `}</style>
    </div>
  );
}