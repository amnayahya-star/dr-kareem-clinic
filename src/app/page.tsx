"use client";

import React from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import {
  Stethoscope,
  Calendar,
  Clock,
  User,
  ShieldCheck,
  UserCheck,
  Layers,
  ChevronLeft,
  ChevronRight,
  Globe,
  Sparkles,
} from "lucide-react";

// Vivid & Elegant Ambient Stars & Sparkles Configuration
const AMBIENT_STARS = [
  // Left Zone Sparkles
  { top: "10%", left: "5%", size: 14, color: "#0C9A96", isSparkle: true, animation: "animate-star-slow", delay: "0s", duration: "6s" },
  { top: "18%", left: "12%", size: 5, color: "#147D7A", isSparkle: false, animation: "animate-star-pulse", delay: "0.8s", duration: "4.5s" },
  { top: "32%", left: "4%", size: 12, color: "#F59E0B", isSparkle: true, animation: "animate-star-medium", delay: "1.5s", duration: "7s" },
  { top: "44%", left: "15%", size: 6, color: "#0C9A96", isSparkle: false, animation: "animate-star-slow", delay: "2.2s", duration: "5.5s" },
  { top: "62%", left: "7%", size: 15, color: "#147D7A", isSparkle: true, animation: "animate-star-pulse", delay: "0.4s", duration: "6.5s" },
  { top: "76%", left: "14%", size: 5, color: "#F59E0B", isSparkle: false, animation: "animate-star-medium", delay: "1.9s", duration: "5s" },
  { top: "90%", left: "8%", size: 13, color: "#0C9A96", isSparkle: true, animation: "animate-star-slow", delay: "2.7s", duration: "7.5s" },

  // Center-Left Zone Sparkles
  { top: "14%", left: "26%", size: 6, color: "#F59E0B", isSparkle: false, animation: "animate-star-pulse", delay: "1.1s", duration: "5s" },
  { top: "28%", left: "32%", size: 13, color: "#147D7A", isSparkle: true, animation: "animate-star-slow", delay: "2.5s", duration: "6.5s" },
  { top: "48%", left: "28%", size: 5, color: "#0C9A96", isSparkle: false, animation: "animate-star-medium", delay: "0.2s", duration: "4.5s" },
  { top: "66%", left: "35%", size: 14, color: "#F59E0B", isSparkle: true, animation: "animate-star-pulse", delay: "1.7s", duration: "7s" },
  { top: "84%", left: "30%", size: 6, color: "#147D7A", isSparkle: false, animation: "animate-star-slow", delay: "3s", duration: "6s" },

  // Middle Content Zone Sparkles
  { top: "8%", left: "48%", size: 12, color: "#0C9A96", isSparkle: true, animation: "animate-star-medium", delay: "0.9s", duration: "6s" },
  { top: "36%", left: "45%", size: 5, color: "#F59E0B", isSparkle: false, animation: "animate-star-pulse", delay: "2.1s", duration: "5s" },
  { top: "72%", left: "47%", size: 13, color: "#147D7A", isSparkle: true, animation: "animate-star-slow", delay: "1.3s", duration: "7.5s" },

  // Center-Right Zone Sparkles
  { top: "12%", left: "62%", size: 6, color: "#147D7A", isSparkle: false, animation: "animate-star-pulse", delay: "0.6s", duration: "4.8s" },
  { top: "24%", left: "70%", size: 14, color: "#F59E0B", isSparkle: true, animation: "animate-star-slow", delay: "1.8s", duration: "6.8s" },
  { top: "54%", left: "65%", size: 5, color: "#0C9A96", isSparkle: false, animation: "animate-star-medium", delay: "2.9s", duration: "5.2s" },
  { top: "80%", left: "68%", size: 15, color: "#147D7A", isSparkle: true, animation: "animate-star-pulse", delay: "0.7s", duration: "7.2s" },

  // Right Zone Sparkles
  { top: "6%", left: "82%", size: 13, color: "#F59E0B", isSparkle: true, animation: "animate-star-slow", delay: "1.2s", duration: "6.5s" },
  { top: "20%", left: "90%", size: 5, color: "#0C9A96", isSparkle: false, animation: "animate-star-pulse", delay: "2.4s", duration: "4.5s" },
  { top: "42%", left: "85%", size: 14, color: "#147D7A", isSparkle: true, animation: "animate-star-medium", delay: "0.5s", duration: "7s" },
  { top: "64%", left: "92%", size: 6, color: "#F59E0B", isSparkle: false, animation: "animate-star-slow", delay: "3.2s", duration: "5.5s" },
  { top: "86%", left: "88%", size: 12, color: "#0C9A96", isSparkle: true, animation: "animate-star-pulse", delay: "1.6s", duration: "6.2s" },
];

