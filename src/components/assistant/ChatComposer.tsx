import { useState, type FormEvent } from "react";
import { format, isToday, isTomorrow } from "date-fns";
import { SendHorizontal } from "lucide-react";
import { Button } from "@/components/app/Button";
import { Input } from "@/components/app/Input";
import { useVisibleArea } from "@/hooks/useVisibleArea";

function resetTime(resetsAt: Date) {
  const time = format(resetsAt, "h:mm a");
  if (isToday(resetsAt)) return `at ${time}`;
  if (isTomorrow(resetsAt)) return `tomorrow at ${time}`;
  return `on ${format(resetsAt, "EEEE")} at ${time}`;
}

export function ChatComposer({
  online,
  limitResetsAt,
  busy,
  initialText = "",
  onSend,
}: {
  online: boolean;
  limitResetsAt: Date | null;
  busy: boolean;
  /** Fills the input on mount; remount to fill it again. */
  initialText?: string;
  /** Resolves false when the message didn't go through. */
  onSend: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState(initialText);
  const { inset } = useVisibleArea();
  const blockedBecause = !online
    ? "The assistant needs a connection. Everything else works offline."
    : limitResetsAt
      ? `The assistant has reached today's limit. It's back ${resetTime(limitResetsAt)}.`
      : null;
  const message = text.trim();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (blockedBecause || busy || message === "") return;
    setText("");
    void onSend(message).then((sent) => {
      if (!sent) setText((typed) => (typed === "" ? message : typed));
    });
  };

  return (
    // Pinned to the screen's bottom edge, above any bottom chrome; the conversation scrolls behind it.
    <form
      onSubmit={submit}
      className="sticky bottom-0 space-y-2 border-t bg-background pt-3 pb-[max(1rem,var(--bottom-chrome))]"
      style={inset > 0 ? { paddingBottom: `calc(${inset}px + 0.5rem)` } : undefined}
    >
      {blockedBecause && <p className="text-body text-muted-foreground">{blockedBecause}</p>}
      <div className="flex gap-2">
        <Input
          aria-label="Message the assistant"
          placeholder="e.g. jollibee 250 gcash"
          autoComplete="off"
          enterKeyHint="send"
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={blockedBecause !== null}
        />
        <Button
          type="submit"
          size="icon"
          aria-label="Send"
          disabled={blockedBecause !== null || busy || message === ""}
        >
          <SendHorizontal />
        </Button>
      </div>
    </form>
  );
}
