import React from "react";
import FocusSessionTemplate from "./FocusSessionTemplate";

const siteButtons = [
  { domain: "indiabix.com", label: "Start IndiaBix", url: "https://www.indiabix.com" },
  { domain: "youtube.com", label: "Start YouTube Aptitude", url: "https://www.youtube.com/results?search_query=aptitude+practice" },
  { domain: "quizizz.com", label: "Start Practice Quiz Sites", url: "https://quizizz.com" },
];

const AptitudeSession = () => (
  <FocusSessionTemplate
    title="Aptitude Practice"
    subtitle="Quant and reasoning drills"
    description="Pick an aptitude platform, open it, and run your timed session."
    taskKey="aptitude"
    storageKeyPrefix="aptitudeFocus"
    siteButtons={siteButtons}
  />
);

export default AptitudeSession;
