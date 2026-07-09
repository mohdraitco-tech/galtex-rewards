    "use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type Country = "SA" | "DE";

export default function CustomerRegisterCard() {
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [city, setCity] = useState("");

  const [country, setCountry] = useState<Country>("SA");
  const [phone, setPhone] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const countryCode = country === "SA" ? "+966" : "+49";

  const countryName =
    country === "SA" ? "Saudi Arabia" : "Germany";

  const username = phone ? `0${phone}` : "";

  const phoneInternational = phone
    ? `${countryCode}${phone}`
    : "";

  function handleCountryChange(
    event: React.ChangeEvent<HTMLSelectElement>
  ) {
    setCountry(event.target.value as Country);
    setPhone("");
    setMessage("");
  }

  function handlePhoneChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const value = event.target.value.replace(/\D/g, "");

    if (country === "SA") {
      setPhone(value.slice(0, 9));
    } else {
      setPhone(value.slice(0, 11));
    }
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setMessage("");
    setIsLoading(true);

    if (!firstName.trim()) {
      setMessage("يرجى إدخال الاسم الأول");
      setIsLoading(false);
      return;
    }

    if (!lastName.trim()) {
      setMessage("يرجى إدخال الاسم الأخير");
      setIsLoading(false);
      return;
    }

    if (!city.trim()) {
      setMessage("يرجى إدخال المدينة");
      setIsLoading(false);
      return;
    }

    if (country === "SA" && !/^5\d{8}$/.test(phone)) {
      setMessage(
        "يرجى إدخال رقم جوال سعودي صحيح يبدأ بالرقم 5"
      );
      setIsLoading(false);
      return;
    }

    if (country === "DE" && !/^\d{7,11}$/.test(phone)) {
      setMessage("يرجى إدخال رقم جوال ألماني صحيح");
      setIsLoading(false);
      return;
    }

    if (password.length < 8) {
      setMessage(
        "يجب أن تتكون كلمة المرور من 8 أحرف على الأقل"
      );
      setIsLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setMessage("كلمتا المرور غير متطابقتين");
      setIsLoading(false);
      return;
    }

    const { data, error } = await supabase.rpc(
      "register_customer",
      {
        p_first_name: firstName.trim(),
        p_last_name: lastName.trim(),
        p_city: city.trim(),
        p_country: countryName,
        p_country_code: countryCode,
        p_phone_local: phone,
        p_phone_international: phoneInternational,
        p_username: username,
        p_password: password,
        p_language: "ar",
      }
    );

    if (error) {
      console.error("Supabase error:", error);

      setMessage(
        error.message || "حدث خطأ أثناء إنشاء الحساب"
      );

      setIsLoading(false);
      return;
    }

    if (data?.success) {
      router.push("/register-success");
      return;
    }

    setMessage(
      data?.message || "لم يتم إنشاء الحساب"
    );

    setIsLoading(false);
  }

  return (
    <div
      className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8"
      dir="rtl"
    >
      <div className="flex justify-start mb-4">
        <button
          type="button"
          className="text-sm font-medium text-blue-700 bg-blue-50 px-4 py-2 rounded-full"
        >
          English
        </button>
      </div>

      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-blue-900 tracking-wide">
          GALTEX
        </h1>

        <p className="text-3xl font-bold text-blue-700 mt-2">
          Rewards
        </p>

        <p className="text-gray-500 mt-3">
          إنشاء حساب جديد
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            الاسم الأول
          </label>

          <input
            type="text"
            required
            value={firstName}
            onChange={(event) =>
              setFirstName(event.target.value)
            }
            placeholder="أدخل الاسم الأول"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            الاسم الأخير
          </label>

          <input
            type="text"
            required
            value={lastName}
            onChange={(event) =>
              setLastName(event.target.value)
            }
            placeholder="أدخل الاسم الأخير"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            المدينة
          </label>

          <input
            type="text"
            required
            value={city}
            onChange={(event) =>
              setCity(event.target.value)
            }
            placeholder="أدخل المدينة"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            الدولة
          </label>

          <select
            value={country}
            onChange={handleCountryChange}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600 bg-white"
          >
            <option value="SA">
              🇸🇦 المملكة العربية السعودية
            </option>

            <option value="DE">
              🇩🇪 ألمانيا
            </option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            رقم الجوال
          </label>

          <div className="flex" dir="ltr">
            <div className="flex items-center justify-center min-w-20 px-4 border border-r-0 border-gray-300 rounded-l-xl bg-gray-100 text-gray-700 font-semibold">
              {countryCode}
            </div>

            <input
              type="tel"
              inputMode="numeric"
              required
              value={phone}
              onChange={handlePhoneChange}
              placeholder={
                country === "SA"
                  ? "5XXXXXXXX"
                  : "XXXXXXXXXXX"
              }
              className="w-full border border-gray-300 rounded-r-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <p className="text-xs text-gray-500 mt-2">
            {country === "SA"
              ? "أدخل رقم الجوال السعودي بدون الصفر في البداية"
              : "أدخل رقم الجوال الألماني بدون الصفر في البداية"}
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            اسم المستخدم
          </label>

          <input
            type="text"
            value={username}
            readOnly
            placeholder="سيتم إنشاء اسم المستخدم تلقائيًا"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 bg-gray-100 text-gray-700 outline-none"
          />

          <p className="text-xs text-gray-500 mt-2">
            رقم جوالك المحلي سيكون اسم المستخدم الخاص بك
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            كلمة المرور
          </label>

          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(event) =>
              setPassword(event.target.value)
            }
            placeholder="أدخل كلمة المرور"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            تأكيد كلمة المرور
          </label>

          <input
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(event) =>
              setConfirmPassword(event.target.value)
            }
            placeholder="أعد إدخال كلمة المرور"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        {message && (
          <div className="text-center text-sm font-semibold text-red-700 bg-red-50 rounded-xl p-3">
            {message}
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-blue-700 hover:bg-blue-800 disabled:bg-gray-400 text-white font-semibold py-3 rounded-xl"
        >
          {isLoading
            ? "جاري إنشاء الحساب..."
            : "إنشاء الحساب"}
        </button>
      </form>
    </div>
  );
}