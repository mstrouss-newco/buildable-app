# AUTOPILOT.md — working the roadmap when Mike is not watching

Read this **in addition to** `AGENTS.md` and the README when the session prompt says
**autopilot**, when the session was started by `scripts/autopilot.mjs`, or when it was
started by a schedule rather than by Mike typing.

Everything in the **Guardrails** section of `AGENTS.md` still applies, without exception.
This file only changes *how decisions get made when nobody is there to answer a question.*

---

## The one rule

**Decide and log. Never stall.**

Mike's words: *"I rarely disagree with Claude's recommended approach, so would hate if you
asked me a question and I can't get to it, so it just stalls out."*

A question left hanging at 2am burns the entire window he was trying to buy. He would
rather undo one wrong call than lose four hours to a blinking cursor. So when the path is
ambiguous, pick the best option, write down what you picked and what you passed on, and
keep moving.

This overrides two rules that are correct when he IS watching and wrong when he is not:

| Normal rule | In autopilot |
|---|---|
| `AGENTS.md`: "state your approach and wait for an OK" | State the approach **in the report** and proceed. |
| roadmap: "chat sessions decide, Cowork sessions execute" | This session does both. |

Note what is **not** overridden: "do ONLY the card you were given, never start the next."
That rule is now load-bearing. One card is one session (see below), and the runner starts
the next one. A session that runs ahead into card two breaks the chain's safety gate.

---

## One card, one session

`scripts/autopilot.mjs` works cards one at a time, each in a **brand new** Claude Code
session (`claude -p`), and the planner is the handoff between them.

```
runner: ask the planner for the next open card
      → build the prompt from that card
      → start a FRESH session with it
      → session builds, QAs, pushes, ticks the card, exits
      → runner re-reads the planner: is that card actually done?
          yes → next card        no → STOP and tell Mike
```

Why fresh sessions rather than one long one: a session that has been going for hours
carries everything it has ever read into every single reply, so card four costs several
times card one. A fresh session starts empty. The cost is re-reading `AGENTS.md` and the
repo each time, roughly 15-30k tokens, so this is a win from about the third card on.

**The verification gate is the planner, not your own summary.** The runner believes
`state === "done"` on the card and nothing else. Which means:

> **Never tick a card done to keep the chain moving.** If the work is half-finished, use
> `review` and say why in a note. The chain stopping is the correct outcome. A false green
> here quietly poisons every card built on top of it.

Default ceiling is **four cards** per run (`--max`). Keep it there until this has a few
clean runs behind it.

---

## What makes that safe

1. **One commit per card.** So a single bad card can be dropped without losing the good
   ones either side of it. Never bundle two cards into one commit.
2. **QA before the card is ticked.** Any card touching a game ends by running that game's
   `qa-{game}.mjs`. No script exists? Write one, or use `review` rather than `done` and say
   plainly that the card shipped unverified. Never claim QA passed if it did not run.
3. **Two strikes and revert.** If a card fails QA twice, `git revert` its commit, leave the
   card open with a note explaining what beat you, and exit non-zero. Never leave `main`
   broken for the next card to build on top of.
4. **Live check before `deployed`.** `done` means pushed and QA green. `deployed` means you
   have actually looked at the live site. They are not the same flag; do not set the second
   on the strength of the first.
5. **Claim your area in `WORKING.md`** before starting, and clear it at the end. Another
   session may be live at the same time.

---

## Calls autopilot makes on its own

Wording, layout, spacing, naming, which shared helper to reuse, how to phase a big card,
which existing pattern to copy, what to do when the card is vague about a detail. Pick the
option most consistent with what already ships, and log it.

## Calls autopilot must not make alone

These do not become a stall — **build the recommended version anyway**, keep it behind the
existing "coming soon" gate, mark the card `review` rather than `done`, and flag it at the
top of the report so Mike sees it first:

- Anything the roadmap card does not actually cover (scope creep)
- Removing or disabling a feature that currently works
- Art direction that cannot be checked against `GAME-LOOK.md` or the brand guide
- Prices, coin economy changes, anything involving money
- Kid-facing copy about safety, accounts, or sharing

And these are hard stops, prepared as a file for Mike to run and never executed
(this is `AGENTS.md` guardrails, restated because autopilot is when they matter most):
secrets and keys, destructive SQL, publishing to the public gallery, buying anything.

---

## What a card needs to be autopilot-ready

Most roadmap cards already qualify. A card is ready when it names:

- **The goal** in one sentence
- **Where it lives** (a file, a screen, or a route)
- **Done looks like** something checkable without Mike, ideally a QA script assertion

A card missing all three gets **left open, not guessed at**. Add a note saying exactly what
it would need, exit without ticking it, and let the chain stop. Skipping a vague card is
not stalling; it is the one case where guessing costs more than waiting.

---

## The report

`AUTOPILOT-REPORT.md` at the repo root, plain language, no jargon. Mike is non-technical —
the recap is for him, not for the next agent. Prepend each run; do not overwrite, so a
chain of sessions reads as one story.

```markdown
## Autopilot — <date> — card <id>

**Needs you first:** <anything flagged, or "nothing">

**What got built:** one plain sentence. QA: passed / not run / no script.

**Calls I made for you:** I went with X. The other option was Y. Change it by <one line>.
```

Also append the usual dated entries to `SESSION-LOG.md` and the README log, per `AGENTS.md`,
and leave a one-line note on the card itself with `node scripts/planner.mjs note <id> "..."`.

---

## Superseded

Two rules from the July version of this file no longer apply:

- *"Branch, never main."* Mike's standing rule is merge to main and QA the live deploy. The
  chain works on `main`, one commit per card.
- *"Do not tick roadmap checkboxes."* Ticking the card is now the mechanism the runner uses
  to decide whether to continue. See the gate above.
