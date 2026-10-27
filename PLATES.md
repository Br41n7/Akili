# Base plates (anatomy and other figures)

Plates are downloaded once on a developer's computer and committed. Vercel never downloads anything.

1. `node scripts/plates.mjs search "Gray's Anatomy back muscles"` lists Commons files. `OK` = licence allowed, `NO` = refused.
2. Add the chosen file to `picks` in `data/plates/plates.json`: `{ "id": "back-muscles-superficial", "discipline": "anatomy", "topic": "Superficial back muscles", "title": "File:<exact name>" }`
3. `node scripts/plates.mjs fetch` downloads to `public/plates/` (1200 px wide), reads the licence and author from Commons, and writes the credit line.
4. Check every credit. Add `labels` (x and y are fractions of the image). New labels start `reviewed: false`; set `true` only after checking the point on the image.

Licence rules (`lib/plate-licence.mjs`): public domain, CC0 and CC BY are allowed. CC BY-SA needs `--share-alike` and a deliberate decision. NonCommercial, NoDerivatives and unknown licences are always refused. Never use images from social media.

`validateManifest` (in `lib/plates.ts`) rejects plates with a missing credit, a disallowed licence, a file outside `/plates/`, or coordinates outside 0-1. Only plates whose labels are all reviewed count as verified.

Not yet verified: the script has not been run against the live Commons API (this workspace cannot reach it). Run `search` first and confirm the output looks right.
