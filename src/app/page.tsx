"use client";

import React from "react";
import Link from "next/link";
import {
  Stethoscope,
  Calendar,
  Clock,
  User,
  ShieldCheck,
  UserCheck,
  Layers,
  ChevronLeft,
  Sparkles,
  Award,
  Activity,
  HeartPulse,
  ArrowLeft,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans text-[#0A1E33] selection:bg-[#147D7A] selection:text-white" dir="rtl">
      {/* ========================================================================= */}
      {/* 1. Header (~96px - 104px height, Modern Medical Header)                   */}
      {/* ========================================================================= */}
      <header className="w-full bg-white/95 backdrop-blur-md border-b border-[#E2E8F0] h-[92px] sm:h-[104px] px-6 sm:px-12 lg:px-16 flex items-center justify-between z-30 shrink-0 sticky top-0 shadow-2xs">
        {/* Right in RTL: Hexagonal Medical Logo + Clinic Title */}
        <Link href="/" className="flex items-center gap-3.5 group cursor-pointer select-none">
          <div className="text-right">
            <h1 className="text-xl sm:text-[23px] font-black text-[#0A1E33] tracking-tight leading-tight group-hover:text-[#147D7A] transition-colors">
              عيادة د. عبد الكريم عليوي
            </h1>
            <p className="text-xs sm:text-[13px] font-bold text-[#147D7A] mt-0.5">
              بورد طب الأطفال وحديثي الولادة
            </p>
          </div>

          <div className="shrink-0 transition-transform duration-300 group-hover:scale-105">
            <svg
              width="46"
              height="46"
              viewBox="0 0 48 48"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="drop-shadow-xs"
            >
              {/* Hexagon Outer Frame */}
              <path
                d="M24 3.5L42.5 13.8V34.2L24 44.5L5.5 34.2V13.8L24 3.5Z"
                stroke="#0A1E33"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Heartbeat ECG Pulse in Medical Teal */}
              <path
                d="M5.5 24H15.5L19.5 14.5L24.5 34.5L29.5 18L33.5 24H42.5"
                stroke="#0C9A96"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </Link>

        {/* Left in RTL: Live Status Badge + Outlined Login Button */}
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>العيادة جاهزة للاستقبال</span>
          </div>

          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-4 py-2 sm:px-5 sm:py-2.5 rounded-[12px] border-2 border-[#147D7A] bg-white text-[#147D7A] hover:bg-[#147D7A] hover:text-white transition-all duration-200 text-xs sm:text-sm font-black shadow-xs group"
          >
            <span>تسجيل الدخول</span>
            <User className="w-4 h-4 text-[#147D7A] group-hover:text-white transition-colors" />
          </Link>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2. Main Hero Section (Doctor on the RIGHT, Content on the LEFT in RTL)   */}
      {/* ========================================================================= */}
      <main className="flex-1 flex flex-col lg:flex-row relative w-full overflow-hidden">
        {/* RIGHT COLUMN (Doctor Photograph with Multi-layer Curved Divider ~46% width) */}
        <div className="w-full lg:w-[46%] relative h-80 sm:h-96 lg:h-auto min-h-[340px] lg:min-h-[calc(100vh-104px)] overflow-hidden order-1 lg:order-1 bg-[#061524]">
          {/* Subtle Ambient Background Gradient */}
          <div className="absolute inset-0 bg-radial from-[#147D7A]/20 via-transparent to-transparent pointer-events-none z-0" />

          {/* SVG Clip Path Definition for Smooth Crescent Curve */}
          <svg width="0" height="0" className="absolute">
            <defs>
              <clipPath id="doctor-hero-curve" clipPathUnits="objectBoundingBox">
                <path d="M 0.16 0 C -0.02 0.32, -0.02 0.68, 0.16 1 L 1 1 L 1 0 Z" />
              </clipPath>
            </defs>
          </svg>

          {/* Doctor Image with Curve Clipping on Desktop */}
          <div
            className="w-full h-full relative z-10"
            style={{
              clipPath: "url(#doctor-hero-curve)",
              WebkitClipPath: "url(#doctor-hero-curve)",
            }}
          >
            <img
              src="/doctor-clinic-photo.jpg"
              alt="الدكتور عبد الكريم عليوي - بورد طب الأطفال وحديثي الولادة"
              className="w-full h-full object-cover object-[75%_top] sm:object-[70%_center] lg:object-[80%_center] contrast-105"
            />
          </div>

          {/* Floating Prestigious Doctor Badge (Bottom-Right Corner) */}
          <div className="hidden sm:flex absolute bottom-6 right-6 z-30 items-center gap-3 bg-white/90 backdrop-blur-md p-3.5 rounded-2xl border border-white/60 shadow-xl max-w-xs">
            <div className="w-10 h-10 rounded-xl bg-[#061524] text-white flex items-center justify-center shrink-0 shadow-xs">
              <Award className="w-5 h-5 text-[#0C9A96]" />
            </div>
            <div className="text-right">
              <h4 className="text-xs font-black text-[#0A1E33]">د. عبد الكريم عليوي</h4>
              <p className="text-[10px] text-[#147D7A] font-bold">استشاري طب الأطفال وحديثي الولادة</p>
              <p className="text-[9px] text-[#697A8D] font-medium mt-0.5">زميل كلية الأطباء الملكية البريطانية</p>
            </div>
          </div>

          {/* Multi-layered Vector Curve Borders */}
          <div className="hidden lg:block absolute inset-0 w-full h-full pointer-events-none z-20">
            <svg
              className="w-full h-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* 1. Thin Teal Accent Outer Line */}
              <path
                d="M 13.5 0 C -4.5 32, -4.5 68, 13.5 100"
                stroke="#0C9A96"
                strokeWidth="0.9"
                vectorEffect="non-scaling-stroke"
              />

              {/* 2. White Separation Gap */}
              <path
                d="M 14.8 0 C -3.2 32, -3.2 68, 14.8 100"
                stroke="#FFFFFF"
                strokeWidth="1.2"
                vectorEffect="non-scaling-stroke"
              />

              {/* 3. Main Dark Navy Thick Arch */}
              <path
                d="M 16 0 C -2 32, -2 68, 16 100"
                stroke="#0A1E33"
                strokeWidth="2.8"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>
        </div>

        {/* LEFT COLUMN (Content Area ~54% width in RTL) */}
        <div className="w-full lg:w-[54%] flex flex-col justify-between p-6 sm:p-10 lg:py-8 lg:px-12 xl:px-16 z-20 order-2 lg:order-2">
          <div className="space-y-4 max-w-xl">
            {/* Tag Label */}
            <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#E2EDF0] text-[#147D7A] text-[11px] sm:text-xs font-black w-fit shadow-2xs border border-[#CDE1E6]">
              <Sparkles className="w-3.5 h-3.5 text-[#0C9A96]" />
              <span>منظومة إدارة العيادة الطبية الذكية</span>
            </div>

            {/* Main Headline */}
            <h2 className="text-3xl sm:text-4xl lg:text-[42px] xl:text-[46px] font-black text-[#0A1E33] leading-[1.2] tracking-tight">
              رعاية أدق، وتنظيم أفضل
            </h2>

            {/* Subtitle */}
            <p className="text-xs sm:text-sm lg:text-[15px] text-[#697A8D] font-medium leading-relaxed">
              نظام موحّد لإدارة ملفات المرضى والزيارات والمواعيد والوصفات الطبية بكفاءة وأمان وسرعة فائقة.
            </p>

            {/* Portal Cards (Doctor Portal on Right, Reception Portal on Left in RTL) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-4 pt-2">
              {/* Card 1: بوابة الطبيب (Appears on Right in RTL) */}
              <div className="bg-white rounded-[20px] p-5 sm:p-6 border border-[#E2E8F0] shadow-xs hover:shadow-md hover:border-[#147D7A] transition-all duration-200 flex flex-col justify-between min-h-[225px] text-center group">
                <div>
                  <div className="text-[#147D7A] mb-3 flex justify-center">
                    <div className="w-12 h-12 rounded-2xl bg-[#E8F2F2] text-[#147D7A] group-hover:bg-[#147D7A] group-hover:text-white flex items-center justify-center transition-all duration-300 shadow-2xs">
                      <Stethoscope className="w-6 h-6 stroke-[2]" />
                    </div>
                  </div>

                  <h3 className="text-base sm:text-lg font-black text-[#0A1E33] group-hover:text-[#147D7A] transition-colors">
                    بوابة الطبيب
                  </h3>
                  <span className="text-xs sm:text-sm font-bold text-[#147D7A] block mt-0.5">
                    الكشف السريري والتشخيص
                  </span>

                  <p className="text-[11px] sm:text-xs text-[#697A8D] mt-2 leading-relaxed font-normal">
                    استعراض السجل الطبي، توثيق التشخيص، الفحص السريري، وإدارة الوصفات.
                  </p>
                </div>

                <Link href="/doctor" className="mt-4">
                  <button
                    type="button"
                    className="w-full py-2.5 px-3 rounded-xl border-2 border-[#147D7A] text-[#147D7A] hover:bg-[#147D7A] hover:text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all duration-200 group cursor-pointer shadow-2xs"
                  >
                    <span>فتح شاشة الطبيب</span>
                    <ChevronLeft className="w-4 h-4 text-[#147D7A] group-hover:text-white group-hover:-translate-x-1 transition-transform" />
                  </button>
                </Link>
              </div>

              {/* Card 2: بوابة الاستقبال (Appears on Left in RTL) */}
              <div className="bg-white rounded-[20px] p-5 sm:p-6 border border-[#E2E8F0] shadow-xs hover:shadow-md hover:border-[#147D7A] transition-all duration-200 flex flex-col justify-between min-h-[225px] text-center group">
                <div>
                  <div className="text-[#147D7A] mb-3 flex justify-center">
                    <div className="w-12 h-12 rounded-2xl bg-[#E8F2F2] text-[#147D7A] group-hover:bg-[#147D7A] group-hover:text-white flex items-center justify-center transition-all duration-300 shadow-2xs">
                      <div className="relative inline-block">
                        <Calendar className="w-6 h-6 stroke-[2]" />
                        <Clock className="w-3 h-3 absolute -bottom-0.5 -right-0.5 bg-white group-hover:bg-[#147D7A] rounded-full text-[#147D7A] group-hover:text-white stroke-[2.5]" />
                      </div>
                    </div>
                  </div>

                  <h3 className="text-base sm:text-lg font-black text-[#0A1E33] group-hover:text-[#147D7A] transition-colors">
                    بوابة الاستقبال
                  </h3>
                  <span className="text-xs sm:text-sm font-bold text-[#147D7A] block mt-0.5">
                    إدارة المواعيد والمرضى
                  </span>

                  <p className="text-[11px] sm:text-xs text-[#697A8D] mt-2 leading-relaxed font-normal">
                    تسجيل الأطفال، تنظيم الزيارات والقياسات، ومتابعة قائمة الانتظار.
                  </p>
                </div>

                <Link href="/secretary" className="mt-4">
                  <button
                    type="button"
                    className="w-full py-2.5 px-3 rounded-xl border-2 border-[#147D7A] text-[#147D7A] hover:bg-[#147D7A] hover:text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all duration-200 group cursor-pointer shadow-2xs"
                  >
                    <span>فتح شاشة الاستقبال</span>
                    <ChevronLeft className="w-4 h-4 text-[#147D7A] group-hover:text-white group-hover:-translate-x-1 transition-transform" />
                  </button>
                </Link>
              </div>
            </div>
          </div>

          {/* Bottom Benefits Row */}
          <div className="pt-6 mt-6 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between sm:justify-start sm:gap-8 text-xs font-bold text-[#0A1E33]">
            {/* 1. سرية السجلات (Right in RTL) */}
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#E8F2F2] text-[#147D7A] flex items-center justify-center shrink-0 shadow-2xs">
                <ShieldCheck className="w-4 h-4 stroke-[2]" />
              </div>
              <span className="text-[#0A1E33] font-bold">سرية السجلات</span>
            </div>

            {/* Divider */}
            <div className="hidden sm:block w-px h-5 bg-[#E2E8F0]" />

            {/* 2. سهولة الوصول (Middle in RTL) */}
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#E8F2F2] text-[#147D7A] flex items-center justify-center shrink-0 shadow-2xs">
                <UserCheck className="w-4 h-4 stroke-[2]" />
              </div>
              <span className="text-[#0A1E33] font-bold">سهولة الوصول</span>
            </div>

            {/* Divider */}
            <div className="hidden sm:block w-px h-5 bg-[#E2E8F0]" />

            {/* 3. إدارة متكاملة (Left in RTL) */}
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#E8F2F2] text-[#147D7A] flex items-center justify-center shrink-0 shadow-2xs">
                <Layers className="w-4 h-4 stroke-[2]" />
              </div>
              <span className="text-[#0A1E33] font-bold">إدارة متكاملة</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
