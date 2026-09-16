# Contributing

## Ground rules

- **English only.** Every committed file, comment and commit message is in
  English, regardless of the language we discuss the work in.
- **Public by default.** Assume anything you push is read by people outside the
  company. No secrets, tokens, credentials, client names or customer data.
- **One job per skill.** If a skill needs an "also, it does X" section, X is a
  separate skill.

## Adding a skill

1. Pick a lowercase kebab-case name. The folder name and the `name` field in the
   frontmatter must match.
2. Copy the template:
   ```bash
   mkdir -p skills/<skill-name>
   cp templates/SKILL.md skills/<skill-name>/SKILL.md
   ```
3. Fill in the frontmatter. The `description` is the only thing an agent reads
   before deciding to load the skill — write it in the third person, say when it
   applies, and list the phrases that should trigger it.
4. Write the body as instructions to an agent: imperative, step by step, with a
   worked example and a failure-modes table.
5. Add supporting material only if it earns its place:
   - `references/` — depth the agent opens on demand.
   - `scripts/` — executables. Portable, documented in `SKILL.md`, no undeclared
     network calls.
   - `assets/` — templates, fixtures, images.
6. Add a row to the table in [`skills/README.md`](skills/README.md).

## Testing

Symlink the skill into `~/.claude/skills/`, start a fresh session, and give the
agent a task that should trigger it. Confirm that:

- the skill loads without being named explicitly;
- the steps are followable with no prior knowledge of the repo;
- every path, command and script in it actually works.

## Pull requests

- Conventional Commits, imperative mood: `feat(skill-name): add <what>`.
- One skill per PR where practical.
- In the description, say what you tested the skill against and what you
  deliberately left out of scope.
