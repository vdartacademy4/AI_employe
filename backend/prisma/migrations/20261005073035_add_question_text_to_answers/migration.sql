-- Adds `questionText` to every stored answer.
--
-- The column is populated from the question row each answer points at. Those
-- questions are frozen (they belong to a published `DailyQuestionSet`), so the
-- join gives back the exact wording the employee saw, and existing history is
-- preserved rather than left blank.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DailyQuestionAnswer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "responseId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "responseDate" DATETIME NOT NULL,
    "numericValue" REAL,
    "textValue" TEXT,
    "selectedOptionsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyQuestionAnswer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "DailyQuestionResponse" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DailyQuestionAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "DailyQuestion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DailyQuestionAnswer_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DailyQuestionAnswer" (
    "createdAt", "employeeId", "id", "numericValue", "questionId",
    "questionText", "responseDate", "responseId", "selectedOptionsJson", "textValue"
)
SELECT
    a."createdAt", a."employeeId", a."id", a."numericValue", a."questionId",
    q."prompt", a."responseDate", a."responseId", a."selectedOptionsJson", a."textValue"
FROM "DailyQuestionAnswer" a
JOIN "DailyQuestion" q ON q."id" = a."questionId";
DROP TABLE "DailyQuestionAnswer";
ALTER TABLE "new_DailyQuestionAnswer" RENAME TO "DailyQuestionAnswer";
CREATE INDEX "DailyQuestionAnswer_employeeId_responseDate_idx" ON "DailyQuestionAnswer"("employeeId", "responseDate");
CREATE INDEX "DailyQuestionAnswer_questionId_idx" ON "DailyQuestionAnswer"("questionId");
CREATE UNIQUE INDEX "DailyQuestionAnswer_responseId_questionId_key" ON "DailyQuestionAnswer"("responseId", "questionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;