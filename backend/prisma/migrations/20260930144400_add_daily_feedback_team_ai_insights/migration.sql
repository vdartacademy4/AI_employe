-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "departmentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Team_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyPulseConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "questionsPerDay" INTEGER NOT NULL DEFAULT 5,
    "allowResubmission" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "opensAtHour" INTEGER NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DailyPulseConfig_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "prompt" TEXT NOT NULL,
    "answerType" TEXT NOT NULL DEFAULT 'RATING',
    "optionsJson" TEXT,
    "helpText" TEXT,
    "position" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DailyQuestionResponse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "responseDate" DATETIME NOT NULL,
    "numericValue" REAL,
    "textValue" TEXT,
    "selectedOptionsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyQuestionResponse_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DailyQuestionResponse_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "DailyQuestion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmployeeFeedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EmployeeFeedback_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AnonymousFeedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FeedbackHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "feedbackDate" DATETIME NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'DAILY_PULSE',
    "hasAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "questionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedbackHistory_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyEngagementScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "scoreDate" DATETIME NOT NULL,
    "overallScore" REAL NOT NULL,
    "questionScore" REAL,
    "feedbackScore" REAL,
    "trendScore" REAL,
    "method" TEXT NOT NULL DEFAULT 'DAILY_V1',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyEngagementScore_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiInsight" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "level" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "targetName" TEXT NOT NULL,
    "insightType" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'FLAT',
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "evidenceJson" TEXT NOT NULL,
    "evidenceSize" INTEGER NOT NULL,
    "windowStart" DATETIME NOT NULL,
    "windowEnd" DATETIME NOT NULL,
    "isDismissed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Employee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeNumber" TEXT NOT NULL,
    "userId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "jobTitle" TEXT,
    "phone" TEXT,
    "location" TEXT,
    "timezone" TEXT,
    "employmentType" TEXT NOT NULL DEFAULT 'FULL_TIME',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "hireDate" DATETIME,
    "terminationDate" DATETIME,
    "dateOfBirth" DATETIME,
    "skills" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "departmentId" TEXT,
    "teamId" TEXT,
    CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Employee_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Employee" ("createdAt", "dateOfBirth", "deletedAt", "departmentId", "email", "employeeNumber", "employmentType", "firstName", "hireDate", "id", "jobTitle", "lastName", "location", "phone", "skills", "status", "terminationDate", "timezone", "updatedAt", "userId") SELECT "createdAt", "dateOfBirth", "deletedAt", "departmentId", "email", "employeeNumber", "employmentType", "firstName", "hireDate", "id", "jobTitle", "lastName", "location", "phone", "skills", "status", "terminationDate", "timezone", "updatedAt", "userId" FROM "Employee";
DROP TABLE "Employee";
ALTER TABLE "new_Employee" RENAME TO "Employee";
CREATE UNIQUE INDEX "Employee_employeeNumber_key" ON "Employee"("employeeNumber");
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");
CREATE UNIQUE INDEX "Employee_email_key" ON "Employee"("email");
CREATE INDEX "Employee_departmentId_idx" ON "Employee"("departmentId");
CREATE INDEX "Employee_teamId_idx" ON "Employee"("teamId");
CREATE INDEX "Employee_status_idx" ON "Employee"("status");
CREATE TABLE "new_EmployeeCheckIn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "teamId" TEXT,
    "period" TEXT NOT NULL,
    "mood" INTEGER NOT NULL,
    "energy" INTEGER,
    "workload" INTEGER,
    "note" TEXT,
    "sentiment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EmployeeCheckIn_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EmployeeCheckIn_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_EmployeeCheckIn" ("createdAt", "employeeId", "energy", "id", "mood", "note", "period", "sentiment", "updatedAt", "workload") SELECT "createdAt", "employeeId", "energy", "id", "mood", "note", "period", "sentiment", "updatedAt", "workload" FROM "EmployeeCheckIn";
DROP TABLE "EmployeeCheckIn";
ALTER TABLE "new_EmployeeCheckIn" RENAME TO "EmployeeCheckIn";
CREATE INDEX "EmployeeCheckIn_period_idx" ON "EmployeeCheckIn"("period");
CREATE INDEX "EmployeeCheckIn_teamId_idx" ON "EmployeeCheckIn"("teamId");
CREATE UNIQUE INDEX "EmployeeCheckIn_employeeId_period_key" ON "EmployeeCheckIn"("employeeId", "period");
CREATE TABLE "new_Manager" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "managerUserId" TEXT NOT NULL,
    "employeeId" TEXT,
    "departmentId" TEXT,
    "teamId" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'DIRECT_REPORT',
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Manager_managerUserId_fkey" FOREIGN KEY ("managerUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Manager_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Manager_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Manager_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Manager" ("createdAt", "departmentId", "employeeId", "endedAt", "id", "isPrimary", "managerUserId", "scope", "startedAt", "updatedAt") SELECT "createdAt", "departmentId", "employeeId", "endedAt", "id", "isPrimary", "managerUserId", "scope", "startedAt", "updatedAt" FROM "Manager";
DROP TABLE "Manager";
ALTER TABLE "new_Manager" RENAME TO "Manager";
CREATE INDEX "Manager_managerUserId_idx" ON "Manager"("managerUserId");
CREATE INDEX "Manager_employeeId_idx" ON "Manager"("employeeId");
CREATE INDEX "Manager_departmentId_idx" ON "Manager"("departmentId");
CREATE INDEX "Manager_teamId_idx" ON "Manager"("teamId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Team_code_key" ON "Team"("code");

-- CreateIndex
CREATE INDEX "Team_departmentId_idx" ON "Team"("departmentId");

-- CreateIndex
CREATE INDEX "DailyQuestion_isActive_idx" ON "DailyQuestion"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DailyQuestion_position_key" ON "DailyQuestion"("position");

-- CreateIndex
CREATE INDEX "DailyQuestionResponse_responseDate_idx" ON "DailyQuestionResponse"("responseDate");

-- CreateIndex
CREATE INDEX "DailyQuestionResponse_questionId_idx" ON "DailyQuestionResponse"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyQuestionResponse_employeeId_responseDate_key" ON "DailyQuestionResponse"("employeeId", "responseDate");

-- CreateIndex
CREATE INDEX "EmployeeFeedback_employeeId_createdAt_idx" ON "EmployeeFeedback"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "EmployeeFeedback_category_idx" ON "EmployeeFeedback"("category");

-- CreateIndex
CREATE INDEX "AnonymousFeedback_category_idx" ON "AnonymousFeedback"("category");

-- CreateIndex
CREATE INDEX "AnonymousFeedback_createdAt_idx" ON "AnonymousFeedback"("createdAt");

-- CreateIndex
CREATE INDEX "FeedbackHistory_feedbackDate_idx" ON "FeedbackHistory"("feedbackDate");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackHistory_employeeId_feedbackDate_key" ON "FeedbackHistory"("employeeId", "feedbackDate");

-- CreateIndex
CREATE INDEX "DailyEngagementScore_scoreDate_idx" ON "DailyEngagementScore"("scoreDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyEngagementScore_employeeId_scoreDate_key" ON "DailyEngagementScore"("employeeId", "scoreDate");

-- CreateIndex
CREATE INDEX "AiInsight_level_targetKey_createdAt_idx" ON "AiInsight"("level", "targetKey", "createdAt");

-- CreateIndex
CREATE INDEX "AiInsight_windowStart_idx" ON "AiInsight"("windowStart");
