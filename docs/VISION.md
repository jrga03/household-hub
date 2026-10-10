# Household Hub: The Idea

This is the idea for an app I want to build before I've written any of it. It covers why I want it, who it's for, what it should do, what it should never do, and what I'm willing to give up to get it built. When I'm deep in the work later and unsure whether something belongs, I want to be able to come back here and check.

## Where this comes from

Our household money lives in a spreadsheet. It has worked well enough, and it carries years of habits: a list of categories that grew out of how we actually live (savings for a forever house, retirement, big ticket items, utilities, subscriptions, groceries, transportation, personal allowances), monthly targets, and a running sense of where things stand. But the spreadsheet is getting in the way.

The biggest problem is timing. Spending happens at the grocery checkout, in a jeepney, at a pharmacy, in a mall basement with no signal. The spreadsheet lives on a laptop, so every expense has to survive in memory or on a receipt until someone sits down to type it in. Some never make it. By the end of the month the numbers are a reconstruction, not a record.

The second problem is that more than one person spends. A spreadsheet doesn't handle two people well. Either one person becomes the bookkeeper and chases everyone else for their expenses, or several people edit the same file and quietly overwrite each other. Neither is good, and neither scales to a household where everyone has a phone.

The third problem is trust. A spreadsheet will let you type anything into any cell. A formula breaks, a row gets pasted twice, a transfer between two of our own accounts gets counted as spending, and the month looks worse than it was. Nothing tells you it happened. I've lost evenings hunting for why a total was off by a few hundred pesos.

The fourth problem is that most of what we spend shows up first on a bank or credit card statement. Copying statement lines into the spreadsheet by hand is slow and error-prone, so it gets put off, and then it piles up.

So I want to build our own.

## What I want it to be

Household Hub is a private, shared money notebook for a group of people who manage money together. It lives on everyone's phone and computer, works whether or not there's a connection, and always tells the truth about where our money went.

It is not a bank. It doesn't move money, pay bills, or connect to anyone's account. It records what happened, organizes it, and shows us what it means.

## Who it's for

It's for a group, not a person. That's the whole point of the name. A household here means any group of people who manage money together: a family, a couple, relatives under one roof, housemates who split the bills. They share expenses, share some accounts, keep some things separate, and all want to know where the money goes without one person having to be the bookkeeper. Most personal finance tools treat a second person as an afterthought. In this app, the group is the starting point, and one person on their own is just a group of one.

The first group it serves is mine. That keeps it honest: every feature has to earn its place in a real household's month.

Once inside, everyone has the same standing. There's no hierarchy of permissions over the money. If you're in the household, you can record, fix, and review things like anyone else. That reflects how households actually operate, and it avoids building a permission system nobody would use. The one exception is the door: the person who created the household decides who gets in.

Everyone is in the Philippines, thinks in pesos, and spends most of the day on their phone. Some days a laptop is open and someone wants to sit down and properly review the month on a big screen. Both have to feel natural.

Any group should be able to pick it up. Starting a household or joining one should be simple enough that nobody needs it explained to them. Each household's money stays completely separate from every other household's. But I won't add features just to attract people. It grows by being useful, not by being marketed.

## Goals

**Recording something should take seconds, anywhere.** If entering an expense takes longer than putting the phone back in my pocket, it won't happen. The fastest path, from opening the app to a saved expense, has to be short, and it has to work on a bad connection or none at all. I'd like a typical entry to take under thirty seconds.

**It has to work offline, fully.** Not "read-only offline" and not "please reconnect to save". Everything I can do online, I should be able to do offline: add, edit, delete, review. When the connection comes back, the app should catch up on its own. Nobody should ever lose an entry because they recorded it in a basement.

**Everyone in the household should see the same picture.** What I record on my phone should appear on everyone else's devices without anyone sending a file or pressing a refresh button. When two people happen to change things around the same time, the app should settle it sensibly and never silently lose data.

**The numbers have to be right, to the centavo.** Money totals can't drift through rounding. A peso and fifty centavos is exactly that, everywhere it appears. Moving money between our own accounts isn't spending and must never show up as spending. If the app shows a total, I should never have to double-check it on a calculator.

