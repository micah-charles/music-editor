import { createContext, useContext, useEffect, useRef, useSyncExternalStore, type PropsWithChildren } from "react";
import { PlaybackSessionController } from "./PlaybackSessionController";

const PlaybackSessionContext = createContext<PlaybackSessionController | null>(null);

export function PlaybackSessionProvider({ children }: PropsWithChildren) {
  const controllerRef = useRef<PlaybackSessionController>();
  controllerRef.current ??= new PlaybackSessionController();

  useEffect(() => () => controllerRef.current?.dispose(), []);
  return <PlaybackSessionContext.Provider value={controllerRef.current}>{children}</PlaybackSessionContext.Provider>;
}

export function usePlaybackSession() {
  const controller = useContext(PlaybackSessionContext);
  if (!controller) {
    throw new Error("usePlaybackSession must be used inside PlaybackSessionProvider.");
  }
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return { controller, snapshot };
}

export function usePlaybackActiveEvents() {
  const controller = useContext(PlaybackSessionContext);
  if (!controller) {
    throw new Error("usePlaybackActiveEvents must be used inside PlaybackSessionProvider.");
  }
  return useSyncExternalStore(
    controller.subscribe,
    () => controller.getSnapshot().activeEvents,
    () => controller.getSnapshot().activeEvents
  );
}

export function usePlaybackSessionController() {
  const controller = useContext(PlaybackSessionContext);
  if (!controller) {
    throw new Error("usePlaybackSessionController must be used inside PlaybackSessionProvider.");
  }
  return controller;
}
