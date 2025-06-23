# NPM Versions Tracker

Automated tracking of npm download statistics for MUI packages.

## Overview

This repository automatically collects and stores weekly download statistics for MUI packages using the npm registry API. Data is stored in a space-efficient format suitable for browser consumption.

## How it works

- **Automated Collection**: GitHub Actions runs weekly (Sundays at 00:00 UTC) to collect download stats
- **Data Storage**: Statistics are stored in JSON files in the `data/` directory
- **Historical Tracking**: Maintains version-specific download counts over time with timestamps

## Data Format

Each package has its own JSON file in `data/` containing:

```json
{
  "package": "@mui/material",
  "timestamps": [1703030400000, 1703635200000],
  "downloads": {
    "5.14.0": [150000, 160000],
    "5.13.7": [120000, 110000]
  }
}
```

## Manual Usage

Install dependencies:
```bash
pnpm install
```

Collect statistics manually:
```bash
pnpm collect-stats
```

## Tracked Packages

The script tracks all major MUI packages including:
- Core packages (`@mui/material`, `@mui/system`, etc.)
- X components (`@mui/x-data-grid`, `@mui/x-date-pickers`, etc.)
- Base UI (`@base-ui-components/react`)

See `collect-stats.ts` for the complete list.

