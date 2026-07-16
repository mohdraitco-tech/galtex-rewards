const DEVICE_ID_KEY = "galtex_device_id";

/**
 * يرجع بصمة جهاز ثابتة لهذا المتصفح — يتم توليدها مرة واحدة فقط
 * وتُحفظ في localStorage، وتبقى نفسها في كل مرة يفتح فيها العميل الموقع
 * من نفس المتصفح/الجهاز.
 *
 * ملاحظة: في وضع التصفّح الخفي (Incognito) قد يكون localStorage محظوراً،
 * فنلفّ العمليات بحماية try/catch حتى لا تتوقف عملية الدخول بخطأ،
 * وبدلاً من ذلك نُرجع بصمة جديدة (يتعامل معها النظام كجهاز جديد
 * ويطلب اعتماد الإدارة — وهو السلوك الصحيح).
 */
function generateId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getDeviceId(): string {
  if (typeof window === "undefined") return "";

  // نحاول القراءة من localStorage — وإن فشل (Incognito) نكمل بأمان
  let deviceId: string | null = null;

  try {
    deviceId = localStorage.getItem(DEVICE_ID_KEY);
  } catch {
    deviceId = null;
  }

  if (!deviceId) {
    deviceId = generateId();

    // نحاول الحفظ — وإن فشل (Incognito) نتجاهل الخطأ ونُكمل بالبصمة المؤقتة
    try {
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    } catch {
      // localStorage غير متاح (تصفّح خفي مثلاً) — نُكمل بالبصمة الحالية
    }
  }

  return deviceId;
}