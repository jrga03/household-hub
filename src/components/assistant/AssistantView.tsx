import { useEffect, useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { HeaderActions } from "@/components/layout/HeaderActions";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useVisibleArea } from "@/hooks/useVisibleArea";
import { isWaiting, type ChatItem } from "@/lib/assistant/conversation";
import type { Actor } from "@/lib/commands/accounts";
import { confirm } from "@/lib/confirm";
import { useAssistantStore } from "@/stores/assistantStore";
import { ChatComposer } from "./ChatComposer";
import { ProposalCard } from "./ProposalCard";
import { ReplyMarkdown } from "./ReplyMarkdown";

const EXAMPLE_PROMPTS = [
  "jollibee 250 gcash",
  "How's my Groceries budget?",
  "What's my GCash balance?",
  "How much did I spend this month?",
];

function Bubble({ from, children }: { from: "member" | "assistant"; children: string }) {
  return from === "member" ? (
    <li className="max-w-[85%] self-end whitespace-pre-wrap rounded-lg bg-primary px-3 py-2 text-body text-primary-foreground">
      {children}
    </li>
  ) : (
    <li className="min-w-0 max-w-[85%] self-start rounded-lg bg-muted px-3 py-2 text-body has-[table]:w-full has-[table]:max-w-full">
      <ReplyMarkdown>{children}</ReplyMarkdown>
    </li>
  );
}
function ChatItemView({ item, actor }: { item: ChatItem; actor: Actor }) {
  const decide = useAssistantStore((state) => state.decide);
  switch (item.kind) {
    case "user":
      return <Bubble from="member">{item.text}</Bubble>;
    case "assistant":
      return item.text.trim() === "" ? null : <Bubble from="assistant">{item.text}</Bubble>;
    case "proposal":
      return (
        <li className="w-full">
          <ProposalCard item={item} actor={actor} onDecide={decide} />
        </li>
      );
    case "tool":
      return null;
  }
}

function NewChatButton({ userId }: { userId: string }) {
  const { items, busy, startNewChat } = useAssistantStore();

  const startFresh = async () => {
    const keepsCard =
      items.some(isWaiting) &&
      !(await confirm({
        title: "Discard this proposal?",
        description: "It hasn't been recorded. A new chat starts without it.",
        confirmLabel: "Discard",
        destructive: true,
      }));
    if (keepsCard) return;
    await startNewChat(userId);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="New chat"
      disabled={busy}
      onClick={() => void startFresh()}
    >
      <MessageSquarePlus className="h-5 w-5" />
    </Button>
  );
}

export function AssistantView({ actor }: { actor: Actor }) {
  const { items, replyText, busy, error, limitResetsAt, send } = useAssistantStore();
  const online = useOnlineStatus();
  const [prompt, setPrompt] = useState({ text: "", composerKey: 0 });
  const { viewportHeight, inset } = useVisibleArea();
  // Not `inset` itself: iOS changes it while the reader pans, and the scroll would pull them back down.
  const keyboardCoversPage = inset > 0;
  useEffect(() => {
    // The newest message stays just above the pinned composer, also when the keyboard opens or a notice grows it.
    document.getElementById("main-content")?.scrollIntoView?.({ block: "end" });
  }, [items, replyText, busy, viewportHeight, keyboardCoversPage, online, limitResetsAt]);

  return (
    // Fills the screen below the header (3.5rem, its border and the page's 2rem top padding), so the composer starts at the bottom edge.
    <div className="mx-auto flex min-h-[calc(100dvh-5.5rem-1px-var(--safe-area-top))] max-w-2xl flex-col gap-4">
      {items.length > 0 && (
        <HeaderActions>
          <NewChatButton userId={actor.userId} />
        </HeaderActions>
      )}
      {items.length === 0 && (
        <div className="space-y-2">
          <p className="text-body text-muted-foreground">Try asking</p>
          <ul className="flex flex-wrap gap-2">
            {EXAMPLE_PROMPTS.map((text) => (
              <li key={text}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPrompt((previous) => ({ text, composerKey: previous.composerKey + 1 }))
                  }
                >
                  {text}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ol aria-label="Conversation" aria-live="polite" className="flex flex-1 flex-col gap-3">
        {items.map((item, index) => (
          <ChatItemView key={index} item={item} actor={actor} />
        ))}
        {busy &&
          (replyText ? (
            <Bubble from="assistant">{replyText}</Bubble>
          ) : (
            <li className="self-start text-body text-muted-foreground">Thinking…</li>
          ))}
      </ol>
      <FormError>{error}</FormError>
      <ChatComposer
        key={prompt.composerKey}
        initialText={prompt.text}
        online={online}
        limitResetsAt={limitResetsAt}
        busy={busy}
        onSend={(text) => send(text, actor.userId)}
      />
    </div>
  );
}
