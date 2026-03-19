import { AppLayout } from "./components/layout/AppLayout";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useBreakpoint } from "./hooks/useBreakpoint";
import { useVoice } from "./hooks/useVoice";
import { useTour } from "./hooks/useTour";

export function App() {
  useKeyboardShortcuts();
  useBreakpoint();
  useVoice();
  useTour();
  return <AppLayout />;
}
