import React from "react";
import FocusSessionTemplate from "./FocusSessionTemplate";

const siteButtons = [
  { domain: "indiabix.com", label: "Start IndiaBix Logical", url: "https://www.indiabix.com/logical-reasoning/questions-and-answers" },
  { domain: "puzzle-site.com", label: "Start Puzzle Practice", url: "https://www.puzzleprime.com" },
  { domain: "reasoning-site.com", label: "Start Reasoning Websites", url: "https://www.hitbullseye.com/Reasoning.php" },
];

const LogicalReasoningSession = () => (
  <FocusSessionTemplate
    title="Logical Reasoning"
    subtitle="Puzzles and logic drills"
    description="Open a reasoning site and keep the timer running until you finish the block."
    taskKey="logicalReasoning"
    storageKeyPrefix="logicalFocus"
    siteButtons={siteButtons}
  />
);

export default LogicalReasoningSession;
