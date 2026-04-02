import React, { useEffect, useState } from "react";
import GlobalLayout from "../components/GlobalLayout";
import DashboardCard from "../components/DashboardCard";
import { useAuth } from "../lib/AuthContext";
import { useSkills } from "../lib/SkillsContext";
import { computeAttendance, fetchAttendance, updateAttendanceRecord } from "../services/attendanceService";

const Attendance = () => {
  const { user } = useAuth();
  const { skills } = useSkills();
  const [todayStatus, setTodayStatus] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      setLoading(true);
      try {
        const [today, stored] = await Promise.all([
          computeAttendance(user.uid, skills),
          fetchAttendance(user.uid, 30),
        ]);
        const merged = today
          ? [today, ...(stored || []).filter((item) => item.date !== today.date)]
          : stored || [];
        merged.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        setTodayStatus(today);
        setHistory(merged.slice(0, 30));
      } catch (err) {
        console.error("Failed to load attendance", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user, skills]);

  useEffect(() => {
    if (!user) return;
    updateAttendanceRecord(user.uid, skills).catch(() => {});
  }, [user, skills]);

  return (
    <GlobalLayout>
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold text-indigo-600">Attendance</p>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Daily skill attendance</h1>
          <p className="text-slate-600 text-base">Present only when all registered skills are completed for the day.</p>
        </div>

        <DashboardCard title="Today" subtitle="Completion summary" accent="green">
          {loading || !todayStatus ? (
            <p className="text-sm text-slate-600">Loading attendance...</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-lg font-semibold">
                <span className={`px-3 py-1 rounded-full text-sm font-bold ${todayStatus.status === "present" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                  {todayStatus.status === "present" ? "Present" : "Absent"}
                </span>
                <span className="text-slate-700">{todayStatus.date}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Completed Skills</p>
                  {todayStatus.completedSkills.length === 0 ? (
                    <p className="text-slate-600 mt-1">None yet</p>
                  ) : (
                    <ul className="mt-1 space-y-1">
                      {todayStatus.completedSkills.map((s) => (
                        <li key={`c-${s}`} className="text-slate-800 font-semibold">{s}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Incomplete Skills</p>
                  {todayStatus.incompleteSkills.length === 0 ? (
                    <p className="text-slate-600 mt-1">All done</p>
                  ) : (
                    <ul className="mt-1 space-y-1">
                      {todayStatus.incompleteSkills.map((s) => (
                        <li key={`i-${s}`} className="text-slate-800 font-semibold">{s}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}
        </DashboardCard>

        <DashboardCard title="History" subtitle="Recent attendance" accent="indigo">
          {history.length === 0 ? (
            <p className="text-sm text-slate-600">No attendance records yet.</p>
          ) : (
            <div className="space-y-2">
              {history.map((item) => (
                <div key={item.date} className="rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-900">{item.date}</div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${item.status === "present" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                      {item.status === "present" ? "Present" : "Absent"}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-700">
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Completed</p>
                      {item.completedSkills?.length ? item.completedSkills.join(", ") : "-"}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Incomplete</p>
                      {item.incompleteSkills?.length ? item.incompleteSkills.join(", ") : "-"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DashboardCard>
      </div>
    </GlobalLayout>
  );
};

export default Attendance;
