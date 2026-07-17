"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getDeviceId } from "@/utils/deviceId";

/* ============================================================
   GALTEX Rewards — بطاقة دخول العميل
   الشكل: تصميم Claude Design الجديد (لوحة كحلية + نموذج بيج)
   المنطق: نفس منطق النظام (Supabase RPC + نقل الجهاز) — لم يُمَس
   ============================================================ */

const C = {
  navy: "#0E2C5C",
  blue: "#16407F",
  gold: "#C4952E",
  beige: "#F5F2EC",
  cream: "#FFFDF8",
  slate: "#586377",
  slate3: "#33405A",
  border: "rgba(18,44,92,0.18)",
};

export default function CustomerLoginCard() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [deviceMismatchCustomerId, setDeviceMismatchCustomerId] = useState<string | null>(null);
  const [isRequestingTransfer, setIsRequestingTransfer] = useState(false);
  const [transferRequestSent, setTransferRequestSent] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage("");
    setDeviceMismatchCustomerId(null);
    setTransferRequestSent(false);
    setIsLoading(true);

    try {
      const { data, error } = await supabase.rpc("login_customer", {
        p_username: username.trim(),
        p_password: password,
        p_device_id: getDeviceId(),
      });

      if (error) {
        console.error("LOGIN CUSTOMER ERROR:", error);

        setMessage(
          `خطأ: ${error.message}${
            error.code ? ` — الكود: ${error.code}` : ""
          }`
        );

        return;
      }

      if (!data?.success) {
        setMessage(data?.message || "تعذر تسجيل الدخول");

        if (data?.status === "device_mismatch" && data?.customer_id) {
          setDeviceMismatchCustomerId(data.customer_id);
        }

        return;
      }

      localStorage.setItem("galtex_customer_id", String(data.customer_id ?? ""));
      localStorage.setItem("galtex_customer_number", String(data.customer_number || ""));
      localStorage.setItem("galtex_customer_name", `${data.first_name} ${data.last_name}`);
      localStorage.setItem("galtex_customer_points", String(data.points || 0));

      router.push("/rewards");
    } catch (err) {
      console.error("UNEXPECTED CUSTOMER LOGIN ERROR:", err);

      setMessage(
        err instanceof Error
          ? `خطأ غير متوقع: ${err.message}`
          : "حدث خطأ غير متوقع"
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function requestDeviceTransfer() {
    if (!deviceMismatchCustomerId) return;

    setIsRequestingTransfer(true);
    setMessage("");

    const { data, error } = await supabase.rpc("request_device_transfer", {
      p_customer_id: deviceMismatchCustomerId,
      p_new_device_id: getDeviceId(),
    });

    if (error || !data?.success) {
      setMessage(data?.message || error?.message || "حدث خطأ أثناء إرسال الطلب");
      setIsRequestingTransfer(false);
      return;
    }

    setMessage(data.message);
    setTransferRequestSent(true);
    setIsRequestingTransfer(false);
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    fontFamily: "inherit",
    fontSize: 15,
    color: C.navy,
    background: C.cream,
    border: `1px solid ${C.border}`,
    borderRadius: 11,
    padding: "13px 15px",
  };
  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 13.5,
    fontWeight: 600,
    color: C.slate3,
    marginBottom: 7,
  };

  return (
    <div
      dir="rtl"
      className="gx-login"
      style={{
        fontFamily: "'IBM Plex Sans Arabic', sans-serif",
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        background: C.beige,
        color: C.navy,
      }}
    >
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* ===== LEFT: BRAND PANEL ===== */}
      <div
        className="gx-login-brand"
        style={{
          position: "relative",
          background: `linear-gradient(155deg, ${C.blue} 0%, ${C.navy} 100%)`,
          color: C.beige,
          padding: "48px 52px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          overflow: "hidden",
        }}
      >
        {/* نجمة زخرفية متحركة */}
        <span
          style={{
            position: "absolute",
            top: -60,
            insetInlineEnd: -60,
            width: 260,
            height: 260,
            background: "rgba(196,149,46,0.12)",
            clipPath: "polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)",
            animation: "gxFloat 6s ease-in-out infinite",
          }}
        />

        {/* الشعار (نص أبيض — يظهر واضح على الكحلي) */}
        <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 30, letterSpacing: "0.06em", color: "#FFFFFF", alignSelf: "flex-start" }}>
          GALTEX
        </span>

        <div style={{ position: "relative", zIndex: 1 }}>
          <h2 style={{ fontSize: "clamp(26px,2.6vw,36px)", fontWeight: 700, lineHeight: 1.25, letterSpacing: "-0.02em", margin: "0 0 16px" }}>
            نظام مكافآت العملاء<br />من GALTEX
          </h2>
          <p style={{ fontSize: 16.5, color: "#C6D2EA", margin: "0 0 30px", maxWidth: 380 }}>
            سجّل الدخول لمتابعة رصيد نقاطك واستبدال مكافآتك وبطاقات الهدايا الحصرية.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {[
              "اجمع النقاط مع كل عملية شراء لقطع أصلية",
              "استبدلها بأدوات ومعدات وبطاقات هدايا",
              "ارتقِ بين الفئات: فضي، ذهبي، بلاتيني",
            ].map((line, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ width: 9, height: 9, background: C.gold, transform: "rotate(45deg)", flex: "none" }} />
                <span style={{ fontSize: 15.5, color: "#DDE6F5" }}>{line}</span>
              </div>
            ))}
          </div>
        </div>

        {/* بطاقة نقاط زخرفية */}
        <div style={{ position: "relative", zIndex: 1, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: "18px 20px", display: "flex", alignItems: "center", gap: 14, maxWidth: 340 }}>
          <div>
            <div style={{ fontSize: 12.5, color: "#9FB2D6", marginBottom: 4 }}>رصيد نقاطك</div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 30, lineHeight: 1 }}>12,450</div>
          </div>
          <span style={{ marginInlineStart: "auto", background: C.gold, color: C.navy, fontWeight: 700, fontSize: 11.5, padding: "4px 11px", borderRadius: 100 }}>الفئة الذهبية</span>
        </div>
      </div>

      {/* ===== RIGHT: FORM PANEL ===== */}
      <div className="gx-login-form" style={{ display: "flex", flexDirection: "column", padding: "36px 52px", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <a href="/" style={{ color: C.slate3, fontWeight: 600, fontSize: 14.5 }}>‹ العودة إلى الموقع</a>
          <button type="button" style={{ background: "rgba(18,44,92,0.06)", border: "none", color: C.blue, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 13, padding: "8px 16px", borderRadius: 100, cursor: "pointer" }}>English</button>
        </div>

        <div style={{ width: "100%", maxWidth: 420, margin: "0 auto" }}>
          {/* أزرار التبويب: دخول (نشط) / إنشاء حساب (ينقل لصفحة التسجيل) */}
          <div style={{ display: "flex", background: "rgba(18,44,92,0.06)", borderRadius: 12, padding: 5, marginBottom: 28 }}>
            <button
              type="button"
              style={{ flex: 1, fontFamily: "inherit", fontWeight: 600, fontSize: 14.5, padding: 10, border: "none", borderRadius: 9, cursor: "pointer", background: C.blue, color: C.beige, boxShadow: "0 4px 12px -4px rgba(22,64,127,0.5)" }}
            >
              تسجيل الدخول
            </button>
            <button
              type="button"
              onClick={() => router.push("/register")}
              style={{ flex: 1, fontFamily: "inherit", fontWeight: 600, fontSize: 14.5, padding: 10, border: "none", borderRadius: 9, cursor: "pointer", background: "transparent", color: C.slate3 }}
            >
              إنشاء حساب
            </button>
          </div>

          <h1 style={{ fontSize: 25, fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 6px", color: C.navy }}>مرحباً بعودتك</h1>
          <p style={{ fontSize: 15, color: C.slate, margin: "0 0 26px" }}>سجّل الدخول للوصول إلى نقاطك ومكافآتك.</p>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>اسم المستخدم</label>
              <input
                className="gx-input"
                type="text"
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="أدخل اسم المستخدم أو رقم الجوال"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>كلمة المرور</label>
              <input
                className="gx-input"
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="أدخل كلمة المرور"
                style={inputStyle}
              />
            </div>

            {message && !deviceMismatchCustomerId && (
              <div style={{ textAlign: "center", fontSize: 14, fontWeight: 600, color: C.blue, background: "rgba(22,64,127,0.08)", borderRadius: 11, padding: 12, marginBottom: 18 }}>
                {message}
              </div>
            )}

            {deviceMismatchCustomerId && (
              <div style={{ background: "rgba(196,149,46,0.10)", border: "1px solid rgba(196,149,46,0.35)", borderRadius: 12, padding: 16, marginBottom: 18, display: "flex", flexDirection: "column", gap: 12 }}>
                <p style={{ textAlign: "center", fontSize: 14, fontWeight: 600, color: "#8F6819", margin: 0 }}>{message}</p>

                {transferRequestSent ? (
                  <p style={{ textAlign: "center", fontSize: 14, color: "#1F8A5B", fontWeight: 600, margin: 0 }}>
                    تم إرسال الطلب بنجاح، انتظر موافقة الإدارة ثم حاول تسجيل الدخول مرة أخرى.
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={requestDeviceTransfer}
                    disabled={isRequestingTransfer}
                    style={{ width: "100%", background: isRequestingTransfer ? "#9AA3B5" : C.gold, color: C.navy, fontFamily: "inherit", fontWeight: 700, fontSize: 15, padding: 12, border: "none", borderRadius: 11, cursor: isRequestingTransfer ? "not-allowed" : "pointer" }}
                  >
                    {isRequestingTransfer ? "جاري الإرسال..." : "طلب نقل الجهاز"}
                  </button>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              style={{ width: "100%", background: isLoading ? "#9AA3B5" : C.blue, color: C.beige, fontFamily: "inherit", fontWeight: 700, fontSize: 16, padding: 14, border: "none", borderRadius: 12, cursor: isLoading ? "not-allowed" : "pointer" }}
            >
              {isLoading ? "جاري تسجيل الدخول..." : "تسجيل الدخول"}
            </button>
          </form>

          <p style={{ fontSize: 14.5, color: C.slate, textAlign: "center", margin: "22px 0 12px" }}>ليس لديك حساب؟</p>
          <a href="/register" style={{ display: "block", width: "100%", boxSizing: "border-box", textAlign: "center", background: C.cream, color: C.blue, fontFamily: "inherit", fontWeight: 700, fontSize: 15, padding: 13, border: `1px solid ${C.blue}`, borderRadius: 12 }}>
            إنشاء حساب جديد
          </a>
          <p style={{ textAlign: "center", margin: "18px 0 0" }}>
            <a href="/forgot-password" style={{ fontSize: 14, color: "#7A8498" }}>نسيت كلمة المرور؟</a>
          </p>
        </div>

        <div style={{ marginTop: "auto", paddingTop: 28, textAlign: "center" }}>
          <span style={{ fontSize: 12.5, color: "#9AA3B5" }}>© ٢٠٢٦ GALTEX — نظام مكافآت العملاء</span>
        </div>
      </div>

      <style>{`
        .gx-input::placeholder { color: #9AA3B5; }
        .gx-input:focus { outline: none; border-color: #16407F; box-shadow: 0 0 0 3px rgba(22,64,127,0.12); }
        .gx-input { transition: border-color .15s, box-shadow .15s; }
        @keyframes gxFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-9px); } }
        @media (max-width:820px){
          .gx-login { grid-template-columns:1fr !important; }
          .gx-login-brand { display:none !important; }
          .gx-login-form { padding:28px 22px !important; }
        }
      `}</style>
    </div>
  );
}