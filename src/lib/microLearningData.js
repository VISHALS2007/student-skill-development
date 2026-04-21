// Catalog and progress helpers for Micro Learning
import { recordFocusSession } from "./focusService";

const STORAGE_KEY = "skilldev-micro-learning";
const MICRO_DOMAIN = "micro-learning";

export const microLessons = [
  {
    id: "aptitude-001",
    title: "Percentages in 8 Minutes",
    category: "Aptitude",
    estimatedMinutes: 8,
    difficulty: "Easy",
    type: "lesson",
    summary: "Key formulas with two worked examples and a 3-question drill.",
    outcomes: ["Convert fractions to percentages", "Compute gain/loss quickly", "Handle successive changes"],
    tags: ["math", "speed"],
  },
  {
    id: "aptitude-002",
    title: "Ratio & Proportion Sprint",
    category: "Aptitude",
    estimatedMinutes: 7,
    difficulty: "Medium",
    type: "practice",
    summary: "Mini-drill on ratios, mixtures, and inverse proportion.",
    outcomes: ["Simplify ratios", "Mixing problems", "Work-rate intuition"],
    tags: ["ratios", "mixture"],
  },
  {
    id: "coding-001",
    title: "Binary Search in 7 Minutes",
    category: "Coding",
    estimatedMinutes: 7,
    difficulty: "Medium",
    type: "lesson",
    summary: "Iterative + edge cases with a dry run and template.",
    outcomes: ["Safe mid calculation", "Loop invariants", "Return bounds correctly"],
    tags: ["arrays", "search"],
    quizId: "quiz-coding-001",
  },
  {
    id: "coding-002",
    title: "Two-Pointer Patterns",
    category: "Coding",
    estimatedMinutes: 9,
    difficulty: "Medium",
    type: "practice",
    summary: "Identify when to use two pointers with a 3-step checklist.",
    outcomes: ["Detect sorted opportunities", "Shrink/expand window", "Avoid O(n^2) traps"],
    tags: ["arrays", "patterns"],
  },
  {
    id: "communication-001",
    title: "1-Minute Elevator Pitch",
    category: "Communication",
    estimatedMinutes: 6,
    difficulty: "Easy",
    type: "lesson",
    summary: "Hook, value, proof, and close—structured template.",
    outcomes: ["Concise hook", "Value statement", "Clear ask"],
    tags: ["speaking", "pitch"],
  },
  {
    id: "communication-002",
    title: "STAR Stories Fast",
    category: "Communication",
    estimatedMinutes: 8,
    difficulty: "Medium",
    type: "practice",
    summary: "Draft two STAR answers with prompts and timing cues.",
    outcomes: ["Situation clarity", "Action detail", "Measurable results"],
    tags: ["interview", "storytelling"],
  },
  {
    id: "logic-001",
    title: "Pattern Recognition Drill",
    category: "Logical Reasoning",
    estimatedMinutes: 6,
    difficulty: "Easy",
    type: "quiz",
    summary: "5 quick puzzles on sequences and grids.",
    outcomes: ["Spot transformations", "Eliminate distractors", "Work under time"],
    tags: ["puzzles", "sequences"],
  },
  {
    id: "logic-002",
    title: "Assumptions & Conclusions",
    category: "Logical Reasoning",
    estimatedMinutes: 10,
    difficulty: "Hard",
    type: "lesson",
    summary: "Mini-lesson on argument flaws with 4 practice items.",
    outcomes: ["Identify hidden assumptions", "Strengthen/Weaken tactics", "Avoid common fallacies"],
    tags: ["critical thinking", "arguments"],
  },
];

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    return {};
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    /* ignore */
  }
}

function ensureUserProgress(state, userId) {
  if (!userId) return state;
  if (!state[userId]) {
    state[userId] = { lessons: {}, history: [] };
  }
  if (!state[userId].lessons) state[userId].lessons = {};
  if (!Array.isArray(state[userId].history)) state[userId].history = [];
  return state;
}

export function getLessonById(id) {
  return microLessons.find((l) => l.id === id);
}

export function getLessonsByCategory(category) {
  return microLessons.filter((l) => !category || l.category === category);
}

export function getUserProgress(userId) {
  const state = loadState();
  if (!userId || !state[userId]) return { lessons: {}, history: [] };
  return state[userId];
}

export function upsertLessonProgress(userId, lessonId, updater) {
  if (!userId || !lessonId || typeof updater !== "function") return null;
  const state = loadState();
  ensureUserProgress(state, userId);
  const current = state[userId].lessons[lessonId] || {
    status: "not-started",
    attempts: 0,
    bestScore: null,
    lastCompletedAt: null,
    totalMinutes: 0,
  };
  const next = updater(current);
  state[userId].lessons[lessonId] = next;
  saveState(state);
  return next;
}

export function getCategoryProgress(userId) {
  const progress = getUserProgress(userId);
  const byCategory = {};
  microLessons.forEach((lesson) => {
    const bucket = byCategory[lesson.category] || { completed: 0, total: 0, minutes: 0 };
    bucket.total += 1;
    const lessonProg = progress.lessons[lesson.id];
    if (lessonProg?.status === "completed") {
      bucket.completed += 1;
      bucket.minutes += lessonProg.totalMinutes || 0;
    }
    byCategory[lesson.category] = bucket;
  });
  return byCategory;
}

export async function recordMicroCompletion(userId, lesson, { durationMs, interruptions = 0, pausedMs = 0, score }) {
  if (!userId || !lesson) return null;
  const durationMinutes = Math.max(0, Math.round((durationMs || 0) / 60000));
  const focusScore = durationMs + pausedMs > 0 ? Math.round((durationMs / (durationMs + pausedMs)) * 100) : 100;

  const progress = upsertLessonProgress(userId, lesson.id, (prev) => ({
    ...prev,
    status: "completed",
    attempts: (prev.attempts || 0) + 1,
    bestScore: typeof score === "number" ? Math.max(score, prev.bestScore || 0) : prev.bestScore,
    lastCompletedAt: new Date().toISOString(),
    totalMinutes: (prev.totalMinutes || 0) + durationMinutes,
  }));

  const state = loadState();
  ensureUserProgress(state, userId);
  state[userId].history.unshift({
    lessonId: lesson.id,
    category: lesson.category,
    durationMinutes,
    focusScore,
    interruptions,
    completedAt: new Date().toISOString(),
  });
  state[userId].history = state[userId].history.slice(0, 30);
  saveState(state);

  await recordFocusSession(userId, {
    durationMs: durationMs || lesson.estimatedMinutes * 60000,
    domain: MICRO_DOMAIN,
    platformName: lesson.category,
    startedAt: new Date(Date.now() - (durationMs || lesson.estimatedMinutes * 60000)).toISOString(),
    endedAt: new Date().toISOString(),
    tabSwitches: interruptions,
    pausedMs,
    status: "completed",
    interruptions,
    focusScore,
    events: [],
  });

  return progress;
}
