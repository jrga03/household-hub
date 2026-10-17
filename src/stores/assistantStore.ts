import { create } from "zustand";
import { AssistantError, createProxyClient, LimitReachedError } from "@/lib/assistant/client";
import { ASSISTANT_URL } from "@/lib/assistant/config";
import { buildSessionContext } from "@/lib/assistant/context";
import {
  addMemberMessage,
  continueConversation,
  decideProposal,
  type ChatItem,
  type ProposalDecision,
} from "@/lib/assistant/conversation";
import {
  forgetChat,
  hasGoneIdle,
  loadChat,
  saveChat,
  type SavedChat,
} from "@/lib/assistant/savedChat";
import { runAssistantTool } from "@/lib/assistant/tools";
import { reportError } from "@/lib/sentry";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "./authStore";

const client =
  ASSISTANT_URL &&
  createProxyClient({
    url: ASSISTANT_URL,
    getToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
  });

interface AssistantStore {
  items: ChatItem[];
  /** When `items` last changed; null for a chat not started. */
  updatedAt: Date | null;
  /** The reply streaming in, until it joins `items`. */
  replyText: string;
  busy: boolean;
  error: string | null;
  limitResetsAt: Date | null;
  /** Resolves false when the message failed and was taken back out of the chat. */
  send: (text: string, userId: string) => Promise<boolean>;
  decide: (callId: string, decision: ProposalDecision) => void;
  /** Brings back the member's saved chat when the screen opens, unless it has gone idle. */
  open: (userId: string) => Promise<void>;
  startNewChat: (userId: string) => Promise<void>;
}

const EMPTY = {
  items: [],
  updatedAt: null,
  replyText: "",
  busy: false,
  error: null,
  limitResetsAt: null,
} satisfies Partial<AssistantStore>;

// Bumped by a reset, so a reply still streaming for the previous member is dropped.
let conversationNumber = 0;
let limitTimer: ReturnType<typeof setTimeout> | undefined;
// The member whose chat is in memory, so a decision is saved to their row.
let owner: string | null = null;

const saveQuietly = (userId: string, items: ChatItem[], updatedAt: Date) =>
  saveChat(userId, items, updatedAt).catch((error: unknown) => {
    reportError(error, { subsystem: "assistant", operation: "save-chat" });
  });

const currentChat = ({ items, updatedAt }: AssistantStore): SavedChat | null =>
  updatedAt && { items, updatedAt };

/** The conversation, saved on this device per member and wiped on sign-out (ADR 0010). */
export const useAssistantStore = create<AssistantStore>()((set, get) => {
  const reachLimit = (resetsAt: Date) => {
    set({ limitResetsAt: resetsAt });
    clearTimeout(limitTimer);
    limitTimer = setTimeout(
      () => set({ limitResetsAt: null }),
      Math.max(0, resetsAt.getTime() - Date.now())
    );
  };

  return {
    ...EMPTY,

    send: async (text, userId) => {
      if (!client || get().busy) return false;
      const startedIn = conversationNumber;
      const update = (state: Partial<AssistantStore>) => {
        if (startedIn === conversationNumber) set(state);
      };
      const keep = (items: ChatItem[]) => {
        if (startedIn !== conversationNumber) return;
        const updatedAt = new Date();
        set({ items, updatedAt });
        void saveQuietly(userId, items, updatedAt);
      };
      owner = userId;
      const chat = currentChat(get());
      const before = chat && !hasGoneIdle(chat, new Date()) ? chat.items : [];
      const items = addMemberMessage(before, text);
      update({ items, busy: true, error: null, replyText: "" });
      try {
        // Rebuilt for each message, so "today" and new accounts stay current in a long-open app.
        const session = { userId, now: new Date() };
        const context = await buildSessionContext(session);
        const settled = await continueConversation({
          context,
          items,
          client,
          runTool: (name, rawArguments) => runAssistantTool(name, rawArguments, session),
          onProgress: (progress) => {
            keep(progress);
            update({ replyText: "" });
          },
          onText: (replyText) => update({ replyText }),
        });
        keep(settled);
        return true;
      } catch (error) {
        // A new member's chat starts empty, so there's nothing to take back.
        if (startedIn !== conversationNumber) return true;
        // Back to before the message, so resending doesn't repeat it and a waiting card stays open.
        set({ items: before, updatedAt: chat?.updatedAt ?? null });
        if (error instanceof LimitReachedError) reachLimit(error.resetsAt);
        else if (error instanceof AssistantError) set({ error: error.message });
        else {
          console.error("Assistant failed:", error);
          set({ error: "Something went wrong. Try again." });
        }
        return false;
      } finally {
        update({ busy: false, replyText: "" });
      }
    },

    decide: (callId, decision) => {
      const items = decideProposal(get().items, callId, decision);
      const updatedAt = new Date();
      set({ items, updatedAt });
      if (owner) void saveQuietly(owner, items, updatedAt);
    },

    open: async (userId) => {
      const openedIn = conversationNumber;
      const chat =
        owner === userId
          ? currentChat(get())
          : await loadChat(userId).catch((error: unknown) => {
              reportError(error, { subsystem: "assistant", operation: "load-chat" });
              return null;
            });
      if (openedIn !== conversationNumber || get().busy) return;
      owner = userId;
      const restored = chat && !hasGoneIdle(chat, new Date()) ? chat : null;
      set({ items: restored?.items ?? [], updatedAt: restored?.updatedAt ?? null });
    },

    startNewChat: async (userId) => {
      owner = userId;
      set({ items: [], updatedAt: null, error: null });
      await forgetChat(userId);
    },
  };
});

useAuthStore.subscribe((state, previous) => {
  if (state.user?.id === previous.user?.id) return;
  conversationNumber++;
  owner = null;
  clearTimeout(limitTimer);
  useAssistantStore.setState(EMPTY);
});
