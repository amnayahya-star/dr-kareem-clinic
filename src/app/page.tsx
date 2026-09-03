import Link from "next/link";
import { Stethoscope, UserCheck, ArrowLeft, Sparkles, ShieldCheck } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between p-4 sm:p-8">
      {/* Top Header */}
      <header className="max-w-5xl mx-auto w-full flex items-center justify-between py-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl overflow-hidden border-2 border-clinic-500 shadow-sm shrink-0 bg-slate-900">
            <img
              src="/dr-kareem.jpg"
              alt="الدكتور عبد الكريم عليوي"
              className="w-full h-full object-cover object-top"
            />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-slate-900">عيادة د. عبد الكريم عليوي</h1>
            <p className="text-[11px] font-bold text-clinic-700">بورد طب الأطفال وحديثي الولادة</p>
          </div>
        </div>

        <Link
          href="/login"
          className="text-xs font-bold text-white bg-slate-900 hover:bg-clinic-700 px-4 py-2 rounded-xl shadow-xs transition-all"
        >
          تسجيل الدخول
        </Link>
      </header>

      {/* Main Selection Area */}
      <main className="max-w-3xl mx-auto w-full my-auto text-center py-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold mb-6">
          <span className="w-2 h-2 rounded-full bg-clinic-500 animate-pulse"></span>
          <span>منظومة العيادة الطبية المباشرة</span>
        </div>

        <h2 className="text-2xl sm:text-4xl font-black text-slate-900 leading-tight mb-4">
          نظام إدارة عيادة الأطفال السريري
        </h2>

        <p className="text-sm text-slate-500 max-w-xl mx-auto leading-relaxed mb-8">
          اختر البوابة المناسبة للدخول إلى واجهة العمل السريرية للطبيب أو شاشة الاستقبال للسكرتير
        </p>

        {/* The Two Portals */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-right">
          {/* Doctor Portal */}
          <Link
            href="/doctor"
            className="group bg-white p-6 rounded-3xl border border-slate-200 hover:border-slate-900 shadow-sm hover:shadow-md transition-all duration-200"
          >
            <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center mb-4 group-hover:bg-clinic-600 transition-colors">
              <Stethoscope className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-black text-slate-900 group-hover:text-clinic-700 transition-colors">
              بوابة الطبيب (الكشف السريري)
            </h3>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              البحث الفوري عن الطفل، استعراض تاريخ الزيارات والتحاليل السابقة، وتوثيق التشخيص واعتماد الوصفة.
            </p>
            <div className="mt-4 flex items-center gap-1 text-xs font-bold text-slate-900 group-hover:text-clinic-700">
              <span>فتح شاشة الطبيب</span>
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            </div>
          </Link>

          {/* Secretary Portal */}
          <Link
            href="/secretary"
            className="group bg-white p-6 rounded-3xl border border-slate-200 hover:border-teal-700 shadow-sm hover:shadow-md transition-all duration-200"
          >
            <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-800 flex items-center justify-center mb-4 group-hover:bg-teal-700 group-hover:text-white transition-colors">
              <UserCheck className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-black text-slate-900 group-hover:text-teal-700 transition-colors">
              بوابة السكرتير (الاستقبال)
            </h3>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              إضافة طفل جديد، البحث الفوري لفتح زيارة وتسجيل القياسات، ومتابعة الانتظار وسلة المحذوفات.
            </p>
            <div className="mt-4 flex items-center gap-1 text-xs font-bold text-teal-700">
              <span>فتح شاشة الاستقبال</span>
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            </div>
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-5xl mx-auto w-full flex flex-col sm:flex-row items-center justify-between gap-2 py-4 border-t border-slate-200/60 text-xs text-slate-500">
        <div className="flex items-center gap-1.5 font-bold">
          <ShieldCheck className="w-4 h-4 text-clinic-600" />
          <span>جميع الحقوق محفوظة © {new Date().getFullYear()} عيادة الدكتور عبد الكريم عليوي</span>
        </div>
        <div className="flex items-center gap-1.5 font-extrabold text-slate-700 bg-white px-3 py-1 rounded-full border border-slate-200">
          <Sparkles className="w-3.5 h-3.5 text-clinic-600" />
          <span>تم التصميم والتطوير بواسطة فريق Trimindesai</span>
        </div>
      </footer>
    </div>
  );
}
