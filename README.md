# Unbelievable Skills

Public collection of [Claude Code](https://claude.com/claude-code) skills maintained by
**Unbelievable Digital**.

A skill is a folder of instructions that teaches Claude how to do one job
well — a repeatable workflow, a house standard, a tool the team uses every day.
Skills are plain Markdown with optional reference docs and helper scripts. No
build step, no dependencies to install for the repo itself.

## Catalog

| Skill | What it does |
|-------|--------------|
| [`mobile-ux-qa`](skills/mobile-ux-qa/) | Mobile-first UX audit across a device matrix in both orientations, including the foldable iPhone Duo. Drives Playwright, measures what is measurable, screenshots the rest, and reports what is broken — as Markdown or a shareable HTML report with inline screenshots. |

---

## Install

### Option 1 — as a plugin (recommended)

One command to add the repository as a marketplace, one to install it. Claude
picks up every skill in the collection and future ones arrive with an update.

```bash
claude plugin marketplace add unbelievable-digital/unbelievable-skills
claude plugin install unbelievable-skills@unbelievable
```

Restart Claude Code, or start a new session, and the skills are available.

Check what landed:

```bash
claude plugin list
claude plugin details unbelievable-skills
```

Update later:

```bash
claude plugin update unbelievable-skills
```

Remove:

```bash
claude plugin uninstall unbelievable-skills
claude plugin marketplace remove unbelievable
```

### Option 2 — symlink into your personal skills directory

Useful when you want to edit a skill and see the change immediately, because the
symlink points at your working copy.

```bash
git clone https://github.com/unbelievable-digital/unbelievable-skills.git
cd unbelievable-skills

# Every skill
ln -s "$PWD"/skills/* ~/.claude/skills/

# Or just one
ln -s "$PWD/skills/mobile-ux-qa" ~/.claude/skills/mobile-ux-qa
```

### Option 3 — scoped to a single project

Commit the skill alongside the project so everyone working in that repository
gets it, and nobody outside it does.

```bash
mkdir -p /path/to/project/.claude/skills
cp -r skills/mobile-ux-qa /path/to/project/.claude/skills/
```

### Option 4 — try it without installing anything

```bash
claude --plugin-dir /path/to/unbelievable-skills
```

The skills exist for that session only.

---

## Using a skill in Claude

**Just describe the task.** Every skill declares in its frontmatter when it
applies, and Claude loads it on its own when the work matches. For the mobile QA
skill, any of these pull it in:

> check this site on mobile
> run a mobile UX audit on localhost:3000
> is the checkout broken on phones?
> mobile-first QA before we ship

**Or call it by name.** Type a slash followed by the skill name:

```
/mobile-ux-qa
```

**Confirm it loaded.** Claude announces which skill it is using before it starts.
If nothing loads when you expected it to, the skill's `description` is not
matching the way you phrased the request — that is a bug in the skill, and worth
an issue.

---

## Repository layout

```
skills/
  <skill-name>/
    SKILL.md            # required — frontmatter plus instructions
    references/         # optional — depth loaded on demand
    scripts/            # optional — executable helpers
    assets/             # optional — templates and fixtures
templates/
  SKILL.md              # starting point for a new skill
.claude-plugin/
  marketplace.json      # makes this repo installable as a plugin
  plugin.json
```

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [CLAUDE.md](CLAUDE.md) first.

Short version:

1. Copy [`templates/SKILL.md`](templates/SKILL.md) to `skills/<skill-name>/SKILL.md`.
2. Write the `description` first — it decides whether the skill ever loads.
3. One job per skill. Keep `SKILL.md` under ~500 lines and push depth into
   `references/`.
4. Test it in a real session, then open a PR saying what you tested it against.

Everything committed here is in English, and everything here is public — never
commit secrets or client data.

## License

[MIT](LICENSE)
