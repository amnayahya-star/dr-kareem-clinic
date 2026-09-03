import React from "react";
import Link from "next/link";
import {
  Stethoscope,
  Calendar,
  Clock,
  User,
  ChevronLeft,
  ShieldCheck,
  UserCircle2,
  Layers,
  Sparkles,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-50/70 flex flex-col justify-between text-slate-900 selection:bg-teal-100 selection:text-teal-900 font-sans" dir="rtl">
      {/* 1. Header */}
      <header className="w-full max-w-7xl mx-auto px-4 sm:px-8 py-5 flex items-center justify-between">
        {/* Right side: Logo & Clinic Name */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 text-teal-800 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 48 48" className="w-12 h-12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="24 4 44 14 44 34 24 44 4 34 4 14" stroke="#0f766e" strokeWidth="2.5" />
              <path d="M12 24h6l3-7 6 14 4-9 3 4h4" stroke="#0f766e" strokeWidth="2.5" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight leading-tight">
              عيادة د. عبد الكريم عليوي
            </h1>
            <p className="text-xs sm:text-sm font-bold text-teal-700 leading-tight mt-0.5">
              بورد طب الأطفال وحديثي الولادة
            </p>
          </div>
        </div>

        {/* Left side: Login Button */}
        <Link
          href="/login"
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-300 hover:border-slate-400 bg-white text-slate-800 font-black text-xs sm:text-sm shadow-2xs hover:shadow-xs transition-all"
        >
          <User className="w-4 h-4 text-slate-600" />
          <span>تسجيل الدخول</span>
        </Link>
      </header>

      {/* 2. Hero Section */}
      <main className="w-full max-w-7xl mx-auto px-4 sm:px-8 my-auto py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Column (Text & 2 Portal Cards) */}
          <div className="lg:col-span-7 space-y-6 text-right order-2 lg:order-1">
            {/* Badge */}
            <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-slate-100 text-teal-900 text-xs sm:text-sm font-black border border-slate-200">
              منظومة إدارة العيادة الطبية
            </div>

            {/* Main Title */}
            <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-[1.2]">
              رعاية أدق، وتنظيم أفضل
            </h2>

            {/* Subtitle */}
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-xl font-medium">
              نظام موحّد لإدارة ملفات المرضى والزيارات والمواعيد والوصفات الطبية بكفاءة وأمان.
            </p>

            {/* The 2 Portals Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 pt-2 max-w-2xl">
              {/* Card 1: بوابة الاستقبال */}
              <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between text-center group">
                <div className="space-y-3">
                  <div className="flex justify-center text-teal-700">
                    <div className="relative">
                      <Calendar className="w-10 h-10 stroke-[1.8]" />
                      <Clock className="w-4 h-4 absolute -bottom-0.5 -right-0.5 text-teal-800 bg-white rounded-full stroke-[2.5]" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-black text-slate-900">
                      بوابة الاستقبال
                    </h3>
                    <p className="text-xs sm:text-sm font-bold text-teal-700 mt-0.5">
                      إدارة المواعيد
                    </p>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed font-medium">
                    تسجيل المرضى، تنظيم الزيارات ومتابعة قائمة الانتظار.
                  </p>
                </div>

                <Link href="/secretary" className="mt-5 block">
                  <button
                    type="button"
                    className="w-full py-2.5 px-4 rounded-xl border border-teal-700 text-teal-800 hover:bg-teal-700 hover:text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer group-hover:border-teal-800"
                  >
                    <span>فتح شاشة الاستقبال</span>
                    <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                  </button>
                </Link>
              </div>

              {/* Card 2: بوابة الطبيب */}
              <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between text-center group">
                <div className="space-y-3">
                  <div className="flex justify-center text-teal-700">
                    <Stethoscope className="w-10 h-10 stroke-[1.8]" />
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-black text-slate-900">
                      بوابة الطبيب
                    </h3>
                    <p className="text-xs sm:text-sm font-bold text-teal-700 mt-0.5">
                      الكشف السريري
                    </p>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed font-medium">
                    استعراض السجل الطبي، توثيق التشخيص وإدارة الوصفات.
                  </p>
                </div>

                <Link href="/doctor" className="mt-5 block">
                  <button
                    type="button"
                    className="w-full py-2.5 px-4 rounded-xl border border-teal-700 text-teal-800 hover:bg-teal-700 hover:text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer group-hover:border-teal-800"
                  >
                    <span>فتح شاشة الطبيب</span>
                    <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                  </button>
                </Link>
              </div>
            </div>
          </div>

          {/* Right Column (The Arched Doctor Photo Frame) */}
          <div className="lg:col-span-5 flex justify-center lg:justify-end order-1 lg:order-2">
            <div className="relative w-full max-w-sm sm:max-w-md lg:max-w-lg">
              {/* Crescent Arched Outer Border */}
              <div className="relative overflow-hidden rounded-[40px] sm:rounded-r-[40px] sm:rounded-l-[180px] border-4 border-slate-900/90 shadow-2xl bg-white">
                <img
                  src="/doctor-hero.jpg"
                  alt="الدكتور عبد الكريم عليوي"
                  className="w-full h-auto object-cover object-top hover:scale-102 transition-transform duration-500"
                />
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* 3. Bottom Features Bar & Credits */}
      <footer className="w-full border-t border-slate-200/80 bg-white/70 backdrop-blur-xs py-5 px-4 sm:px-8 mt-4 relative z-20">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Features */}
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-8">
            {/* Feature 1 */}
            <div className="flex items-center gap-2 text-slate-700 font-extrabold text-xs sm:text-sm">
              <ShieldCheck className="w-5 h-5 text-teal-700" />
              <span>سرية السجلات</span>
            </div>

            <div className="hidden sm:block w-px h-5 bg-slate-200" />

            {/* Feature 2 */}
            <div className="flex items-center gap-2 text-slate-700 font-extrabold text-xs sm:text-sm">
              <UserCircle2 className="w-5 h-5 text-teal-700" />
              <span>سهولة الوصول</span>
            </div>

            <div className="hidden sm:block w-px h-5 bg-slate-200" />

            {/* Feature 3 */}
            <div className="flex items-center gap-2 text-slate-700 font-extrabold text-xs sm:text-sm">
              <Layers className="w-5 h-5 text-teal-700" />
              <span>إدارة متكاملة</span>
            </div>
          </div>

          {/* Designer Credit */}
          <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-slate-700 bg-slate-100 px-3.5 py-1 rounded-full border border-slate-200">
            <Sparkles className="w-3.5 h-3.5 text-teal-700" />
            <span>تم التصميم والتطوير بواسطة فريق Trimindesai</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
