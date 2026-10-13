# Drafts are device-local; an import key prevents double import

This refines ADR 0001. Drafts are the first records deliberately kept out of the event log: they live in a local Dexie table on the device that imported the statement and never reach the server. Only a saved draft becomes a record, as an ordinary `transaction.created` event.

Each saved draft stamps its transaction with an `importKey`: a hash of the statement format, the account, the line's date, raw description and amount, and its position among identical lines in that statement. Re-importing the same statement reproduces the same keys, and two genuine identical lines on one statement get different ones. The key travels in the event (`transaction.created` v3, with v1 and v2 upcast to `null`), so a statement imported on one device is recognized on every other.

## Considered options

- **Drafts as synced events:** another member could review them on their phone, but raw statement lines would sit on the server forever, and a draft event schema would need versioning for records that are thrown away within the hour.
- **A device-local list of imported keys:** no event change, but a second member importing the same statement on their own phone would double-count it.
- **Matching on date and amount only:** catches re-imports without a key, but flags two real ₱150 coffees on the same day as one.

## Consequences

- Drafts can't be reviewed on another device, and they're lost if the device is wiped before they're saved. The sign-out warning counts unsaved drafts.
- An exact key match on a transaction that isn't removed reads "Already imported" and is discarded by default. The ±3-day, same-amount match is only a hint, and only against transactions without a key (ones typed by hand).
- Editing a draft's description before saving doesn't change its key, since the key comes from the raw line.
