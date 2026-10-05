-- AlterTable
ALTER TABLE "EngagementScore" ADD COLUMN "method" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_EngagementFactorResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "factorKey" TEXT NOT NULL,
    "rawValue" REAL,
    "normalizedScore" REAL,
    "weight" REAL NOT NULL,
    "contribution" REAL NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "explanation" TEXT,
    "calculatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EngagementFactorResult_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_EngagementFactorResult" ("calculatedAt", "contribution", "employeeId", "factorKey", "id", "normalizedScore", "period", "rawValue", "sampleSize", "weight") SELECT "calculatedAt", "contribution", "employeeId", "factorKey", "id", "normalizedScore", "period", "rawValue", "sampleSize", "weight" FROM "EngagementFactorResult";
DROP TABLE "EngagementFactorResult";
ALTER TABLE "new_EngagementFactorResult" RENAME TO "EngagementFactorResult";
CREATE INDEX "EngagementFactorResult_period_idx" ON "EngagementFactorResult"("period");
CREATE UNIQUE INDEX "EngagementFactorResult_employeeId_period_factorKey_key" ON "EngagementFactorResult"("employeeId", "period", "factorKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
