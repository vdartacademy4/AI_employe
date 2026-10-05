-- CreateTable
CREATE TABLE "EmployeeCheckIn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "mood" INTEGER NOT NULL,
    "energy" INTEGER,
    "workload" INTEGER,
    "note" TEXT,
    "sentiment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EmployeeCheckIn_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AiConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New conversation',
    "kind" TEXT NOT NULL DEFAULT 'CHAT',
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "context" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AiConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AiConversation" ("context", "createdAt", "id", "isArchived", "model", "provider", "title", "updatedAt", "userId") SELECT "context", "createdAt", "id", "isArchived", "model", "provider", "title", "updatedAt", "userId" FROM "AiConversation";
DROP TABLE "AiConversation";
ALTER TABLE "new_AiConversation" RENAME TO "AiConversation";
CREATE INDEX "AiConversation_userId_idx" ON "AiConversation"("userId");
CREATE INDEX "AiConversation_kind_idx" ON "AiConversation"("kind");
CREATE INDEX "AiConversation_updatedAt_idx" ON "AiConversation"("updatedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "EmployeeCheckIn_period_idx" ON "EmployeeCheckIn"("period");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeCheckIn_employeeId_period_key" ON "EmployeeCheckIn"("employeeId", "period");

-- CreateIndex
CREATE INDEX "SystemSetting_updatedById_idx" ON "SystemSetting"("updatedById");
