import React from "react";

export default function DashboardCard({ children, icon: Icon, title, subtitle, accent = "indigo" }) {
  const accentMap = {
    indigo: "from-indigo-500/10 to-indigo-500/5 border-indigo-100",
    purple: "from-violet-500/10 to-indigo-500/5 border-violet-100",
    blue: "from-blue-500/10 to-indigo-500/5 border-blue-100",
    green: "from-emerald-500/10 to-indigo-500/5 border-emerald-100",
    orange: "from-orange-500/10 to-indigo-500/5 border-orange-100",
  };

  const accentClass = accentMap[accent] || accentMap.indigo;

  return (
    <div className="ui-card relative overflow-hidden transition-all duration-200 hover:shadow-md">
      <div className={`absolute inset-0 bg-gradient-to-br ${accentClass} opacity-30 pointer-events-none`} />
      <div className="relative">
        <div className="flex items-center gap-3 mb-3">
          {Icon && (
            <div className="w-10 h-10 rounded-lg bg-white grid place-items-center text-slate-700 shadow-sm border border-slate-200">
              <Icon className="text-[18px]" />
            </div>
          )}
          <div>
            <p className="text-[13px] text-slate-500 font-medium">{subtitle}</p>
            <h3 className="ui-card-title">{title}</h3>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
