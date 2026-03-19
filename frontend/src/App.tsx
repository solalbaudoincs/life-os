import { AppLayout } from "./components/layout/AppLayout";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useBreakpoint } from "./hooks/useBreakpoint";
import { useVoice } from "./hooks/useVoice";

export function App() {
  useKeyboardShortcuts();
  useBreakpoint();
  useVoice();
  return <AppLayout />;
}