export default function HomePage() {
  const { language, toggleLanguage, isRTL } = useLanguage();

  return (
    <div
      className="min-h-screen bg-[#F7F9FA] flex flex-col font-sans text-[#0A1E33] selection:bg-[#147D7A] selection:text-white relative overflow-hidden"
      dir={isRTL ? "rtl" : "ltr"}
    >
      {/* Ambient Vivid & Peaceful Floating Stars Layer */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-10 select-none">
        {AMBIENT_STARS.map((star, idx) => (
          <div
            key={idx}
            className={`absolute ${star.animation}`}
            style={{
              top: star.top,
              left: star.left,
              animationDelay: star.delay,
              animationDuration: star.duration,
            }}
          >
            {star.isSparkle ? (
              <svg
                width={star.size}
                height={star.size}
                viewBox="0 0 24 24"
                fill={star.color}
                style={{
                  filter: `drop-shadow(0 0 ${star.size * 0.7}px ${star.color})`,
                }}
              >
                {/* 4-point Diamond Star */}
                <path d="M12 0L14.8 9.2L24 12L14.8 14.8L12 24L9.2 14.8L0 12L9.2 9.2L12 0Z" />
              </svg>
            ) : (
              <div
                className="rounded-full"
                style={{
                  width: `${star.size}px`,
                  height: `${star.size}px`,
                  backgroundColor: star.color,
                  boxShadow: `0 0 ${star.size * 2.5}px ${star.color}, 0 0 ${star.size * 5}px ${star.color}`,
                }}
              />
            )}
          </div>
        ))}
      </div>

      {/* 1. Header (Approx 96px-104px height, White, Clean) */}
      <header className="w-full bg-white/95 backdrop-blur-md border-b border-[#D7E0E5] h-[92px] sm:h-[104px] px-5 sm:px-10 lg:px-14 flex items-center justify-between z-30 shrink-0 shadow-2xs">
        {/* Right in RTL: Hexagonal Medical Logo FIRST, then Clinic Title */}
        <Link href="/" className="flex items-center gap-3.5 group cursor-pointer select-none">
          {/* Hexagonal Medical Logo (Rightmost) */}
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

          {/* Clinic Name & Specialty */}
          <div className={isRTL ? "text-right" : "text-left"}>
            <h1 className="text-xl sm:text-[23px] font-black text-[#0A1E33] tracking-tight leading-tight">
              {language === "ar"
                ? "عيادة الدكتور عبد الكريم عليوي"
                : "Dr. Abdul Karim Aliwi Clinic"}
            </h1>
            <p className="text-xs sm:text-[13px] font-bold text-[#147D7A] mt-0.5">
              {language === "ar"
                ? "بورد طب الأطفال وحديثي الولادة"
                : "Board Certified in Pediatrics & Neonatology"}
            </p>
          </div>
        </Link>

        {/* Left in RTL: Language Switcher Button + Outlined Login Button */}
        <div className="flex items-center gap-2.5 sm:gap-3.5">
          {/* Language Switcher Toggle */}
          <button
            type="button"
            onClick={toggleLanguage}
            className="inline-flex items-center gap-1.5 px-3 py-2 sm:px-4 sm:py-2.5 rounded-[12px] border border-[#D7E0E5] bg-white hover:border-[#147D7A] hover:bg-[#F0FDF4] text-[#0A1E33] hover:text-[#147D7A] transition-all text-xs sm:text-sm font-bold shadow-2xs cursor-pointer group"
            title={language === "ar" ? "Switch to English" : "التحويل للغة العربية"}
          >
            <Globe className="w-4 h-4 text-[#147D7A] group-hover:rotate-45 transition-transform duration-300" />
            <span>{language === "ar" ? "English" : "عربي"}</span>
          </button>

          {/* Login Button */}
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-4 py-2 sm:px-5 sm:py-2.5 rounded-[12px] border-2 border-[#147D7A] bg-transparent text-[#147D7A] hover:bg-[#147D7A] hover:text-white transition-all duration-200 text-xs sm:text-sm font-black shadow-2xs group cursor-pointer"
          >
            <User className="w-4 h-4 text-[#147D7A] group-hover:text-white transition-colors" />
            <span>{language === "ar" ? "تسجيل الدخول" : "Sign In"}</span>
          </Link>
        </div>
      </header>

      {/* 2. Main Hero Section (Right: Doctor Image + Curve | Left: Content & Portals) */}
      <main className="flex-1 flex flex-col lg:flex-row relative w-full overflow-hidden z-20">
        {/* ========================================================================= */}
        {/* RIGHT COLUMN (In RTL: Doctor Photograph with Multi-layer Curved Divider)   */}
        {/* ========================================================================= */}
        <div className="w-full lg:w-[46%] xl:w-[45%] relative h-72 sm:h-96 lg:h-auto min-h-[340px] lg:min-h-[calc(100vh-104px)] overflow-hidden order-1 lg:order-1 bg-[#F7F9FA] select-none">
          {/* SVG Clip Path Definition for Smooth Inner Curve */}
          <svg width="0" height="0" className="absolute">
            <defs>
              <clipPath id="doctor-hero-curve" clipPathUnits="objectBoundingBox">
                {isRTL ? (
                  /* Arch curving inwards from left of the photo */
                  <path d="M 0.16 0 C -0.02 0.32, -0.02 0.68, 0.16 1 L 1 1 L 1 0 Z" />
                ) : (
                  /* Arch curving inwards from right of the photo in LTR */
                  <path d="M 0 0 L 0.84 0 C 1.02 0.32, 1.02 0.68, 0.84 1 L 0 1 Z" />
                )}
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
              className="w-full h-full object-cover object-[75%_top] sm:object-[70%_center] lg:object-[80%_center] filter contrast-[1.03]"
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
              {isRTL ? (
                <>
                  {/* 1. Thin Teal Accent Outer Line */}
                  <path
                    d="M 13.5 0 C -4.5 32, -4.5 68, 13.5 100"
                    stroke="#0C9A96"
                    strokeWidth="0.85"
                    vectorEffect="non-scaling-stroke"
                  />
                  {/* 2. White Separation Gap */}
                  <path
                    d="M 14.8 0 C -3.2 32, -3.2 68, 14.8 100"
                    stroke="#FFFFFF"
                    strokeWidth="1.3"
                    vectorEffect="non-scaling-stroke"
                  />
                  {/* 3. Main Dark Navy Thick Arch */}
                  <path
                    d="M 16 0 C -2 32, -2 68, 16 100"
                    stroke="#0A1E33"
                    strokeWidth="2.8"
                    vectorEffect="non-scaling-stroke"
                  />
                </>
              ) : (
                <>
                  {/* LTR Curve Borders */}
                  <path
                    d="M 86.5 0 C 104.5 32, 104.5 68, 86.5 100"
                    stroke="#0C9A96"
                    strokeWidth="0.85"
                    vectorEffect="non-scaling-stroke"
                  />
                  <path
                    d="M 85.2 0 C 103.2 32, 103.2 68, 85.2 100"
                    stroke="#FFFFFF"
                    strokeWidth="1.3"
                    vectorEffect="non-scaling-stroke"
                  />
                  <path
                    d="M 84 0 C 102 32, 102 68, 84 100"
                    stroke="#0A1E33"
                    strokeWidth="2.8"
                    vectorEffect="non-scaling-stroke"
                  />
                </>
              )}
            </svg>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* LEFT COLUMN (In RTL: Content Area ~54% width)                              */}
        {/* ========================================================================= */}
        <div className="w-full lg:w-[54%] xl:w-[55%] flex flex-col justify-between p-6 sm:p-10 lg:py-8 lg:px-12 xl:px-16 z-20 order-2 lg:order-2">
          <div className="space-y-4 max-w-xl">
            {/* Tag Label */}
            <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#E2EDF0] text-[#147D7A] text-[11px] sm:text-xs font-black w-fit shadow-2xs border border-[#CDE1E6]">
              <Sparkles className="w-3.5 h-3.5 text-[#147D7A]" />
              <span>
                {language === "ar"
                  ? "منظومة إدارة العيادة الطبية"
                  : "Clinical Medical Management System"}
              </span>
            </div>

            {/* Main Headline */}
            <h2 className="text-3xl sm:text-4xl lg:text-[42px] xl:text-[46px] font-black text-[#0A1E33] leading-[1.2] tracking-tight">
              {language === "ar"
                ? "رعاية أدق، وتنظيم أفضل"
                : "Accurate Care, Superior Organization"}
            </h2>

            {/* Subtitle */}
            <p className="text-xs sm:text-sm lg:text-[15px] text-[#697A8D] font-medium leading-relaxed">
              {language === "ar"
                ? "نظام موحّد لإدارة ملفات المرضى والزيارات والمواعيد والوصفات الطبية بكفاءة وأمان."
                : "A unified clinical workstation to manage pediatric patient records, vitals, visits, and prescriptions with high efficiency and security."}
            </p>

            {/* Portal Cards (Doctor on Right, Reception on Left in RTL) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-4 pt-2">
              {/* Card 1: بوابة الطبيب (Doctor Portal) */}
              <div className="bg-white rounded-[20px] p-5 border border-[#D7E0E5] shadow-xs hover:border-[#147D7A] hover:shadow-md transition-all duration-200 flex flex-col justify-between min-h-[220px] text-center group">
                <div>
                  <div className="text-[#147D7A] mb-2.5 flex justify-center">
                    <div className="w-12 h-12 rounded-2xl bg-[#E8F2F2] flex items-center justify-center group-hover:bg-[#147D7A] group-hover:text-white transition-colors duration-200 shadow-2xs">
                      <Stethoscope className="w-6 h-6 stroke-[2]" />
                    </div>
                  </div>

                  <h3 className="text-base sm:text-lg font-black text-[#0A1E33] group-hover:text-[#147D7A] transition-colors">
                    {language === "ar" ? "بوابة الطبيب" : "Doctor Portal"}
                  </h3>
                  <span className="text-xs sm:text-sm font-bold text-[#147D7A] block mt-0.5">
                    {language === "ar" ? "الكشف السريري" : "Clinical Examination"}
                  </span>

                  <p className="text-[11px] sm:text-xs text-[#697A8D] mt-2 leading-relaxed font-normal">
                    {language === "ar"
                      ? "استعراض السجل الطبي، توثيق التشخيص وإدارة الوصفات."
                      : "Review medical history, document clinical diagnoses and approve Rx."}
                  </p>
                </div>

                <Link href="/doctor" className="mt-4">
                  <button
                    type="button"
                    className="w-full py-2.5 px-3 rounded-[12px] border-2 border-[#147D7A] text-[#147D7A] hover:bg-[#147D7A] hover:text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors group cursor-pointer shadow-2xs"
                  >
                    <span>
                      {language === "ar" ? "فتح شاشة الطبيب" : "Open Doctor Station"}
                    </span>
                    {isRTL ? (
                      <ChevronLeft className="w-4 h-4 text-[#147D7A] group-hover:text-white group-hover:-translate-x-1 transition-transform" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-[#147D7A] group-hover:text-white group-hover:translate-x-1 transition-transform" />
                    )}
                  </button>
                </Link>
              </div>

              {/* Card 2: بوابة الاستقبال (Reception Portal) */}
              <div className="bg-white rounded-[20px] p-5 border border-[#D7E0E5] shadow-xs hover:border-[#147D7A] hover:shadow-md transition-all duration-200 flex flex-col justify-between min-h-[220px] text-center group">
                <div>
                  <div className="text-[#147D7A] mb-2.5 flex justify-center">
                    <div className="w-12 h-12 rounded-2xl bg-[#E8F2F2] flex items-center justify-center group-hover:bg-[#147D7A] group-hover:text-white transition-colors duration-200 shadow-2xs">
                      <div className="relative inline-block">
                        <Calendar className="w-6 h-6 stroke-[2]" />
                        <Clock className="w-3 h-3 absolute -bottom-0.5 -right-0.5 bg-white rounded-full text-[#147D7A] stroke-[2.5]" />
                      </div>
                    </div>
                  </div>

                  <h3 className="text-base sm:text-lg font-black text-[#0A1E33] group-hover:text-[#147D7A] transition-colors">
                    {language === "ar" ? "بوابة الاستقبال" : "Reception Portal"}
                  </h3>
                  <span className="text-xs sm:text-sm font-bold text-[#147D7A] block mt-0.5">
                    {language === "ar" ? "إدارة المواعيد" : "Appointment & Vitals"}
                  </span>

                  <p className="text-[11px] sm:text-xs text-[#697A8D] mt-2 leading-relaxed font-normal">
                    {language === "ar"
                      ? "تسجيل المرضى، تنظيم الزيارات ومتابعة قائمة الانتظار."
                      : "Register children, record vitals, manage visits and live queue."}
                  </p>
                </div>

                <Link href="/secretary" className="mt-4">
                  <button
                    type="button"
                    className="w-full py-2.5 px-3 rounded-[12px] border-2 border-[#147D7A] text-[#147D7A] hover:bg-[#147D7A] hover:text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors group cursor-pointer shadow-2xs"
                  >
                    <span>
                      {language === "ar" ? "فتح شاشة الاستقبال" : "Open Reception Desk"}
                    </span>
                    {isRTL ? (
                      <ChevronLeft className="w-4 h-4 text-[#147D7A] group-hover:text-white group-hover:-translate-x-1 transition-transform" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-[#147D7A] group-hover:text-white group-hover:translate-x-1 transition-transform" />
                    )}
                  </button>
                </Link>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* 3. ENHANCED & INTERACTIVE BENEFITS ROW (More clear, vivid and interactive) */}
          {/* ========================================================================= */}
          <div className="pt-6 mt-6 border-t border-[#D7E0E5]/90">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Feature 1: سرية السجلات */}
              <div className="group bg-white/85 hover:bg-white p-3.5 rounded-2xl border border-[#D7E0E5] hover:border-[#147D7A] shadow-2xs hover:shadow-md transition-all duration-200 flex items-center gap-3 cursor-default">
                <div className="w-10 h-10 rounded-xl bg-[#E8F2F2] text-[#147D7A] group-hover:bg-[#147D7A] group-hover:text-white flex items-center justify-center shrink-0 transition-colors duration-200 shadow-2xs">
                  <ShieldCheck className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-black text-[#0A1E33] group-hover:text-[#147D7A] transition-colors truncate">
                    {language === "ar" ? "سرية السجلات" : "Confidential Records"}
                  </h4>
                  <p className="text-[10px] text-[#697A8D] truncate mt-0.5">
                    {language === "ar" ? "أمان وتشفير معتمد" : "Certified Encryption"}
                  </p>
                </div>
              </div>

              {/* Feature 2: سهولة الوصول */}
              <div className="group bg-white/85 hover:bg-white p-3.5 rounded-2xl border border-[#D7E0E5] hover:border-[#147D7A] shadow-2xs hover:shadow-md transition-all duration-200 flex items-center gap-3 cursor-default">
                <div className="w-10 h-10 rounded-xl bg-[#E8F2F2] text-[#147D7A] group-hover:bg-[#147D7A] group-hover:text-white flex items-center justify-center shrink-0 transition-colors duration-200 shadow-2xs">
                  <UserCheck className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-black text-[#0A1E33] group-hover:text-[#147D7A] transition-colors truncate">
                    {language === "ar" ? "سهولة الوصول" : "Instant Access"}
                  </h4>
                  <p className="text-[10px] text-[#697A8D] truncate mt-0.5">
                    {language === "ar" ? "متاح على كافة الأجهزة" : "All Devices & Mobile"}
                  </p>
                </div>
              </div>

              {/* Feature 3: إدارة متكاملة */}
              <div className="group bg-white/85 hover:bg-white p-3.5 rounded-2xl border border-[#D7E0E5] hover:border-[#147D7A] shadow-2xs hover:shadow-md transition-all duration-200 flex items-center gap-3 cursor-default">
                <div className="w-10 h-10 rounded-xl bg-[#E8F2F2] text-[#147D7A] group-hover:bg-[#147D7A] group-hover:text-white flex items-center justify-center shrink-0 transition-colors duration-200 shadow-2xs">
                  <Layers className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-black text-[#0A1E33] group-hover:text-[#147D7A] transition-colors truncate">
                    {language === "ar" ? "إدارة متكاملة" : "Integrated Workflow"}
                  </h4>
                  <p className="text-[10px] text-[#697A8D] truncate mt-0.5">
                    {language === "ar" ? "ربط الطبيب بالاستقبال" : "Doctor & Reception Sync"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
