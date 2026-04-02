import React from "react";
import { useLocation } from "react-router-dom";
import FocusSessionTemplate from "./FocusSessionTemplate";

const aptitudeSites = [
  { label: "Start IndiaBix", domain: "indiabix.com", url: "https://www.indiabix.com" },
  { label: "Start GFG Aptitude", domain: "geeksforgeeks.org", url: "https://www.geeksforgeeks.org/aptitude-questions-and-answers" },
  { label: "Start YouTube Aptitude", domain: "youtube.com", url: "https://www.youtube.com" },
  { label: "Start Practice Quiz", domain: "practiceaptitudetests.com", url: "https://www.practiceaptitudetests.com" },
];

const FocusAptitude = () => {
  const location = useLocation();
  const initialTargetMinutes = location?.state?.durationMinutes;

  return (
    <FocusSessionTemplate
      title="Aptitude Focus Session"
      subtitle="Quant and reasoning practice"
      description="Choose an aptitude platform and run a focused timer with inactivity guard."
      taskKey="aptitude"
      storageKeyPrefix="focusAptitude"
      initialTargetMinutes={initialTargetMinutes}
      siteButtons={aptitudeSites}
    />
  );
};

export default FocusAptitude;