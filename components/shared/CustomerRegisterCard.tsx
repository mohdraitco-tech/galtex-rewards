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

  const fieldLabel: React.CSSProperties = {
    display: "block",
    fontSize: 13.5,
    fontWeight: 600,
    color: "#33405A",
    marginBottom: 8,
  };

  const fieldInput: React.CSSProperties = {
    width: "100%",
    fontFamily: "inherit",
    fontSize: 15,
    color: "#0E2C5C",
    background: "#FFFFFF",
    border: "1px solid rgba(18,44,92,0.18)",
    borderRadius: 12,
    padding: "12px 16px",
    outline: "none",
  };

  const fieldHint: React.CSSProperties = {
    fontSize: 12,
    color: "#9AA3B5",
    margin: "8px 0 0",
  };

  return (
    <div
      className="w-full max-w-md"
      style={{
        fontFamily: "'IBM Plex Sans Arabic', sans-serif",
        background: "#FFFDF8",
        border: "1px solid rgba(18,44,92,0.1)",
        borderRadius: 24,
        boxShadow: "0 20px 60px rgba(14,44,92,0.10)",
        padding: 32,
      }}
      dir="rtl"
    >
      {/* زر اللغة (الوظيفة مؤجّلة — للتصميم فقط الآن) */}
      <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 18 }}>
        <button
          type="button"
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "#16407F",
            background: "#FFFFFF",
            border: "1px solid rgba(18,44,92,0.14)",
            padding: "7px 16px",
            borderRadius: 999,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          English
        </button>
      </div>

      {/* الشعار + العنوان */}
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <img
          src="/galtex-logo.png"
          alt="GALTEX"
          style={{ height: 46, width: "auto", display: "inline-block" }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 9,
            margin: "14px 0 0",
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              background: "#C4952E",
              transform: "rotate(45deg)",
              display: "inline-block",
            }}
          />
          <span style={{ fontSize: 15, fontWeight: 600, color: "#C4952E" }}>
            GALTEX Rewards
          </span>
        </div>
        <p style={{ fontSize: 15, color: "#586377", margin: "12px 0 0" }}>
          إنشاء حساب جديد
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={fieldLabel}>الاسم الأول</label>
          <input
            type="text"
            required
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            placeholder="أدخل الاسم الأول"
            style={fieldInput}
          />
        </div>

        <div>
          <label style={fieldLabel}>الاسم الأخير</label>
          <input
            type="text"
            required
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            placeholder="أدخل الاسم الأخير"
            style={fieldInput}
          />
        </div>

        <div>
          <label style={fieldLabel}>المدينة</label>
          <input
            type="text"
            required
            value={city}
            onChange={(event) => setCity(event.target.value)}
            placeholder="أدخل المدينة"
            style={fieldInput}
          />
        </div>

        <div>
          <label style={fieldLabel}>الدولة</label>
          <select
            value={country}
            onChange={handleCountryChange}
            style={{ ...fieldInput, cursor: "pointer" }}
          >
            <option value="SA">🇸🇦 المملكة العربية السعودية</option>
            <option value="DE">🇩🇪 ألمانيا</option>
          </select>
        </div>

        <div>
          <label style={fieldLabel}>رقم الجوال</label>
          <div style={{ display: "flex" }} dir="ltr">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 80,
                padding: "0 16px",
                border: "1px solid rgba(18,44,92,0.18)",
                borderRight: "none",
                borderRadius: "12px 0 0 12px",
                background: "#F5F2EC",
                color: "#33405A",
                fontWeight: 600,
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              {countryCode}
            </div>
            <input
              type="tel"
              inputMode="numeric"
              required
              value={phone}
              onChange={handlePhoneChange}
              placeholder={country === "SA" ? "5XXXXXXXX" : "XXXXXXXXXXX"}
              style={{
                ...fieldInput,
                borderRadius: "0 12px 12px 0",
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            />
          </div>
          <p style={fieldHint}>
            {country === "SA"
              ? "أدخل رقم الجوال السعودي بدون الصفر في البداية"
              : "أدخل رقم الجوال الألماني بدون الصفر في البداية"}
          </p>
        </div>

        <div>
          <label style={fieldLabel}>اسم المستخدم</label>
          <input
            type="text"
            value={username}
            readOnly
            placeholder="سيتم إنشاء اسم المستخدم تلقائيًا"
            style={{
              ...fieldInput,
              background: "#F5F2EC",
              color: "#586377",
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          />
          <p style={fieldHint}>
            رقم جوالك المحلي سيكون اسم المستخدم الخاص بك
          </p>
        </div>

        <div>
          <label style={fieldLabel}>كلمة المرور</label>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="أدخل كلمة المرور"
            style={fieldInput}
          />
        </div>

        <div>
          <label style={fieldLabel}>تأكيد كلمة المرور</label>
          <input
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="أعد إدخال كلمة المرور"
            style={fieldInput}
          />
        </div>

        {message && (
          <div
            style={{
              textAlign: "center",
              fontSize: 14,
              fontWeight: 600,
              color: "#B03A3A",
              background: "rgba(200,60,60,0.08)",
              border: "1px solid rgba(200,60,60,0.25)",
              borderRadius: 12,
              padding: 12,
            }}
          >
            {message}
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          style={{
            width: "100%",
            marginTop: 6,
            border: "none",
            borderRadius: 13,
            fontFamily: "inherit",
            fontWeight: 700,
            fontSize: 15.5,
            padding: 14,
            background: isLoading ? "rgba(18,44,92,0.12)" : "#16407F",
            color: isLoading ? "#9AA3B5" : "#F5F2EC",
            cursor: isLoading ? "not-allowed" : "pointer",
          }}
        >
          {isLoading ? "جاري إنشاء الحساب..." : "إنشاء الحساب"}
        </button>
      </form>
    </div>
  );
}