-- AlterTable
ALTER TABLE "SurveyResponse" ADD COLUMN "anonymousOwnerHash" TEXT;

-- CreateTable
CREATE TABLE "SentimentAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "employeeId" TEXT,
    "period" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "score" REAL NOT NULL,
    "confidence" REAL,
    "method" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "excerpt" TEXT,
    "analyzedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responseId" TEXT,
    CONSTRAINT "SentimentAnalysis_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SentimentAnalysis_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "SurveyResponse" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ThemeDetection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysisId" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 0,
    "evidence" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ThemeDetection_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "SentimentAnalysis" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EngagementFactorConfig" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "weight" REAL NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "updatedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "EngagementFactorResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "factorKey" TEXT NOT NULL,
    "rawValue" REAL NOT NULL,
    "normalizedScore" REAL NOT NULL,
    "weight" REAL NOT NULL,
    "contribution" REAL NOT NULL,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "calculatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EngagementFactorResult_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmployeeActivitySignal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "signalKey" TEXT NOT NULL,
    "value" REAL NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'count',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "approvalStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "approvedAt" DATETIME,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EmployeeActivitySignal_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EngagementDomainScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "period" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "domainKey" TEXT NOT NULL,
    "domainName" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "value" REAL NOT NULL,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "suppressed" BOOLEAN NOT NULL DEFAULT false,
    "calculatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "SentimentAnalysis_employeeId_period_idx" ON "SentimentAnalysis"("employeeId", "period");

-- CreateIndex
CREATE INDEX "SentimentAnalysis_period_label_idx" ON "SentimentAnalysis"("period", "label");

-- CreateIndex
CREATE INDEX "SentimentAnalysis_sourceType_idx" ON "SentimentAnalysis"("sourceType");

-- CreateIndex
CREATE UNIQUE INDEX "SentimentAnalysis_sourceType_sourceId_key" ON "SentimentAnalysis"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "ThemeDetection_theme_idx" ON "ThemeDetection"("theme");

-- CreateIndex
CREATE UNIQUE INDEX "ThemeDetection_analysisId_theme_key" ON "ThemeDetection"("analysisId", "theme");

-- CreateIndex
CREATE INDEX "EngagementFactorConfig_updatedById_idx" ON "EngagementFactorConfig"("updatedById");

-- CreateIndex
CREATE INDEX "EngagementFactorResult_period_idx" ON "EngagementFactorResult"("period");

-- CreateIndex
CREATE UNIQUE INDEX "EngagementFactorResult_employeeId_period_factorKey_key" ON "EngagementFactorResult"("employeeId", "period", "factorKey");

-- CreateIndex
CREATE INDEX "EmployeeActivitySignal_period_approvalStatus_idx" ON "EmployeeActivitySignal"("period", "approvalStatus");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeActivitySignal_employeeId_period_signalKey_key" ON "EmployeeActivitySignal"("employeeId", "period", "signalKey");

-- CreateIndex
CREATE INDEX "EngagementDomainScore_period_domain_dimension_idx" ON "EngagementDomainScore"("period", "domain", "dimension");

-- CreateIndex
CREATE INDEX "EngagementDomainScore_domainKey_idx" ON "EngagementDomainScore"("domainKey");

-- CreateIndex
CREATE UNIQUE INDEX "EngagementDomainScore_period_domain_domainKey_dimension_key" ON "EngagementDomainScore"("period", "domain", "domainKey", "dimension");

-- CreateIndex
CREATE INDEX "SurveyResponse_anonymousOwnerHash_idx" ON "SurveyResponse"("anonymousOwnerHash");
