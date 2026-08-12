import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { redirectDisabledFeatureRoute } from "./config/workspaceRouting";
import { PlaybackSessionProvider } from "./music/playback/session/PlaybackSessionContext";
import "./styles/app.css";

const redirectedFromDisabledFeature = redirectDisabledFeatureRoute();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <PlaybackSessionProvider>
      <App initialWorkspace={redirectedFromDisabledFeature ? "score" : undefined} />
    </PlaybackSessionProvider>
  </React.StrictMode>
);
