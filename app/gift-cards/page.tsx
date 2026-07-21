"use client";

import { useState } from "react";

/* =========================================================================
   صفحة تصفّح بطاقات الهدايا — عرض فقط (بدون ربط بقاعدة بيانات)
   نسخة تجريبية: 8 متاجر بالصور المتوفّرة فعلاً في public/cards/
   ملاحظة: أسماء الملفات مكتوبة بالضبط كما هي عندك (حساسة لحالة الأحرف).
   ========================================================================= */

type Category = "hyper" | "coffee" | "delivery" | "topup";

type GiftCard = {
  nameAr: string;
  nameEn: string;
  category: Category;
  logo: string; // مسار الصورة داخل public (مثال: /cards/carrefour.png)
  bg: string; // لون خلفية البطاقة خلف الشعار
};

const CATEGORIES: { key: Category | "all"; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "hyper", label: "هايبر ماركت" },
  { key: "coffee", label: "مطاعم وقهوة" },
  { key: "delivery", label: "توصيل" },
  { key: "topup", label: "شحن جوال" },
];

const CATEGORY_LABEL: Record<Category, string> = {
  hyper: "هايبر ماركت",
  coffee: "مطاعم وقهوة",
  delivery: "توصيل",
  topup: "شحن جوال",
};

// ====== عدّل هنا: أضف/احذف بطاقة، أو غيّر الصورة (logo) أو اللون (bg) ======
// ملاحظة مهمة: أسماء ملفات الصور مطابقة تماماً للموجود عندك (حساسة للأحرف الكبيرة/الصغيرة).
const CARDS: GiftCard[] = [
  { nameAr: "بن داود", nameEn: "Bin Dawood", category: "hyper", logo: "/cards/BINDAWOOD.png", bg: "#FFFDF8" },
  { nameAr: "كارفور", nameEn: "Carrefour", category: "hyper", logo: "/cards/carrefour.png", bg: "#FFFDF8" },
  { nameAr: "دانوب", nameEn: "Danube", category: "hyper", logo: "/cards/danube.png", bg: "#FFFDF8" },
  { nameAr: "إكسترا", nameEn: "eXtra", category: "hyper", logo: "/cards/EXTRA.png", bg: "#FFFDF8" },
  { nameAr: "المزرعة", nameEn: "Farm", category: "hyper", logo: "/cards/farm supermarkstore.png", bg: "#FFFDF8" },
  { nameAr: "بنده", nameEn: "Panda", category: "hyper", logo: "/cards/Panda.png", bg: "#FFFDF8" },
  { nameAr: "أسواق التميمي", nameEn: "Tamimi", category: "hyper", logo: "/cards/tamimi sipermarket.png", bg: "#FFFDF8" },
  { nameAr: "لولو", nameEn: "LuLu", category: "hyper", logo: "/cards/lulu.png", bg: "#FFFDF8" },
  { nameAr: "ستاربكس", nameEn: "Starbucks", category: "coffee", logo: "/cards/starbox.png", bg: "#FFFDF8" },
  { nameAr: "دانكن", nameEn: "Dunkin'", category: "coffee", logo: "/cards/dunkin.png", bg: "#FFFDF8" },
  { nameAr: "هنقرستيشن", nameEn: "HungerStation", category: "delivery", logo: "/cards/hunger station.png", bg: "#FFFDF8" },
  { nameAr: "شحن جوال STC", nameEn: "STC", category: "topup", logo: "/cards/STC.png", bg: "#FFFDF8" },
];

// دالة مساعدة: تقسّم المصفوفة إلى صفوف بحجم size
function chunk<T>(arr: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < arr.length; i += size) rows.push(arr.slice(i, i + size));
  return rows;
}

