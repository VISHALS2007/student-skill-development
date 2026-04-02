import React from "react";

export default function DashboardCard({ children, icon: Icon, title, subtitle, accent = "indigo" }) {
  const accentMap = {
    indigo: "from-indigo-500/10 to-indigo-500/5 border-indigo-100",
    purple: "from-purple-500/10 to-purple-500/5 border-purple-100",
    blue: "from-sky-500/10 to-sky-500/5 border-sky-100",
    green: "from-emerald-500/10 to-emerald-500/5 border-emerald-100",
    orange: "from-orange-500/10 to-orange-500/5 border-orange-100",
  };

  const accentClass = accentMap[accent] || accentMap.indigo;

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-md p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${accentClass} opacity-50 pointer-events-none`} />
      <div className="relative">
        <div className="flex items-center gap-3 mb-3">
          {Icon && (
            <div className="w-10 h-10 rounded-xl bg-white/90 grid place-items-center text-slate-700 shadow-sm ring-1 ring-white/80">
              <Icon className="text-[18px]" />
            </div>
          )}
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">{subtitle}</p>
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