**It should replace the spreadsheet, not sit beside it.** Everything the spreadsheet does for us today, the app should do as well or better: our categories, our monthly targets, our account balances, our month-end review. Once it's ready, we should be able to stop opening the spreadsheet.

**Getting statement data in should be easy and safe.** I want to hand it a bank or credit card statement and get back a list of transactions I can review, correct, and accept, without retyping everything. Nothing from a statement should land in our real records until a person has looked at it.

**Our data stays ours.** Our finances are private. They shouldn't be sold, profiled, or fed to anyone's advertising. We should be able to take a full copy of our data out whenever we want, in a format other tools can read.

**It should cost little or nothing to run.** This is a household tool, not a business. Running it shouldn't need a monthly bill that a spreadsheet never needed. That constraint shapes a lot of decisions, and I'm comfortable with that.

## The ideas it's built on

These are the beliefs about money and about our household that the app should hold, even where users never see them directly.

### Every amount is positive, with a direction

An expense of five hundred pesos is five hundred pesos going out, and income of five hundred is five hundred coming in. People shouldn't have to type minus signs or think about signs at all. Each entry has an amount and says whether money came in or went out.

### Moving money is not spending

When I withdraw cash from the bank, load money into an e-wallet, or pay off a credit card from savings, our household didn't get any poorer. Money moved from one pocket to another. The app should record that as a transfer: money leaves one account and arrives in another, both sides are linked, and neither side counts toward spending, income, budgets, or reports. Each account's balance still moves, because the money really did move. This is the mistake the spreadsheet made most often, and the app should make it impossible.

### A budget is a target, not a pot of money

When we say "fifteen thousand for groceries this month", that's a target to compare against, not an envelope of cash. The app should never treat a budget as a balance that gets spent down or carried forward. Each month stands alone. What we actually spent always comes from what we actually recorded, and the budget is the line we compare it to. For convenience, I can copy last month's targets to start a new month, but that copies the targets, not the leftover money.

### A date is the day it happened, where we live

If I buy something at 11 p.m. on the last day of the month, it belongs to that month. It shouldn't slip into the next one because a computer somewhere thinks in a different time zone. The date on a transaction is the calendar date we lived it, and months begin and end the way they do on our wall calendar.

### Shared by default, private when needed

Most of our money is household money, and everyone in the household should see it. But people are also entitled to some privacy, like a personal allowance or a gift being saved up for. Each account and transaction can be either household (everyone sees it and it counts toward household totals) or personal (only its owner sees it). Household is the default, and personal is a deliberate choice.

### Pending and cleared are different things

When I swipe a card, the expense is real to me but not yet final at the bank. Recording that difference lets us see both what we've committed to spend and what has actually gone through. Marking things cleared as statements arrive should be quick, including many at once.

### History matters

When a debt payment turns out to be wrong, I don't want it erased as if it never happened. I want it undone with a visible correction, so the trail still makes sense months later. More generally, the app should prefer keeping a record of what changed over quietly overwriting it.

### Your phone is the first place your data lives

The app should treat the device in your hand as a real home for your data, not a window onto a server. That's what makes it fast and what makes it work offline. The shared, online copy is how devices stay in agreement and how nothing is lost if a phone is dropped in the sea.

## What it should do

### Starting or joining a household

Everything in the app belongs to a household, so the first thing a new person does after signing up is find theirs. If they don't have one yet, they get two choices: create a new household, or join an existing one with its household code.

Creating a household takes a name and nothing else. The creator becomes its owner and gets a short code they can share however they like, by text, in a group chat, or out loud across the dinner table.

Joining means typing in that code. That doesn't let anyone in straight away. It sends a request, and the owner gets a notification that someone wants to join, showing who they are. The owner accepts or declines. Accepted, the person sees the household's shared accounts, transactions, and budgets right away. Declined, they're told politely and can create their own household or try another code. Until then, the person waiting can see that their request is pending and can cancel it.

A code on its own should never be enough to see anyone's money. Someone who gets hold of it, by accident or otherwise, still needs the owner's yes. If a code gets passed around more widely than intended, the owner should be able to replace it so the old one stops working. Only the owner approves requests.

A person belongs to one household at a time. Anyone can leave their household whenever they want. When they do, what they recorded for the household stays behind: the groceries they logged, the bills they paid, the transfers they made. Those are part of the household's history, and taking them out would quietly change past totals and budgets that everyone else relied on. What they kept personal goes with them. Nobody else could see those entries, and they never counted toward the household's numbers, so their absence changes nothing for the people who stay. After leaving, the person can create a new household or ask to join another.

