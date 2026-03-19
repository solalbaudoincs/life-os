import { create } from "zustand";
import type { ChatMessage, PendingConfirmation, ToolCallInfo, SSEEvent } from "../types/chat";
import * as api from "../api/chat";
import * as convApi from "../api/conversations";
import type { ConversationSummary } from "../api/conversations";

interface ChatState {
  messages: ChatMessage[];
  loading: boolean;
  conversationId: string | null;
  conversations: ConversationSummary[];
  conversationsLoaded: boolean;
  pendingConfirmation: PendingConfirmation | null;
  pendingTool: Record<string, unknown> | null;
  messagesSnapshot: Record<string, unknown>[] | null;

  // Streaming state
  streamingContent: string;
  streamingToolCalls: ToolCallInfo[];
  activeToolName: string | null;
  suggestedFollowups: string[];

  send: (text: string) => Promise<void>;
  confirmPendingAction: () => Promise<void>;
  cancelPendingAction: () => Promise<void>;
  clear: () => void;
  fetchConversations: () => Promise<void>;
  loadConversation: (id: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  startNewConversation: () => void;
}

function handleApiResponse(
  resp: api.ChatApiResponse,
  set: (partial: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>)) => void,
  get: () => ChatState,
) {
  if (resp.pending_confirmation) {
    set({
      conversationId: resp.conversation_id,
      pendingConfirmation: resp.pending_confirmation,
      pendingTool: resp.pending_confirmation ? {
        name: resp.pending_confirmation.tool_name,
        arguments: resp.pending_confirmation.arguments,
      } : null,
      messagesSnapshot: resp.messages_snapshot ?? null,
      loading: false,
    });
  } else {
    const assistantMsg: ChatMessage = {
      role: "assistant",
      content: resp.response,
      tool_calls: resp.tool_calls,
    };
    set((s) => ({
      messages: [...s.messages, assistantMsg],
      conversationId: resp.conversation_id,
      pendingConfirmation: null,
      pendingTool: null,
      messagesSnapshot: null,
      loading: false,
    }));
    get().fetchConversations();
  }
}

const INITIAL_STREAMING_STATE = {
  streamingContent: "",
  streamingToolCalls: [] as ToolCallInfo[],
  activeToolName: null as string | null,
  suggestedFollowups: [] as string[],
};

// Tracks the active stream so it can be cancelled on navigation
let _activeAbort: AbortController | null = null;

function _cancelActiveStream() {
  if (_activeAbort) {
    _activeAbort.abort();
    _activeAbort = null;
  }
}

