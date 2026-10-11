# Categories carry visibility

A category is Household or Personal, fixed when it is created, like an account. Household accounts hold money only in Household categories; a member's Personal accounts hold money only in that member's Personal categories. Personal categories belong to the member and go with them when they leave or move, along with their Personal accounts.

This follows ADR 0002's reasoning. Under ADR 0003 a category holds money inside accounts, so a Personal account keeping money in a Household category would strand that money when its member leaves: the category stays with the household, the account goes with the member.

We rejected one shared category list, which would leave a departed member's Personal money in categories they can no longer see. We also rejected Personal accounts without categories (only Unassigned), because a member's private savings goals are envelopes too. The cost is that a household and a member may each have a category with the same name, such as Groceries.