export default function GiftCardsPage() {
  const [active, setActive] = useState<Category | "all">("all");

  const visible =
    active === "all" ? CARDS : CARDS.filter((c) => c.category === active);

  const chip = (selected: boolean): React.CSSProperties => ({
    fontSize: 14,
    fontWeight: selected ? 700 : 500,
    padding: "9px 18px",
    borderRadius: 100,
    cursor: "pointer",
    border: selected ? "none" : "1px solid rgba(18,44,92,0.15)",
    background: selected ? "#16407F" : "#FFFDF8",
    color: selected ? "#F5F2EC" : "#33405A",
    fontFamily: "inherit",
    transition: "all .15s",
  });

  return (
    <div
      dir="rtl"
      style={{
        fontFamily: "'IBM Plex Sans Arabic', sans-serif",
        background: "#F5F2EC",
        color: "#0E2C5C",
        minHeight: "100vh",
        overflowX: "hidden",
      }}
    >
      {/* ===== هيدر ===== */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "rgba(245,242,236,0.85)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(18,44,92,0.08)",
        }}
      >
        <nav
          style={{
            maxWidth: 1360,
            margin: "0 auto",
            padding: "16px 28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
          }}
        >
          <img
            src="/galtex-logo.png"
            alt="GALTEX"
            style={{ height: 32, width: "auto", display: "block" }}
          />
          <a
            href="/"
            style={{ color: "#33405A", fontWeight: 600, fontSize: 15, textDecoration: "none" }}
          >
            ‹ العودة إلى الرئيسية
          </a>
        </nav>
      </header>

      {/* ===== العنوان + التصنيفات ===== */}
      <section style={{ maxWidth: 1360, margin: "0 auto", padding: "56px 28px 8px", textAlign: "center" }}>
        <span
          style={{
            display: "inline-block",
            background: "rgba(196,149,46,0.15)",
            color: "#8F6819",
            fontWeight: 600,
            fontSize: 13,
            padding: "6px 14px",
            borderRadius: 100,
            marginBottom: 18,
          }}
        >
          كتالوج بطاقات الهدايا
        </span>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <span
            style={{
              width: 13,
              height: 13,
              background: "#C4952E",
              transform: "rotate(45deg)",
              display: "inline-block",
            }}
          />
          <h1
            style={{
              fontSize: "clamp(30px,4vw,48px)",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              margin: 0,
              color: "#0E2C5C",
            }}
          >
            استبدل نقاطك ببطاقة تناسبك
          </h1>
        </div>

        <p style={{ fontSize: 17.5, color: "#45506B", maxWidth: 620, margin: "0 auto 26px" }}>
          اجمع نقاطك مع GALTEX واستبدلها ببطاقة هدايا من متاجرك المفضّلة.
        </p>

        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              type="button"
              onClick={() => setActive(cat.key)}
              style={chip(active === cat.key)}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </section>

      {/* ===== بطاقة GALTEX المميّزة (تصميم بالكود، ليست صورة) ===== */}
      <section style={{ maxWidth: 1360, margin: "0 auto", padding: "34px 28px 6px", display: "flex", justifyContent: "center" }}>
        <div
          dir="ltr"
          style={{
            width: "min(440px, 100%)",
            aspectRatio: "1.586 / 1",
            borderRadius: 20,
            position: "relative",
            overflow: "hidden",
            background: "linear-gradient(135deg, #16407F 0%, #0E2C5C 60%, #0A2148 100%)",
            boxShadow: "0 30px 60px -28px rgba(14,44,92,0.6)",
            padding: "26px 28px",
            boxSizing: "border-box",
            color: "#F5F2EC",
          }}
        >
          {/* نجوم زخرفية خافتة بالخلفية */}
          <div style={{ position: "absolute", top: -40, left: -30, width: 230, height: 230, opacity: 0.1 }}>
            <svg viewBox="0 0 100 100" width="230" height="230">
              <polygon points="50,3 61,38 98,38 68,60 79,95 50,73 21,95 32,60 2,38 39,38" fill="#F5F2EC" />
            </svg>
          </div>
          <div style={{ position: "absolute", bottom: -55, right: -45, width: 200, height: 200, opacity: 0.06 }}>
            <svg viewBox="0 0 100 100" width="200" height="200">
              <polygon points="50,3 61,38 98,38 68,60 79,95 50,73 21,95 32,60 2,38 39,38" fill="#C4952E" />
            </svg>
          </div>

          <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            {/* أعلى: الشعار + GIFT CARD */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <span
                style={{
                  background: "#FFFFFF",
                  color: "#16407F",
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontWeight: 700,
                  fontSize: 19,
                  letterSpacing: "-0.5px",
                  padding: "8px 14px",
                  borderRadius: 9,
                }}
              >
                GALTEX
              </span>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 14, letterSpacing: "2px", color: "#C4952E" }}>
                  GIFT CARD
                </div>
                <div style={{ fontSize: 12, color: "#C6D2EA", marginTop: 2 }} dir="rtl">
                  بطاقة هدايا
                </div>
              </div>
            </div>

            {/* وسط: الشريحة + رقم البطاقة */}
            <div>
              <div style={{ width: 44, height: 33, borderRadius: 6, background: "linear-gradient(135deg, #E7C06A, #C4952E)", marginBottom: 16, position: "relative" }}>
                <div style={{ position: "absolute", inset: "6px 8px", border: "1px solid rgba(14,44,92,0.25)", borderRadius: 3 }} />
              </div>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 21, letterSpacing: "2px", display: "flex", alignItems: "center", gap: 14 }}>
                <span>5140</span>
                <span style={{ fontSize: 11, color: "#9DB2D6" }}>••••</span>
                <span style={{ fontSize: 11, color: "#9DB2D6" }}>••••</span>
                <span>0192</span>
              </div>
            </div>

            {/* أسفل: اسم النادي + النجمة الذهبية */}
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 11.5, letterSpacing: "2px", color: "#9DB2D6" }}>
                GALTEX REWARDS CLUB
              </span>
              <svg viewBox="0 0 100 100" width="30" height="30">
                <polygon points="50,4 61,38 97,38 68,60 79,96 50,74 21,96 32,60 3,38 39,38" fill="#C4952E" />
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* ===== شبكة البطاقات: صفوف من 4، كل صف على شريط كريمي، بينهم فراغ مميّز ===== */}
      <section
        style={{
          background: "#FBF9F4", // فراغ/خلفية أفتح من البيج الكريمي (مميّزة)
          padding: "40px 0 80px",
        }}
      >
        <div style={{ maxWidth: 1360, margin: "0 auto", padding: "0 28px" }}>
          {chunk(visible, 4).map((row, rowIndex) => (
            <div
              key={rowIndex}
              style={{
                background: "#F3EFE6", // لون الشريط تحت البطاقات (كريمي هادئ تحت الفراغ الأفتح)
                borderRadius: 22,
                padding: "34px 28px",
                marginBottom: rowIndex === chunk(visible, 4).length - 1 ? 0 : 22,
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 26,
                }}
              >
                {row.map((card) => (
                  <div key={card.nameEn} style={{ textAlign: "center" }}>
                    {/* اسم المتجر (فوق البطاقة) */}
                    <div
                      style={{
                        fontFamily: "'Space Grotesk', sans-serif",
                        fontWeight: 700,
                        fontSize: 18,
                        color: "#0E2C5C",
                        marginBottom: 16,
                      }}
                    >
                      {card.nameEn}
                    </div>

                    {/* البطاقة (صورة المتجر) */}
                    <div
                      style={{
                        background: card.bg,
                        aspectRatio: "1.586 / 1",
                        borderRadius: 16,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 18px 34px -18px rgba(0,0,0,0.4)",
                        overflow: "hidden",
                      }}
                    >
                      <img
                        src={card.logo}
                        alt={card.nameEn}
                        loading="lazy"
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      />
                    </div>

                    {/* التصنيف (تحت البطاقة) */}
                    <div style={{ fontSize: 14.5, fontWeight: 600, color: "#586377", marginTop: 16 }}>
                      {CATEGORY_LABEL[card.category]}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {visible.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 0", fontSize: 15, color: "#7A8498" }}>
              لا توجد بطاقات في هذا التصنيف حالياً.
            </div>
          )}
        </div>
      </section>

      {/* ===== فوتر ===== */}
      <footer style={{ background: "#ECE7DD", borderTop: "1px solid rgba(18,44,92,0.08)" }}>
        <div
          style={{
            maxWidth: 1360,
            margin: "0 auto",
            padding: "36px 28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 20,
          }}
        >
          <span style={{ fontSize: 16, color: "#33405A" }}>
            جاهز لاستبدال نقاطك؟ سجّل الدخول إلى حسابك في GALTEX.
          </span>
          <a
            href="/login"
            style={{
              background: "#C4952E",
              color: "#0E2C5C",
              fontWeight: 700,
              fontSize: 15,
              padding: "13px 26px",
              borderRadius: 12,
              textDecoration: "none",
            }}
          >
            تسجيل الدخول
          </a>
        </div>
      </footer>
    </div>
  );
}