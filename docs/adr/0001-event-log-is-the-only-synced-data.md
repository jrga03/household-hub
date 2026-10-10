# The event log is the only synced data

Every change is an immutable event with an ID generated on the device. The events go into one append-only Supabase table. A push inserts events and ignores any it already has; a pull asks for events after a server-assigned sequence number. RLS decides who can read each event.

Each device keeps a full replica of the events its member can see. Screens read only local tables rebuilt from those events, and never the network. When two edits to the same record conflict, a hybrid logical clock (a device timestamp that corrects for clock skew) decides that the edit made later wins. The server sequence only tells a device what to pull next.

We chose this because merging immutable events is a set union, so a new entry can never be lost. Deletes are just events, and the vision's "history matters" comes for free.

The previous app ran a row outbox and a half-built event log side by side. Its client-timestamp catch-up cursor and missing tombstones caused most of its sync bugs.

Events are never rewritten. Each event type carries a version number, and the projection code translates old versions when it reads them. Corrections are new events.

## Considered options

- **PowerSync:** about 1 MB of client, its free cloud pauses after a week idle, and self-hosting needs a paid server.
- **A Cloudflare Durable Object per household:** a shared cap of 100k requests a day, and checking a login token under the 10 ms CPU limit is untested. This is the upgrade path if sequence gaps or Supabase idle pausing cause problems.
- **ElectricSQL, Zero:** no offline writes.

## Consequences

Supabase Free pauses an idle project, so a Cloudflare cron job runs a keep-alive query every 3 days. Server-side reports have no tables of their own; totals and exports are computed on the device.
