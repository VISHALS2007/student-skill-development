import React from "react";
import FocusSessionTemplate from "./FocusSessionTemplate";

const siteButtons = [
  { domain: "leetcode.com", label: "Start LeetCode", url: "https://leetcode.com" },
  { domain: "codechef.com", label: "Start CodeChef", url: "https://www.codechef.com" },
  { domain: "hackerrank.com", label: "Start HackerRank", url: "https://www.hackerrank.com" },
  { domain: "codeforces.com", label: "Start Codeforces", url: "https://codeforces.com" },
  { domain: "atcoder.jp", label: "Start AtCoder", url: "https://atcoder.jp" },
];

const ProblemSolvingSession = () => (
  <FocusSessionTemplate
    title="Problem Solving"
    subtitle="Coding practice drills"
    description="Solve problems on your preferred platform and track the focused time."
    taskKey="problemSolving"
    storageKeyPrefix="problemFocus"
    siteButtons={siteButtons}
  />
);

export default ProblemSolvingSession;
