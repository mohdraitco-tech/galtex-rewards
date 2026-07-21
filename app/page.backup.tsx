"use client";

import { useState } from "react";
import Link from "next/link";

/* ============================================================
   GALTEX Rewards — الصفحة الرئيسية لعملاء نادي المكافآت
   محوّلة من تصميم Claude Design إلى React.
   الألوان: كحلي #0E2C5C / أزرق #16407F / ذهبي #C4952E / بيج #F5F2EC
   ============================================================ */

// روابط تسجيل الدخول والتسجيل بالموقع — عدّلها لو مسارك مختلف
const LOGIN_URL = "/login";
const JOIN_URL = "/register";

type Lang = "ar" | "en";

const T = {
  ar: {
    nav_program: "البرنامج", nav_how: "كيف يعمل", nav_rewards: "المكافآت", nav_tiers: "الفئات", nav_faq: "الأسئلة",
    btn_login: "تسجيل الدخول", btn_join: "انضم الآن", langBtn: "English",
    hero_eyebrow: "نادي مكافآت الورش والمحلات",
    hero_h1: "كل قطعة غيار تبيعها أو تستخدمها تمنحك نقاطًا قابلة للاستبدال بمكافآت حقيقية.",
    hero_sub: "انضم إلى «GALTEX» واجمع النقاط مع كل عملية شراء لقطع الغيار الأصلية، واستبدلها بجوائز حصرية مصمّمة خصيصاً لأصحاب الورش.",
    hero_cta1: "انضم الآن مجاناً", hero_cta2: "لديك حساب؟ سجّل الدخول",
    card_label: "رصيد نقاطك", card_tier: "الفئة الذهبية", card_note: "يكفي لـ 3 مكافآت",
    stat1_l: "ورشة عضو", stat2_l: "نقطة مُستبدلة", stat3_l: "مكافأة متاحة", stat4_l: "دولة",
    how_kicker: "كيف يعمل البرنامج", how_title: "أربع خطوات من الشراء إلى المكافأة",
    step1_t: "سجّل ورشتك", step1_d: "أنشئ حساباً مجانياً وفعّل عضويتك خلال دقائق.",
    step2_t: "امسح الرمز", step2_d: "امسح رمز QR الموجود على كل عبوة قطع غيار أصلية.",
    step3_t: "اجمع النقاط", step3_d: "تُضاف النقاط تلقائياً إلى رصيدك مع كل عملية شراء.",
    step4_t: "استبدل مكافأتك", step4_d: "اختر من كتالوج المكافآت واطلب جائزتك فوراً.",
    sc_kicker: "امسح واكسب", sc_title: "كيف تمسح رمز QR بالشكل الصحيح",
    sc_sub: "امسح رمز الـ QR الموجود على ملصق العبوة — وليس الباركود. كل مسح صحيح يضيف نقاطك تلقائياً.",
    sc_s1t: "افتح تطبيق «GALTEX» أو الكاميرا", sc_s1d: "سجّل الدخول إلى حسابك ثم اضغط «مسح رمز».",
    sc_s2t: "وجّه الكاميرا نحو رمز QR", sc_s2d: "الرمز المربّع على الملصق — ثبّته داخل الإطار حتى يُقرأ.",
    sc_s3t: "تُضاف النقاط فوراً", sc_s3d: "يظهر رصيدك المحدّث في لوحة التحكم مباشرة.",
    sc_bonus: "احصل على 35 نقطة ترحيبية عند أول عملية مسح",
    sc_labelno: "ITEM NO : 300192", sc_ok: "امسح هذا الرمز", sc_no: "ليس الباركود",
    gc_kicker: "بطاقات هدايا حصرية", gc_title: "استبدل نقاطك ببطاقات هدايا من أشهر العلامات",
    gc_sub: "أكثر من ٣٠ علامة — أزياء، مطاعم، هايبر ماركت، تسوّق إلكتروني ومجوهرات. اجمع نقاطك مع GALTEX واختر بطاقتك.",
    gc_cta: "تصفّح كل البطاقات",
    tier_kicker: "فئات العضوية", tier_title: "كلما اشتريت أكثر، ارتقت فئتك",
    t1_name: "فضي", t1_sub: "نقطة الانطلاق مع كل عملية.",
    t1_b1: "النقاط الأساسية على كل عملية شراء", t1_b2: "الوصول إلى كتالوج المكافآت", t1_b3: "دعم عبر البريد",
    t2_badge: "الأكثر شيوعاً", t2_name: "ذهبي", t2_sub: "للورش النشطة التي تشتري بانتظام.",
    t2_b1: "نقاط مضاعفة على كل عملية", t2_b2: "عروض وجوائز حصرية", t2_b3: "دعم ذو أولوية",
    t3_name: "بلاتيني", t3_sub: "لكبار الشركاء وأصحاب الأساطيل.",
    t3_b1: "مدير حساب مخصص", t3_b2: "أولوية في الجوائز الكبرى", t3_b3: "دعوات لفعاليات المورّد",
    mb_title: "عضو بالفعل؟", mb_sub: "سجّل الدخول لمتابعة رصيد نقاطك واستبدال مكافآتك.",
    mb_btn: "تسجيل الدخول إلى حسابك",
    faq_kicker: "الأسئلة الشائعة", faq_title: "أسئلة يطرحها أصحاب الورش",
    q1: "كيف أنضم إلى البرنامج؟", a1: "سجّل ورشتك عبر زر «انضم الآن»، وستحصل على عضوية مفعّلة فوراً ورمز خاص بورشتك.",
    q2: "هل الاشتراك مجاني؟", a2: "نعم، الانضمام والعضوية مجانيان تماماً لكل الورش والمحلات المؤهلة.",
    q3: "كيف أجمع النقاط؟", a3: "امسح رمز QR على عبوات قطع الغيار الأصلية، وتُضاف النقاط تلقائياً إلى رصيدك.",
    q4: "متى تنتهي صلاحية النقاط؟", a4: "تبقى نقاطك صالحة لمدة ٢٤ شهراً من تاريخ اكتسابها.",
    q5: "كيف أستبدل المكافآت؟", a5: "من لوحة التحكم اختر المكافأة المطلوبة وأكمل الطلب، وسنشحنها إلى ورشتك.",
    foot_tag: "نادي «GALTEX» — مكافآت مصمّمة لأصحاب الورش والمحلات.",
    foot_c1: "البرنامج", foot_c1a: "كيف يعمل", foot_c1b: "المكافآت", foot_c1c: "الفئات",
    foot_c2: "الدعم", foot_c2a: "الأسئلة الشائعة", foot_c2b: "شروط الاستخدام", foot_c2c: "حماية البيانات",
    foot_c3: "تواصل", foot_c3a: "اتصل بنا", foot_c3b: "انضم كشريك",
    copyright: "© ٢٠٢٦ GALTEX. جميع الحقوق محفوظة.", foot_made: "صُمّم لأصحاب الورش في المنطقة",
  },
  en: {
    nav_program: "Program", nav_how: "How it works", nav_rewards: "Rewards", nav_tiers: "Tiers", nav_faq: "FAQ",
    btn_login: "Log in", btn_join: "Join now", langBtn: "العربية",
    hero_eyebrow: "Rewards club for workshops & retailers",
    hero_h1: "Every part you sell earns you points and real rewards.",
    hero_sub: "Join GALTEX and collect points on every purchase of genuine parts, then redeem them for exclusive rewards built for workshop owners.",
    hero_cta1: "Join free", hero_cta2: "Have an account? Log in",
    card_label: "Your points balance", card_tier: "Gold tier", card_note: "Enough for 3 rewards",
    stat1_l: "member workshops", stat2_l: "points redeemed", stat3_l: "rewards available", stat4_l: "countries",
    how_kicker: "How it works", how_title: "Four steps from purchase to reward",
    step1_t: "Register your workshop", step1_d: "Create a free account and activate in minutes.",
    step2_t: "Scan the code", step2_d: "Scan the QR on every genuine-parts pack.",
    step3_t: "Collect points", step3_d: "Points are added to your balance automatically on every purchase.",
    step4_t: "Redeem your reward", step4_d: "Pick from the catalog and claim your prize instantly.",
    sc_kicker: "Scan & earn", sc_title: "How to scan the QR code correctly",
    sc_sub: "Scan the QR code on the pack label — not the barcode. Every correct scan adds your points automatically.",
    sc_s1t: "Open the GALTEX app or camera", sc_s1d: 'Log in to your account and tap "Scan code".',
    sc_s2t: "Point the camera at the QR code", sc_s2d: "The square code on the label — hold it in frame until it reads.",
    sc_s3t: "Points are added instantly", sc_s3d: "Your updated balance appears in your dashboard right away.",
    sc_bonus: "Get 35 welcome points on your first scan",
    sc_labelno: "ITEM NO : 300192", sc_ok: "Scan this code", sc_no: "Not the barcode",
    gc_kicker: "Exclusive gift cards", gc_title: "Redeem your points for gift cards from top brands",
    gc_sub: "Over 30 brands — fashion, dining, hypermarkets, online shopping and jewellery. Collect points with GALTEX and pick your card.",
    gc_cta: "Browse all cards",
    tier_kicker: "Membership tiers", tier_title: "The more you buy, the higher you climb",
    t1_name: "Silver", t1_sub: "Your starting point on every order.",
    t1_b1: "Base points on every purchase", t1_b2: "Access to the rewards catalog", t1_b3: "Email support",
    t2_badge: "Most popular", t2_name: "Gold", t2_sub: "For active workshops buying regularly.",
    t2_b1: "Double points on every order", t2_b2: "Exclusive offers & prizes", t2_b3: "Priority support",
    t3_name: "Platinum", t3_sub: "For major partners and fleet owners.",
    t3_b1: "Dedicated account manager", t3_b2: "Priority on major prizes", t3_b3: "Invitations to supplier events",
    mb_title: "Already a member?", mb_sub: "Log in to track your points and redeem your rewards.",
    mb_btn: "Log in to your account",
    faq_kicker: "FAQ", faq_title: "Questions workshop owners ask",
    q1: "How do I join the program?", a1: 'Register your workshop via the "Join now" button and get an instantly activated membership and a workshop code.',
    q2: "Is membership free?", a2: "Yes, joining and membership are completely free for all eligible workshops and retailers.",
    q3: "How do I earn points?", a3: "Scan the QR code on genuine-parts packs and points are added to your balance automatically.",
    q4: "When do points expire?", a4: "Your points stay valid for 24 months from the date they were earned.",
    q5: "How do I redeem rewards?", a5: "From your dashboard, pick the reward you want, confirm the order, and we ship it to your workshop.",
    foot_tag: "GALTEX Club — rewards built for workshop owners and retailers.",
    foot_c1: "Program", foot_c1a: "How it works", foot_c1b: "Rewards", foot_c1c: "Tiers",
    foot_c2: "Support", foot_c2a: "FAQ", foot_c2b: "Terms of use", foot_c2c: "Data protection",
    foot_c3: "Contact", foot_c3a: "Contact us", foot_c3b: "Become a partner",
    copyright: "© 2026 GALTEX. All rights reserved.", foot_made: "Built for workshop owners in the region",
  },
} as const;