function handleSSEEvent(
  event: SSEEvent,
  set: (partial: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>)) => void,
  get: () => ChatState,
) {
  switch (event.type) {
    case "stream_start":
      set({ conversationId: event.conversation_id });
      break;

    case "tool_start":
      set({ activeToolName: event.name });
      break;

    case "tool_end":
      set((s) => ({
        streamingToolCalls: [
          ...s.streamingToolCalls,
          { name: event.name, arguments: event.arguments, result: event.result },
        ],
        activeToolName: null,
      }));
      break;

    case "text_delta":
      set((s) => ({
        streamingContent: s.streamingContent + event.delta,
      }));
      break;

    case "complete": {
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: event.response,
        tool_calls: event.tool_calls,
        suggested_followups: event.suggested_followups,
      };
      set((s) => ({
        messages: [...s.messages, assistantMsg],
        loading: false,
        ...INITIAL_STREAMING_STATE,
        suggestedFollowups: event.suggested_followups || [],
      }));
      get().fetchConversations();
      break;
    }

    case "pending_confirmation": {
      const conf = event.pending_confirmation;
      set({
        pendingConfirmation: conf,
        pendingTool: event.pending_tool as Record<string, unknown>,
        messagesSnapshot: event.messages_snapshot ?? null,
        loading: false,
        ...INITIAL_STREAMING_STATE,
      });
      break;
    }

    case "error":
      set((s) => ({
        messages: [
          ...s.messages,
          { role: "assistant" as const, content: `Error: ${event.message}` },
        ],
        loading: false,
        ...INITIAL_STREAMING_STATE,
      }));
      break;
  }
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  loading: false,
  conversationId: null,
  conversations: [],
  conversationsLoaded: false,
  pendingConfirmation: null,
  pendingTool: null,
  messagesSnapshot: null,
  ...INITIAL_STREAMING_STATE,

  send: async (text) => {
    _cancelActiveStream();

    const userMsg: ChatMessage = { role: "user", content: text };
    set((s) => ({
      messages: [...s.messages, userMsg],
      loading: true,
      ...INITIAL_STREAMING_STATE,
    }));

    const abort = new AbortController();
    _activeAbort = abort;

    try {
      const history = get().messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      await api.sendMessageStream(
        text,
        history.slice(0, -1), // exclude the just-added user message
        get().conversationId,
        (event) => {
          if (abort.signal.aborted) return;
          handleSSEEvent(event, set, get);
        },
        abort.signal,
      );
    } catch (e) {
      if (abort.signal.aborted) return; // cancelled intentionally, don't show error
      const errMsg: ChatMessage = {
        role: "assistant",
        content: `Error: ${e instanceof Error ? e.message : "Something went wrong"}`,
      };
      set((s) => ({
        messages: [...s.messages, errMsg],
        loading: false,
        ...INITIAL_STREAMING_STATE,
      }));
    } finally {
      if (_activeAbort === abort) _activeAbort = null;
    }
  },

  confirmPendingAction: async () => {
    const { conversationId, pendingTool, messagesSnapshot } = get();
    if (!conversationId || !pendingTool || !messagesSnapshot) return;

    set({ loading: true });
    try {
      const resp = await api.confirmAction(conversationId, pendingTool, messagesSnapshot);
      handleApiResponse(resp, set, get);
    } catch (e) {
      const errMsg: ChatMessage = {
        role: "assistant",
        content: `Error confirming action: ${e instanceof Error ? e.message : "Something went wrong"}`,
      };
      set((s) => ({
        messages: [...s.messages, errMsg],
        loading: false,
        pendingConfirmation: null,
        pendingTool: null,
        messagesSnapshot: null,
      }));
    }
  },

  cancelPendingAction: async () => {
    const { conversationId, pendingTool, messagesSnapshot } = get();
    if (!conversationId || !pendingTool || !messagesSnapshot) return;

    set({ loading: true });
    try {
      const resp = await api.cancelAction(conversationId, pendingTool, messagesSnapshot);
      handleApiResponse(resp, set, get);
    } catch (e) {
      set({
        loading: false,
        pendingConfirmation: null,
        pendingTool: null,
        messagesSnapshot: null,
      });
    }
  },

  clear: () => {
    _cancelActiveStream();
    set({
      messages: [], conversationId: null, loading: false,
      pendingConfirmation: null, pendingTool: null, messagesSnapshot: null,
      ...INITIAL_STREAMING_STATE,
    });
  },

  startNewConversation: () => {
    _cancelActiveStream();
    set({
      messages: [], conversationId: null, loading: false,
      pendingConfirmation: null, pendingTool: null, messagesSnapshot: null,
      ...INITIAL_STREAMING_STATE,
    });
  },

  fetchConversations: async () => {
    try {
      const conversations = await convApi.listConversations();
      set({ conversations, conversationsLoaded: true });
    } catch {
      // silently fail
    }
  },

  loadConversation: async (id: string) => {
    _cancelActiveStream();
    try {
      const detail = await convApi.getConversation(id);
      const messages: ChatMessage[] = detail.messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
        tool_calls: m.tool_calls,
      }));
      set({ messages, conversationId: id, loading: false, ...INITIAL_STREAMING_STATE });
    } catch (e) {
      console.error("Failed to load conversation", e);
    }
  },

  deleteConversation: async (id: string) => {
    try {
      await convApi.deleteConversation(id);
      const state = get();
      if (state.conversationId === id) {
        set({ messages: [], conversationId: null });
      }
      await state.fetchConversations();
    } catch (e) {
      console.error("Failed to delete conversation", e);
    }
  },
}));
