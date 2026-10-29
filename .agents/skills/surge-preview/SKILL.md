---
name: surge-preview
description: Put one rig page on a public surge.sh link for review, upload over it later, and take it down, with the surge CLI through npx. Use for a plan's "Preview for review" and "Clean up" issues (ADR 0003).
---

# surge-preview

A preview is one HTML file on a public HTTPS link (ADR 0003). This is the routine for putting it up,
uploading over it, and taking it down again with surge.sh. Every step has `--help`: read it for the
flags, don't guess them.

Every put, upload-over, discard and teardown is public. Ask the human first: what, where, who can see
it, how to undo it.

## Before

- `npx surge whoami` shows a session. If not, the human runs `npx surge login` (it makes the account
  on first use). Never ask them for the password or a token.
- Pick the domain once per preview: `<name>.surge.sh`. The same domain is the "same link" for the
  clean-up.

## Save the page

Run rig and save the page with a command, never a browser's "save as". The file goes outside the repo
(ADR 0003: no previews in the repo, issues or chat).

```sh
pnpm start                                                     # PORT 8787, banner from .env
curl -sf http://localhost:8787/digest/<night> -o <outside-repo>/page.html
```

Check it is self-contained (no `src=`, `href=`, `<script>`, `<link>`) and that the banner shows what
you expect: the marker for review, "no marker set" for the clean-up (`LANE_MARKER=` unset).

## Put it up

```sh
npx surge <outside-repo>/page.html <name>.surge.sh -m "<what this revision is>"
```

One HTML file is published as the domain's `index.html`. The reply lists three links:

- Production: `<name>.surge.sh` (the one you send)
- Latest: `latest--<name>.surge.sh`
- Revision: `<rev>--<name>.surge.sh` (one per upload)

Check the link: `curl -s https://<name>.surge.sh/` returns 200 and the file you saved.

## Upload over it

The same command with the same domain replaces production. Surge keeps every older upload as a
revision with its own `<rev>--` link, so a marker on an older revision is still public. List them and
remove every revision that carries the marker:

```sh
npx surge <name>.surge.sh revs
npx surge <name>.surge.sh discard <rev>
```

Check each discarded `<rev>--<name>.surge.sh` returns 404 and production shows the new file.

## Take it down

```sh
npx surge <name>.surge.sh teardown
```

Removes the domain and every revision. Check production, `latest--` and each `<rev>--` link return
404.

## Notes

- Claude Code's auto mode may refuse a public upload. Then give the human the exact command to run.
