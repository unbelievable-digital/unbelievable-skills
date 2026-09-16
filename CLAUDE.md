# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this repo is

A public collection of Claude Code **Skills** maintained by Unbelievable Digital.
Each skill is a self-contained folder under `skills/` that teaches an agent how to
perform one job well. Nothing here is application code — it is instructions,
reference material and optional helper scripts.

## Language policy

**All repository content is written in English.** This includes skill bodies,
README files, code comments, commit messages, issue templates and PR
descriptions. Conversations with maintainers may happen in any language, but
nothing in any language other than English gets committed.

## Repository layout

```
skills/
  <skill-name>/
    SKILL.md            # required — frontmatter + instructions
    references/         # optional — docs loaded on demand
    scripts/            # optional — executable helpers
    assets/             # optional — templates, images, fixtures
templates/
  SKILL.md              # starting point for a new skill
```

`<skill-name>` is lowercase kebab-case, matches the `name` in the frontmatter,
and is unique across the repo.

## SKILL.md contract

Every `SKILL.md` starts with YAML frontmatter:

```yaml
---
name: skill-name
description: Use when <situation>. Triggers include "<phrase>", "<phrase>".
---
```

- `name` — lowercase kebab-case, max 64 chars, identical to the folder name.
- `description` — third person, one or two sentences. It is the **only** thing an
  agent sees before deciding to load the skill, so it must state *when to use
  this*, not just what it is. List concrete trigger phrases.

Body rules:

- Write imperative instructions addressed to the agent, not prose about the topic.
- Keep `SKILL.md` under ~500 lines. Push depth into `references/` and link to it.
- Reference files with repo-relative paths so the agent can open them.
- Show a worked example for anything non-obvious.
- Prefer a checklist the agent can follow step by step over a narrative.
- State failure modes explicitly: what to do when a step does not apply.

## Writing or changing a skill

1. Copy `templates/SKILL.md` into `skills/<skill-name>/SKILL.md`.
2. Write the description first — if you cannot name the trigger, the skill is not
   scoped tightly enough.
3. Keep one job per skill. Split rather than adding a second unrelated section.
4. Do not duplicate content across skills; link to the other skill by name.
5. Test the skill in a real session before opening a PR, and say in the PR what
   you tested it against.

## Hard rules

- Never commit secrets, API keys, tokens, customer names, or client data. Skills
  are public the moment they are pushed.
- Never hardcode a local absolute path (`/Users/...`) in a skill.
- Scripts in `scripts/` must be portable: no assumptions about the operating
  system beyond POSIX unless the skill says so, and no network calls that are not
  documented in `SKILL.md`.
- Do not add a dependency or a build step to this repo. It stays plain files.

## Commits

Conventional Commits, English, imperative mood:

```
feat(skill-name): add <what>
fix(skill-name): correct <what>
docs: update contributing guide
```

One skill per commit where practical.
