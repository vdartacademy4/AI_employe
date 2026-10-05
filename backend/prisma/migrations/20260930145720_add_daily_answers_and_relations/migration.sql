/*
  Warnings:

  - You are about to drop the column `numericValue` on the `DailyQuestionResponse` table. All the data in the column will be lost.
  - You are about to drop the column `selectedOptionsJson` on the `DailyQuestionResponse` table. All the data in the column will be lost.
  - You are about to drop the column `textValue` on the `DailyQuestionResponse` table. All the data in the column will be lost.
  - Added the required column `updatedAt` to the `DailyQuestionResponse` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "DailyQuestionAnswer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "responseId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "responseDate" DATETIME NOT NULL,
    "numericValue" REAL,
    "textValue" TEXT,
    "selectedOptionsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyQuestionAnswer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "DailyQuestionResponse" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DailyQuestionAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "DailyQuestion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DailyQuestionAnswer_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DailyQuestionResponse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "responseDate" DATETIME NOT NULL,
    "summaryValue" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DailyQuestionResponse_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DailyQuestionResponse_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "DailyQuestion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DailyQuestionResponse" ("createdAt", "employeeId", "id", "questionId", "responseDate") SELECT "createdAt", "employeeId", "id", "questionId", "responseDate" FROM "DailyQuestionResponse";
DROP TABLE "DailyQuestionResponse";
ALTER TABLE "new_DailyQuestionResponse" RENAME TO "DailyQuestionResponse";
CREATE INDEX "DailyQuestionResponse_responseDate_idx" ON "DailyQuestionResponse"("responseDate");
CREATE UNIQUE INDEX "DailyQuestionResponse_employeeId_responseDate_key" ON "DailyQuestionResponse"("employeeId", "responseDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "DailyQuestionAnswer_employeeId_responseDate_idx" ON "DailyQuestionAnswer"("employeeId", "responseDate");

-- CreateIndex
CREATE INDEX "DailyQuestionAnswer_questionId_idx" ON "DailyQuestionAnswer"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyQuestionAnswer_responseId_questionId_key" ON "DailyQuestionAnswer"("responseId", "questionId");
