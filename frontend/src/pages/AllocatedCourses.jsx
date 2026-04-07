import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { FiBookOpen, FiCalendar, FiCheckCircle, FiClock } from "react-icons/fi";
import GlobalLayout from "../components/GlobalLayout";
import DashboardCard from "../components/DashboardCard";
import { useAuth } from "../lib/AuthContext";
import { db } from "../firebase";

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

export default function AllocatedCourses() {
  const { user } = useAuth();
  const [allocations, setAllocations] = useState([]);
  const [coursesById, setCoursesById] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!user?.uid) return;
      setLoading(true);
      try {
        const allocSnap = await getDocs(
          query(collection(db, "user_courses"), where("user_id", "==", user.uid))
        );
        const allocItems = allocSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        setAllocations(allocItems);

        const courseIds = Array.from(new Set(allocItems.map((a) => a.course_id).filter(Boolean)));
        if (!courseIds.length) {
          setCoursesById({});
          return;
        }

        const courseSnap = await getDocs(collection(db, "courses"));
        const map = {};
        courseSnap.forEach((docSnap) => {
          if (courseIds.includes(docSnap.id)) {
            map[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
          }
        });
        setCoursesById(map);
      } catch (err) {
        console.error("Failed to load allocated courses", err);
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
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Admin assigned courses</h1>
          <p className="text-slate-600 text-base">View only. Course allocation is controlled by admin.</p>
        </div>

        <div className="grid gap-5 grid-cols-1 sm:grid-cols-3">
          <DashboardCard title={String(allocations.length)} subtitle="Total allocations" icon={FiBookOpen} accent="blue" />
          <DashboardCard title={String(stats.active)} subtitle="Active" icon={FiCheckCircle} accent="green" />
          <DashboardCard title={`${stats.upcoming}/${stats.expired}`} subtitle="Upcoming / Expired" icon={FiClock} accent="orange" />
        </div>

        <DashboardCard title="Allocated Courses" subtitle="Start and end dates" icon={FiCalendar} accent="indigo">
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
                  const course = coursesById[item.course_id] || {};
                  const state = allocationState(item.startDate, item.endDate);
                  const stateClass =
                    state === "active"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                      : state === "upcoming"
                        ? "bg-amber-50 text-amber-700 border-amber-100"
                        : "bg-slate-100 text-slate-700 border-slate-200";
                  return (
                    <div key={item.id} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{course.course_name || item.course_id || "Course"}</p>
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
