# Skills

One folder per skill. Each folder contains a `SKILL.md` and, optionally,
`references/`, `scripts/` and `assets/`.

Start from `../templates/SKILL.md`. The contract every skill must satisfy is
documented in `../CLAUDE.md`.

| Skill | Description |
|-------|-------------|
| [`mobile-ux-qa`](mobile-ux-qa/) | Mobile-first UX audit across a device matrix in both orientations, including the foldable iPhone Duo. Measures what is measurable, screenshots the rest, reports what is broken. |
| [`iphone-duo-qa`](iphone-duo-qa/) | iPhone Duo only: four postures plus fold, unfold and rotate transitions without a reload. Reuses the `mobile-ux-qa` rules and report renderer. |
