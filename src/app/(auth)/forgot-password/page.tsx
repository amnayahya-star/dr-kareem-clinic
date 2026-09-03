"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { Mail, ArrowRight } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setIsSubmitted(true);
    }, 600);
  };

  return (
    <Card className="shadow-xl border-slate-200/90 p-6 sm:p-8">
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-slate-900">استعادة كلمة المرور</h2>
        <p className="text-xs text-slate-500 mt-1">
          أدخل بريدك الإلكتروني المسجل وسنرسل لك رابط إعادة تعيين كلمة المرور
        </p>
      </div>

      {isSubmitted ? (
        <div className="space-y-4">
          <Alert variant="success" title="تم إرسال الرابط بنجاح">
            إذا كان البريد الإلكتروني مسجلاً في النظام، ستصلك رسالة تحتوي على تعليمات إعادة التعيين.
          </Alert>
          <Link href="/login" className="block">
            <Button variant="outline" className="w-full">
              العودة لتسجيل الدخول
            </Button>
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="البريد الإلكتروني"
            type="email"
            required
            placeholder="doctor@dr-kareem.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            rightIcon={<Mail className="w-4 h-4" />}
          />

          <Button type="submit" className="w-full mt-2" size="lg" isLoading={isLoading}>
            إرسال رابط الاستعادة
          </Button>

          <div className="text-center pt-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900"
            >
              <ArrowRight className="w-4 h-4" />
              <span>العودة لصفحة الدخول</span>
            </Link>
          </div>
        </form>
      )}
    </Card>
  );
}
