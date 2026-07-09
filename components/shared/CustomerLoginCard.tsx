"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getDeviceId } from "@/utils/deviceId";

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

    const { data, error } = await supabase.rpc("login_customer", {
      p_username: username.trim(),
      p_password: password,
      p_device_id: getDeviceId(),
    });

    if (error) {
      setMessage("حدث خطأ أثناء تسجيل الدخول");
      setIsLoading(false);
      return;
    }

    if (!data?.success) {
      setMessage(data?.message || "تعذر تسجيل الدخول");

      if (data?.status === "device_mismatch" && data?.customer_id) {
        setDeviceMismatchCustomerId(data.customer_id);
      }

      setIsLoading(false);
      return;
    }

    localStorage.setItem("galtex_customer_id", data.customer_id);
    localStorage.setItem("galtex_customer_number", String(data.customer_number || ""));
    localStorage.setItem("galtex_customer_name", `${data.first_name} ${data.last_name}`);
    localStorage.setItem("galtex_customer_points", String(data.points || 0));

    router.push("/rewards");
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

  return (
    <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8" dir="rtl">
      <div className="flex justify-start mb-4">
        <button type="button" className="text-sm font-medium text-blue-700 bg-blue-50 px-4 py-2 rounded-full">
          English
        </button>
      </div>

      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-blue-900 tracking-wide">GALTEX</h1>
        <p className="text-3xl font-bold text-blue-700 mt-2">Rewards</p>
        <p className="text-gray-500 mt-3">نظام مكافآت العملاء</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">اسم المستخدم</label>
          <input
            type="text"
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="أدخل اسم المستخدم أو رقم الجوال"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">كلمة المرور</label>
          <input
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="أدخل كلمة المرور"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        {message && !deviceMismatchCustomerId && (
          <div className="text-center text-sm font-semibold text-blue-700 bg-blue-50 rounded-xl p-3">
            {message}
          </div>
        )}

        {deviceMismatchCustomerId && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 space-y-3">
            <p className="text-center text-sm font-semibold text-yellow-800">{message}</p>

            {transferRequestSent ? (
              <p className="text-center text-sm text-green-700 font-semibold">
                تم إرسال الطلب بنجاح، انتظر موافقة الإدارة ثم حاول تسجيل الدخول مرة أخرى.
              </p>
            ) : (
              <button
                type="button"
                onClick={requestDeviceTransfer}
                disabled={isRequestingTransfer}
                className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-400 text-white font-semibold py-3 rounded-xl transition"
              >
                {isRequestingTransfer ? "جاري الإرسال..." : "طلب نقل الجهاز"}
              </button>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-blue-700 hover:bg-blue-800 disabled:bg-gray-400 text-white font-semibold py-3 rounded-xl"
        >
          {isLoading ? "جاري تسجيل الدخول..." : "تسجيل الدخول"}
        </button>
      </form>

      <div className="mt-6 text-center space-y-3">
        <p className="text-sm text-gray-600">ليس لديك حساب؟</p>

        <a href="/register" className="block w-full border border-blue-700 text-blue-700 font-semibold py-3 rounded-xl hover:bg-blue-50">
          إنشاء حساب جديد
        </a>

        <a href="/forgot-password" className="block text-sm text-gray-500 hover:text-blue-700">
          نسيت كلمة المرور؟
        </a>
      </div>
    </div>
  );
}
