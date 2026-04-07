import React from "react";
import FocusSessionTemplate from "./FocusSessionTemplate";

const siteButtons = [
  { domain: "geeksforgeeks.org", label: "Start GeeksforGeeks", url: "https://www.geeksforgeeks.org" },
  { domain: "w3schools.com", label: "Start W3Schools", url: "https://www.w3schools.com" },
  { domain: "youtube.com", label: "Start YouTube Learning", url: "https://www.youtube.com/results?search_query=learning+tutorial" },
  { domain: "tutorialspoint.com", label: "Start Tutorial Websites", url: "https://www.tutorialspoint.com" },
];

const LearningSession = () => (
  <FocusSessionTemplate
    title="Learning"
    subtitle="Deep work on tutorials and courses"
    description="Start a learning site, keep the timer running, and log your completion."
    taskKey="learning"
    storageKeyPrefix="learningFocus"
    siteButtons={siteButtons}
  />
);

export default LearningSession;
