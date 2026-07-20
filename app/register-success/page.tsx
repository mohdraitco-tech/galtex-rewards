export default function RegisterSuccessPage() {
  return (
    <main
      dir="rtl"
      style={{
        fontFamily: "'IBM Plex Sans Arabic', sans-serif",
        minHeight: "100vh",
        background: "#F5F2EC",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 448,
          background: "#FFFDF8",
          border: "1px solid rgba(18,44,92,0.1)",
          borderRadius: 24,
          boxShadow: "0 20px 60px rgba(14,44,92,0.10)",
          padding: 32,
          textAlign: "center",
        }}
      >
        {/* الشعار */}
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

        {/* بطاقة الحالة */}
        <div
          style={{
            marginTop: 28,
            background: "#F5F2EC",
            border: "1px solid rgba(18,44,92,0.1)",
            borderRadius: 16,
            padding: 24,
          }}
        >
          <h2
            style={{
              fontSize: 19,
              fontWeight: 700,
              color: "#0E2C5C",
              margin: "0 0 12px",
            }}
          >
            حسابك قيد المراجعة
          </h2>
          <p style={{ fontSize: 15, color: "#586377", lineHeight: 1.9, margin: 0 }}>
            تم استلام طلب التسجيل بنجاح، وسيتم تفعيل الحساب من قبل إدارة GALTEX.
          </p>
        </div>

        {/* زر الرجوع */}
        <a
          href="/"
          style={{
            display: "block",
            width: "100%",
            marginTop: 24,
            background: "#16407F",
            color: "#F5F2EC",
            fontWeight: 700,
            fontSize: 15.5,
            padding: 14,
            borderRadius: 13,
            textDecoration: "none",
            boxSizing: "border-box",
          }}
        >
          العودة إلى تسجيل الدخول
        </a>
      </div>
    </main>
  );
}