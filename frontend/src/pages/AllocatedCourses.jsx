import React, { useEffect, useMemo, useState } from "react";
import { FiBookOpen, FiCalendar, FiCheckCircle, FiClock } from "react-icons/fi";
import GlobalLayout from "../components/GlobalLayout";
import DashboardCard from "../components/DashboardCard";
import { useAuth } from "../lib/AuthContext";
import { apiRequestWithFallback } from "../lib/apiClient";

const toDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const dateLabel = (value) => {
  const d = toDate(value);
  if (!d) return "-";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
};

const allocationState = (startDate, endDate) => {
  const now = new Date();
  const start = toDate(startDate);
  const end = toDate(endDate);
  if (!start || !end) return "unknown";
  if (now < start) return "upcoming";
  if (now > end) return "expired";
  return "active";
};

const isLikelyIdLabel = (value = "") => {
  const normalized = String(value || "").trim();
  if (!normalized) return true;
  if (/^[a-f0-9]{24,}$/i.test(normalized)) return true;
  if (/^[a-f0-9]{8}-[a-f0-9-]{27,}$/i.test(normalized)) return true;
  return false;
};

const allocationTitle = (item = {}) => {
  const candidates = [item.title, item.course_name, item.skillName, item.skillTitle, item.name, item.courseTitle]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const bestTitle = candidates.find((value) => !isLikelyIdLabel(value));
  if (bestTitle) return bestTitle;
  return "Allocated Skill";
};

export default function AllocatedCourses() {
  const { user } = useAuth();
  const [allocations, setAllocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      if (!user?.uid) {
        setAllocations([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const token = await user.getIdToken();
        const headers = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "x-student-session": JSON.stringify({ uid: user.uid, email: user.email || "", role: "student" }),
        };

        const response = await apiRequestWithFallback("/student/courses", { headers });
        const primary = Array.isArray(response?.allocatedCourses) ? response.allocatedCourses : [];
        const merged = primary.length
          ? primary
          : (Array.isArray(response?.items) ? response.items : []).filter((item) => {
              const source = String(item?.source || "admin").toLowerCase();
              const status = String(item?.status || "active").toLowerCase();
              return source !== "student" && status !== "registered";
            });

        const sorted = merged
          .slice()
          .sort((a, b) => String(b.startDate || "").localeCompare(String(a.startDate || "")));
        setAllocations(sorted);
      } catch (err) {
        console.error("Failed to load allocated courses", err);
        setAllocations([]);
        setError(err?.message || "Unable to load allocated courses");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  const stats = useMemo(() => {
    const active = allocations.filter((a) => allocationState(a.startDate, a.endDate) === "active").length;
    const upcoming = allocations.filter((a) => allocationState(a.startDate, a.endDate) === "upcoming").length;
    const expired = allocations.filter((a) => allocationState(a.startDate, a.endDate) === "expired").length;
    return { active, upcoming, expired };
  }, [allocations]);

  return (
    <GlobalLayout>
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold text-indigo-600">Allocated Courses</p>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Admin-assigned courses</h1>
          <p className="text-slate-600 text-base">View only. Course allocation is controlled by admin.</p>
        </div>

        <div className="grid gap-5 grid-cols-1 sm:grid-cols-3">
          <DashboardCard title={String(allocations.length)} subtitle="Total allocations" icon={FiBookOpen} accent="blue" />
          <DashboardCard title={String(stats.active)} subtitle="Active" icon={FiCheckCircle} accent="green" />
          <DashboardCard title={`${stats.upcoming}/${stats.expired}`} subtitle="Upcoming / Expired" icon={FiClock} accent="orange" />
        </div>

        <DashboardCard title="Allocated Courses" subtitle="Start and end dates" icon={FiCalendar} accent="indigo">
          {error ? <p className="mb-2 text-sm font-semibold text-rose-600">{error}</p> : null}
          {loading ? (
            <p className="text-sm text-slate-600">Loading allocated courses...</p>
          ) : allocations.length === 0 ? (
            <p className="text-sm text-slate-500">No courses allocated yet.</p>
          ) : (
            <div className="space-y-3">
              {allocations
                .slice()
                .sort((a, b) => (String(b.startDate || "")).localeCompare(String(a.startDate || "")))
                .map((item) => {
                  const state = allocationState(item.startDate, item.endDate);
                  const stateClass =
                    state === "active"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                      : state === "upcoming"
                        ? "bg-amber-50 text-amber-700 border-amber-100"
                        : "bg-slate-100 text-slate-700 border-slate-200";
                  return (
                    <div key={item.id || `${item.course_id || item.courseId || "skill"}_${item.startDate || ""}`} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{allocationTitle(item)}</p>
                        <p className="text-sm text-slate-500">
                          {dateLabel(item.startDate)} to {dateLabel(item.endDate)}
                        </p>
                      </div>
                      <span className={`text-xs font-semibold px-3 py-1 rounded-full border uppercase ${stateClass}`}>
                        {state}
                      </span>
                    </div>
                  );
                })}
            </div>
          )}
        </DashboardCard>
      </div>
    </GlobalLayout>
  );
}
