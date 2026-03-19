import { MessageSquare, Search, Layers } from "lucide-react";
import { useModuleStore } from "../../stores/moduleStore";
import { useNoteStore } from "../../stores/noteStore";
import { useUIStore } from "../../stores/uiStore";

export function MobileBottomNav() {
  const { modules, activeModuleId, setActiveModule } = useModuleStore();
  const { fetchForModule, setActiveNote } = useNoteStore();
  const { setShowAgentOverview, showAgentOverview, setShowSuggestionsView } = useUIStore();

  const handleModule = (id: string) => {
    setActiveModule(id);
    setActiveNote(null);
    setShowAgentOverview(false);
    setShowSuggestionsView(false);
    fetchForModule(id);
  };

  const handleHome = () => {
    setActiveModule(null);
    setActiveNote(null);
    setShowAgentOverview(false);
    setShowSuggestionsView(false);
  };

  const handleSearch = () => {
    window.dispatchEvent(new CustomEvent("focus-search"));
  };

  const isHome = !activeModuleId && !showAgentOverview;

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-14 bg-sidebar border-t border-border flex items-center justify-around z-[200] pb-[env(safe-area-inset-bottom,0px)]">
      <button
        onClick={handleHome}
        className={`flex flex-col items-center gap-0.5 px-3 py-1.5 text-[10px] border-none bg-none ${
          isHome ? "text-primary" : "text-muted-foreground"
        }`}
      >
        <MessageSquare size={18} />
        Chat
      </button>

      {modules.slice(0, 4).map((mod) => (
        <button
          key={mod.id}
          onClick={() => handleModule(mod.id)}
          className={`flex flex-col items-center gap-0.5 px-2 py-1.5 text-[10px] border-none bg-none ${
            activeModuleId === mod.id ? "text-primary" : "text-muted-foreground"
          }`}
        >
          <span className="text-lg">{mod.icon}</span>
          <span className="max-w-[48px] overflow-hidden text-ellipsis whitespace-nowrap">
            {mod.display_name}
          </span>
        </button>
      ))}

      {modules.length > 4 ? (
        <button
          onClick={handleSearch}
          className="flex flex-col items-center gap-0.5 px-3 py-1.5 text-[10px] text-muted-foreground border-none bg-none"
        >
          <Layers size={18} />
          More
        </button>
      ) : (
        <button
          onClick={handleSearch}
          className="flex flex-col items-center gap-0.5 px-3 py-1.5 text-[10px] text-muted-foreground border-none bg-none"
        >
          <Search size={18} />
          Search
        </button>
      )}
    </nav>
  );
}
