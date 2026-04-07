export const SKILL_SITE_DEFAULTS = {
  learning: [
    { label: "GeeksforGeeks", url: "https://www.geeksforgeeks.org" },
    { label: "W3Schools", url: "https://www.w3schools.com" },
    { label: "MDN Web Docs", url: "https://developer.mozilla.org" },
    { label: "YouTube", url: "https://youtube.com" },
  ],
  "problem solving": [
    { label: "LeetCode", url: "https://leetcode.com" },
    { label: "CodeChef", url: "https://www.codechef.com" },
    { label: "HackerRank", url: "https://www.hackerrank.com" },
    { label: "Codeforces", url: "https://codeforces.com" },
  ],
  "aptitude practice": [
    { label: "IndiaBix", url: "https://www.indiabix.com" },
    { label: "PrepInsta", url: "https://prepinsta.com" },
    { label: "YouTube Aptitude Channels", url: "https://www.youtube.com/results?search_query=aptitude+questions" },
  ],
  "communication practice": [],
  "system design basics": [
    { label: "GFG System Design", url: "https://www.geeksforgeeks.org/system-design-tutorial/" },
    { label: "YouTube System Design", url: "https://www.youtube.com/results?search_query=system+design+basics" },
    { label: "Educative.io", url: "https://www.educative.io" },
  ],
  "project development": [
    { label: "GitHub", url: "https://github.com" },
    { label: "Dev.to", url: "https://dev.to" },
    { label: "freeCodeCamp", url: "https://www.freecodecamp.org" },
  ],
  "coding practice": [
    { label: "HackerRank", url: "https://www.hackerrank.com" },
    { label: "CodeChef", url: "https://www.codechef.com" },
    { label: "LeetCode", url: "https://leetcode.com" },
    { label: "Codeforces", url: "https://codeforces.com" },
  ],
  "technical interview preparation": [
    { label: "GFG Interview Questions", url: "https://www.geeksforgeeks.org/interview-preparation-for-software-developer/" },
    { label: "LeetCode Interview", url: "https://leetcode.com/interview/" },
    { label: "InterviewBit", url: "https://www.interviewbit.com" },
  ],
  "core subject revision": [
    { label: "GFG Core Subjects", url: "https://www.geeksforgeeks.org/operating-systems/" },
    { label: "Tutorialspoint", url: "https://www.tutorialspoint.com" },
    { label: "YouTube Engineering Lectures", url: "https://www.youtube.com/results?search_query=operating+systems+dbms+cn+oop" },
  ],
};

export const DEFAULT_SKILLS = [
  {
    name: "Learning",
    defaultDuration: 30,
    activities: ["Read docs", "Watch a tutorial", "Take notes", "Summarize what you learned"],
    websites: SKILL_SITE_DEFAULTS.learning,
  },
  {
    name: "Problem Solving",
    defaultDuration: 45,
    activities: ["Solve easy problem", "Solve medium problem", "Review solutions", "Track patterns learned"],
    websites: SKILL_SITE_DEFAULTS["problem solving"],
  },
  {
    name: "Aptitude Practice",
    defaultDuration: 30,
    activities: ["Quant practice", "Logical reasoning set", "Number puzzles", "Timed aptitude quiz"],
    websites: SKILL_SITE_DEFAULTS["aptitude practice"],
  },
  {
    name: "Communication Practice",
    defaultDuration: 10,
    activities: ["Random topic speaking", "Storytelling", "Explain a concept", "Mock interview question"],
    websites: SKILL_SITE_DEFAULTS["communication practice"],
  },
  {
    name: "System Design Basics",
    defaultDuration: 40,
    activities: ["Read a system design article", "Draw a simple architecture", "Explain a component", "Review tradeoffs"],
    websites: SKILL_SITE_DEFAULTS["system design basics"],
  },
  {
    name: "Project Development",
    defaultDuration: 50,
    activities: ["Plan a feature", "Implement a component", "Write tests", "Refactor code"],
    websites: SKILL_SITE_DEFAULTS["project development"],
  },
  {
    name: "Coding Practice",
    defaultDuration: 40,
    activities: ["Daily coding challenge", "Implement an algorithm", "Debug code", "Refactor solution"],
    websites: SKILL_SITE_DEFAULTS["coding practice"],
  },
  {
    name: "Technical Interview Preparation",
    defaultDuration: 35,
    activities: ["Review common questions", "Practice behavioral answers", "Mock interview", "Explain a project"],
    websites: SKILL_SITE_DEFAULTS["technical interview preparation"],
  },
  {
    name: "Core Subject Revision",
    defaultDuration: 30,
    activities: ["OS recap", "DBMS queries", "CN protocols", "OOP principles"],
    websites: SKILL_SITE_DEFAULTS["core subject revision"],
  },
];
