const fs = require("fs");
const path = require("path");

const nextDir = path.join(process.cwd(), ".next");

try {
  fs.rmSync(nextDir, { recursive: true, force: true });
  console.log("[SportsPulse] Cleared .next cache");
} catch (error) {
  console.warn(
    "[SportsPulse] Failed to clear .next cache:",
    error instanceof Error ? error.message : String(error)
  );
}
