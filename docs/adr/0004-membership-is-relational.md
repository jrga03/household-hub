# Membership is relational; the event log is the only synced record data

This refines ADR 0001. Households, membership and join requests are ordinary Postgres tables that the server owns. Clients read them and change them only through database functions. They are not events.

These tables are the access boundary. Every RLS policy on the event log asks "is the reader a member of this event's household?", and that question needs one authoritative answer at the moment of the read. With membership as events, each device would replay its own copy of the answer, and a removed member's device could keep granting itself access until it synced. A relational table answers on the server, at once, for everyone.

Records (accounts now; transactions, categories and the rest later) stay events. They sync by union-merge and project locally, as ADR 0001 describes.

## Consequences

- Creating a household, joining, approving, leaving and removal need a connection. The app explains this rather than queueing them.
- The route gate reads membership from the network and falls back to the last membership seen online, so a member opening the app offline still reaches their records.
- Membership history isn't kept. If it ever needs showing, add an audit table rather than turning membership into events.
- Server ids for households (`gen_random_uuid()`), unlike records, which use ids generated on the device.
