import { bdoCreditCardPdf } from "./bdo-pdf";
import { unionBankCreditCardXlsx } from "./unionbank-xlsx";
import type { ParseRequest, ParseResponse } from "./parse-statement";
import { StatementParseError, type StatementFormatId, type StatementParser } from "./statement";

const PARSERS: Record<StatementFormatId, StatementParser> = {
  "bdo-credit-card-pdf": bdoCreditCardPdf,
  "unionbank-credit-card-xlsx": unionBankCreditCardXlsx,
};

async function parse({ formatId, data, password }: ParseRequest): Promise<ParseResponse> {
  try {
    return { ok: true, lines: await PARSERS[formatId].parse(data, password) };
  } catch (error) {
    if (error instanceof StatementParseError && error.problem !== "failed") {
      return { ok: false, problem: error.problem };
    }
    const cause = error instanceof StatementParseError ? error.cause : error;
    return { ok: false, problem: "failed", detail: String(cause) };
  }
}

const isParseRequest = (message: unknown): message is ParseRequest =>
  typeof message === "object" &&
  message !== null &&
  "reply" in message &&
  message.reply instanceof MessagePort;

// pdf.js's worker code listens on this global port too; requests come with their own reply port.
self.addEventListener("message", (event: MessageEvent<unknown>) => {
  const request = event.data;
  if (!isParseRequest(request)) return;
  void parse(request).then((response) => request.reply.postMessage(response));
});
