# Changelog

All notable changes to this project will be documented in this file. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/).

Per-version release notes for tagged releases are published on the [GitHub Releases page](https://github.com/WYRE-AI/alertops-mcp/releases) - `semantic-release` generates them from commit history at release time.

## [Unreleased]

### Added

- Initial v1 release: 11 read-only tools covering alerts (list, and AlertID lookup by inbound message ID/unique inbound ID), users (list, and contact methods), groups, message topics, configured inbound integrations, and on-call schedules (who's on-call now, and per-user/per-group schedule for a date range). Static account-level API key authentication, sent as the `APIKey` query parameter (AlertOps' documented auth shape, verified live against `api.alertops.com`). See README's Scope section for the full list of deliberately excluded alert-mutating, paging, and provisioning endpoints.
