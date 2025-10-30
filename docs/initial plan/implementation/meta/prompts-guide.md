# Prompts Guide for Claude Code

> **Purpose**: Effective prompts to use in Claude Code conversations for working with the chunked implementation docs.

## Table of Contents

- [Starting a New Session](#starting-a-new-session)
- [Working on Chunks](#working-on-chunks)
- [Getting Help](#getting-help)
- [Tracking Progress](#tracking-progress)
- [Understanding Architecture](#understanding-architecture)
- [Debugging & Troubleshooting](#debugging--troubleshooting)
- [Advanced Prompts](#advanced-prompts)

---

## Starting a New Session

### First Time Setup

```
I'm starting the Household Hub project using the chunked implementation approach.
Show me what chunks I should complete for Milestone 1 (Foundation).
```

### Returning After a Break

```
I last completed chunk [number/name]. What's the next chunk I should work on?
Show me the checkpoint from my last chunk to verify everything still works.
```

### Quick Status Check

```
Check my progress-tracker.md and tell me:
1. What milestone am I on?
2. What's the next chunk?
3. How many hours remain to complete this milestone?
```

---

## Working on Chunks

### Implementing a Specific Chunk

**Basic Implementation**

```
Implement chunk [number]-[name] following the instructions.md.
Show me each step and pause at the checkpoint.
```

**With Context from Original Docs**

```
Implement chunk 006-currency-system. Reference the currency specification
from DATABASE.md lines 1005-1160 and create the utilities with tests.
```

**See Code First**

```
Show me the code samples from chunk 008-transactions-schema before we implement it.
I want to understand the structure first.
```

### Running Checkpoints

```
Run the checkpoint for chunk [number]. Verify all tests pass and show me
what the output should look like.
```

### Handling Failures

```
The checkpoint for chunk [number] failed at step [X].
Check the troubleshooting section and help me debug.
```

---

## Getting Help

### Understanding a Chunk

```
Explain what chunk [number]-[name] does and why it's important for the overall system.
Reference the relevant decisions from DECISIONS.md.
```

### Before Starting

```
Before I start chunk [number], what prerequisites need to be complete?
Check the dependency-map.md.
```

### Skipping Chunks

```
I want to skip chunks related to [feature].
Which chunks can I safely skip and which are dependencies for later milestones?
```

**Example:**

```
I want to skip offline support for now. Which chunks can I skip?
Will this break anything in Milestone 2 (MVP)?
```

### Alternative Approaches

```
The instructions for chunk [number] suggest [approach].
Are there simpler alternatives that still meet the requirements?
```

---

## Tracking Progress

### Update Progress After Work

```
I completed chunks 001 through 005. Update my progress-tracker.md
and show me my milestone progress percentage.
```

### Time Estimates

```
I have 3 hours to work today. Which chunks can I complete in that time?
Show me options that fit within my available time.
```

### Milestone Completion Check

```
Check if I've completed all required chunks for Milestone [number].
Show me any remaining items and estimated time to finish.
```

---

## Understanding Architecture

### Big Picture Context

```
I'm working on chunk [number] about [topic]. Explain how this fits into
the overall offline-first architecture described in ARCHITECTURE.md.
```

### Decision Rationale

```
Why did we choose [technical decision] for chunk [number]?
Reference the relevant decision from DECISIONS.md.
```

### Database Schema Questions

```
I need to understand the [table name] schema for chunk [number].
Show me the schema from DATABASE.md and explain the key fields.
```

### Sync Engine Deep Dive

```
Explain how [sync concept] works in the context of chunk [number].
Reference SYNC-ENGINE.md sections on [topic].
```

---

## Debugging & Troubleshooting

### General Troubleshooting

```
I'm getting [error] in chunk [number].
Check the troubleshooting-guide.md and help me resolve it.
```

### Checkpoint Failures

```
The checkpoint for chunk [number] shows [failure]. Walk me through
debugging this step by step.
```

### Environment Issues

```
My [tool/dependency] isn't working. What does chunk 001-project-setup
say about configuring [tool]?
```

### Test Failures

```
Tests are failing for chunk [number]. Show me the expected test output
from the checkpoint and help me identify what's wrong.
```

### Rollback

```
I need to rollback chunk [number]. Show me the rollback.md instructions
and help me undo the changes safely.
```

---

## Advanced Prompts

### Cross-Referencing Documentation

```
I'm implementing chunk [number] which references DATABASE.md lines [X-Y]
and DECISIONS.md #[Z]. Show me all relevant sections and create the implementation.
```

### Optimizing Implementation

```
Review my implementation of chunk [number]. Are there optimizations suggested
in the original docs that I should apply?
```

### Creating Custom Chunks

```
I want to add [custom feature] that isn't in the original plan.
Create a new chunk document following the template in templates/chunk-template.md.
```

### Batch Operations

```
Implement chunks [A] through [B] in sequence. After each chunk, run the checkpoint
and show me a summary. Stop if any checkpoint fails.
```

### Documentation Generation

```
I've completed chunks [list]. Generate a summary document showing:
1. What was built
2. Key decisions made
3. What's working now
4. Next recommended chunks
```

---

## Template Prompts

### Morning Standup Format

```
Morning standup for Household Hub:
- Last session: Completed chunks [list]
- Today's goal: Complete [milestone/chunks]
- Available time: [X hours]
- Blockers: [none/list any]

Show me which chunks to tackle today and time estimates.
```

### End of Session Summary

```
Session complete. I finished chunks [list].
Generate an end-of-session summary:
1. What's now working (checkpoint summaries)
2. Progress toward current milestone
3. Recommended next session goals
4. Any warnings or notes for next time
```

### Code Review

```
Review the code I wrote for chunk [number]. Compare it to the
code-samples/ in the chunk folder. What's different and does it still meet requirements?
```

---

## Prompts by Skill Level

### Beginner (Want Maximum Guidance)

```
I'm new to [React/TypeScript/Supabase]. Walk me through chunk [number]
with detailed explanations of every step. Explain why we're doing each part.
```

### Intermediate (Want Efficiency)

```
Show me the code-samples for chunk [number]. I'll implement it myself,
just run the checkpoint when I'm done to verify.
```

### Advanced (Want Context Only)

```
I'm implementing chunk [number]. Just show me the relevant sections from
the original docs (DATABASE.md, DECISIONS.md, etc.). I'll code it myself.
```

---

## Prompts for Specific Situations

### Working on Weekend Project

```
I have this weekend (16 hours total) to work on Household Hub.
Create a realistic 2-day plan showing which chunks to complete each day,
with breaks factored in.
```

### Inherited Codebase

```
Someone else completed chunks 001-010. I'm taking over at chunk 011.
Run all checkpoints for chunks 001-010 to verify the foundation is solid,
then show me what I need to know to start chunk 011.
```

### Different Tech Stack

```
I want to implement chunk [number] but using [different library] instead
of [suggested library]. Is this viable? What changes to the chunk instructions
would be needed?
```

### Production Debugging

```
The app is deployed but [issue] is happening. Which chunk covers [feature]
and what does the troubleshooting guide say about this symptom?
```

---

## Quick Reference Card

Keep this handy for fast access:

| Need              | Prompt                                         |
| ----------------- | ---------------------------------------------- |
| Start new session | "Check progress-tracker.md, show next chunk"   |
| Implement chunk   | "Implement chunk [N], run checkpoint"          |
| Debug failure     | "Checkpoint failed at step [X], help debug"    |
| Understand why    | "Explain why chunk [N] uses [approach]"        |
| Skip feature      | "What chunks can I skip for [feature]?"        |
| Update progress   | "I completed chunks [A-B], update tracker"     |
| Get time estimate | "How long to complete [milestone/chunk]?"      |
| Find reference    | "Where in original docs is [topic] explained?" |
| Rollback          | "Show rollback steps for chunk [N]"            |
| Next steps        | "What should I do after chunk [N]?"            |

---

## Pro Tips

### 1. Be Specific with Chunk Numbers

❌ "Help me with auth"
✅ "Help me with chunk 002-auth-flow"

### 2. Reference Original Docs When Needed

❌ "How does sync work?"
✅ "Explain vector clocks for chunk 031, reference SYNC-ENGINE.md"

### 3. Ask for Checkpoints

Always include "run checkpoint" or "verify with checkpoint" in implementation prompts.

### 4. Use Progress Tracker

Start sessions with "Check progress-tracker.md" to avoid losing your place.

### 5. Combine Context

```
Implement chunk [N] using:
- Schema from DATABASE.md lines [X-Y]
- Decision rationale from DECISIONS.md #[Z]
- Code samples from chunk folder
Then run checkpoint and update progress tracker.
```

---

## Example Session Flow

Here's a complete session using effective prompts:

```
1. "Check progress-tracker.md, show next chunk"
   → Claude: "You're on chunk 008-transactions-schema"

2. "Show me the code samples for chunk 008 first"
   → Claude: [Shows SQL schema files]

3. "Implement chunk 008 following instructions.md, pause at checkpoint"
   → Claude: [Implements, runs migration, runs tests]

4. "Checkpoint passed. Update progress-tracker.md, mark chunk 008 complete"
   → Claude: [Updates tracker, shows milestone progress]

5. "What's next? I have 1 hour left today"
   → Claude: "Chunk 009 (1.5hr) won't fit. Chunk 007 (45min) would work if you skipped it earlier"

6. "End session summary: completed chunk 008, next session do chunk 009"
   → Claude: [Generates summary with what's working now]
```

---

## Common Pitfalls to Avoid

### ❌ Vague Requests

"Make the app work" → Too broad

### ❌ Skipping Checkpoints

Implementing multiple chunks without verifying each → Hard to debug later

### ❌ Not Tracking Progress

Losing track of what's done → Wasted time re-implementing

### ❌ Ignoring Dependencies

Starting chunk 020 before chunk 019 → Will fail dependency checks

### ✅ Instead, Use Structured Prompts

Follow the templates above for clarity and efficiency.

---

## Getting Started Right Now

Copy this prompt to start your next session:

```
I'm working on Household Hub using docs/implementation/.

1. Check my progress-tracker.md - what's my current status?
2. What's the next chunk I should work on?
3. Show me the README.md for that chunk
4. Let's implement it step by step with checkpoints

I have [X hours] available today.
```

---

**Questions about prompts?**

Ask Claude Code:

```
"Explain the prompts-guide.md structure"
"Give me example prompts for [situation]"
"What's the best prompt for [task]?"
```

---

Generated: 2025-01-15
For use with: Household Hub Chunked Implementation Docs
