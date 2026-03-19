import { Sidebar } from "./Sidebar";
import { MainContent } from "./MainContent";
import { ChatOverlay } from "./ChatOverlay";
import { MobileBottomNav } from "./MobileBottomNav";
import { CommandPalette } from "../CommandPalette";

import { useUIStore } from "../../stores/uiStore";

export function AppLayout() {
  const breakpoint = useUIStore((s) => s.breakpoint);
  const commandPaletteOpen = useUIStore((s) => s.commandPaletteOpen);

  return (
    <div className="flex h-screen overflow-hidden bg-background relative">
      <Sidebar />
      <MainContent />
      <ChatOverlay />

      {breakpoint === "mobile" && <MobileBottomNav />}
      {commandPaletteOpen && <CommandPalette />}
    </div>
  );
}
