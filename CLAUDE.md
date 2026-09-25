# Working on the Compliance Matrix Power Pages build

Read this before every task in this repo.

## How Ben deploys

- The site is a Power Pages site on the **enhanced data model**. Every `pac pages` command needs `--modelVersion Enhanced`.
- Node.js is blocked by group policy on Ben's machine. He cannot run `npm install`, `npm run build`, or `npm test`. You build and test; he only deploys what you send.
- He saves the files you send into one flat folder, then runs `deploy-cm.ps1`, which copies each file into the matching record in his downloaded site folder and uploads. The script matches by these exact names:

| Dist file | Site record |
|---|---|
| `cm-matrix.js` | Web file, partial URL `cm-matrix.js` |
| `cm-matrix.css` | Web file, partial URL `cm-matrix.css` |
| `cm-site.js` | Web file, partial URL `cm-site.js` |
| `cm-site.css` | Web file, partial URL `cm-site.css` |
| `compliance-matrix.webtemplate.liquid` | Web template "Compliance Matrix" |
| `site-header.webtemplate.liquid` | Web template "CM Site Header" |
| `site-footer.webtemplate.liquid` | Web template "CM Site Footer" |

## Rules for every change

1. **Never rename a dist file, partial URL, or template name.** The script and the site depend on them. If a change truly needs a new file or record, say so at the top of your reply, because Ben has to create it by hand in Power Pages Management first.
2. **If `cm-matrix.js` or `cm-matrix.css` changed, always send `compliance-matrix.webtemplate.liquid` too.** It carries the `?v=` hash that stops browsers and the site cache serving the old file. The same applies to `cm-site.*` and `site-header.webtemplate.liquid`.
3. **Before replying, run the build and tests and confirm they pass**, including the check that no `<script` text remains inside `cm-matrix.js`.
4. **No em dashes anywhere**: UI text, docs, comments, commit messages.
5. **Avoid absolutes in user-facing copy** (for example "every", "all", "always", "never") unless Ben asks for them.
6. **The Power Apps canvas app and the parity spec are the source of truth** for wording, navigation, and access rules. Do not invent copy. If a request conflicts with them, ask.
7. **Web templates may have been edited on the site.** Before regenerating a template Ben did not ask you to change, ask whether he has edited it, so his edit is not overwritten.
8. **Batch related changes into one build** when Ben sends several tweaks together.

## Reply format after every change

Keep it short and use exactly these four headings:

**What changed**
One line per change: the screen, then the old text and the new text (or a one-sentence description for non-text changes).

**Files to deploy**
Only the files that changed, by exact name, attached for download. Include the template whenever rule 2 applies.

**Manual steps**
Anything the script cannot do: new site settings (name and value), new records, flow changes, permission changes. Write "None" if there are none.

**How to check**
What to look at in `preview.html`, and on the live page after deploying, to confirm the change worked.
