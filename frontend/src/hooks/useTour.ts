import { useEffect, useRef } from "react";
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";

const TOUR_STORAGE_KEY = "lifeos-tour-completed";

function buildSteps(): DriveStep[] {
  const steps: DriveStep[] = [
    {
      popover: {
        title: "Welcome to Life OS",
        description:
          "Your personal life management system — a structured Markdown vault with a Mistral AI agent as the intelligence layer. Let's take a quick tour.",
        side: "bottom",
        align: "center",
      },
    },
    {
      element: '[data-tour="sidebar"]',
      popover: {
        title: "Sidebar",
        description:
          "Your navigation hub. Browse modules, access agents, suggestions, and integrations. Drag modules to reorder them. Toggle with <strong>Cmd+B</strong>.",
        side: "right",
        align: "start",
      },
    },
    {
      element: '[data-tour="modules"]',
      popover: {
        title: "Modules",
        description:
          "Modules are the building blocks of your vault. Each module has its own schema, lifecycle stages, alerts, and proactive actions. Click one to explore.",
        side: "right",
        align: "start",
      },
    },
    {
      element: '[data-tour="new-module"]',
      popover: {
        title: "Create a Module",
        description:
          "Click here to design a new module with the AI agent. Describe what you want to track and the agent will set up the schema for you.",
        side: "right",
        align: "center",
      },
    },
    {
      element: '[data-tour="sidebar-actions"]',
      popover: {
        title: "Agents, Suggestions & Integrations",
        description:
          "View all running AI agents, browse proactive suggestions the system has generated, and configure MCP integrations.",
        side: "right",
        align: "end",
      },
    },
    {
      element: '[data-tour="header"]',
      popover: {
        title: "Top Bar",
        description:
          "The header shows your current context — module name, view tabs, search, and the new-note button. Use the search to find anything across your vault.",
        side: "bottom",
        align: "center",
      },
    },
  ];

  // Only add view-tabs step if the element exists (module must be active)
  if (document.querySelector('[data-tour="view-tabs"]')) {
    steps.push({
      element: '[data-tour="view-tabs"]',
      popover: {
        title: "View Switcher",
        description:
          "Switch between Overview, Pipeline, Table, Calendar, and per-module Agents views. Each view gives you a different lens on your notes.",
        side: "bottom",
        align: "start",
      },
    });
  }

  if (document.querySelector('[data-tour="activity"]')) {
    steps.push({
      element: '[data-tour="activity"]',
      popover: {
        title: "Agent Activity",
        description:
          "See what the AI agents are doing right now. A pulsing dot means an agent is actively running — click to see details.",
        side: "bottom",
        align: "end",
      },
    });
  }

  steps.push({
    element: '[data-tour="content"]',
    popover: {
      title: "Main Content Area",
      description:
        "This is where you work. Module dashboards, note editor, pipeline boards, tables, calendars — everything renders here.",
      side: "top",
      align: "center",
    },
  });

  // Chat bar only shows when a module is active
  if (document.querySelector('[data-tour="chat-bar"]')) {
    steps.push({
      element: '[data-tour="chat-bar"]',
      popover: {
        title: "Chat with the Agent",
        description:
          "Your AI assistant lives here. Ask it anything — create notes, query your vault, run actions, or get help. Open it anytime with <strong>Cmd+.</strong> (dot).",
        side: "top",
        align: "center",
      },
    });
  }

  steps.push({
    popover: {
      title: "Keyboard Shortcuts",
      description: `
        <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:12px;margin-top:4px;">
          <kbd style="font-family:monospace;background:rgba(0,0,0,0.06);padding:1px 5px;border-radius:3px;">Cmd+K</kbd><span>Command palette</span>
          <kbd style="font-family:monospace;background:rgba(0,0,0,0.06);padding:1px 5px;border-radius:3px;">Cmd+.</kbd><span>Toggle chat</span>
          <kbd style="font-family:monospace;background:rgba(0,0,0,0.06);padding:1px 5px;border-radius:3px;">Cmd+B</kbd><span>Toggle sidebar</span>
          <kbd style="font-family:monospace;background:rgba(0,0,0,0.06);padding:1px 5px;border-radius:3px;">Cmd+N</kbd><span>New note</span>
          <kbd style="font-family:monospace;background:rgba(0,0,0,0.06);padding:1px 5px;border-radius:3px;">Cmd+1-9</kbd><span>Switch module</span>
        </div>
      `,
      side: "bottom",
      align: "center",
    },
  });

  steps.push({
    popover: {
      title: "You're all set!",
      description:
        "Start by selecting a module from the sidebar or create a new one. The AI agent is always ready to help — just open the chat. Enjoy Life OS!",
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
