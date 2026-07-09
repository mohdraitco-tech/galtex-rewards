"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage("");
    setMessageType("");

    if (newPassword.length < 6) {
      setMessage("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      setMessageType("error");
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage("كلمتا المرور غير متطابقتين");
      setMessageType("error");
      return;
    }

    setIsLoading(true);

    const { data, error } = await supabase.rpc("request_password_reset", {
      p_username: username.trim(),
      p_new_password: newPassword,
    });

    if (error) {
      setMessage("حدث خطأ أثناء إرسال الطلب");
      setMessageType("error");
      setIsLoading(false);
      return;
    }

    if (!data?.success) {
      setMessage(data?.message || "تعذر إرسال الطلب");
      setMessageType("error");
      setIsLoading(false);
      return;
    }

    setMessage(data.message);
    setMessageType("success");
    setIsSubmitted(true);
    setIsLoading(false);
  }

  return (
    <main
      className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 flex items-center justify-center px-4 py-8"
      dir="rtl"
    >
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-blue-900 tracking-wide">GALTEX</h1>
          <p className="text-3xl font-bold text-blue-700 mt-2">Rewards</p>
          <p className="text-gray-500 mt-3">استعادة كلمة المرور</p>
        </div>

        {isSubmitted ? (
          <div className="text-center space-y-6">
            <div className="bg-green-50 border border-green-200 text-green-700 rounded-2xl p-5 font-semibold">
              {message}
            </div>

            <p className="text-gray-500 text-sm leading-7">
              سيتم مراجعة طلبك من قبل الإدارة، وبمجرد الموافقة ستتمكن من تسجيل الدخول بكلمة المرور الجديدة اللي أدخلتها.
            </p>

            <button
              type="button"
              onClick={() => router.push("/")}
              className="w-full bg-blue-700 hover:bg-blue-800 text-white font-semibold py-3 rounded-xl transition"
            >
              العودة لتسجيل الدخول
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-gray-500 text-sm text-center leading-6">
              أدخل اسم المستخدم (رقم الجوال) وكلمة المرور الجديدة اللي تحب تستخدمها. طلبك هيتراجع من الإدارة، وبعد الموافقة تقدر تسجل دخول بيها.
            </p>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                اسم المستخدم أو رقم الجوال
              </label>
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
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                كلمة المرور الجديدة
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="6 أحرف على الأقل"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                تأكيد كلمة المرور الجديدة
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="أعد كتابة كلمة المرور"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            {message && (
              <div
                className={`text-center text-sm font-semibold rounded-xl p-3 border ${
                  messageType === "error"
                    ? "text-red-700 bg-red-50 border-red-200"
                    : "text-blue-700 bg-blue-50 border-blue-200"
                }`}
              >
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-700 hover:bg-blue-800 disabled:bg-gray-400 text-white font-semibold py-3 rounded-xl transition"
            >
              {isLoading ? "جاري الإرسال..." : "إرسال طلب إعادة التعيين"}
            </button>

            <button
              type="button"
              onClick={() => router.push("/")}
              className="w-full text-center text-sm text-gray-500 hover:text-blue-700 py-2"
            >
              العودة لتسجيل الدخول
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
