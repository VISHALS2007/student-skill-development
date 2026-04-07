import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { updateAttendanceRecord } from "../services/attendanceService";
import { useAuth } from "./AuthContext";

const SkillsContext = createContext(null);

const normalizeName = (name) => (name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const cacheKeyForUser = (uid) => (uid ? `skillsCache:v1:${uid}` : "skillsCache:v1");

export const SkillsProvider = ({ children }) => {
  const { user } = useAuth();
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const unsubscribeRef = useRef(null);

  const writeCache = (list) => {
    try {
      localStorage.setItem(cacheKeyForUser(user?.uid), JSON.stringify(list));
    } catch (err) {
      /* ignore cache errors */
    }
  };

  const clearCache = () => {
    try {
      localStorage.removeItem(cacheKeyForUser(user?.uid));
    } catch (err) {
      /* ignore cache errors */
    }
  };

  const recomputeAttendance = useCallback(
    (nextSkills) => {
      const uid = user?.uid;
      if (!uid) return;
      updateAttendanceRecord(uid, nextSkills).catch(() => {});
    },
    [user]
  );

  const fetchSkills = useCallback(async () => skills, [skills]);

  useEffect(() => {
    // cleanup existing listener when user changes
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    setSkills([]);
    setInitialized(false);
    setLoading(false);

    if (!user?.uid) {
      clearCache();
      return;
    }

    let hadCached = false;
    // hydrate from cache for instant paint
    try {
      const cached = localStorage.getItem(cacheKeyForUser(user.uid));
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          setSkills(parsed);
          setInitialized(true);
          setLoading(false);
          hadCached = true;
        }
      }
    } catch (err) {
      /* ignore cache errors */
    }

    setLoading(!hadCached);
    // Order by name to avoid requiring createdAt on older docs
    const q = query(collection(db, "users", user.uid, "skills"), orderBy("skillName", "asc"));
    unsubscribeRef.current = onSnapshot(
      q,
      (snap) => {
        const seen = new Set();
        const list = [];
        snap.docs.forEach((d) => {
          const data = { id: d.id, ...d.data() };
          const key = normalizeName(data.skillName);
          if (seen.has(key)) return;
          seen.add(key);
          list.push(data);
        });
        setSkills(list);
        writeCache(list);
        recomputeAttendance(list);
        setInitialized(true);
        setLoading(false);
      },
      (err) => {
        console.error("Skills listener error", err);
        setLoading(false);
      }
    );

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [user?.uid, recomputeAttendance]);

  const addSkill = useCallback(
    async ({ skillName, defaultDuration = 30, skillWebsites = [] }) => {
      if (!user) throw new Error("Not authenticated");
      const ref = await addDoc(collection(db, "users", user.uid, "skills"), {
        userId: user.uid,
        skillName,
        defaultDuration,
        skillWebsites,
        createdAt: serverTimestamp(),
      });
      const optimistic = { id: ref.id, userId: user.uid, skillName, defaultDuration, skillWebsites, createdAt: Date.now() };
      setSkills((prev) => {
        const next = [optimistic, ...prev];
        writeCache(next);
        recomputeAttendance(next);
        return next;
      });
      // background refresh to sync with backend without blocking UI
      fetchSkills(true).catch(() => {});
      return optimistic;
    },
    [user, fetchSkills, recomputeAttendance]
  );

  const updateSkill = useCallback(
    async (skillId, payload) => {
      if (!user || !skillId) throw new Error("Missing skillId or user");
      await updateDoc(doc(db, "users", user.uid, "skills", skillId), payload);
      setSkills((prev) => {
        const next = prev.map((s) => (s.id === skillId ? { ...s, ...payload } : s));
        writeCache(next);
        recomputeAttendance(next);
        return next;
      });
      fetchSkills(true).catch(() => {});
    },
    [user, fetchSkills, recomputeAttendance]
  );

  const removeSkill = useCallback(
    async (skillId) => {
      if (!user || !skillId) return;
      await deleteDoc(doc(db, "users", user.uid, "skills", skillId));
      setSkills((prev) => {
        const next = prev.filter((s) => s.id !== skillId);
        writeCache(next);
        recomputeAttendance(next);
        return next;
      });
      clearCache();
      await fetchSkills(true).catch(() => {});
    },
    [user, fetchSkills, recomputeAttendance]
  );

  const value = useMemo(
    () => ({ skills, loading, initialized, fetchSkills, addSkill, updateSkill, removeSkill }),
    [skills, loading, initialized, fetchSkills, addSkill, updateSkill, removeSkill]
  );

  return <SkillsContext.Provider value={value}>{children}</SkillsContext.Provider>;
};

export const useSkills = () => {
  const ctx = useContext(SkillsContext);
  if (!ctx) throw new Error("useSkills must be used within SkillsProvider");
  return ctx;
};
