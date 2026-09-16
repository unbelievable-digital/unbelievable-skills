# Unbelievable Skills

Public collection of [Claude Code](https://claude.com/claude-code) Skills maintained by
**Unbelievable Digital**.

A Skill is a folder of instructions that teaches an agent how to do one job
well — a repeatable workflow, a house style, a tool we use every day. Skills are
plain Markdown with optional reference docs and helper scripts. No build step, no
dependencies.

## Install

Clone the repo and symlink the skills you want into your Claude Code skills
directory:

```bash
git clone https://github.com/unbelievable-digital/unbelievable-skills.git
cd unbelievable-skills

# All skills, for your user
ln -s "$PWD"/skills/* ~/.claude/skills/

# Or a single skill, scoped to one project
ln -s "$PWD"/skills/<skill-name> /path/to/project/.claude/skills/<skill-name>
```

Restart Claude Code (or start a new session) and the skills become available.

## Catalog

See [`skills/`](skills/) for the full list.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [CLAUDE.md](CLAUDE.md) first.

Short version:

1. Copy [`templates/SKILL.md`](templates/SKILL.md) to `skills/<skill-name>/SKILL.md`.
2. Write the `description` first — it must say *when* to use the skill.
3. Keep one job per skill, keep `SKILL.md` under ~500 lines, push depth into
   `references/`.
4. Test it in a real session, then open a PR saying what you tested.

Everything committed here is in English, and everything here is public — never
commit secrets or client data.

## License

[MIT](LICENSE)
