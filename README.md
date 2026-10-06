# Public 1.0 baseline snapshot

This branch stores a frozen copy for the transition from 1.0.x to 1.1.

- `repository/formal/` is the full Gitee `main` source at `607ca986944e222b935c46c4e13ebf7d892973cf`.
- `repository/test/` is the full Gitee `preview` source at `2e6cc5b62f2c779b90afc418fb21bd410f959743`.
- `repository/build-formal/` and `repository/build-test/` are local PC builds from those exact source refs. They were built for comparison and backup; they were not deployed.
- `online/formal/` contains the live homepage, formal PC and H5 resource closures. `online/test/` contains the preview PC and H5 resource closures. Each has a manifest with HTTP status and SHA-256; 329 HTTP 200 files were re-read with no missing files or hash mismatches.
- `online/formal/cloudfunctions/` contains source files downloaded from the 88 functions in CloudBase `cloud1-7g8ckb3c7815a011`. `node_modules` is excluded here; the local backup keeps full downloaded packages and their runtime dependencies.
- Function environment variable values and database contents are not included.

The currently served PC bundles differ from the local builds. Of 88 deployed CloudBase function entry files, 56 match Gitee `main` byte for byte, 27 differ, and 5 have no corresponding entry file in the repository. See `online/formal/cloudfunctions/online-vs-repo-index-hashes.json` for the comparison. The snapshots keep online and repository code in separate paths so this branch does not imply that they are identical.

The repository labels its mini-program source `1.0.34` (development / development-experience). The WeChat Developer Tools CLI is upload-only for code packages; it cannot download the exact platform release or experience package. This snapshot therefore preserves the available repository source and records that platform-package limit in `metadata`.

`online/test` is a frontend preview. Per the project release workflow, its backend calls the football production CloudBase environment; it is not an isolated test backend.

Backup branch: `backup/pre-1.1-20261006`. This branch is a source snapshot and does not change `main`, `preview`, or deployment state.


Credential literals in three online CloudBase source files are replaced with environment variable reads in this public snapshot. The local backup keeps the exact downloaded code; see metadata/redacted-credentials.md.

