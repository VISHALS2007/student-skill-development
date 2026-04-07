import React from "react";
import { useLocation } from "react-router-dom";
import FocusSessionTemplate from "./FocusSessionTemplate";

const logicalSites = [
  { label: "Start Logical Reasoning", domain: "indiabix.com", url: "https://www.indiabix.com/logical-reasoning" },
  { label: "Start Puzzle Practice", domain: "brilliant.org", url: "https://brilliant.org/practice/logic-puzzles" },
  { label: "Start Reasoning Quiz", domain: "testbook.com", url: "https://testbook.com/aptitude-and-reasoning" },
];

const FocusLogical = () => {
  const location = useLocation();
  const initialTargetMinutes = location?.state?.durationMinutes;

  return (
    <FocusSessionTemplate
      title="Logical Reasoning Focus Session"
      subtitle="Puzzles and reasoning practice"
      description="Pick a reasoning platform and track your focus time with inactivity protection."
      taskKey="logical"
      storageKeyPrefix="focusLogical"
      initialTargetMinutes={initialTargetMinutes}
      siteButtons={logicalSites}
    />
  );
};

export default FocusLogical;
