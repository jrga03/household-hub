import { useState, type FormEvent } from "react";
import { format, isToday, isTomorrow } from "date-fns";
import { SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  onSend,
}: {
  online: boolean;
  limitResetsAt: Date | null;
  busy: boolean;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const blockedBecause = !online
    ? "The assistant needs a connection. Everything else works offline."
    : limitResetsAt
      ? `The assistant has reached today's limit. It's back ${resetTime(limitResetsAt)}.`
      : null;
  const message = text.trim();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (blockedBecause || busy || message === "") return;
    onSend(message);
    setText("");
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      {blockedBecause && <p className="text-sm text-muted-foreground">{blockedBecause}</p>}
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
