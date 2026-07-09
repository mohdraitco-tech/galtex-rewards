"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const isLoginPage = pathname === "/admin/login";

  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    if (isLoginPage) {
      setIsChecking(false);
      return;
    }

    const adminId = localStorage.getItem("galtex_admin_id");

    if (!adminId) {
      router.replace("/admin/login");
      return;
    }

    setIsChecking(false);
  }, [isLoginPage, router]);

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (isChecking) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-100" dir="rtl">
        <p className="text-gray-500 font-semibold">جاري التحقق من الصلاحية...</p>
      </main>
    );
  }

  return <>{children}</>;
}
