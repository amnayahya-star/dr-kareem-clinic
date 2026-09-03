"use client";

import React from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { MOCK_AUDIT_LOGS } from "@/lib/mock-data/patients";
import { formatArabicDate, formatArabicTime } from "@/lib/utils";
import { ShieldCheck, History, Clock, UserCheck, Stethoscope } from "lucide-react";

export default function DoctorAuditLogsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2">
          <ShieldCheck className="w-7 h-7 text-clinic-600" />
          <span>سجل العمليات والتدقيق (Audit Logs)</span>
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          توثيق زمني غير قابل للتعديل لجميع العمليات الإدارية والطبية في العيادة
        </p>
      </div>

      <Card className="p-0 overflow-hidden border border-slate-200/90 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 border-b border-slate-200/80 text-slate-500 font-bold">
              <tr>
                <th className="p-3.5">الوقت والتاريخ</th>
                <th className="p-3.5">المستخدم والصفة</th>
                <th className="p-3.5">نوع العملية</th>
                <th className="p-3.5">تفاصيل الحدث</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {MOCK_AUDIT_LOGS.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="p-3.5 text-slate-600 font-medium whitespace-nowrap">
                    <div className="font-bold text-slate-800">{formatArabicDate(log.created_at)}</div>
                    <div className="text-[10px] text-slate-400">{formatArabicTime(log.created_at)}</div>
                  </td>
                  <td className="p-3.5 whitespace-nowrap">
                    <div className="flex items-center gap-1.5 font-bold text-slate-800">
                      {log.user_role === "doctor" ? (
                        <Stethoscope className="w-3.5 h-3.5 text-clinic-600" />
                      ) : (
                        <UserCheck className="w-3.5 h-3.5 text-mint-600" />
                      )}
                      <span>{log.user_name}</span>
                    </div>
                  </td>
                  <td className="p-3.5 whitespace-nowrap">
                    <Badge variant={log.user_role === "doctor" ? "info" : "success"} size="sm">
                      {log.action}
                    </Badge>
                  </td>
                  <td className="p-3.5 text-slate-700 font-medium leading-relaxed">
                    {log.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
