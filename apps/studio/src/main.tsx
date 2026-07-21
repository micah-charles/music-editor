import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { PlaybackSessionProvider } from "./music/playback/session/PlaybackSessionContext";
import "./styles/app.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <PlaybackSessionProvider>
      <App />
    </PlaybackSessionProvider>
  </React.StrictMode>
);
