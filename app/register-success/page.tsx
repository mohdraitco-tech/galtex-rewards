export default function RegisterSuccessPage() {
  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 text-center">
        <h1 className="text-4xl font-bold text-blue-900">GALTEX</h1>
        <p className="text-3xl font-bold text-blue-700 mt-2">Rewards</p>

        <div className="mt-8 bg-blue-50 rounded-2xl p-6">
          <h2 className="text-xl font-bold text-blue-700 mb-4">
            حسابك قيد المراجعة
          </h2>

          <p className="text-gray-600 leading-8">
            تم استلام طلب التسجيل بنجاح، وسيتم تفعيل الحساب من قبل إدارة GALTEX.
          </p>
        </div>

        <a
          href="/"
          className="block w-full mt-6 bg-blue-700 text-white font-semibold py-3 rounded-xl"
        >
          العودة إلى تسجيل الدخول
        </a>
      </div>
    </main>
  );
}