const C = {
  navy: "#0E2C5C", blue: "#16407F", gold: "#C4952E", goldDark: "#8F6819", goldMid: "#B4842A",
  beige: "#F5F2EC", cream: "#FFFDF8", ink: "#17211E", slate: "#586377", slate2: "#45506B",
  slate3: "#33405A", line: "rgba(18,44,92,0.09)", green: "#2E7D57", red: "#C0392B",
};

export default function Home() {
  const [lang, setLang] = useState<Lang>("ar");
  const t = T[lang];
  const dir = lang === "ar" ? "rtl" : "ltr";
  const fontFamily = lang === "ar" ? "'IBM Plex Sans Arabic', sans-serif" : "'Space Grotesk', sans-serif";

  const steps = [
    { n: "01", t: t.step1_t, d: t.step1_d, dark: false },
    { n: "02", t: t.step2_t, d: t.step2_d, dark: false },
    { n: "03", t: t.step3_t, d: t.step3_d, dark: false },
    { n: "04", t: t.step4_t, d: t.step4_d, dark: true },
  ];

  const scanSteps = [
    { n: "1", t: t.sc_s1t, d: t.sc_s1d },
    { n: "2", t: t.sc_s2t, d: t.sc_s2d },
    { n: "3", t: t.sc_s3t, d: t.sc_s3d },
  ];

  const faqs = [
    { q: t.q1, a: t.a1 }, { q: t.q2, a: t.a2 }, { q: t.q3, a: t.a3 }, { q: t.q4, a: t.a4 }, { q: t.q5, a: t.a5 },
  ];

  return (
    <div dir={dir} style={{ fontFamily, background: C.beige, color: C.ink, overflowX: "hidden", lineHeight: 1.6 }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* ===== NAV ===== */}
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(245,242,236,0.85)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(18,44,92,0.08)" }}>
        <nav style={{ maxWidth: 1240, margin: "0 auto", padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <img src="/galtex-logo.png" alt="GALTEX" style={{ height: 34, width: "auto", display: "block" }} />
            <span style={{ width: 1, height: 26, background: "rgba(18,44,92,0.2)", display: "inline-block" }} />
            <span style={{ color: C.goldDark, fontWeight: 600, fontSize: 15 }}>{t.nav_rewards}</span>
            <span style={{ color: C.gold, fontSize: 15 }}>★</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 30, flexWrap: "wrap" }} className="mh-navlinks">
            <a href="#program" style={{ color: C.slate3, fontWeight: 500, fontSize: 15 }}>{t.nav_program}</a>
            <a href="#how" style={{ color: C.slate3, fontWeight: 500, fontSize: 15 }}>{t.nav_how}</a>
            <a href="#rewards" style={{ color: C.slate3, fontWeight: 500, fontSize: 15 }}>{t.nav_rewards}</a>
            <a href="#tiers" style={{ color: C.slate3, fontWeight: 500, fontSize: 15 }}>{t.nav_tiers}</a>
            <a href="#faq" style={{ color: C.slate3, fontWeight: 500, fontSize: 15 }}>{t.nav_faq}</a>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => setLang(lang === "ar" ? "en" : "ar")} style={{ background: "none", border: "1px solid rgba(18,44,92,0.2)", color: C.blue, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 13, padding: "8px 12px", borderRadius: 8, cursor: "pointer" }}>{t.langBtn}</button>
            <Link href={LOGIN_URL} style={{ color: C.blue, fontWeight: 600, fontSize: 15, padding: "9px 8px" }}>{t.btn_login}</Link>
            <Link href={JOIN_URL} style={{ background: C.blue, color: C.beige, fontWeight: 600, fontSize: 15, padding: "11px 20px", borderRadius: 10 }}>{t.btn_join}</Link>
          </div>
        </nav>
      </header>

      {/* ===== HERO ===== */}
      <section id="program" style={{ maxWidth: 1240, margin: "0 auto", padding: "72px 28px 40px", display: "grid", gridTemplateColumns: "1fr", gap: 40, alignItems: "center" }} className="mh-hero">
        <div>
          <span style={{ display: "inline-block", background: "rgba(196,149,46,0.15)", color: C.goldDark, fontWeight: 600, fontSize: 13.5, padding: "7px 14px", borderRadius: 100, marginBottom: 22 }}>{t.hero_eyebrow}</span>
          <h1 style={{ fontSize: "clamp(34px,4vw,54px)", lineHeight: 1.15, fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 20px", color: C.navy }}>{t.hero_h1}</h1>
          <p style={{ fontSize: 18, color: C.slate2, maxWidth: 520, margin: "0 0 30px" }}>{t.hero_sub}</p>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <Link href={JOIN_URL} style={{ background: C.gold, color: C.navy, fontWeight: 700, fontSize: 16, padding: "15px 28px", borderRadius: 12 }}>{t.hero_cta1}</Link>
            <Link href={LOGIN_URL} style={{ background: "transparent", border: "1px solid rgba(18,44,92,0.25)", color: C.blue, fontWeight: 600, fontSize: 16, padding: "15px 26px", borderRadius: 12 }}>{t.hero_cta2}</Link>
          </div>
        </div>
        {/* صورة الورشة مع بطاقة نقاط على زاويتها.
            الصورة كخلفية CSS — لو ما وُجدت، تظهر الخلفية الكحلية بدون أيقونة مكسورة.
            لإضافة صورتك: ضعها باسم workshop.jpg في مجلد public.
            ملاحظة: استخدم صورة تملك حقوقها (مجانية من Unsplash/Pexels أو صورة ورشتك). */}
        <div
          style={{
            position: "relative",
            borderRadius: 24,
            overflow: "hidden",
            boxShadow: "0 30px 60px -30px rgba(18,44,92,0.5)",
            minHeight: 560,
            backgroundColor: C.navy,
            backgroundImage: `linear-gradient(160deg, rgba(28,58,102,0.25), rgba(14,44,92,0.55)), url('/workshop.jpg')`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          {/* زخرفة خفيفة (تظهر لو ما فيه صورة) */}
          <div style={{ position: "absolute", top: "26%", left: "50%", transform: "translateX(-50%)", width: 130, height: 130, borderRadius: "50%", border: `4px solid ${C.gold}`, opacity: 0.2 }} />
          <div style={{ position: "absolute", top: "34%", left: "50%", transform: "translateX(-50%)", color: "rgba(245,242,236,0.5)", fontSize: 14, fontWeight: 600, whiteSpace: "nowrap" }}>صورة الورشة</div>

          {/* بطاقة نقاط عائمة على الزاوية السفلى — حواف مدوّرة من كل الجهات وظل ناعم */}
          <div style={{ position: "absolute", bottom: 24, insetInlineStart: 24, background: C.blue, borderRadius: 22, padding: "20px 26px", color: C.beige, minWidth: 250, boxShadow: "0 20px 45px -18px rgba(0,0,0,0.55)", border: "1px solid rgba(196,149,46,0.25)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ color: C.gold, fontSize: 15 }}>★</span>
              <span style={{ fontSize: 13.5, opacity: 0.85 }}>{t.card_label}</span>
            </div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 40, color: C.beige, lineHeight: 1.05, marginBottom: 14 }}>12,450</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ background: C.gold, color: C.navy, fontWeight: 700, fontSize: 12, padding: "5px 14px", borderRadius: 100 }}>{t.card_tier}</span>
              <span style={{ fontSize: 12.5, opacity: 0.82 }}>{t.card_note}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ===== STATS ===== */}
      <section style={{ maxWidth: 1240, margin: "40px auto 0", padding: "0 28px" }}>
        <div style={{ background: C.blue, borderRadius: 22, padding: "38px 40px", display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 24, color: C.beige }} className="mh-stats">
          {[
            { v: "8,500+", l: t.stat1_l }, { v: "3.2M", l: t.stat2_l }, { v: "640", l: t.stat3_l }, { v: "12", l: t.stat4_l },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: "center", borderInlineStart: i === 0 ? "none" : "1px solid rgba(255,255,255,0.14)" }}>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 38, color: C.gold }}>{s.v}</div>
              <div style={{ fontSize: 14, opacity: 0.82, marginTop: 4 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section id="how" style={{ maxWidth: 1240, margin: "0 auto", padding: "88px 28px 40px" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <span style={{ color: C.goldMid, fontWeight: 600, fontSize: 14 }}>{t.how_kicker}</span>
          <h2 style={{ fontSize: "clamp(28px,3vw,40px)", fontWeight: 700, letterSpacing: "-0.02em", margin: "10px 0 0", color: C.navy }}>{t.how_title}</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 22 }}>
          {steps.map((s) => (
            <div key={s.n} style={{ background: C.cream, border: `1px solid ${C.line}`, borderRadius: 18, padding: "28px 24px" }}>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 15, width: 40, height: 40, borderRadius: 11, background: s.dark ? C.blue : "rgba(196,149,46,0.15)", color: s.dark ? C.gold : C.goldDark, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>{s.n}</div>
              <h3 style={{ fontSize: 19, fontWeight: 600, margin: "0 0 8px", color: C.navy }}>{s.t}</h3>
              <p style={{ fontSize: 15, color: C.slate, margin: 0 }}>{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== HOW TO SCAN ===== */}
      <section id="scan" style={{ background: "#ECE7DD", marginTop: 40 }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "72px 28px", display: "grid", gridTemplateColumns: "1fr", gap: 48, alignItems: "center" }} className="mh-scan">
          <div>
            <span style={{ color: C.goldMid, fontWeight: 600, fontSize: 14 }}>{t.sc_kicker}</span>
            <h2 style={{ fontSize: "clamp(28px,3vw,40px)", fontWeight: 700, letterSpacing: "-0.02em", margin: "10px 0 12px", color: C.navy }}>{t.sc_title}</h2>
            <p style={{ fontSize: 17, color: C.slate2, margin: "0 0 28px", maxWidth: 480 }}>{t.sc_sub}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {scanSteps.map((s) => (
                <div key={s.n} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                  <span style={{ flex: "none", width: 38, height: 38, borderRadius: 11, background: C.blue, color: C.gold, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{s.n}</span>
                  <div>
                    <h3 style={{ fontSize: 17, fontWeight: 600, margin: "0 0 3px", color: C.navy }}>{s.t}</h3>
                    <p style={{ fontSize: 15, color: C.slate, margin: 0 }}>{s.d}</p>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 26, display: "inline-flex", alignItems: "center", gap: 10, background: "rgba(196,149,46,0.16)", color: C.goldDark, padding: "11px 18px", borderRadius: 100 }}>
              <span style={{ width: 15, height: 15, background: C.gold, display: "inline-block", clipPath: "polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)" }} />
              <span style={{ fontWeight: 600, fontSize: 14.5 }}>{t.sc_bonus}</span>
            </div>
          </div>

          {/* ملصق توضيحي */}
          <div style={{ background: "#FFFFFF", border: "1px solid rgba(18,44,92,0.12)", borderRadius: 20, padding: 26, boxShadow: "0 26px 60px -30px rgba(18,44,92,0.4)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px dashed rgba(18,44,92,0.2)", paddingBottom: 14, marginBottom: 20 }}>
              <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 20, letterSpacing: "0.04em", color: C.navy }}>GALTEX</span>
              <span style={{ fontSize: 12, color: C.slate, fontFamily: "'Space Grotesk',sans-serif" }}>{t.sc_labelno}</span>
            </div>
            <div style={{ display: "flex", gap: 24, alignItems: "stretch" }}>
              {/* QR = صحيح */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ position: "relative", width: 132, height: 132, padding: 12, background: "#FFFFFF", border: `3px solid ${C.green}`, borderRadius: 14 }}>
                  <div style={{ width: "100%", height: "100%", background: "repeating-conic-gradient(#0E2C5C 0% 25%, #FFFFFF 0% 50%) 0 0 / 15px 15px", borderRadius: 3 }} />
                  <span style={{ position: "absolute", top: 8, left: 8, width: 26, height: 26, background: "#FFFFFF", border: `6px solid ${C.navy}` }} />
                  <span style={{ position: "absolute", top: 8, right: 8, width: 26, height: 26, background: "#FFFFFF", border: `6px solid ${C.navy}` }} />
                  <span style={{ position: "absolute", bottom: 8, left: 8, width: 26, height: 26, background: "#FFFFFF", border: `6px solid ${C.navy}` }} />
                  <span style={{ position: "absolute", bottom: -14, right: -14, width: 36, height: 36, borderRadius: "50%", background: C.green, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700, boxShadow: "0 4px 10px rgba(0,0,0,0.2)" }}>✓</span>
                </div>
                <span style={{ marginTop: 22, color: C.green, fontWeight: 700, fontSize: 15 }}>{t.sc_ok}</span>
              </div>
              {/* باركود = خطأ */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ position: "relative", width: 132, height: 132, padding: 16, background: "#FFFFFF", border: "3px solid #E0D9CC", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ display: "flex", alignItems: "stretch", gap: 2, height: 78, opacity: 0.55 }}>
                    {[3, 2, 5, 2, 3, 6, 2, 4, 2, 5, 3, 2, 6, 2, 4].map((w, i) => (
                      <span key={i} style={{ width: w, background: C.navy }} />
                    ))}
                  </div>
                  <span style={{ position: "absolute", bottom: -14, right: -14, width: 36, height: 36, borderRadius: "50%", background: C.red, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, fontWeight: 700, boxShadow: "0 4px 10px rgba(0,0,0,0.2)" }}>✕</span>
                </div>
                <span style={{ marginTop: 22, color: C.red, fontWeight: 700, fontSize: 15 }}>{t.sc_no}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== GIFT CARDS ===== */}
      <section id="rewards" style={{ maxWidth: 1240, margin: "0 auto", padding: "56px 28px 8px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 48, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          <span style={{ display: "inline-block", background: "rgba(196,149,46,0.15)", color: C.goldDark, fontWeight: 600, fontSize: 13, padding: "6px 13px", borderRadius: 100, marginBottom: 16 }}>{t.gc_kicker}</span>
          <h2 style={{ fontSize: "clamp(26px,2.6vw,36px)", fontWeight: 700, color: C.navy, letterSpacing: "-0.02em", margin: "0 0 12px" }}>{t.gc_title}</h2>
          <p style={{ fontSize: 16.5, color: C.slate2, margin: "0 0 26px", maxWidth: 440 }}>{t.gc_sub}</p>
          <Link href="/gift-cards" style={{ display: "inline-block", background: C.blue, color: C.beige, fontWeight: 700, fontSize: 16, padding: "14px 28px", borderRadius: 12 }}>{t.gc_cta}</Link>
        </div>
        <div style={{ flex: "none", width: "min(440px,100%)" }}>
          {/* بطاقة هدية توضيحية */}
          <div style={{ width: "100%", aspectRatio: "1.6 / 1", background: `linear-gradient(135deg, ${C.gold}, ${C.goldMid})`, borderRadius: 18, boxShadow: "0 28px 60px -28px rgba(18,44,92,0.5)", padding: 28, display: "flex", flexDirection: "column", justifyContent: "space-between", color: C.navy }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 26, letterSpacing: "0.04em" }}>GALTEX</span>
              <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.8 }}>GIFT CARD</span>
            </div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", letterSpacing: "0.15em", fontSize: 18, fontWeight: 500 }}>•••• •••• •••• 4820</div>
          </div>
        </div>
      </section>

      {/* ===== TIERS ===== */}
      <section id="tiers" style={{ maxWidth: 1240, margin: "0 auto", padding: "64px 28px 40px" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <span style={{ color: C.goldMid, fontWeight: 600, fontSize: 14 }}>{t.tier_kicker}</span>
          <h2 style={{ fontSize: "clamp(28px,3vw,40px)", fontWeight: 700, letterSpacing: "-0.02em", margin: "10px 0 0", color: C.navy }}>{t.tier_title}</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 22, alignItems: "stretch" }}>
          {/* فضي */}
          <TierCard dot="#9AA6A1" name={t.t1_name} sub={t.t1_sub} bullets={[t.t1_b1, t.t1_b2, t.t1_b3]} />
          {/* ذهبي - مميز */}
          <div style={{ background: C.blue, borderRadius: 20, padding: "30px 26px", color: C.beige, position: "relative", boxShadow: "0 26px 50px -26px rgba(18,44,92,0.6)" }}>
            <span style={{ position: "absolute", top: 20, insetInlineEnd: 22, background: C.gold, color: C.navy, fontWeight: 700, fontSize: 11.5, padding: "4px 11px", borderRadius: 100 }}>{t.t2_badge}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: C.gold }} />
              <h3 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{t.t2_name}</h3>
            </div>
            <p style={{ fontSize: 14.5, opacity: 0.8, margin: "0 0 20px" }}>{t.t2_sub}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[t.t2_b1, t.t2_b2, t.t2_b3].map((b, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ width: 7, height: 7, marginTop: 8, background: C.gold, transform: "rotate(45deg)", flex: "none" }} />
                  <span style={{ fontSize: 14.5 }}>{b}</span>
                </div>
              ))}
            </div>
          </div>
          {/* بلاتيني */}
          <TierCard dot={C.navy} name={t.t3_name} sub={t.t3_sub} bullets={[t.t3_b1, t.t3_b2, t.t3_b3]} />
        </div>
      </section>

      {/* ===== MEMBER LOGIN BAND ===== */}
      <section id="login" style={{ maxWidth: 1240, margin: "0 auto", padding: "48px 28px" }}>
        <div style={{ background: `linear-gradient(120deg,${C.navy},#1C4E92)`, borderRadius: 24, padding: "52px 48px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 32, flexWrap: "wrap", color: C.beige }}>
          <div style={{ maxWidth: 560 }}>
            <h2 style={{ fontSize: "clamp(26px,3vw,36px)", fontWeight: 700, margin: "0 0 10px" }}>{t.mb_title}</h2>
            <p style={{ fontSize: 17, opacity: 0.82, margin: 0 }}>{t.mb_sub}</p>
          </div>
          <Link href={LOGIN_URL} style={{ background: C.gold, color: C.navy, fontWeight: 700, fontSize: 16, padding: "16px 30px", borderRadius: 12, whiteSpace: "nowrap" }}>{t.mb_btn}</Link>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section id="faq" style={{ maxWidth: 840, margin: "0 auto", padding: "48px 28px 40px" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <span style={{ color: C.goldMid, fontWeight: 600, fontSize: 14 }}>{t.faq_kicker}</span>
          <h2 style={{ fontSize: "clamp(28px,3vw,38px)", fontWeight: 700, letterSpacing: "-0.02em", margin: "10px 0 0", color: C.navy }}>{t.faq_title}</h2>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {faqs.map((f, i) => (
            <FaqItem key={i} q={f.q} a={f.a} />
          ))}
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer style={{ background: C.navy, color: "#D2D9E6", marginTop: 40 }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "56px 28px 30px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 36 }}>
          <div>
            <span style={{ display: "inline-flex", background: C.beige, borderRadius: 10, padding: "9px 14px", marginBottom: 14 }}>
              <img src="/galtex-logo.png" alt="GALTEX" style={{ height: 24, width: "auto", display: "block" }} />
            </span>
            <p style={{ fontSize: 14.5, opacity: 0.7, maxWidth: 280, margin: 0 }}>{t.foot_tag}</p>
          </div>
          <FooterCol title={t.foot_c1} links={[{ l: t.foot_c1a, h: "#how" }, { l: t.foot_c1b, h: "#rewards" }, { l: t.foot_c1c, h: "#tiers" }]} />
          <FooterCol title={t.foot_c2} links={[{ l: t.foot_c2a, h: "#faq" }, { l: t.foot_c2b, h: "#" }, { l: t.foot_c2c, h: "#" }]} />
          <div>
            <h4 style={{ fontSize: 14, fontWeight: 600, color: C.gold, margin: "0 0 14px" }}>{t.foot_c3}</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <a href="#" style={{ color: "#D2D9E6", fontSize: 14.5, opacity: 0.85 }}>{t.foot_c3a}</a>
              <a href="#" style={{ color: "#D2D9E6", fontSize: 14.5, opacity: 0.85 }}>{t.foot_c3b}</a>
              <span style={{ color: "#D2D9E6", fontSize: 14.5, opacity: 0.85, fontFamily: "'Space Grotesk',sans-serif", direction: "ltr" }}>+966 11 000 0000</span>
            </div>
          </div>
        </div>
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ maxWidth: 1240, margin: "0 auto", padding: "20px 28px", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <span style={{ fontSize: 13, opacity: 0.6 }}>{t.copyright}</span>
            <span style={{ fontSize: 13, opacity: 0.6 }}>{t.foot_made}</span>
          </div>
        </div>
      </footer>

      <style>{`
        @media (min-width: 900px) {
          .mh-hero { grid-template-columns: 1.05fr 0.95fr !important; gap: 56px !important; }
          .mh-stats { grid-template-columns: repeat(4,1fr) !important; }
          .mh-scan { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 720px) {
          .mh-navlinks { display: none !important; }
        }
        html { scroll-behavior: smooth; }
      `}</style>
    </div>
  );
}

function TierCard({ dot, name, sub, bullets }: { dot: string; name: string; sub: string; bullets: string[] }) {
  return (
    <div style={{ background: C.cream, border: "1px solid rgba(18,44,92,0.10)", borderRadius: 20, padding: "30px 26px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span style={{ width: 12, height: 12, borderRadius: "50%", background: dot }} />
        <h3 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: C.navy }}>{name}</h3>
      </div>
      <p style={{ fontSize: 14.5, color: C.slate, margin: "0 0 20px" }}>{sub}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {bullets.map((b, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ width: 7, height: 7, marginTop: 8, background: C.gold, transform: "rotate(45deg)", flex: "none" }} />
            <span style={{ fontSize: 14.5, color: C.slate3 }}>{b}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: C.cream, border: "1px solid rgba(18,44,92,0.10)", borderRadius: 14, padding: "4px 20px" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "16px 0", fontSize: 17, fontWeight: 600, color: C.navy, background: "none", border: "none", cursor: "pointer", textAlign: "inherit", fontFamily: "inherit" }}
      >
        <span>{q}</span>
        <span style={{ fontFamily: "'Space Grotesk',sans-serif", color: C.gold, fontSize: 24, lineHeight: 1, transform: open ? "rotate(45deg)" : "none", transition: "transform 0.25s" }}>+</span>
      </button>
      {open && <p style={{ margin: "0 0 16px", fontSize: 15.5, color: C.slate }}>{a}</p>}
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: { l: string; h: string }[] }) {
  return (
    <div>
      <h4 style={{ fontSize: 14, fontWeight: 600, color: C.gold, margin: "0 0 14px" }}>{title}</h4>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {links.map((x, i) => (
          <a key={i} href={x.h} style={{ color: "#D2D9E6", fontSize: 14.5, opacity: 0.85 }}>{x.l}</a>
        ))}
      </div>
    </div>
  );
}
