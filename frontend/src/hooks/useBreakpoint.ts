import { useEffect } from "react";
import { useUIStore } from "../stores/uiStore";

export function useBreakpoint() {
  const setBreakpoint = useUIStore((s) => s.setBreakpoint);
  const setSidebarCollapsed = useUIStore((s) => s.setSidebarCollapsed);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const update = () => {
      const w = window.innerWidth;
      if (w < 640) {
        setBreakpoint("mobile");
        setSidebarCollapsed(true);
      } else if (w < 1024) {
        setBreakpoint("tablet");
        setSidebarCollapsed(true);
      } else {
        setBreakpoint("desktop");
      }
    };

    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(update, 150);
    };

    update();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(timer);
    };
  }, [setBreakpoint, setSidebarCollapsed]);
}
