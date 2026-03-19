import { useEffect, useRef } from "react";
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";

const TOUR_STORAGE_KEY = "lifeos-tour-completed";

/** Helper: only add a step if the element exists in the DOM */
function addIf(steps: DriveStep[], selector: string, step: Omit<DriveStep, "element">) {
  if (document.querySelector(selector)) {
    steps.push({ element: selector, ...step });
  }
}

function buildSteps(): DriveStep[] {
  const steps: DriveStep[] = [];

  // ── Welcome ──
  steps.push({
    popover: {
      title: "Welcome to Life OS",
      description:
        "Your personal life management system — a structured Markdown vault with a Mistral AI agent as the intelligence layer. Let's walk through everything.",
      side: "bottom",
      align: "center",
    },
  });

  // ── Sidebar ──
  steps.push({
    element: '[data-tour="sidebar"]',
    popover: {
      title: "Sidebar",
      description:
        "Your navigation hub. Browse modules, access agents, suggestions, and integrations. Drag modules to reorder them. Toggle with <strong>Cmd+B</strong>.",
      side: "right",
      align: "start",
    },
  });

  steps.push({
    element: '[data-tour="modules"]',
    popover: {
      title: "Modules",
      description:
        "Modules are the building blocks of your vault. Each one has its own custom schema, lifecycle stages, alerts, and proactive AI actions. Click one to open its dashboard.",
      side: "right",
      align: "start",
    },
  });

  steps.push({
    element: '[data-tour="new-module"]',
    popover: {
      title: "Create a Module",
      description:
        "Click here to design a new module. Just describe what you want to track and the AI agent will create the schema, fields, and lifecycle for you.",
      side: "right",
      align: "center",
    },
  });

  steps.push({
    element: '[data-tour="sidebar-actions"]',
    popover: {
      title: "Agents, Suggestions & Integrations",
      description:
        "<strong>Agents</strong> — see all running AI agents and their history.<br/><strong>Suggestions</strong> — browse proactive AI recommendations.<br/><strong>Integrations</strong> — configure MCP servers and external tools.",
      side: "right",
      align: "end",
    },
  });

  // ── Header ──
  steps.push({
    element: '[data-tour="header"]',
    popover: {
      title: "Top Bar",
      description:
        "Shows your current context — module name, view tabs, search, and the new-note button. Everything adapts based on where you are in the app.",
      side: "bottom",
      align: "center",
    },
  });

  addIf(steps, '[data-tour="header-search"]', {
    popover: {
      title: "Quick Search",
      description:
        "Find any note across all modules instantly. Results appear as you type with content previews and module badges. Press <strong>Enter</strong> for full results.",
      side: "bottom",
      align: "end",
    },
  });

  addIf(steps, '[data-tour="view-tabs"]', {
    popover: {
      title: "View Switcher",
      description:
        "Switch between <strong>Overview</strong> (dashboard), <strong>Pipeline</strong> (kanban board), <strong>Table</strong> (spreadsheet), <strong>Calendar</strong> (date grid), and <strong>Agents</strong> (automation config).",
      side: "bottom",
      align: "start",
    },
  });

  addIf(steps, '[data-tour="activity"]', {
    popover: {
      title: "Agent Activity",
      description:
        "Monitor AI agents in real-time. A pulsing dot means an agent is actively running. Click to see what it's doing, which tools it's calling, and its full history.",
      side: "bottom",
      align: "end",
    },
  });

  // ── Homepage elements (visible when no module is selected) ──
  addIf(steps, '[data-tour="home-search"]', {
    popover: {
      title: "Search Your Vault",
      description:
        "Search across all modules from the home screen. Matching notes appear in a dropdown — click to jump straight to a note in its module.",
      side: "bottom",
      align: "center",
    },
  });

  addIf(steps, '[data-tour="module-cards"]', {
    popover: {
      title: "Module Cards",
      description:
        "Quick access to all your modules. Each card shows the module icon, name, and note count. Click any card to open its dashboard. Scroll horizontally to see more.",
      side: "bottom",
      align: "center",
    },
  });

  addIf(steps, '[data-tour="briefing"]', {
    popover: {
      title: "Daily Briefing",
      description:
        "Your AI-generated daily briefing. Sections include overdue items, upcoming deadlines, new suggestions, and insights. Each item is clickable. The briefing auto-caches for 3 hours — hit refresh to regenerate.",
      side: "top",
      align: "center",
    },
  });

  addIf(steps, '[data-tour="quick-actions"]', {
    popover: {
      title: "Quick Actions",
      description:
        "Pre-written prompts for common tasks — summarize activity, find overdue items, run a scan, and more. Click any action to send it directly to the AI agent. Hover to pause the scroll.",
      side: "top",
      align: "center",
    },
  });

  addIf(steps, '[data-tour="input-bar"]', {
    popover: {
      title: "Chat Input",
      description:
        "Type naturally to talk to the agent. Ask questions, create notes, run searches, or give instructions. Press <strong>Enter</strong> to send. Use the mic button for voice input.",
      side: "top",
      align: "center",
    },
  });

  // ── Module Dashboard elements (visible when a module is selected) ──
  addIf(steps, '[data-tour="dashboard-grid"]', {
    popover: {
      title: "Module Dashboard",
      description:
        "A 3-column overview of your module. Pipeline status, recent notes, AI suggestions, agent automations, calendar, and today's items — all at a glance.",
      side: "top",
      align: "center",
    },
  });

  addIf(steps, '[data-tour="dashboard-col1"]', {
    popover: {
      title: "Pipeline & Recent Notes",
      description:
        "The pipeline bar shows note distribution across lifecycle stages. Below it, your 10 most recently updated notes with metadata previews. Click any note to open it.",
      side: "right",
      align: "start",
    },
  });

  addIf(steps, '[data-tour="dashboard-col2"]', {
    popover: {
      title: "Suggestions & Agents",
      description:
        "Pending AI suggestions for this module — alerts, follow-ups, insights, and opportunities. Below that, the proactive agents configured to run on a schedule.",
      side: "left",
      align: "start",
    },
  });

  addIf(steps, '[data-tour="dashboard-col3"]', {
    popover: {
      title: "Calendar & Today",
      description:
        "A month grid showing which days have notes (dots), with today highlighted. Below, a quick list of notes created or due today.",
      side: "left",
      align: "start",
    },
  });

  // ── Content area ──
  addIf(steps, '[data-tour="content"]', {
    popover: {
      title: "Content Area",
      description:
        "Everything renders here — dashboards, the note editor with live Markdown preview, pipeline kanban boards, spreadsheet tables, calendar views, and search results.",
      side: "top",
      align: "center",
    },
  });

  // ── Chat bar (only when module active) ──
  addIf(steps, '[data-tour="chat-bar"]', {
    popover: {
      title: "Chat with the Agent",
      description:
        "Your AI assistant lives here. Ask it anything — create notes, query your vault, update metadata, run web searches, or trigger scans. Open anytime with <strong>Cmd+.</strong> (dot). Voice input supported via the mic button.",
      side: "top",
      align: "center",
    },
  });

  // ── Keyboard shortcuts ──
  steps.push({
    popover: {
      title: "Keyboard Shortcuts",
      description: `
        <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:12px;margin-top:4px;">
          <kbd style="font-family:monospace;background:rgba(0,0,0,0.06);padding:1px 5px;border-radius:3px;">Cmd+K</kbd><span>Command palette — search notes, actions, views, chats</span>
          <kbd style="font-family:monospace;background:rgba(0,0,0,0.06);padding:1px 5px;border-radius:3px;">Cmd+.</kbd><span>Toggle the chat overlay</span>
          <kbd style="font-family:monospace;background:rgba(0,0,0,0.06);padding:1px 5px;border-radius:3px;">Cmd+B</kbd><span>Collapse / expand sidebar</span>
          <kbd style="font-family:monospace;background:rgba(0,0,0,0.06);padding:1px 5px;border-radius:3px;">Cmd+N</kbd><span>Create a new note in current module</span>
          <kbd style="font-family:monospace;background:rgba(0,0,0,0.06);padding:1px 5px;border-radius:3px;">Cmd+Shift+U</kbd><span>Start / stop voice recording</span>
          <kbd style="font-family:monospace;background:rgba(0,0,0,0.06);padding:1px 5px;border-radius:3px;">Cmd+1-9</kbd><span>Jump to module 1 through 9</span>
          <kbd style="font-family:monospace;background:rgba(0,0,0,0.06);padding:1px 5px;border-radius:3px;">Escape</kbd><span>Close palette, search, or deselect note</span>
        </div>
      `,
      side: "bottom",
      align: "center",
    },
  });

  // ── Closing ──
  steps.push({
    popover: {
      title: "You're all set!",
      description:
        "Start by selecting a module from the sidebar, or create a new one with the agent. You can re-run this tour anytime from the <strong>Tour</strong> button on the home screen. Enjoy Life OS!",
      side: "bottom",
      align: "center",
    },
  });

  return steps;
}

