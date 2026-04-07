import React, { useEffect, useMemo, useState } from "react";
import { FiCalendar, FiTrendingUp, FiCheckCircle, FiXCircle, FiClock } from "react-icons/fi";
import GlobalLayout from "../components/GlobalLayout";
import { useAuth } from "../lib/AuthContext";
import { useSkills } from "../lib/SkillsContext";
import { listAttendance, getAttendanceByDate, computeTodayAttendance } from "../services/attendanceService";

const todayKey = new Date().toISOString().slice(0, 10);

export default function Calendar() {
  const { user } = useAuth();
  const { skills } = useSkills();
  const [attendanceList, setAttendanceList] = useState([]);
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const derivedSkills = useMemo(() => {
    if (!selectedRecord) return [];
    if (Array.isArray(selectedRecord.skills)) return selectedRecord.skills;
    const list = [];
    (selectedRecord.completedSkills || []).forEach((name) => list.push({ name, status: "completed" }));
    (selectedRecord.incompleteSkills || []).forEach((name) => list.push({ name, status: "pending" }));
    return list;
  }, [selectedRecord]);

  useEffect(() => {
    if (!user) return;
    const bootstrap = async () => {
      setLoading(true);
      setError("");
      try {
        const [todayRecord, list] = await Promise.all([
          computeTodayAttendance(user.uid, skills),
          listAttendance(user.uid),
        ]);
        const merged = todayRecord
          ? [todayRecord, ...(list || []).filter((item) => item.date !== todayRecord.date)]
          : list || [];
        merged.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        setAttendanceList(merged);
        if (selectedDate === todayKey) {
          setSelectedRecord(todayRecord || merged.find((item) => item.date === todayKey) || null);
        }
      } catch (err) {
        console.error("Failed to load attendance", err);
        setError(err.message || "Unable to load attendance");
      } finally {
        setLoading(false);
      }
    };
    bootstrap();
  }, [user, skills]);

  useEffect(() => {
    if (!user || !selectedDate) return;
    const local = attendanceList.find((entry) => entry.date === selectedDate);
    if (local) {
      setSelectedRecord(local);
      setError("");
      setLoading(false);
      return;
    }
    const loadRecord = async () => {
      setLoading(true);
      setError("");
      try {
        const record = await getAttendanceByDate(selectedDate, user.uid);
        setSelectedRecord(record);
      } catch (err) {
        console.error("Failed to load attendance for date", err);
        setSelectedRecord(null);
        setError(err.message || "No attendance for this date");
      } finally {
        setLoading(false);
      }
    };
    loadRecord();
  }, [user, selectedDate, attendanceList]);

  const summary = useMemo(() => {
    if (!selectedRecord) return { percent: 0, present: 0, absent: 0, status: "absent" };
    const total = derivedSkills.length || selectedRecord.totalSkills || 0;
    const present = Array.isArray(selectedRecord.completedSkills)
      ? selectedRecord.completedSkills.length
      : derivedSkills.filter((s) => s.status === "completed").length;
    const absent = Math.max(total - present, 0);
    const percent = total > 0 ? Math.round((present / total) * 100) : 0;
    return { percent, present, absent, status: selectedRecord.status };
  }, [selectedRecord, derivedSkills]);

  const todayRecord = useMemo(
    () => attendanceList.find((item) => item.date === todayKey) || null,
    [attendanceList]
  );

  const recentHistory = useMemo(
    () => attendanceList.slice(0, 30),
    [attendanceList]
  );

  const statusClasses = (status) => {
    if (status === "present") return "bg-emerald-50 text-emerald-700 border-emerald-100";
    if (status === "partial") return "bg-amber-50 text-amber-700 border-amber-100";
    return "bg-rose-50 text-rose-700 border-rose-100";
  };

  return (
    <GlobalLayout>
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold text-indigo-600">My Attendance</p>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Attendance</h1>
          <p className="text-slate-600 text-base">Daily attendance overview plus date-wise skill status in one page.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-white shadow-md border border-slate-100 p-5 space-y-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Today</p>
              <p className="text-sm text-slate-500">Completion summary</p>
            </div>
            {loading && !todayRecord ? (
              <p className="text-sm text-slate-600">Loading attendance...</p>
            ) : !todayRecord ? (
              <p className="text-sm text-slate-500">No attendance record for today.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm font-semibold">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${todayRecord.status === "present" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                    {todayRecord.status === "present" ? "Present" : "Absent"}
                  </span>
                  <span className="text-slate-700">{todayRecord.date}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Completed</p>
                    <p className="text-slate-700 mt-1">{todayRecord.completedSkills?.length ? todayRecord.completedSkills.join(", ") : "None yet"}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Incomplete</p>
                    <p className="text-slate-700 mt-1">{todayRecord.incompleteSkills?.length ? todayRecord.incompleteSkills.join(", ") : "All done"}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-white shadow-md border border-slate-100 p-5 space-y-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">History</p>
              <p className="text-sm text-slate-500">Recent attendance records</p>
            </div>
            {recentHistory.length === 0 ? (
              <p className="text-sm text-slate-500">No attendance records yet.</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-auto pr-1">
                {recentHistory.map((item) => (
                  <div key={item.date} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-800">{item.date}</div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${item.status === "present" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                      {item.status === "present" ? "Present" : "Absent"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <div className="rounded-2xl bg-white shadow-md hover:shadow-lg transition-all duration-200 p-5 border border-slate-100">
            <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Attendance</div>
            <div className="flex items-center justify-between mt-2">
              <div className="text-3xl font-bold text-indigo-600">{summary.percent}%</div>
              <FiTrendingUp className="text-[20px] text-indigo-500" />
            </div>
            <p className="text-xs text-slate-500 mt-2">Computed from completed skills on the selected day.</p>
          </div>
          <div className="rounded-2xl bg-white shadow-md hover:shadow-lg transition-all duration-200 p-5 border border-slate-100">
            <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Completed</div>
            <div className="flex items-center justify-between mt-2">
              <div className="text-3xl font-bold text-emerald-600">{summary.present}</div>
              <FiCheckCircle className="text-[20px] text-emerald-500" />
            </div>
            <p className="text-xs text-slate-500 mt-2">Skills finished on this date.</p>
          </div>
          <div className="rounded-2xl bg-white shadow-md hover:shadow-lg transition-all duration-200 p-5 border border-slate-100">
            <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Remaining</div>
            <div className="flex items-center justify-between mt-2">
              <div className="text-3xl font-bold text-rose-600">{summary.absent}</div>
              <FiXCircle className="text-[20px] text-rose-500" />
            </div>
            <p className="text-xs text-slate-500 mt-2">Skills not completed on this date.</p>
          </div>
        </div>

        <div className="rounded-2xl bg-white shadow-md hover:shadow-lg transition-all duration-200 p-5 border border-slate-100 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2 text-slate-700 font-semibold">
              <FiCalendar className="text-[18px]" />
              <span>Select day to review</span>
            </div>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full sm:w-auto rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
              max={todayKey}
            />
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <div className="flex flex-wrap gap-2">
            {attendanceList.map((item) => (
              <button
                key={item.date}
                onClick={() => setSelectedDate(item.date)}
                className={`px-3 py-2 rounded-xl border text-sm transition ${
                  selectedDate === item.date ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-slate-50 text-slate-700"
                }`}
              >
                <div className="font-semibold">{item.date}</div>
                <div className={`mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${statusClasses(item.status)}`}>
                  <span className="capitalize">{item.status}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {loading ? (
              <p className="text-sm text-slate-600">Loading attendance...</p>
            ) : !selectedRecord ? (
              <p className="text-sm text-slate-500">No attendance recorded for this date.</p>
            ) : derivedSkills.length === 0 ? (
              <p className="text-sm text-slate-500">No skills were registered for this day.</p>
            ) : (
              derivedSkills.map((skill) => {
                const isCompleted = skill.status === "completed";
                const badge = isCompleted ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-amber-50 text-amber-700 border-amber-100";
                const label = isCompleted ? "Completed" : "Pending";
                return (
                  <div
                    key={`${selectedRecord.date}-${skill.name}`}
                    className="rounded-2xl bg-white border border-slate-100 shadow-sm px-4 py-4 flex items-start justify-between gap-3 hover:shadow-md transition"
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-indigo-600">
                        <FiClock className="text-[18px]" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-lg font-semibold text-slate-900">{skill.name || "Skill"}</p>
                        <p className="text-sm text-slate-500">Status for {selectedRecord.date}</p>
                      </div>
                    </div>
                    <span className={`text-sm font-semibold px-3 py-1 rounded-full border whitespace-nowrap ${badge}`}>{label}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </GlobalLayout>
  );
}
