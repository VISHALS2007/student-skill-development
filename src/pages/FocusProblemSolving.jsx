import React from "react";
import { useLocation } from "react-router-dom";
import FocusSessionTemplate from "./FocusSessionTemplate";

const problemSolvingSites = [
  { label: "Start LeetCode", domain: "leetcode.com", url: "https://leetcode.com" },
  { label: "Start CodeChef", domain: "codechef.com", url: "https://www.codechef.com" },
  { label: "Start HackerRank", domain: "hackerrank.com", url: "https://www.hackerrank.com" },
  { label: "Start Codeforces", domain: "codeforces.com", url: "https://codeforces.com" },
  { label: "Start AtCoder", domain: "atcoder.jp", url: "https://atcoder.jp" },
];

const FocusProblemSolving = () => {
  const location = useLocation();
  const initialTargetMinutes = location?.state?.durationMinutes;

  return (
    <FocusSessionTemplate
      title="Problem Solving Focus Session"
      subtitle="Coding practice platforms"
      description="Open a coding platform and track your focused practice time."
      taskKey="problemSolving"
      storageKeyPrefix="focusProblemSolving"
      initialTargetMinutes={initialTargetMinutes}
      siteButtons={problemSolvingSites}
    />
  );
};

export default FocusProblemSolving;