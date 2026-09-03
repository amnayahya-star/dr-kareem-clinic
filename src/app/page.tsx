"use client";

import React from "react";
import Link from "next/link";
import {
  User,
  Stethoscope,
  Calendar,
  Clock,
  ShieldCheck,
  UserCircle2,
  Layers,
  ChevronLeft,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col justify-between font-sans selection:bg-teal-100 selection:text-teal-900 relative overflow-hidden" dir="rtl">
      {/* 1. Top Header */}
      <header className="w-full max-w-7xl mx-auto px-4 sm:px-8 py-5 flex items-center justify-between z-20">
        {/* Logo & Clinic Titles (Right) */}
        <div className="flex items-center gap-3">
          {/* Hexagonal Medical Pulse Logo */}
          <div className="relative w-12 h-12 flex items-center justify-center shrink-0">
            <svg
              viewBox="0 0 100 100"
              className="w-12 h-12 text-[#0B2545]"
              fill="none"
              stroke="currentColor"
              strokeWidth="5.5"
            >
              <polygon points="50,4 93,25 93,75 50,96 7,75 7,25" strokeLinejoin="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-teal-600">
              <svg viewBox="0 0 50 30" className="w-8 h-6 fill-none stroke-teal-600" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M 2 15 L 12 15 L 18 5 L 26 25 L 32 10 L 38 18 L 48 15" />
              </svg>
            </div>
          </div>

          <div>
            <h1 className="text-lg sm:text-xl font-black text-[#0B2545] tracking-tight">
              عيادة د. عبد الكريم عليوي
            </h1>
            <p className="text-xs sm:text-sm font-bold text-teal-700">
              بورد طب الأطفال وحديثي الولادة
            </p>
          </div>
        </div>

        {/* Login Button (Left) */}
        <Link
          href="/login"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl border-2 border-teal-700 text-teal-950 hover:bg-teal-50 text-xs sm:text-sm font-bold transition-all shadow-xs"
        >
          <User className="w-4 h-4 text-teal-700" />
          <span>تسجيل الدخول</span>
        </Link>
      </header>

      {/* 2. Main Hero Section */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-8 py-4 sm:py-6 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-8 items-center z-10">
        {/* Text & Portals Content (Left in visual / Col-7) */}
        <div className="lg:col-span-7 space-y-6 sm:space-y-7 order-2 lg:order-1">
          {/* Tagline Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#E6F4F4] text-[#0A6C74] text-xs sm:text-sm font-black border border-teal-100">
            <span>منظومة إدارة العيادة الطبية</span>
          </div>

          {/* Main Title */}
          <div className="space-y-3">
            <h2 className="text-3xl sm:text-5xl lg:text-[54px] font-black text-[#0B2545] tracking-tight leading-[1.18]">
              رعاية أدق، وتنظيم أفضل
            </h2>
            <p className="text-sm sm:text-base text-slate-500 font-semibold max-w-xl leading-relaxed">
              نظام موحّد لإدارة ملفات المرضى والزيارات والمواعيد والوصفات الطبية بكفاءة وأمان.
            </p>
          </div>

          {/* Two Portals Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 pt-2 max-w-2xl">
            {/* 1. بوابة الاستقبال */}
            <div className="bg-white rounded-3xl p-5 sm:p-6 border-2 border-slate-100 shadow-sm hover:shadow-md hover:border-teal-400 transition-all flex flex-col justify-between gap-5 text-center">
              <div className="space-y-3">
                {/* Calendar / Clock Icon */}
                <div className="flex justify-center text-teal-600">
                  <div className="relative">
                    <Calendar className="w-11 h-11 stroke-[1.8]" />
                    <Clock className="w-5 h-5 absolute -bottom-1 -right-1 bg-white rounded-full text-teal-700 stroke-[2.2]" />
                  </div>
                </div>

                <div>
                  <h3 className="text-lg sm:text-xl font-black text-[#0B2545]">
                    بوابة الاستقبال
                  </h3>
                  <span className="text-xs sm:text-sm font-bold text-teal-700">
                    إدارة المواعيد
                  </span>
                </div>

                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                  تسجيل المرضى، تنظيم الزيارات ومتابعة قائمة الانتظار.
                </p>
              </div>

              <Link href="/secretary">
                <button
                  type="button"
                  className="w-full py-2.5 px-4 rounded-xl border-2 border-teal-700 text-teal-900 hover:bg-teal-50 font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors group cursor-pointer"
                >
                  <span>فتح شاشة الاستقبال</span>
                  <ChevronLeft className="w-4 h-4 text-teal-700 group-hover:-translate-x-1 transition-transform" />
                </button>
              </Link>
            </div>

            {/* 2. بوابة الطبيب */}
            <div className="bg-white rounded-3xl p-5 sm:p-6 border-2 border-slate-100 shadow-sm hover:shadow-md hover:border-teal-400 transition-all flex flex-col justify-between gap-5 text-center">
              <div className="space-y-3">
                {/* Stethoscope Icon */}
                <div className="flex justify-center text-teal-600">
                  <Stethoscope className="w-11 h-11 stroke-[1.8]" />
                </div>

                <div>
                  <h3 className="text-lg sm:text-xl font-black text-[#0B2545]">
                    بوابة الطبيب
                  </h3>
                  <span className="text-xs sm:text-sm font-bold text-teal-700">
                    الكشف السريري
                  </span>
                </div>

                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                  استعراض السجل الطبي، توثيق التشخيص وإدارة الوصفات.
                </p>
              </div>

              <Link href="/doctor">
                <button
                  type="button"
                  className="w-full py-2.5 px-4 rounded-xl border-2 border-teal-700 text-teal-900 hover:bg-teal-50 font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors group cursor-pointer"
                >
                  <span>فتح شاشة الطبيب</span>
                  <ChevronLeft className="w-4 h-4 text-teal-700 group-hover:-translate-x-1 transition-transform" />
                </button>
              </Link>
            </div>
          </div>
        </div>

        {/* Doctor Photo with Curved Crescent Border (Right in visual / Col-5) */}
        <div className="lg:col-span-5 flex justify-center lg:justify-end order-1 lg:order-2">
          <div className="relative w-full max-w-md lg:max-w-lg">
            {/* The Outer Curved Crescent Border SVG Frame matching the exact mockup */}
            <div className="relative rounded-[40px] sm:rounded-[56px] overflow-hidden border-4 sm:border-8 border-[#0B2545] shadow-2xl aspect-[4/5] bg-slate-900 group">
              <img
                src="/dr-kareem.jpg"
                alt="الدكتور عبد الكريم عليوي"
                className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
              />

              {/* Inner subtle glow gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#0B2545]/40 via-transparent to-transparent pointer-events-none" />
            </div>

            {/* Decorative Crescent Curve Line on outer left edge */}
            <div className="hidden lg:block absolute -left-6 top-1/2 -translate-y-1/2 w-12 h-[90%] border-l-4 border-teal-600/40 rounded-full pointer-events-none" />
          </div>
        </div>
      </main>

      {/* 3. Bottom Features Bar */}
      <footer className="w-full border-t border-slate-200/80 bg-white/70 backdrop-blur-xs py-5 px-4 sm:px-8 mt-4 z-20">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-around gap-4 sm:gap-8">
          {/* Feature 1: سرية السجلات */}
          <div className="flex items-center gap-2.5 text-slate-700 font-extrabold text-xs sm:text-sm">
            <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6 text-teal-700" />
            <span>سرية السجلات</span>
          </div>

          {/* Divider */}
          <div className="hidden sm:block w-px h-6 bg-slate-200" />

          {/* Feature 2: سهولة الوصول */}
          <div className="flex items-center gap-2.5 text-slate-700 font-extrabold text-xs sm:text-sm">
            <UserCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-teal-700" />
            <span>سهولة الوصول</span>
          </div>

          {/* Divider */}
          <div className="hidden sm:block w-px h-6 bg-slate-200" />

          {/* Feature 3: إدارة متكاملة */}
          <div className="flex items-center gap-2.5 text-slate-700 font-extrabold text-xs sm:text-sm">
            <Layers className="w-5 h-5 sm:w-6 sm:h-6 text-teal-700" />
            <span>إدارة متكاملة</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
