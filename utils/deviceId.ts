const DEVICE_ID_KEY = "galtex_device_id";

/**
 * يرجع بصمة جهاز ثابتة لهذا المتصفح — يتم توليدها مرة واحدة فقط
 * وتُحفظ في localStorage، وتبقى نفسها في كل مرة يفتح فيها العميل الموقع
 * من نفس المتصفح/الجهاز.
 */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "";

  let deviceId = localStorage.getItem(DEVICE_ID_KEY);

  if (!deviceId) {
    deviceId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }

  return deviceId;
}
