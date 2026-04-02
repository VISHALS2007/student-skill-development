import React, { useEffect, useMemo, useState } from "react";
import GlobalLayout from "../components/GlobalLayout";
import ProgressBar from "../components/ProgressBar";
import DashboardCard from "../components/DashboardCard";
import { FiClock, FiBarChart2, FiTarget, FiMic } from "react-icons/fi";
import { useAuth } from "../lib/AuthContext";
import { fetchFocusSummary, msToHHMMSS } from "../lib/focusService";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";

export default function Progress() {
  const { user } = useAuth();
  const [focus, setFocus] = useState({ totalFocusMs: 0, mostUsedDomain: "-", weekly: [], history: [] });
  const [eventFeed, setEventFeed] = useState([]);
  const [skillStats, setSkillStats] = useState({
    totalMinutes: 0,
    totalActivities: 0,
    todayMinutes: 0,
    todayCount: 0,
    bySkill: {},
    last7: [],
  });

  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      const data = await fetchFocusSummary(user.uid, 21);
      if (data) setFocus(data);
    })();
  }, [user]);

  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      const today = new Date().toISOString().split("T")[0];
      const since = new Date();
      since.setDate(since.getDate() - 14);
      const sinceStr = since.toISOString().split("T")[0];
      try {
        const q = query(collection(db, "users", user.uid, "activityHistory"), where("date", ">=", sinceStr));
        const snap = await getDocs(q);
        const bySkill = {};
        const dayMap = {};
        let totalMinutes = 0;
        let totalActivities = 0;
        let todayMinutes = 0;
        let todayCount = 0;
        snap.forEach((doc) => {
          const data = doc.data();
          const mins = Number(data?.duration) || 0;
          const skill = data?.skillName || "Skill";
          const date = data?.date;
          bySkill[skill] = (bySkill[skill] || 0) + mins;
          totalMinutes += mins;
          totalActivities += 1;
          if (date) {
            dayMap[date] = {
              minutes: (dayMap[date]?.minutes || 0) + mins,
              count: (dayMap[date]?.count || 0) + 1,
            };
            if (date === today) {
              todayMinutes += mins;
              todayCount += 1;
            }
          }
        });
        const last7 = [];
        for (let i = 6; i >= 0; i -= 1) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().split("T")[0];
          last7.push({
            date: dateStr,
            minutes: dayMap[dateStr]?.minutes || 0,
            count: dayMap[dateStr]?.count || 0,
          });
        }
        setSkillStats({ totalMinutes, totalActivities, todayMinutes, todayCount, bySkill, last7 });
      } catch (err) {
        console.error("Failed to load skill stats", err);
      }
    })();
  }, [user]);

  const weeklyBars = useMemo(() => {
    if (!focus.weekly?.length) return [];
    return focus.weekly.map((day) => ({
      label: day.date?.slice(5),
      value: day.totalFocusMs || 0,
    }));
  }, [focus.weekly]);

  const skillBars = useMemo(() => {
    const entries = Object.entries(skillStats.bySkill || {});
    if (!entries.length) return [];
    const sorted = entries.sort((a, b) => b[1] - a[1]);
    const max = Math.max(...sorted.map(([, val]) => val || 0));
    return sorted.map(([name, minutes]) => ({
      name,
      minutes,
      pct: max ? Math.round((minutes / max) * 100) : 0,
    }));
  }, [skillStats.bySkill]);

  const topSkill = skillBars.length ? skillBars[0] : { name: "-", minutes: 0 };

  const mostUsed = focus.mostUsedDomain || "-";
  const totalHours = (focus.totalFocusMs || 0) / (1000 * 60 * 60);
  const lastSession = focus.history?.[0];
  const lastFocusScore = lastSession
    ? Math.round(
        (lastSession.durationMs / Math.max(1, lastSession.durationMs + (lastSession.pausedMs || 0))) * 100
      )
    : 0;
  const totalInterruptions = focus.history?.reduce((sum, s) => sum + (s.interruptions || 0), 0) || 0;
  const averageFocusScore = focus.history?.length
    ? Math.round(
        focus.history.reduce((sum, s) => sum + (s.focusScore || lastFocusScore || 0), 0) /
          Math.max(1, focus.history.length)
      )
    : 0;

  useEffect(() => {
    if (!focus.history?.length) {
      setEventFeed([]);
      return;
    }
    const flattened = [];
    focus.history.forEach((session) => {
      (session.events || []).forEach((evt) => {
        flattened.push({
          ...evt,
          domain: session.domain,
        });
      });
    });
    setEventFeed(flattened.slice(0, 30));
  }, [focus.history]);

  return (
    <GlobalLayout>
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold text-indigo-600">Progress</p>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Overall learning stats</h1>
          <p className="text-slate-600 text-base">Track time by skill, weekly trends, and totals.</p>
        </div>

        <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          <DashboardCard title="Total focus" subtitle="All time" icon={FiClock}>
            <div className="text-3xl font-bold text-slate-900">{totalHours.toFixed(1)}h</div>
            <p className="text-sm text-slate-500">Productive learning time</p>
          </DashboardCard>
          <DashboardCard title="Most used" subtitle="Site" icon={FiBarChart2} accent="blue">
            <div className="text-lg font-semibold text-slate-900">{mostUsed}</div>
            <p className="text-sm text-slate-500 mt-1">Based on focus sessions</p>
          </DashboardCard>
          <DashboardCard title="Sessions" subtitle="Count" icon={FiTarget} accent="green">
            <div className="text-3xl font-bold text-slate-900">{focus.sessionCount || 0}</div>
            <p className="text-sm text-slate-500">Completed focus sessions</p>
          </DashboardCard>
          <DashboardCard title="This week" subtitle="Focus" icon={FiMic} accent="orange">
            <ProgressBar
              value={Math.min(
                100,
                Math.round(
                  ((focus.weekly?.reduce((sum, d) => sum + (d.totalFocusMs || 0), 0) || 0) /
                    (7 * 60 * 60 * 1000)) *
                    100
                )
              )}
            />
            <p className="text-sm text-slate-500 mt-2">Scaled vs. 7h weekly target</p>
          </DashboardCard>
          <DashboardCard title={`${averageFocusScore}%`} subtitle="Avg focus score" icon={FiMic} accent="purple">
            <p className="text-sm text-slate-600">Weighted by last {focus.history?.length || 0} sessions.</p>
          </DashboardCard>
          <DashboardCard title={totalInterruptions} subtitle="Interruptions" icon={FiMic} accent="rose">
            <p className="text-sm text-slate-600">Tab switches and auto-pauses recorded.</p>
          </DashboardCard>
          <DashboardCard title={`${lastFocusScore}%`} subtitle="Last focus score" icon={FiMic} accent="teal">
            <p className="text-sm text-slate-600">Active vs. total time for your most recent session.</p>
          </DashboardCard>
        </div>

        <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
          <DashboardCard title="Skill practice" subtitle="Last 14 days" icon={FiClock} accent="green">
            <div className="text-3xl font-bold text-slate-900">{Math.round(skillStats.totalMinutes)}m</div>
            <p className="text-sm text-slate-500">{skillStats.totalActivities} tracked study sessions</p>
          </DashboardCard>
          <DashboardCard title="Today" subtitle="Skill sessions" icon={FiTarget} accent="orange">
            <div className="text-3xl font-bold text-slate-900">{skillStats.todayCount}</div>
            <p className="text-sm text-slate-500">{skillStats.todayMinutes} minutes logged</p>
          </DashboardCard>
          <DashboardCard title={topSkill.name} subtitle="Top skill" icon={FiBarChart2} accent="blue">
            <div className="text-lg font-semibold text-slate-900">{topSkill.minutes} min</div>
            <p className="text-sm text-slate-500">Based on recent activity logs</p>
          </DashboardCard>
        </div>

        <div className="grid gap-5 grid-cols-1 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-2xl bg-white shadow-md hover:shadow-lg hover:-translate-y-1 transition-all duration-200 p-5 border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Weekly summary</p>
                <h2 className="text-xl font-semibold text-slate-900">Focus minutes by day</h2>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {weeklyBars.map((day) => (
                <div key={day.day} className="flex flex-col items-center gap-2">
                  <div className="w-11 rounded-2xl bg-indigo-50 border border-indigo-100 flex flex-col justify-end shadow-inner" style={{ height: "150px" }}>
                    <div
                      className="w-full rounded-2xl bg-gradient-to-b from-indigo-500 to-sky-500"
                      style={{ height: `${Math.min(100, Math.max(5, (day.value / (60 * 60 * 1000)) * 100))}%` }}
                    />
                  </div>
                  <div className="text-xs text-slate-600">{day.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-white shadow-md hover:shadow-lg hover:-translate-y-1 transition-all duration-200 p-5 border border-slate-100">
            <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Skill split</p>
            <h3 className="text-lg font-semibold text-slate-900 mb-3">Session history</h3>
            <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
              {focus.history?.length ? (
                focus.history.map((entry, idx) => (
                  <div key={`${entry.startedAt}-${idx}`} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{entry.domain}</div>
                      <div className="text-xs text-slate-500">{entry.date}</div>
                      <div className="text-xs text-slate-500">Interruptions: {entry.interruptions || 0}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-slate-700">{msToHHMMSS(entry.durationMs || 0)}</div>
                      <div className="text-xs text-emerald-600">Score {entry.focusScore || lastFocusScore || 0}%</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-500">No focus sessions yet.</div>
              )}
            </div>
          </div>
          <div className="rounded-2xl bg-white shadow-md hover:shadow-lg hover:-translate-y-1 transition-all duration-200 p-5 border border-slate-100">
            <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Interruption feed</p>
            <h3 className="text-lg font-semibold text-slate-900 mb-3">Recent events</h3>
            <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
              {eventFeed.length ? (
                eventFeed.map((evt, idx) => (
                  <div key={`evt-${idx}`} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                    <div className="text-sm text-slate-800 capitalize">{evt.type} — {evt.reason}</div>
                    <div className="text-xs text-slate-500">{evt.domain || "unknown"} · {new Date(evt.at).toLocaleString()}</div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-500">No interruptions recorded.</div>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-5 grid-cols-1 lg:grid-cols-2">
          <div className="rounded-2xl bg-white shadow-md hover:shadow-lg hover:-translate-y-1 transition-all duration-200 p-5 border border-slate-100">
            <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Skill split</p>
            <h3 className="text-lg font-semibold text-slate-900 mb-3">Where time went</h3>
            <div className="space-y-3">
              {skillBars.length ? (
                skillBars.slice(0, 6).map((bar) => (
                  <div key={bar.name} className="space-y-1">
                    <div className="flex items-center justify-between text-sm text-slate-700">
                      <span className="font-semibold text-slate-900">{bar.name}</span>
                      <span className="text-xs text-slate-500">{bar.minutes} min</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100">
                      <div className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-sky-500" style={{ width: `${Math.min(100, Math.max(5, bar.pct))}%` }} />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">No skill sessions logged yet.</p>
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-white shadow-md hover:shadow-lg hover:-translate-y-1 transition-all duration-200 p-5 border border-slate-100">
            <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Recent days</p>
            <h3 className="text-lg font-semibold text-slate-900 mb-3">Skill activity timeline</h3>
            <div className="space-y-3">
              {skillStats.last7.length ? (
                skillStats.last7.map((day) => (
                  <div key={day.date} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{day.date}</div>
                      <div className="text-xs text-slate-500">{day.count} sessions</div>
                    </div>
                    <div className="text-right text-sm font-semibold text-slate-700">{day.minutes} min</div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">Log a skill session to see your daily breakdown.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </GlobalLayout>
  );
}