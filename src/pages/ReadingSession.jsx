import React from "react";
import FocusSessionTemplate from "./FocusSessionTemplate";

const siteButtons = [
  { domain: "medium.com", label: "Start Reading (Medium)", url: "https://medium.com" },
  { domain: "wikipedia.org", label: "Start Wikipedia", url: "https://www.wikipedia.org" },
  { domain: "youtube.com", label: "Start YouTube Knowledge", url: "https://www.youtube.com/results?search_query=educational+videos" },
  { domain: "arxiv.org", label: "Start Research Papers", url: "https://arxiv.org" },
];

const ReadingSession = () => (
  <FocusSessionTemplate
    title="Reading / Knowledge"
    subtitle="Articles, explainers, and deep dives"
    description="Pick a knowledge source, open it, and stay focused for your set duration."
    taskKey="reading"
    storageKeyPrefix="readingFocus"
    siteButtons={siteButtons}
  />
);

export default ReadingSession;