export function useTour() {
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const completed = localStorage.getItem(TOUR_STORAGE_KEY);
    if (completed) return;

    // Small delay to let the UI render
    const timeout = setTimeout(() => {
      const driverObj = driver({
        showProgress: true,
        animate: true,
        smoothScroll: true,
        allowClose: true,
        overlayOpacity: 0.6,
        stagePadding: 8,
        stageRadius: 8,
        popoverOffset: 12,
        popoverClass: "lifeos-tour-popover",
        showButtons: ["next", "previous", "close"],
        nextBtnText: "Next",
        prevBtnText: "Back",
        doneBtnText: "Done",
        progressText: "{{current}} / {{total}}",
        steps: buildSteps(),
        onDestroyed: () => {
          localStorage.setItem(TOUR_STORAGE_KEY, "true");
        },
      });

      driverObj.drive();
    }, 800);

    return () => clearTimeout(timeout);
  }, []);
}

/** Call this to reset the tour so it shows again on next load */
export function resetTour() {
  localStorage.removeItem(TOUR_STORAGE_KEY);
}

/** Call this to start the tour manually */
export function startTour() {
  const driverObj = driver({
    showProgress: true,
    animate: true,
    smoothScroll: true,
    allowClose: true,
    overlayOpacity: 0.6,
    stagePadding: 8,
    stageRadius: 8,
    popoverOffset: 12,
    popoverClass: "lifeos-tour-popover",
    showButtons: ["next", "previous", "close"],
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Done",
    progressText: "{{current}} / {{total}}",
    steps: buildSteps(),
  });

  driverObj.drive();
}
