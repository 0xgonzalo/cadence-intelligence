import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../supabase/migrations");

function migrationFiles(): string[] {
  if (!existsSync(MIGRATIONS_DIR)) return [];
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => path.join(MIGRATIONS_DIR, f));
}

describe("compliance: no lyric columns in migrations", () => {
  const files = migrationFiles();

  it.skipIf(files.length === 0)(
    "forbids any column name matching /lyric/i",
    () => {
      const offenders: string[] = [];
      for (const file of files) {
        const sql = readFileSync(file, "utf8");
        for (const line of sql.split("\n")) {
          // Flag column-definition lines that name a lyric column.
          if (/^\s*"?[a-z_]*lyric[a-z_]*"?\s+\w/i.test(line)) {
            offenders.push(`${path.basename(file)}: ${line.trim()}`);
          }
        }
      }
      expect(offenders, offenders.join("\n")).toEqual([]);
    },
  );
});
