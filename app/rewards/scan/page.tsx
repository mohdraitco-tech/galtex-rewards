"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Html5Qrcode } from "html5-qrcode";
import { supabase } from "@/lib/supabase/client";

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
    <main
      className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 p-4 md:p-8"
      dir="rtl"
    >
      <div className="max-w-2xl mx-auto">
        <section className="bg-white rounded-[2rem] shadow-xl p-6 md:p-10">
          <div className="text-center">
            <h1 className="text-3xl md:text-4xl font-bold text-blue-900">
              GALTEX Rewards
            </h1>

            <p className="text-xl font-bold text-blue-700 mt-3">
              مسح رمز QR
            </p>

            <p className="text-gray-500 mt-4 leading-7">
              امسح رمز QR الموجود على منتج GALTEX لإضافة نقاط المكافآت إلى حسابك.
            </p>
          </div>

          <div className="mt-8 bg-slate-50 border-2 border-dashed border-blue-200 rounded-3xl min-h-[360px] p-4">
            <div id="qr-reader" className="w-full overflow-hidden rounded-2xl" />

            {!isScanning && (
              <div className="text-center py-12">
                <div className="w-24 h-24 mx-auto bg-blue-100 rounded-3xl flex items-center justify-center">
                  <span className="text-4xl">▦</span>
                </div>

                <p className="text-blue-900 font-bold text-xl mt-5">
                  جاهز لتشغيل الكاميرا
                </p>

                <p className="text-gray-500 mt-3 leading-7">
                  اضغط الزر بالأسفل ثم وجّه الكاميرا نحو رمز QR.
                </p>
              </div>
            )}
          </div>

          {message && (
            <div className="mt-5 text-center text-sm font-semibold text-blue-700 bg-blue-50 rounded-xl p-4">
              {message}
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            {!isScanning ? (
              <button
                type="button"
                onClick={startScanner}
                disabled={isProcessing}
                className="w-full bg-blue-700 hover:bg-blue-800 disabled:bg-gray-400 text-white font-bold py-4 rounded-2xl transition"
              >
                {isProcessing ? "جاري التحقق..." : "تشغيل الكاميرا"}
              </button>
            ) : (
              <button
                type="button"
                onClick={stopScanner}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-2xl transition"
              >
                إيقاف الكاميرا
              </button>
            )}

            <button
              type="button"
              onClick={() => router.push("/rewards")}
              className="w-full border border-blue-700 text-blue-700 hover:bg-blue-50 font-bold py-4 rounded-2xl transition"
            >
              العودة إلى لوحة المكافآت
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}