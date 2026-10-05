-- CreateTable
CREATE TABLE "DailyQuestionSet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "responseDate" DATETIME NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'BANK',
    "model" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DailyQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "prompt" TEXT NOT NULL,
    "answerType" TEXT NOT NULL DEFAULT 'RATING',
    "optionsJson" TEXT,
    "helpText" TEXT,
    "position" INTEGER NOT NULL,
    "theme" TEXT,
    "questionSetId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DailyQuestion_questionSetId_fkey" FOREIGN KEY ("questionSetId") REFERENCES "DailyQuestionSet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DailyQuestion" ("answerType", "createdAt", "helpText", "id", "isActive", "optionsJson", "position", "prompt", "updatedAt") SELECT "answerType", "createdAt", "helpText", "id", "isActive", "optionsJson", "position", "prompt", "updatedAt" FROM "DailyQuestion";
DROP TABLE "DailyQuestion";
ALTER TABLE "new_DailyQuestion" RENAME TO "DailyQuestion";
CREATE INDEX "DailyQuestion_isActive_idx" ON "DailyQuestion"("isActive");
CREATE INDEX "DailyQuestion_questionSetId_idx" ON "DailyQuestion"("questionSetId");
CREATE UNIQUE INDEX "DailyQuestion_questionSetId_position_key" ON "DailyQuestion"("questionSetId", "position");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "DailyQuestionSet_responseDate_key" ON "DailyQuestionSet"("responseDate");

-- CreateIndex
CREATE INDEX "DailyQuestionSet_responseDate_idx" ON "DailyQuestionSet"("responseDate");
