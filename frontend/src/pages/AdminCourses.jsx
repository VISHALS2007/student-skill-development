import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import { FiBookOpen, FiPlus, FiX, FiEdit2, FiTrash2, FiLink as FiLinkIcon, FiLoader } from "react-icons/fi";
import DashboardCard from "../components/DashboardCard";
import ConfirmDialog from "../components/ConfirmDialog";
import LoadingSpinner from "../components/LoadingSpinner";
import { toast } from "react-toastify";

const COURSE_CATEGORIES = [
  { id: "learning", label: "Learning" },
  { id: "aptitude", label: "Aptitude" },
  { id: "problem-solving", label: "Problem Solving" },
  { id: "communication", label: "Communication" },
  { id: "extra", label: "Extra Course" },
];

const DIFFICULTY_LEVELS = ["Beginner", "Intermediate", "Advanced", "Expert"];

const emptyCourseForm = {
  title: "",
  category: "learning",
  customCategory: "",
  description: "",
  defaultDuration: 30,
  difficulty: "Beginner",
  links: [],
};

function AdminCourses({
  courses = [],
  onSave,
  onDelete,
  onEdit,
  editingId,
  status: pageStatus = "",
  isSaving = false,
  isListLoading = false,
  hasMore = false,
  onLoadMore,
  totalCourses = 0,
  deletingCourseId = "",
}) {
  const [formData, setFormData] = useState(emptyCourseForm);
  const [showForm, setShowForm] = useState(false);
  const [newLinkType, setNewLinkType] = useState("video");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [coursePendingDelete, setCoursePendingDelete] = useState(null);
  const linkInputRef = useRef(null);

  const handleAddLink = () => {
    if (!newLinkUrl.trim()) {
      toast.error("Enter a link URL", { containerId: "global-toasts" });
      return;
    }
    try {
      new URL(newLinkUrl.trim());
    } catch {
      toast.error("Enter a valid URL", { containerId: "global-toasts" });
      return;
    }
    setFormData((p) => ({
      ...p,
      links: [...p.links, { url: newLinkUrl.trim(), type: newLinkType }],
    }));
    setNewLinkUrl("");
    setNewLinkType("video");
    if (linkInputRef.current) linkInputRef.current.focus();
  };

  const handleRemoveLink = (index) => {
    setFormData((p) => ({
      ...p,
      links: p.links.filter((_, i) => i !== index),
    }));
  };

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    const errors = [];
    if (!formData.title.trim()) errors.push("Course title is required");
    if ((Number(formData.defaultDuration) || 0) <= 0) errors.push("Time in minutes is required");

    if (errors.length > 0) {
      toast.error(errors.join("\n"), { containerId: "global-toasts" });
      return;
    }

    const payload = {
      title: formData.title.trim(),
      category: formData.category === "custom" ? "custom" : formData.category,
      customCategory: formData.category === "custom" ? formData.customCategory.trim() : "",
      description: formData.description.trim() || `Practice plan for ${formData.title.trim()}`,
      defaultDuration: Math.max(1, Number(formData.defaultDuration) || 30),
      difficulty: formData.difficulty,
      links: formData.links,
    };

    try {
      await onSave(payload, editingId);
      setFormData(emptyCourseForm);
      setShowForm(false);
    } catch (err) {
      toast.error(err.message || "Failed to save course", { containerId: "global-toasts" });
    }
  }, [formData, onSave, editingId, isSaving]);

  const handleEdit = useCallback((course) => {
    setFormData({
      title: course.title || course.course_name || "",
      category: course.category || "learning",
      customCategory: course.customCategory || "",
      description: course.description || "",
      defaultDuration: Number(course.defaultDuration) || Number(course.timeMinutes) || 30,
      difficulty: course.difficulty || "Beginner",
      links: course.links || [],
    });
    onEdit(course.id);
    setShowForm(true);
  }, [onEdit]);

  const handleCancel = useCallback(() => {
    setFormData(emptyCourseForm);
    onEdit("");
    setShowForm(false);
  }, [onEdit]);

  const handleListScroll = useCallback(
    (event) => {
      if (!onLoadMore || !hasMore || isListLoading) return;
      const el = event.currentTarget;
      const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (remaining < 120) {
        onLoadMore();
      }
    },
    [onLoadMore, hasMore, isListLoading]
  );

  const categoryDisplay = (course) => {
    if (course.category === "custom") {
      return course.customCategory || "Custom";
    }
    const found = COURSE_CATEGORIES.find((c) => c.id === course.category);
    return found?.label || course.category || "Learning";
  };

  const listSubtitle = useMemo(() => `${courses.length}/${totalCourses || courses.length} loaded`, [courses.length, totalCourses]);

  const handleConfirmDelete = useCallback(() => {
    if (!coursePendingDelete?.id) return;
    if (deletingCourseId && deletingCourseId === coursePendingDelete.id) return;
    Promise.resolve(onDelete(coursePendingDelete.id)).finally(() => {
      setCoursePendingDelete(null);
    });
  }, [coursePendingDelete, onDelete, deletingCourseId]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
      {/* FORM SECTION */}
      <DashboardCard
        title={editingId ? "Edit Course" : "Create Course"}
        subtitle="Course Form"
        icon={FiBookOpen}
        accent="indigo"
      >
        {!showForm ? (
          <button
            onClick={() => setShowForm(true)}
            disabled={isSaving}
            className="ml-auto w-full sm:w-auto rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2.5 flex items-center justify-center gap-2 transition-colors"
          >
            <FiPlus className="text-lg" />
            Add New Course
          </button>
        ) : (
          <div className="space-y-4 max-h-[650px] overflow-y-auto pr-2">
            {/* Course Title */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Course Title *</label>
              <input
                type="text"
                placeholder="e.g., Spoken English Basics"
                value={formData.title}
                onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Practice Time */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Time (minutes) *</label>
              <input
                type="number"
                min="1"
                max="240"
                value={formData.defaultDuration}
                onChange={(e) => setFormData((p) => ({ ...p, defaultDuration: Math.max(1, Number(e.target.value) || 1) }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Course Category Selection */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Course Category *</label>
              <div className="space-y-2">
                {COURSE_CATEGORIES.map((cat) => (
                  <label key={cat.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-100 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="radio"
                      name="category"
                      value={cat.id}
                      checked={formData.category === cat.id}
                      onChange={(e) => setFormData((p) => ({ ...p, category: e.target.value }))}
                      className="w-4 h-4"
                    />
                    <span className="text-sm text-slate-700">{cat.label}</span>
                  </label>
                ))}
                {/* Custom Course */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-100 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="radio"
                      name="category"
                      value="custom"
                      checked={formData.category === "custom"}
                      onChange={(e) => setFormData((p) => ({ ...p, category: e.target.value }))}
                      className="w-4 h-4"
                    />
                    <span className="text-sm text-slate-700">Custom Category</span>
                  </label>
                  {formData.category === "custom" && (
                    <input
                      type="text"
                      placeholder="Custom category"
                      value={formData.customCategory}
                      onChange={(e) => setFormData((p) => ({ ...p, customCategory: e.target.value }))}
                      className="w-full ml-6 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Description</label>
              <textarea
                placeholder="Description"
                value={formData.description}
                onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                rows={3}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Difficulty */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Difficulty Level</label>
              <select
                value={formData.difficulty}
                onChange={(e) => setFormData((p) => ({ ...p, difficulty: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {DIFFICULTY_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </div>

            {/* Resource Links */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Resource Links</label>
              <div className="space-y-2 mb-2">
                {formData.links && formData.links.length > 0 && (
                  <div className="space-y-1">
                    {formData.links.map((link, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                        <div className="flex items-center gap-1 flex-1 min-w-0">
                          <FiLinkIcon className="flex-shrink-0 text-slate-500" />
                          <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline truncate">
                            {link.type.toUpperCase()} Link
                          </a>
                        </div>
                        <button
                          onClick={() => handleRemoveLink(idx)}
                          disabled={isSaving}
                          className="flex-shrink-0 p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-red-600"
                        >
                          <FiX />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <select
                    value={newLinkType}
                    onChange={(e) => setNewLinkType(e.target.value)}
                    className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="video">Video</option>
                    <option value="website">Website</option>
                    <option value="pdf">PDF</option>
                    <option value="coding">Coding Platform</option>
                  </select>
                  <input
                    ref={linkInputRef}
                    type="text"
                    placeholder="https://youtube.com/..."
                    value={newLinkUrl}
                    onChange={(e) => setNewLinkUrl(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleAddLink()}
                    className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    onClick={handleAddLink}
                    disabled={isSaving}
                    className="px-2 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors"
                  >
                    <FiPlus />
                  </button>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between gap-2 pt-2">
              <button
                onClick={handleCancel}
                disabled={isSaving}
                className="rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold px-4 py-2.5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2.5 transition-colors disabled:opacity-50"
              >
                {isSaving ? (
                  <span className="inline-flex items-center gap-2"><FiLoader className="animate-spin" /> Saving...</span>
                ) : editingId ? "Save Course" : "Add Course"}
              </button>
            </div>

            {pageStatus && <p className="text-sm text-slate-600 text-center">{pageStatus}</p>}
          </div>
        )}
      </DashboardCard>

      {/* COURSES LIST */}
      <DashboardCard title="Courses" subtitle={listSubtitle} icon={FiBookOpen} accent="purple">
        <div className="space-y-2 max-h-[650px] overflow-y-auto pr-2" onScroll={handleListScroll}>
          {courses.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">No courses yet.</p>
          ) : (
            courses.map((course) => (
              <div key={course.id} className="rounded-xl border border-slate-100 bg-gradient-to-br from-white to-slate-50 p-3 space-y-2">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{course.title || course.course_name}</p>
                    <p className="text-xs text-slate-500">{categoryDisplay(course)}</p>
                  </div>
                  <span
                    className={`text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap ${
                      (course.status || "Active") === "Active"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {course.status || "Active"}
                  </span>
                </div>

                {/* Description */}
                <p className="text-xs text-slate-600 line-clamp-2">{course.description}</p>

                {/* Meta Info */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="rounded-lg bg-slate-100 px-2 py-1.5">
                    <span className="text-slate-500">Time</span>
                    <p className="font-semibold text-slate-900">{Number(course.defaultDuration) || Number(course.timeMinutes) || 30} min</p>
                  </div>
                  <div className="rounded-lg bg-slate-100 px-2 py-1.5">
                    <span className="text-slate-500">Plan</span>
                    <p className="font-semibold text-slate-900">{course.durationDays || 0} Days</p>
                  </div>
                  <div className="rounded-lg bg-slate-100 px-2 py-1.5">
                    <span className="text-slate-500">Difficulty</span>
                    <p className="font-semibold text-slate-900">{course.difficulty || "Beginner"}</p>
                  </div>
                  <div className="rounded-lg bg-slate-100 px-2 py-1.5">
                    <span className="text-slate-500">Dates</span>
                    <p className="font-semibold text-slate-900 text-[10px]">
                      {course.startDate ? new Date(course.startDate).toLocaleDateString(undefined, { day: "2-digit", month: "short" }) : "N/A"}
                    </p>
                  </div>
                </div>

                {/* Links */}
                {course.links && course.links.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {course.links.slice(0, 2).map((link, idx) => (
                      <a
                        key={idx}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs rounded-full bg-indigo-100 text-indigo-700 px-2 py-1 hover:bg-indigo-200 transition-colors truncate"
                      >
                        {link.type}
                      </a>
                    ))}
                    {course.links.length > 2 && <span className="text-xs text-slate-500 px-2 py-1">+{course.links.length - 2} more</span>}
                  </div>
                )}

                {/* Actions */}
                <div className="ui-actions flex gap-2 pt-1">
                  <button
                    onClick={() => handleEdit(course)}
                    disabled={isSaving}
                    className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1 transition-colors"
                  >
                    <FiEdit2 className="w-3 h-3" />
                    Edit
                  </button>
                  <button
                    onClick={() => setCoursePendingDelete({ id: course.id, title: course.title || course.course_name })}
                    disabled={isSaving || deletingCourseId === course.id}
                    className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center justify-center gap-1 transition-colors"
                  >
                    <FiTrash2 className="w-3 h-3" />
                    {deletingCourseId === course.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            ))
          )}
          {isListLoading && (
            <div className="text-xs text-slate-500 px-1 py-2 inline-flex items-center gap-2">
              <LoadingSpinner label="Loading more courses" />
              Loading more courses...
            </div>
          )}
          {!hasMore && courses.length > 0 && <div className="text-xs text-slate-400 px-1 py-2">End of list</div>}
        </div>
      </DashboardCard>
      <ConfirmDialog
        open={Boolean(coursePendingDelete)}
        title="Delete course"
        message={`Delete ${coursePendingDelete?.title || "this course"}? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        danger
        loading={deletingCourseId === coursePendingDelete?.id}
        onCancel={() => setCoursePendingDelete(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

export default memo(AdminCourses);
