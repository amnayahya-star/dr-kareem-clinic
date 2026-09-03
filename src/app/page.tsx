"use client";

import React from "react";
import Link from "next/link";
import {
  Stethoscope,
  Calendar,
  Clock,
  User,
  Shield,
  UserCheck,
  Layers,
  ChevronLeft,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#F7F9FA] flex flex-col font-sans text-[#0A1E33] selection:bg-[#147D7A] selection:text-white" dir="rtl">
      {/* 1. Header (~96px - 104px height, White, Clean RTL Header) */}
      <header className="w-full bg-white border-b border-[#D7E0E5] h-[92px] sm:h-[104px] px-6 sm:px-12 lg:px-16 flex items-center justify-between z-30 shrink-0">
        {/* Right in RTL: Hexagonal Medical Logo + Clinic Title */}
        <Link href="/" className="flex items-center gap-3.5 group cursor-pointer select-none">
          <div className="text-right">
            <h1 className="text-xl sm:text-[23px] font-black text-[#0A1E33] tracking-tight leading-tight">
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
              className="drop-shadow-2xs"
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
                stroke="#147D7A"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </Link>

        {/* Left in RTL: Outlined Login Button with User Icon */}
        <Link
          href="/login"
          className="inline-flex items-center gap-2 px-4 py-2 sm:px-5 sm:py-2.5 rounded-[12px] border border-[#147D7A] bg-transparent text-[#147D7A] hover:bg-[#147D7A] hover:text-white transition-all duration-200 text-xs sm:text-sm font-bold shadow-2xs group"
        >
          <span>تسجيل الدخول</span>
          <User className="w-4 h-4 text-[#147D7A] group-hover:text-white transition-colors" />
        </Link>
      </header>

      {/* 2. Main Hero Section (Two-part layout with curved divider) */}
      <main className="flex-1 flex flex-col lg:flex-row relative w-full overflow-hidden">
        {/* RIGHT COLUMN (In RTL visual layout: Doctor Photograph with Curved Divider ~46% width) */}
        <div className="w-full lg:w-[46%] relative h-72 sm:h-96 lg:h-auto min-h-[320px] lg:min-h-[calc(100vh-104px)] overflow-hidden order-1 lg:order-2 bg-[#F7F9FA]">
          {/* SVG Clip Path Definition for Smooth Curve */}
          <svg width="0" height="0" className="absolute">
            <defs>
              <clipPath id="doctor-hero-curve" clipPathUnits="objectBoundingBox">
                <path d="M 0.16 0 C -0.02 0.32, -0.02 0.68, 0.16 1 L 1 1 L 1 0 Z" />
              </clipPath>
            </defs>
          </svg>

          {/* Doctor Image with Curve Clipping on Desktop */}
          <div
            className="w-full h-full relative"
            style={{
              clipPath: "url(#doctor-hero-curve)",
              WebkitClipPath: "url(#doctor-hero-curve)",
            }}
          >
            <img
              src="/doctor-clinic-photo.jpg"
              alt="الدكتور عبد الكريم عليوي - بورد طب الأطفال وحديثي الولادة"
              className="w-full h-full object-cover object-[75%_top] sm:object-[70%_center] lg:object-[80%_center]"
            />
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
                strokeWidth="0.8"
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

        {/* LEFT COLUMN (In RTL visual layout: Content Area ~54% width) */}
        <div className="w-full lg:w-[54%] flex flex-col justify-between p-6 sm:p-10 lg:py-8 lg:px-12 xl:px-16 z-20 order-2 lg:order-1">
          <div className="space-y-4 max-w-xl">
            {/* Tag Label */}
            <div className="inline-flex items-center px-4 py-1 rounded-full bg-[#E2EDF0] text-[#147D7A] text-[11px] sm:text-xs font-black w-fit">
              <span>منظومة إدارة العيادة الطبية</span>
            </div>

            {/* Main Headline */}
            <h2 className="text-3xl sm:text-4xl lg:text-[42px] xl:text-[46px] font-black text-[#0A1E33] leading-[1.2] tracking-tight">
              رعاية أدق، وتنظيم أفضل
            </h2>

            {/* Subtitle */}
            <p className="text-xs sm:text-sm lg:text-[15px] text-[#697A8D] font-medium leading-relaxed">
              نظام موحّد لإدارة ملفات المرضى والزيارات والمواعيد والوصفات الطبية بكفاءة وأمان.
            </p>

            {/* Portal Cards (Doctor Portal on Right, Reception Portal on Left in RTL) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-4 pt-2">
              {/* Card 1: بوابة الطبيب (Appears on Right in RTL) */}
              <div className="bg-white rounded-[18px] p-5 border border-[#D7E0E5] shadow-xs hover:border-[#147D7A] transition-all flex flex-col justify-between min-h-[215px] text-center group">
                <div>
                  <div className="text-[#147D7A] mb-2.5 flex justify-center">
                    <Stethoscope className="w-9 h-9 stroke-[1.8]" />
                  </div>

                  <h3 className="text-base sm:text-lg font-black text-[#0A1E33]">
                    بوابة الطبيب
                  </h3>
                  <span className="text-xs sm:text-sm font-bold text-[#147D7A] block mt-0.5">
                    الكشف السريري
                  </span>

                  <p className="text-[11px] sm:text-xs text-[#697A8D] mt-2 leading-relaxed font-normal">
                    استعراض السجل الطبي، توثيق التشخيص وإدارة الوصفات.
                  </p>
                </div>

                <Link href="/doctor" className="mt-4">
                  <button
                    type="button"
                    className="w-full py-2 px-3 rounded-[10px] border border-[#147D7A] text-[#147D7A] hover:bg-[#147D7A] hover:text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors group cursor-pointer"
                  >
                    <span>فتح شاشة الطبيب</span>
                    <ChevronLeft className="w-4 h-4 text-[#147D7A] group-hover:text-white group-hover:-translate-x-1 transition-transform" />
                  </button>
                </Link>
              </div>

              {/* Card 2: بوابة الاستقبال (Appears on Left in RTL) */}
              <div className="bg-white rounded-[18px] p-5 border border-[#D7E0E5] shadow-xs hover:border-[#147D7A] transition-all flex flex-col justify-between min-h-[215px] text-center group">
                <div>
                  <div className="text-[#147D7A] mb-2.5 flex justify-center">
                    <div className="relative inline-block">
                      <Calendar className="w-9 h-9 stroke-[1.8]" />
                      <Clock className="w-4 h-4 absolute -bottom-0.5 -right-0.5 bg-white rounded-full text-[#147D7A] stroke-[2.2]" />
                    </div>
                  </div>

                  <h3 className="text-base sm:text-lg font-black text-[#0A1E33]">
                    بوابة الاستقبال
                  </h3>
                  <span className="text-xs sm:text-sm font-bold text-[#147D7A] block mt-0.5">
                    إدارة المواعيد
                  </span>

                  <p className="text-[11px] sm:text-xs text-[#697A8D] mt-2 leading-relaxed font-normal">
                    تسجيل المرضى، تنظيم الزيارات ومتابعة قائمة الانتظار.
                  </p>
                </div>

                <Link href="/secretary" className="mt-4">
                  <button
                    type="button"
                    className="w-full py-2 px-3 rounded-[10px] border border-[#147D7A] text-[#147D7A] hover:bg-[#147D7A] hover:text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors group cursor-pointer"
                  >
                    <span>فتح شاشة الاستقبال</span>
                    <ChevronLeft className="w-4 h-4 text-[#147D7A] group-hover:text-white group-hover:-translate-x-1 transition-transform" />
                  </button>
                </Link>
              </div>
            </div>
          </div>

          {/* Bottom Benefits Row */}
          <div className="pt-6 mt-6 border-t border-[#D7E0E5]/80 flex items-center justify-between sm:justify-start sm:gap-8 text-xs font-bold text-[#0A1E33]">
            {/* 1. سرية السجلات (Right in RTL) */}
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#E8F2F2] text-[#147D7A] flex items-center justify-center shrink-0">
                <Shield className="w-4 h-4 stroke-[2]" />
              </div>
              <span className="text-[#0A1E33] font-bold">سرية السجلات</span>
            </div>

            {/* Divider */}
            <div className="w-px h-5 bg-[#D7E0E5]" />

            {/* 2. سهولة الوصول (Middle in RTL) */}
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#E8F2F2] text-[#147D7A] flex items-center justify-center shrink-0">
                <UserCheck className="w-4 h-4 stroke-[2]" />
              </div>
              <span className="text-[#0A1E33] font-bold">سهولة الوصول</span>
            </div>

            {/* Divider */}
            <div className="w-px h-5 bg-[#D7E0E5]" />

            {/* 3. إدارة متكاملة (Left in RTL) */}
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#E8F2F2] text-[#147D7A] flex items-center justify-center shrink-0">
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
