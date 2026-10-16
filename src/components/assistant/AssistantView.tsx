import { useEffect } from "react";
import { FormError } from "@/components/ui/form-error";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import type { Entry } from "@/lib/assistant/conversation";
import type { Actor } from "@/lib/commands/accounts";
import { cn } from "@/lib/utils";
import { useAssistantStore } from "@/stores/assistantStore";
import { ChatComposer } from "./ChatComposer";
import { ProposalCard } from "./ProposalCard";

function Bubble({ from, children }: { from: "member" | "assistant"; children: string }) {
  return (
    <li
      className={cn(
        "max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm",
        from === "member" ? "self-end bg-primary text-primary-foreground" : "self-start bg-muted"
      )}
    >
      {children}
    </li>
  );
}

function EntryView({ entry, actor }: { entry: Entry; actor: Actor }) {
  const decide = useAssistantStore((state) => state.decide);
  switch (entry.kind) {
    case "user":
      return <Bubble from="member">{entry.text}</Bubble>;
    case "assistant":
      return entry.text.trim() === "" ? null : <Bubble from="assistant">{entry.text}</Bubble>;
    case "proposal":
      return (
        <li className="w-full">
          <ProposalCard entry={entry} actor={actor} onDecide={decide} />
        </li>
      );
    case "tool":
      return null;
  }
}

export function AssistantView({ actor }: { actor: Actor }) {
  const { entries, replyText, busy, error, limitResetsAt, send } = useAssistantStore();
  const online = useOnlineStatus();
  useEffect(() => {
    // Main's bottom padding, not the composer, meets the screen edge, so the phone's Add button doesn't cover Send.
    document.getElementById("main-content")?.scrollIntoView?.({ block: "end" });
  }, [entries, replyText, busy]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      {entries.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Ask about balances, spending or budgets, or record a line like “jollibee 250 gcash”. You
          confirm every transaction before it’s saved. The chat is cleared when the app reloads.
        </p>
      )}
      <ol aria-label="Conversation" aria-live="polite" className="flex flex-col gap-3">
        {entries.map((entry, index) => (
          <EntryView key={index} entry={entry} actor={actor} />
        ))}
        {busy &&
          (replyText ? (
            <Bubble from="assistant">{replyText}</Bubble>
          ) : (
            <li className="self-start text-sm text-muted-foreground">Thinking…</li>
          ))}
      </ol>
      <FormError>{error}</FormError>
      <ChatComposer
        online={online}
        limitResetsAt={limitResetsAt}
        busy={busy}
        onSend={(text) => void send(text, actor.userId)}
      />
    </div>
  );
}