### Accounts

A place to list every pocket our money sits in: bank accounts, credit cards, cash wallets, e-wallets, investment accounts. Each has a starting balance and a running balance that the app works out from what's recorded against it, never something someone types in and forgets to update. Balances should distinguish what has cleared from what is still pending. Accounts we've stopped using can be retired without erasing their history. Each account can be household or personal.

### Transactions

The heart of the app. A transaction is something that happened to our money: a date, whether it came in or went out, how much, what it was for, which category it belongs to, which account it touched, whether it has cleared, and optionally notes and the household members it involved.

I want to see all of them in one long list that stays smooth whether we have a hundred entries or ten thousand. I want to search them, filter by month, account, category, type, and status, and see the totals of whatever I've filtered right there on screen. I want to select many at once and act on them together. On a phone, common actions should be one swipe away. On a big screen, the list should use the space, with room to see details beside it without losing my place.

### Transfers

A dedicated way to say "this money moved from here to there". It creates both sides at once, keeps them linked, and keeps them out of spending and income everywhere. The two sides can have different dates when the money took a day to arrive, and one side can be cleared while the other is still pending.

### Categories

A two-level structure of groups and categories, like "Food" containing "Groceries", "Restaurants", and "Delivery". The household should start with sensible defaults that match how we already think, and be able to add, rename, and retire categories over time. Reports should be able to show both levels: how much went to food overall, and how much of that was groceries.

### Budgets

For each month, a target per spending category, and a clear comparison of target against what was actually spent. It should be obvious at a glance which categories are comfortable, which are getting close, and which are over. Starting a new month should take a moment, by copying the previous month's targets and adjusting as needed. Income and transfers never count against a budget.

### A dashboard and analytics

A home screen that answers "how are we doing this month?" without digging: money in, money out, the difference, account balances, budget status, and the latest activity. Behind it, a deeper view for sitting down and understanding patterns: spending by category, how this month compares to the last few, where the money trends over time, and drilling from a chart straight into the transactions behind it. Transfers are excluded from all of it.

### Bringing in statements

I want to give it a bank or credit card statement, in the format the bank actually sends (often a password-protected PDF), and get back a list of transactions. Those land in a holding area as drafts, not as real records. There I can fix descriptions, choose categories and accounts, throw away lines I don't want, and confirm the rest, one at a time or in bulk. Only confirmed drafts become real transactions. The app should notice when a line looks like something already recorded so we don't count it twice. It should start with the statements we actually receive and add others as we need them.

### Debts

A way to keep track of what we owe and what's owed within the household, without letting it distort everything else.

External debts are money owed outside the household: a car loan, a housing loan, a personal loan, a credit card balance being paid down. For each one I want to see the original amount, what's been paid, and what's left. When I record a payment as an ordinary expense, I can link it to the debt so the debt's progress updates on its own. Linking is optional, so a debt can also be tracked loosely.

Internal debts are borrowing within the household: one account borrowing from another, one budget category borrowing from another, or one person borrowing from another person or from the household. These are easy to forget and awkward to bring up, so having them written down helps.

Debt tracking is for visibility only. It doesn't change balances, budgets, or reports beyond the ordinary transactions that already exist. A debt's remaining balance always comes from its payment history, never from a number someone edited. A paid-off debt is marked paid off on its own. Overpaying is allowed but called out. A payment recorded by mistake is reversed with a visible correction, not deleted. If the transaction a payment came from is later deleted, the payment history stays intact and makes sense.

### Knowing what's synced

Because the app works offline, people need to trust it when it's offline. I want a calm, clear signal of whether this device is online, whether there are changes still waiting to go out, and whether anything got stuck. When something is stuck, I want to see what it is and either retry it or let it go, deliberately. Coming back online should feel reassuring, not mysterious.

### Taking data out

From settings, anyone should be able to export our data, transactions as a spreadsheet-friendly file or everything as a complete copy. That's our insurance, our tax-time helper, and our guarantee that we're never locked in.

### Feeling at home on every screen

