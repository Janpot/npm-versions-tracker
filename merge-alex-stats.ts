#!/usr/bin/env tsx
/* eslint-disable no-console */

/**
 * Collect per-version npm download statistics for specified packages.
 * This script stores under a size efficient data structure as these files will
 * be loaded directly in the browser.
 */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { setTimeout } from "node:timers/promises";

interface NpmDownloadResponse {
  package: string;
  downloads: Record<string, number>;
}

interface HistoricalData {
  package: string;
  timestamps: number[];
  downloads: Record<string, number[]>;
}

const PACKAGES = [
  "@mui/codemod",
  "@mui/core-downloads-tracker",
  "@mui/icons-material",
  "@mui/lab",
  "@mui/material-nextjs",
  "@mui/material",
  "@mui/material-pigment-css",
  "@mui/private-theming",
  "@mui/styled-engine",
  "@mui/styled-engine-sc",
  "@mui/system",
  "@mui/types",
  "@mui/utils",

  "@mui/x-data-grid",
  "@mui/x-data-grid-generator",
  "@mui/x-data-grid-pro",
  "@mui/x-data-grid-premium",
  "@mui/x-date-pickers",
  "@mui/x-date-pickers-pro",
  "@mui/x-charts",
  "@mui/x-charts-pro",
  "@mui/x-charts-premium",
  "@mui/x-charts-vendor",
  "@mui/x-tree-view",
  "@mui/x-tree-view-pro",
  "@mui/x-license",
  "@mui/x-internals",
  "@mui/x-telemetry",

  "@base-ui-components/react",

  "react",
  "@emotion/react",
];

async function getSeedDates(): Promise<string[] | null> {
  try {
    // Determine file path
    const dataDir = join(process.cwd(), "data-dump-alex");

    const content = await readdir(dataDir, { withFileTypes: true });
    return content
      .filter((filename) => filename.isFile())
      .map((filename) => filename.name)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function readSeedData(
  date: string
): Promise<Record<string, NpmDownloadResponse> | null> {
  try {
    // Determine file path
    const dataDir = join(process.cwd(), "data-dump-alex");

    const filePath = join(
      dataDir,
      date.endsWith(".json") ? date : `${date}.json`
    );
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function readExistingData(
  filePath: string
): Promise<HistoricalData | null> {
  try {
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function updateHistoricalData(
  newDownloads: Record<string, number>,
  timestamp: number,
  existingData: HistoricalData
): void {
  const insertIndex = existingData.timestamps.findIndex(
    (value) => value >= timestamp
  );

  if (insertIndex >= 0 && existingData.timestamps[insertIndex] === timestamp) {
    // timestamp already present. We can skip it
    return;
  }

  // Update existing data
  existingData.timestamps.splice(insertIndex, 0, timestamp);

  // Add new download counts
  for (const [version, count] of Object.entries(newDownloads)) {
    if (!existingData.downloads[version]) {
      // New version - backfill with zeros for historical timestamps
      existingData.downloads[version] = new Array(
        existingData.timestamps.length
      ).fill(0);
    } else {
      existingData.downloads[version].splice(insertIndex, 0, count);
    }
  }

  // Ensure all existing versions have a new entry (fill with 0 if no downloads)
  for (const version of Object.keys(existingData.downloads)) {
    if (!newDownloads[version]) {
      existingData.downloads[version].splice(insertIndex, 0, 0);
    }
  }
}

function onlyDay(date: Date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0
  );
}
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

function getWeekKey(date: Date): string {
  const sunday = new Date(date);
  const dayOfWeek = date.getUTCDay();
  sunday.setUTCDate(date.getUTCDate() - dayOfWeek);
  return onlyDay(sunday).toISOString().split('T')[0];
}

function batchDatesByWeek(dates: string[]): Map<string, string[]> {
  const weekMap = new Map<string, string[]>();
  
  for (const date of dates) {
    const timestamp = new Date(date.split(".")[0]);
    const weekKey = getWeekKey(timestamp);
    
    if (!weekMap.has(weekKey)) {
      weekMap.set(weekKey, []);
    }
    weekMap.get(weekKey)!.push(date);
  }
  
  // Sort dates within each week
  for (const dates of weekMap.values()) {
    dates.sort();
  }
  
  return weekMap;
}

async function processPackage(packageName: string): Promise<void> {
  // Fetch current stats
  const dates = await getSeedDates();

  if (dates === null) {
    throw new Error(`Seed folder not found`);
  }

  // Determine file path
  const dataDir = join(process.cwd(), "data");
  const filePath = join(dataDir, `${packageName}.json`);

  // Ensure directory exists
  await mkdir(dirname(filePath), { recursive: true });

  // Read existing data
  const existingData = await readExistingData(filePath);

  if (!existingData) {
    throw new Error(`existing data not found for ${packageName}`);
  }

  // Batch dates by week starting on Sunday
  const weekMap = batchDatesByWeek(dates);
  let weeksAdded = 0;

  // Process each week chronologically
  const weekKeys = Array.from(weekMap.keys()).sort();
  
  for (const weekKey of weekKeys) {
    const weekDates = weekMap.get(weekKey)!;
    
    // Find the first available date in this week with data for this package
    let dataFound = false;
    for (const date of weekDates) {
      const data = await readSeedData(date);
      
      if (data && data[packageName] && data[packageName].downloads) {
        const timestamp = new Date(date.split(".")[0]);
        
        // Update historical data with this week's data
        updateHistoricalData(
          data[packageName].downloads,
          timestamp.getTime(),
          existingData
        );
        
        dataFound = true;
        weeksAdded += 1;
        break; // Only use the first available date per week
      }
    }
    
    if (!dataFound) {
      // No data found for this package in this entire week
      continue;
    }
  }

  // Write back to file
  await writeFile(filePath, JSON.stringify(existingData));

  console.log(`✅ Updated stats for ${packageName}: +${weeksAdded} weeks added`);
}

async function main() {
  // Process all packages in parallel with individual error handling
  const results = await Promise.allSettled(
    PACKAGES.map(async (packageName) => {
      try {
        await processPackage(packageName);
        return { package: packageName, success: true };
      } catch (error) {
        console.error(
          `❌ Failed to process ${packageName}:`,
          error instanceof Error ? error.message : error
        );
        return {
          package: packageName,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    })
  );

  // Summary report
  const successful = results.filter(
    (r) => r.status === "fulfilled" && r.value.success
  ).length;
  const failed = PACKAGES.length - successful;

  console.log(
    `\n📊 Summary: ${successful}/${PACKAGES.length} packages processed successfully`
  );
  if (failed > 0) {
    console.log(`⚠️  ${failed} package(s) failed`);
  } else {
    console.log("🎉 All packages processed successfully!");
  }
}

main();
