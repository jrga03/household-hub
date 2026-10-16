import { create } from "zustand";
import { AssistantError, createProxyClient, LimitReachedError } from "@/lib/assistant/client";
import { ASSISTANT_URL } from "@/lib/assistant/config";
import { buildSessionContext } from "@/lib/assistant/context";
import {
  addMemberMessage,
  continueConversation,
  decideProposal,
  type Entry,
  type ProposalDecision,
} from "@/lib/assistant/conversation";
import { runAssistantTool } from "@/lib/assistant/tools";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "./authStore";

const client =
  ASSISTANT_URL &&
  createProxyClient({
    url: ASSISTANT_URL,
    getToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
  });

interface AssistantStore {
  entries: Entry[];
  /** The reply streaming in, until it joins `entries`. */
  replyText: string;
  busy: boolean;
  error: string | null;
  limitResetsAt: Date | null;
  send: (text: string, userId: string) => Promise<void>;
  decide: (callId: string, decision: ProposalDecision) => void;
}

const EMPTY = {
  entries: [],
  replyText: "",
  busy: false,
  error: null,
  limitResetsAt: null,
} satisfies Partial<AssistantStore>;

// Bumped by a reset, so a reply still streaming for the previous member is dropped.
let conversationNumber = 0;
let limitTimer: ReturnType<typeof setTimeout> | undefined;

/** The conversation, in memory only: gone on reload and on sign-out (ADR 0010). */
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
      if (!client || get().busy) return;
      const number = conversationNumber;
      const update = (state: Partial<AssistantStore>) => {
        if (number === conversationNumber) set(state);
      };
      const entries = addMemberMessage(get().entries, text);
      update({ entries, busy: true, error: null, replyText: "" });
      try {
        // Rebuilt for each message, so "today" and new accounts stay current in a long-open app.
        const session = { userId, now: new Date() };
        const context = await buildSessionContext(session);
        const settled = await continueConversation({
          context,
          entries,
          client,
          runTool: (name, rawArguments) => runAssistantTool(name, rawArguments, session),
          onProgress: (progress) => update({ entries: progress, replyText: "" }),
          onText: (replyText) => update({ replyText }),
        });
        update({ entries: settled });
      } catch (error) {
        if (number !== conversationNumber) return;
        if (error instanceof LimitReachedError) reachLimit(error.resetsAt);
        else if (error instanceof AssistantError) set({ error: error.message });
        else {
          console.error("Assistant failed:", error);
          set({ error: "Something went wrong. Try again." });
        }
      } finally {
        update({ busy: false, replyText: "" });
      }
    },

    decide: (callId, decision) => set({ entries: decideProposal(get().entries, callId, decision) }),
  };
});

useAuthStore.subscribe((state, previous) => {
  if (state.user?.id === previous.user?.id) return;
  conversationNumber++;
  clearTimeout(limitTimer);
  useAssistantStore.setState(EMPTY);
});
