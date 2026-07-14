"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Html5Qrcode } from "html5-qrcode";
import { supabase } from "@/lib/supabase/client";

/* ============================================================
   GALTEX Rewards — مسح رمز QR (/rewards/scan)
   الشكل: تصميم Claude Design الجديد (Scan) — كحلي/ذهبي/بيج
   المنطق: نفس منطق الكاميرا (Html5Qrcode + redeem_qr_code) — لم يُمَس
   ملاحظة: <div id="qr-reader"> يبقى كما هو (تُعرض فيه الكاميرا الحقيقية)
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

export default function ScanPage() {
  const router = useRouter();
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const [message, setMessage] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  async function redeemCode(decodedText: string) {
    if (isProcessing) return;

    setIsProcessing(true);
    setMessage("جاري التحقق من الرمز...");

    const customerId = localStorage.getItem("galtex_customer_id");

    if (!customerId) {
      setMessage("يرجى تسجيل الدخول مرة أخرى");
      setIsProcessing(false);
      return;
    }

    const { data, error } = await supabase.rpc("redeem_qr_code", {
      p_customer_id: customerId,
      p_token: decodedText.trim(),
    });

    if (error) {
      setMessage(error.message || "حدث خطأ أثناء التحقق من الرمز");
      setIsProcessing(false);
      return;
    }

    if (!data?.success) {
      setMessage(data?.message || "لم يتم قبول الرمز");
      setIsProcessing(false);
      return;
    }

    localStorage.setItem(
      "galtex_customer_points",
      String(data.new_balance || 0)
    );

    setMessage(
      `${data.message} — تمت إضافة ${data.points_added} نقطة. رصيدك الآن ${data.new_balance} نقطة`
    );

    setIsProcessing(false);
  }

  async function startScanner() {
    setMessage("");

    try {
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        async (decodedText) => {
          await stopScanner();
          await redeemCode(decodedText);
        },
        () => {}
      );

      setIsScanning(true);
    } catch {
      setMessage("تعذر تشغيل الكاميرا. تأكد من السماح باستخدام الكاميرا.");
    }
  }

  async function stopScanner() {
    try {
      if (scannerRef.current) {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
        scannerRef.current = null;
      }
    } catch {}

    setIsScanning(false);
  }

  return (
    <div dir="rtl" style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif", background: C.beige, color: C.navy, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* ===== HEADER ===== */}
      <header style={{ background: "rgba(245,242,236,0.85)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(18,44,92,0.08)", position: "sticky", top: 0, zIndex: 40 }}>
        <nav className="gx-nav" style={{ maxWidth: 900, margin: "0 auto", padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
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

      <main className="gx-main" style={{ maxWidth: 720, width: "100%", margin: "0 auto", padding: "44px 28px 64px", flex: 1 }}>
        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(196,149,46,0.15)", color: C.goldDark, fontWeight: 600, fontSize: 13.5, padding: "7px 15px", borderRadius: 100, marginBottom: 16 }}>
            <span style={{ width: 12, height: 12, background: C.gold, display: "inline-block", clipPath: "polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)" }} />
            مسح رمز QR
          </span>
          <h1 style={{ fontSize: "clamp(24px,3vw,32px)", fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 10px", color: C.navy }}>أضف نقاطك بمسح الرمز</h1>
          <p style={{ fontSize: 16, color: C.slate, margin: "0 auto", maxWidth: 440 }}>امسح رمز QR الموجود على منتج GALTEX لإضافة نقاط المكافآت إلى حسابك.</p>
        </div>

        {/* camera viewport */}
        <div style={{ background: C.cream, border: "1px solid rgba(18,44,92,0.1)", borderRadius: 24, padding: 24, boxShadow: "0 24px 50px -30px rgba(18,44,92,0.4)" }}>
          <div style={{ position: "relative", aspectRatio: "1/1", maxWidth: 360, margin: "0 auto", background: `linear-gradient(140deg, #12203F, ${C.navy})`, borderRadius: 20, overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            {/* حاوية الكاميرا الحقيقية — تُعرض فيها الكاميرا عند التشغيل */}
            <div id="qr-reader" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 2, overflow: "hidden", borderRadius: 20 }} />

            {/* الزخرفة تظهر فقط عندما الكاميرا مطفية */}
            {!isScanning && (
              <>
                {/* corner brackets */}
                <span style={{ position: "absolute", top: 22, insetInlineStart: 22, width: 38, height: 38, borderTop: `3px solid ${C.gold}`, borderInlineStart: `3px solid ${C.gold}`, borderRadius: "6px 0 0 0", zIndex: 3 }} />
                <span style={{ position: "absolute", top: 22, insetInlineEnd: 22, width: 38, height: 38, borderTop: `3px solid ${C.gold}`, borderInlineEnd: `3px solid ${C.gold}`, borderRadius: "0 6px 0 0", zIndex: 3 }} />
                <span style={{ position: "absolute", bottom: 22, insetInlineStart: 22, width: 38, height: 38, borderBottom: `3px solid ${C.gold}`, borderInlineStart: `3px solid ${C.gold}`, borderRadius: "0 0 0 6px", zIndex: 3 }} />
                <span style={{ position: "absolute", bottom: 22, insetInlineEnd: 22, width: 38, height: 38, borderBottom: `3px solid ${C.gold}`, borderInlineEnd: `3px solid ${C.gold}`, borderRadius: "0 0 6px 0", zIndex: 3 }} />
                {/* scan line */}
                <span className="gx-scanline" style={{ position: "absolute", insetInline: 34, height: 2, background: "linear-gradient(90deg,transparent,#C4952E,transparent)", zIndex: 3 }} />
                {/* QR icon */}
                <span className="gx-qrfloat" style={{ width: 88, height: 88, borderRadius: 20, background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18, zIndex: 3 }}>
                  <span style={{ width: 44, height: 44, background: "repeating-conic-gradient(#F5F2EC 0% 25%, transparent 0% 50%) 0 0 / 15px 15px", display: "inline-block", borderRadius: 4 }} />
                </span>
                <div style={{ color: C.beige, fontSize: 17, fontWeight: 600, zIndex: 3 }}>جاهز لتشغيل الكاميرا</div>
                <div style={{ color: "#9FB2D6", fontSize: 13.5, marginTop: 6, textAlign: "center", maxWidth: 240, zIndex: 3 }}>اضغط الزر بالأسفل ثم وجّه الكاميرا نحو رمز QR</div>
              </>
            )}
          </div>
        </div>

        {message && (
          <div style={{ marginTop: 20, textAlign: "center", fontSize: 14.5, fontWeight: 600, color: C.blue, background: "rgba(22,64,127,0.08)", borderRadius: 14, padding: 16 }}>
            {message}
          </div>
        )}

        {/* actions */}
        <div className="gx-scan-actions" style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 14, marginTop: 22 }}>
          <button
            type="button"
            onClick={() => router.push("/rewards")}
            style={{ textAlign: "center", background: C.cream, color: C.blue, fontFamily: "inherit", fontWeight: 700, fontSize: 15, padding: 15, border: "1px solid rgba(18,44,92,0.18)", borderRadius: 13, cursor: "pointer" }}
          >
            العودة إلى لوحة المكافآت
          </button>

          {!isScanning ? (
            <button
              type="button"
              onClick={startScanner}
              disabled={isProcessing}
              style={{ background: isProcessing ? "#9AA3B5" : C.blue, color: C.beige, fontFamily: "inherit", fontWeight: 700, fontSize: 15.5, padding: 15, border: "none", borderRadius: 13, cursor: isProcessing ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 9 }}
            >
              <span style={{ width: 10, height: 10, background: C.gold, transform: "rotate(45deg)", display: "inline-block" }} />
              {isProcessing ? "جاري التحقق..." : "تشغيل الكاميرا"}
            </button>
          ) : (
            <button
              type="button"
              onClick={stopScanner}
              style={{ background: "#C0392B", color: "#FFFFFF", fontFamily: "inherit", fontWeight: 700, fontSize: 15.5, padding: 15, border: "none", borderRadius: 13, cursor: "pointer" }}
            >
              إيقاف الكاميرا
            </button>
          )}
        </div>

        <p style={{ textAlign: "center", fontSize: 13.5, color: C.ink, margin: "22px 0 0" }}>لن  والتحقق منه.</p>
      </main>

      <footer style={{ borderTop: "1px solid rgba(18,44,92,0.08)", background: "#ECE7DD" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "22px 28px", textAlign: "center" }}>
          <span style={{ fontSize: 13, color: C.ink }}>© ٢٠٢٦ GALTEX — نظام مكافآت العملاء</span>
        </div>
      </footer>

      <style>{`
        @keyframes gxFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @keyframes gxScanLine { 0% { top:8%; } 50% { top:82%; } 100% { top:8%; } }
        .gx-scanline { animation: gxScanLine 2.6s ease-in-out infinite; }
        .gx-qrfloat { animation: gxFloat 5s ease-in-out infinite; }
        #qr-reader video { width:100% !important; height:100% !important; object-fit:cover !important; border-radius:20px; }
        @media (max-width:760px){
          .gx-main { padding:26px 18px 48px !important; }
          .gx-nav { padding:14px 18px !important; }
          .gx-scan-actions { grid-template-columns:1fr !important; }
        }
      `}</style>
    </div>
  );
}
