# Changelog

All notable changes to this project are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The [autonomous daily loop](./docs/autonomous-loop.md) adds an entry under
`[Unreleased]` for every change it merges.

## [Unreleased]

### Fixed

- A container's terminal (App bottle, Mini OS) no longer leaks raw escape-
  sequence characters into its output. The ANSI CSI parser treated the `[`
  introducer byte as if it could also be the sequence's final byte, so any
  multi-byte CSI command (clear screen, erase line, cursor visibility, …) was
  cut short after two bytes and the rest printed as literal text.

### Changed

- The agent tier's egress now really happens: an allowed `/egress` call
  performs the fetch and returns its real HTTP status (or the CORS/network
  failure), instead of returning only the policy's allow/deny verdict. A
  denied call is never attempted.

### Added

- A unit test suite on Vitest, covering the policy engine, the container
  factory, and the agent, OS image, and config catalogs. Run it with `npm test`.
- A `CI` workflow that runs the typecheck, the lint, the tests, the server
  build, and the static export build on every pull request.
- `scripts/check-static-export.sh`, which fails the build when a static export
  loses its runtime assets or its base path. That failure used to appear only
  in the browser, as a container that never booted.
- An `Auto-merge` workflow that squashes a pull request into `main` when CI
  passes and the pull request carries the `automated` label.
- A `CodeQL` workflow for static security analysis.
- Dependabot updates for npm packages and for GitHub Actions.
- `docs/autonomous-loop.md`, the specification for the daily self-improvement
  loop, and `docs/loop-log.md`, its record.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CHANGELOG.md`,
  issue templates, a pull request template, and `CODEOWNERS`.

[Unreleased]: https://github.com/reagent-systems/clientside-containers/commits/main
