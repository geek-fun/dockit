# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.9.4] - 2026-04-14

### Added

- Add sort and filter to connections list with ascending/descending direction toggle (#360)
- Add progress bar with percentage indicator during update download and install (#360)

### Fixed

- Fix keyboard shortcuts not working on Windows (#359)

### Changed

- Gate release pipeline on version bump to prevent spurious CI runs

## [0.9.3] - 2026-04-08

### Fixed

- Fix keyboard shortcuts not working on Windows (#356)

### Changed

- Modernize release pipeline and updater mechanism (#354)

## [0.9.2] - 2026-04-04

### Added

- Enable shortcut dialog to allow user view all available shortcuts (#351)

### Fixed

- Fix Windows about menu (#350)
- Fix the latest.json collect issues
- Fix auto updater required json file not upload issue (#346)

### Security

- Security upgrade lodash from 4.17.23 to 4.18.1 (#353)

## [0.9.1] - 2026-03-28

### Added

- Add API Key authentication for Elasticsearch connections (#343)

### Fixed

- Auto completion issue fix (#345)

## [0.9.0] - 2026-03-20

### Added

- Implement query history (#328)
- Add PartiQL document formatting provider (#327)
- Enable DynamoDB Local support via optional endpoint URL (#326)

### Changed

- Migrate UI from Naive UI to shadcn-vue + UnoCSS (#323)
- Migrate update mechanism to official Tauri updater plugin (#341)

### Fixed

- Post migration issues (#338)
- Fix loadHttpClient not pass required credentials (#310)

### Security

- Security upgrade markdown-it from 14.1.0 to 14.1.1 (#322)
