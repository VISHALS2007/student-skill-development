import React from "react";
import { useLocation } from "react-router-dom";
import FocusSessionTemplate from "./FocusSessionTemplate";

const learningSites = [
  { label: "Start GeeksforGeeks", domain: "geeksforgeeks.org", url: "https://www.geeksforgeeks.org" },
  { label: "Start W3Schools", domain: "w3schools.com", url: "https://www.w3schools.com" },
  { label: "Start YouTube Learning", domain: "youtube.com", url: "https://www.youtube.com" },
  { label: "Start MDN Learning", domain: "developer.mozilla.org", url: "https://developer.mozilla.org" },
  { label: "Start TutorialsPoint", domain: "tutorialspoint.com", url: "https://www.tutorialspoint.com" },
];

const FocusLearning = () => {
  const location = useLocation();
  const initialTargetMinutes = location?.state?.durationMinutes;

  return (
    <FocusSessionTemplate
      title="Learning Focus Session"
      subtitle="Platforms and timers"
      description="Pick a learning platform to start your focused study timer."
      taskKey="learning"
      storageKeyPrefix="focusLearning"
      initialTargetMinutes={initialTargetMinutes}
      siteButtons={learningSites}
    />
  );
};

export default FocusLearning;