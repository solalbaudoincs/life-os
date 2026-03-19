import { create } from "zustand";
import type { McpServer, McpToolInfo } from "../types/mcp";
import * as api from "../api/mcp";

interface McpState {
  servers: McpServer[];
  allTools: McpToolInfo[];
  loading: boolean;

  fetch: () => Promise<void>;
  fetchTools: () => Promise<void>;
  create: (data: Partial<McpServer>) => Promise<McpServer>;
  update: (id: string, data: Partial<McpServer>) => Promise<McpServer>;
  remove: (id: string) => Promise<void>;
  refresh: (id: string) => Promise<McpServer>;
}

export const useMcpStore = create<McpState>((set, get) => ({
  servers: [],
  allTools: [],
  loading: false,

  fetch: async () => {
    set({ loading: true });
    try {
      const servers = await api.fetchMcpServers();
      set({ servers });
    } finally {
      set({ loading: false });
    }
  },

  fetchTools: async () => {
    const tools = await api.fetchAllMcpTools();
    set({ allTools: tools });
  },

  create: async (data) => {
    const server = await api.createMcpServer(data);
    set({ servers: [...get().servers, server] });
    return server;
  },

  update: async (id, data) => {
    const server = await api.updateMcpServer(id, data);
    set({
      servers: get().servers.map((s) => (s.id === id ? server : s)),
    });
    return server;
  },

  remove: async (id) => {
    await api.deleteMcpServer(id);
    set({ servers: get().servers.filter((s) => s.id !== id) });
  },

  refresh: async (id) => {
    const server = await api.refreshMcpServer(id);
    set({
      servers: get().servers.map((s) => (s.id === id ? server : s)),
    });
    return server;
  },
}));