It should install straight from the browser onto a phone's home screen or a computer's desktop, with no app store in between, and feel like an app, not a website. It opens instantly from its icon, works without a connection from the first launch after installing, and updates itself without anyone reinstalling anything. It should be comfortable one-handed on a small phone and use the room on a wide monitor instead of leaving a narrow column in a sea of white. It should support light and dark appearance, follow the device's setting by default, and let people choose. It should be usable by keyboard and screen reader, and colour should never be the only way something is communicated.

## What it is not

It is not connected to banks. There's no automatic pulling of transactions from accounts. Philippine banks don't offer it in a way I'd trust, and a hand-reviewed statement import gets most of the benefit with none of the risk.

It does not move money, pay bills, or hold anything of value. It is a record.

It is not envelope budgeting in the budget sense. Categories hold real money that carries from month to month, but a budget is only a monthly target for comparison: it never carries forward and never gets spent down.

It is not multi-currency. Everything is in Philippine pesos. If we travel and spend in another currency, we record the peso amount that actually left the account.

It is not bookkeeping software, and it doesn't expect anyone to know bookkeeping. Nobody has to understand debits and credits or learn accounting terms. Every entry is simply money coming in or going out, and the app works out the rest. It doesn't prepare taxes or produce formal financial statements. It should talk the way a household talks about money, not the way an accountant does.

It is not a social or advice product. No tips, no nudges toward financial products, no ads, no "insights" designed to keep people opening it.

## Limitations I'm accepting

Some of these are trade-offs I'm choosing on purpose. Others are just the reality of building this myself, for free, in my own time.

**When two people edit the very same entry at the same time, the later edit wins.** That's simple and predictable, and in a household it's rare. A smarter, field-by-field merge would be nicer, but it isn't worth the complexity for the first version. What I won't accept is losing a new entry. Two people adding different things at the same time must always both survive.

**Offline on iPhones is more limited than on other devices.** iPhones restrict what a web app can do in the background, so an iPhone may only catch up when the app is opened. It still works offline, but it may need a moment, or a nudge, to sync when reopened.

**Changes reach other devices "soon", not instantly.** I'd rather keep the app cheap to run than give it a live connection for every device. Other devices pick up changes when they open the app or check in, and that's good enough for a household.

**Statement import starts narrow.** It will read the statements we actually receive first. Each new bank or statement format is its own small project, added as needed.

**Each device has limited storage.** Phones don't give web apps unlimited space. The app should be careful about how much it keeps and warn before it runs out, not fail silently.

**Logging out is a decision, not a reflex.** Since data lives on the device, signing out may mean removing it. If there are changes on the device that haven't reached the shared copy yet, the app should say so and offer to export them first rather than silently discard them.

**Running on free tiers means living within limits.** Storage, bandwidth, and background work all have ceilings. Features that would blow through them, like keeping large attachments forever, wait until there's a sensible way to do them.

**It's built by one person.** Things will be phased. Some ideas below will wait a long time. I'd rather ship a small thing that's trustworthy than a large thing that isn't.

## Later, not now

These belong to the idea, but not to the first version.

- Recurring transactions, so monthly bills appear on their own and can be skipped or adjusted.
- Notifications for things that matter, like a budget nearing its target or a bill coming due, delivered to installed devices.
- Automatic, encrypted backups of the whole household's data, kept somewhere separate from the main copy.
- Proper reconciliation against a statement's ending balance, with a clear report of anything that doesn't match.
- Receipts and documents attached to transactions, kept private.
- Smarter handling of two people editing the same entry, merging their changes field by field instead of choosing one.
- Splitting shared expenses between household members, building on tagging who an expense was for.
- Beyond money altogether: a home for important documents and insurance policies, home maintenance schedules and warranties, and an inventory of what we own. Money comes first, and these come only once it's solid.

## How I'll know it worked

We stop opening the spreadsheet.

Expenses get recorded when they happen, not reconstructed at month end. Someone in a dead zone records a purchase and later finds it on everyone else's phone without having thought about it.

At the end of the month, reviewing where the money went and setting next month's targets takes minutes, not an evening. When the app shows a total, nobody reaches for a calculator. When something looks off, the history explains why.

Nothing we record is ever lost. Not to a dropped connection, not to a dead phone, not to two people editing at once.

And it still costs us nothing to keep running.
