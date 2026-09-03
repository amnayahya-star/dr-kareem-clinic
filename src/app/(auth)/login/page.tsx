"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import {
  User,
  Lock,
  Phone,
  Eye,
  EyeOff,
  ShieldCheck,
  ChevronLeft,
  ChevronDown,
  Globe,
  ArrowLeft,
  ShieldAlert,
} from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { language, toggleLanguage, t, isRTL } = useLanguage();
  const { login } = useAuth();

  const [selectedRole, setSelectedRole] = useState<"doctor" | "secretary">("doctor");
  const [phoneOrUser, setPhoneOrUser] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await login(selectedRole, phoneOrUser, password);

      if (selectedRole === "doctor") {
        router.replace("/doctor");
      } else {
        router.replace("/secretary");
      }
    } catch (err: any) {
      setError(
        err.message ||
          (language === "ar"
            ? "رقم الهاتف أو كلمة المرور غير صحيحة"
            : "Invalid phone number or password")
      );
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F9FA] flex flex-col lg:flex-row relative w-full overflow-x-hidden font-sans text-[#0A1E33] selection:bg-[#147D7A] selection:text-white" dir="rtl">
      {/* ========================================================================= */}
      {/* 1. RIGHT COLUMN (Dark Navy Hero with Doctor Portrait & Curve in RTL)      */}
      {/* ========================================================================= */}
      <div className="w-full lg:w-[48%] xl:w-[46%] relative bg-[#061524] text-white flex flex-col justify-between p-6 sm:p-10 lg:p-12 min-h-[420px] lg:min-h-screen overflow-hidden order-1 lg:order-2 shadow-2xl">
        {/* Background Subtle Hexagon Pattern / Watermarks */}
        <div className="absolute inset-0 pointer-events-none opacity-20 bg-[radial-gradient(#147D7A_1px,transparent_1px)] [background-size:24px_24px] z-0" />

        {/* Decorative Hexagon Molecules */}
        <div className="absolute top-28 right-8 pointer-events-none opacity-25 z-0">
          <svg width="120" height="120" viewBox="0 0 100 100" fill="none" stroke="#0C9A96" strokeWidth="1.2">
            <path d="M50 5 L85 25 L85 65 L50 85 L15 65 L15 25 Z" />
            <path d="M85 25 L120 45 L120 85 L85 105 L50 85" />
          </svg>
        </div>

        {/* Multi-layered Curve Vector Divider (on the left edge in RTL) */}
        <div className="hidden lg:block absolute inset-0 w-full h-full pointer-events-none z-30">
          <svg
            className="w-full h-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* 1. Outer Thin Teal Accent Curve */}
            <path
              d="M 12 0 C -5 32, -5 68, 12 100"
              stroke="#0C9A96"
              strokeWidth="0.9"
              vectorEffect="non-scaling-stroke"
            />
            {/* 2. White Separation Line */}
            <path
              d="M 13.5 0 C -3.5 32, -3.5 68, 13.5 100"
              stroke="#FFFFFF"
              strokeWidth="1.2"
              vectorEffect="non-scaling-stroke"
            />
            {/* 3. Dark Navy Inner Border */}
            <path
              d="M 14.8 0 C -2.2 32, -2.2 68, 14.8 100"
              stroke="#061524"
              strokeWidth="2.6"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>

        {/* Top Header of Right Side: Logo & Clinic Name */}
        <div className="flex items-center justify-end gap-3.5 relative z-20">
          <div className="text-right">
            <h1 className="text-lg sm:text-xl font-black text-white tracking-tight leading-tight">
              عيادة د. عبد الكريم عليوي
            </h1>
            <p className="text-xs sm:text-[13px] font-bold text-[#0C9A96] mt-0.5">
              بورد طب الأطفال وحديثي الولادة
            </p>
          </div>

          <div className="shrink-0">
            <svg
              width="44"
              height="44"
              viewBox="0 0 48 48"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="drop-shadow-sm"
            >
              <path
                d="M24 3.5L42.5 13.8V34.2L24 44.5L5.5 34.2V13.8L24 3.5Z"
                stroke="#FFFFFF"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M5.5 24H15.5L19.5 14.5L24.5 34.5L29.5 18L33.5 24H42.5"
                stroke="#0C9A96"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        {/* Center: Doctor Portrait with Soft Fade */}
        <div className="relative my-auto flex justify-center items-center py-4 z-10">
          <div className="relative w-72 sm:w-80 lg:w-96 max-w-full aspect-[4/5] overflow-hidden">
            <img
              src="/doctor-clinic-photo.jpg"
              alt="الدكتور عبد الكريم عليوي"
              className="w-full h-full object-cover object-[75%_top] rounded-2xl filter contrast-105"
            />
            {/* Smooth gradient blend at the bottom of the photo */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#061524] via-[#061524]/40 to-transparent" />
          </div>
        </div>

        {/* Bottom Headline & Subtitle of Right Side */}
        <div className="text-center relative z-20 space-y-2 pb-2">
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            رعاية موثوقة. إدارة آمنة<span className="text-[#0C9A96]">.</span>
          </h2>
          <p className="text-xs sm:text-sm text-[#8DA4B8] font-medium max-w-md mx-auto">
            دخول مخصص للكادر الطبي والإداري في العيادة.
          </p>
          <div className="w-12 h-1 bg-[#0C9A96] mx-auto rounded-full mt-3 opacity-90" />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. LEFT COLUMN (Light Background with Floating Login Card in RTL)        */}
      {/* ========================================================================= */}
      <div className="w-full lg:w-[52%] xl:w-[54%] flex flex-col justify-between p-6 sm:p-10 lg:p-12 relative z-20 order-2 lg:order-1">
        {/* Subtle Decorative Dot Matrix in Bottom-Left Corner */}
        <div className="absolute bottom-6 left-6 pointer-events-none opacity-30 z-0">
          <div className="grid grid-cols-6 gap-2">
            {Array.from({ length: 36 }).map((_, i) => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-slate-300" />
            ))}
          </div>
        </div>

        {/* Top Actions: Language Switcher & Back to Home */}
        <div className="flex items-center justify-between w-full max-w-md mx-auto mb-6 z-20">
          {/* Back to Home Link */}
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0A1E33] hover:text-[#147D7A] transition-colors group"
          >
            <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
            <span>العودة للرئيسية</span>
          </Link>

          {/* Language Switcher Pill */}
          <button
            type="button"
            onClick={toggleLanguage}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#D7E0E5] bg-white text-xs font-bold text-[#0A1E33] hover:border-[#147D7A] transition-all shadow-2xs"
          >
            <Globe className="w-3.5 h-3.5 text-[#147D7A]" />
            <span>{language === "ar" ? "English" : "عربي"}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>

        {/* Main Floating Login Card */}
        <div className="w-full max-w-md mx-auto my-auto bg-white rounded-[24px] p-6 sm:p-8 border border-[#E5EBF0] shadow-sm relative z-20 space-y-6">
          {/* Card Header */}
          <div className="text-center space-y-1">
            <h3 className="text-2xl font-black text-[#0A1E33] tracking-tight">
              تسجيل الدخول
            </h3>
            <p className="text-xs text-[#697A8D] font-medium">
              أدخل بيانات حسابك للوصول إلى نظام العيادة
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-bold flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Role Switcher Tabs (Doctor vs Receptionist) */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-[#F1F5F7] rounded-xl border border-[#E2E8EC]">
            {/* Doctor Tab */}
            <button
              type="button"
              onClick={() => {
                setSelectedRole("doctor");
                setError(null);
                setPhoneOrUser("");
                setPassword("");
              }}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-black transition-all ${
                selectedRole === "doctor"
                  ? "bg-[#0A1E33] text-white shadow-xs"
                  : "text-[#697A8D] hover:text-[#0A1E33]"
              }`}
            >
              <User className={`w-4 h-4 ${selectedRole === "doctor" ? "text-[#0C9A96]" : "text-slate-400"}`} />
              <span>حساب الطبيب</span>
            </button>

            {/* Receptionist Tab */}
            <button
              type="button"
              onClick={() => {
                setSelectedRole("secretary");
                setError(null);
                setPhoneOrUser("");
                setPassword("");
              }}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-black transition-all ${
                selectedRole === "secretary"
                  ? "bg-[#0A1E33] text-white shadow-xs"
                  : "text-[#697A8D] hover:text-[#0A1E33]"
              }`}
            >
              <User className={`w-4 h-4 ${selectedRole === "secretary" ? "text-[#0C9A96]" : "text-slate-400"}`} />
              <span>حساب الاستقبال</span>
            </button>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Phone Number Field */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#0A1E33] text-right">
                رقم الهاتف
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="أدخل رقم الهاتف"
                  value={phoneOrUser}
                  onChange={(e) => setPhoneOrUser(e.target.value)}
                  className="w-full h-12 pr-4 pl-11 rounded-xl border border-[#D7E0E5] focus:border-[#147D7A] focus:ring-2 focus:ring-[#147D7A]/15 text-xs font-bold text-[#0A1E33] placeholder:text-[#94A3B8] outline-none transition-all"
                />
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#94A3B8]">
                  <Phone className="w-4 h-4" />
                </div>
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#0A1E33] text-right">
                كلمة المرور
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-12 pr-11 pl-11 rounded-xl border border-[#D7E0E5] focus:border-[#147D7A] focus:ring-2 focus:ring-[#147D7A]/15 text-xs font-bold text-[#0A1E33] placeholder:text-[#94A3B8] outline-none transition-all tracking-wider"
                />
                {/* Lock Icon on Right in RTL */}
                <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-[#94A3B8]">
                  <Lock className="w-4 h-4" />
                </div>

                {/* Show/Hide Eye Toggle on Left in RTL */}
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-[#94A3B8] hover:text-[#0A1E33] transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Options Row: Remember Me & Forgot Password */}
            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none text-[#697A8D]">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-[#D7E0E5] text-[#147D7A] focus:ring-[#147D7A] accent-[#147D7A]"
                />
                <span className="font-medium text-xs">تذكرني على هذا الجهاز</span>
              </label>

              <Link
                href="/forgot-password"
                className="text-xs font-bold text-[#147D7A] hover:underline"
              >
                نسيت كلمة المرور؟
              </Link>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 bg-[#0A1E33] hover:bg-[#147D7A] text-white rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all duration-200 shadow-sm cursor-pointer disabled:opacity-60"
            >
              <span>{isLoading ? "جاري الدخول..." : "الدخول إلى النظام"}</span>
              <ArrowLeft className="w-4 h-4" />
            </button>
          </form>

          {/* Quick Credential Hint Pill */}
          <div className="p-2.5 rounded-xl bg-[#F7F9FA] border border-slate-200/80 text-[10px] text-slate-500 text-center space-y-0.5">
            <span>
              {selectedRole === "doctor" ? "حساب الطبيب: " : "حساب الاستقبال: "}
              <strong className="text-slate-800 font-mono">
                {selectedRole === "doctor" ? "07801021470 (dr.Kareem@97al)" : "07719215504 (Husain@97al)"}
              </strong>
            </span>
          </div>
        </div>

        {/* Security Badge & Footer */}
        <div className="text-center mt-6 space-y-3 z-20">
          {/* Encrypted Connection Badge */}
          <div className="inline-flex items-center gap-2 text-xs text-[#697A8D] font-bold">
            <div className="w-10 h-px bg-[#D7E0E5]" />
            <ShieldCheck className="w-4 h-4 text-[#147D7A]" />
            <span>اتصال آمن ومشفر</span>
            <div className="w-10 h-px bg-[#D7E0E5]" />
          </div>

          {/* Copyright */}
          <p className="text-[11px] text-[#94A3B8] font-medium">
            عيادة د. عبد الكريم عليوي 2026 ©
          </p>
        </div>
      </div>
    </div>
  );
}
