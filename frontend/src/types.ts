/**
 * Shared API types, mirroring the backend contracts.
 *
 * These are hand-maintained rather than generated; they are the seam where a
 * future OpenAPI generator should replace this file.
 */

export type UserRole = 'EMPLOYEE' | 'MANAGER' | 'HR' | 'ADMIN';

export type Permission = string;

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: string;
  avatarUrl: string | null;
  employeeId: string | null;
}

export interface Session {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface MeResponse {
  user: AuthUser;
  permissions: Permission[];
  employee: { id: string; jobTitle: string | null; departmentId: string | null } | null;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  description: string | null;
  parentId: string | null;
  headId: string | null;
  isActive: boolean;
  _count?: { employees: number; children: number };
}

export interface Employee {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string | null;
  status: string;
  employmentType: string;
  hireDate: string | null;
  departmentId: string | null;
  department?: { id: string; name: string; code: string } | null;
  user?: { id: string; role: string } | null;
}

/** A `Manager` row: who manages whom, and over which scope. */
export interface ManagerAssignment {
  id: string;
  managerUserId: string;
  employeeId: string | null;
  departmentId: string | null;
  scope: string;
  isPrimary: boolean;
  startedAt: string;
  endedAt: string | null;
  managerUser?: { id: string; email: string; firstName: string; lastName: string; role: string } | null;
  employee?: { id: string; firstName: string; lastName: string; jobTitle: string | null } | null;
  department?: { id: string; name: string; code: string } | null;
}

export type QuestionType =
  | 'LIKERT_5'
  | 'LIKERT_10'
  | 'SCALE_1_5'
  | 'SINGLE_CHOICE'
  | 'MULTI_CHOICE'
  | 'FREE_TEXT'
  | 'YES_NO'
  | 'NUMERIC';

export interface SurveyQuestion {
  id: string;
  surveyId: string;
  prompt: string;
  description: string | null;
  type: QuestionType;
  isRequired: boolean;
  options: string[];
  order: number;
  weight: number;
}

export interface Survey {
  id: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  audience: string;
  isAnonymous: boolean;
  opensAt: string | null;
  closesAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  department?: { id: string; name: string } | null;
  questions?: SurveyQuestion[];
  _count?: { questions: number; responses: number };
}

export interface SurveyAnswer {
  id: string;
  responseId: string;
  questionId: string;
  valueText: string | null;
  valueNumber: number | null;
}

export interface SurveyResponse {
  id: string;
  surveyId: string;
  status: string;
  startedAt: string;
  submittedAt: string | null;
  sentiment: string | null;
  answers: SurveyAnswer[];
  survey?: Survey;
}

export type FeedbackStatus =
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'ACKNOWLEDGED'
  | 'ACTIONED'
  | 'CLOSED'
  | 'REJECTED';

export interface Feedback {
  id: string;
  title: string | null;
  content: string;
  category: string;
  channel: string;
  status: FeedbackStatus;
  visibility: string;
  isAnonymous: boolean;
  sentiment: string | null;
  aiSummary: string | null;
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  authorId?: string | null;
  author?: { id: string; firstName: string; lastName: string; email: string } | null;
  recipient?: { id: string; firstName: string; lastName: string } | null;
  submittedAnonymously?: boolean;
  anonymousSelfVisible?: boolean;
}

export interface CheckIn {
  id: string;
  employeeId: string;
  period: string;
  mood: number;
  energy: number | null;
  workload: number | null;
  note: string | null;
  sentiment: string | null;
  createdAt: string;
  updatedAt: string;
  employee?: { id: string; firstName: string | null; lastName: string | null };
}

export interface CheckInStatus {
  period: string;
  enabled: boolean;
  hasLinkedEmployeeRecord: boolean;
  alreadySubmitted: boolean;
}

export interface CheckInSummary {
  period: string;
  sampleSize: number;
  minimumGroupSize: number;
  suppressed: boolean;
  mood: number | null;
  energy: number | null;
  workload: number | null;
}

export type ConversationKind = 'CHAT' | 'CHECK_IN' | 'FEEDBACK';

export interface Conversation {
  id: string;
  title: string;
  kind: ConversationKind;
  provider: string;
  model: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { messages: number };
  messages?: Message[];
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  provider: string | null;
  model: string | null;
  totalTokens: number | null;
  latencyMs: number | null;
  error: string | null;
  createdAt: string;
  pending?: boolean;
  failed?: boolean;
}

export interface AiProviderInfo {
  id: string;
  model: string;
  configured: boolean;
  capabilities: {
    chat: boolean;
    sentiment: boolean;
    embeddings: boolean;
    summarization: boolean;
  };
}

export interface PrivacySettings {
  feedbackEnabled: boolean;
  feedbackAllowAnonymous: boolean;
  feedbackAnonymousSelfVisible: boolean;
  feedbackManagerVisible: boolean;
  reportingMinimumGroupSize: number;
  checkInsEnabled: boolean;
  checkInMinimumGroupSize: number;
}

export interface RiskPrediction {
  id: string;
  employeeId: string;
  riskScore: number;
  riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  factors: string | null;
  modelVersion: string;
  confidence: number | null;
  explanation: string | null;
  predictedAt: string;
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
    jobTitle: string | null;
    department: { id: string; name: string } | null;
  };
}

export interface Alert {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  status: string;
  employeeId: string | null;
  triggeredAt: string;
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
    department: { id: string; name: string } | null;
  } | null;
  _count?: { actionItems: number };
}

export interface ActionItem {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  ownerId: string | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  alert?: { id: string; title: string; severity: string; type: string } | null;
}

export interface Report {
  id: string;
  title: string;
  description: string | null;
  type: string;
  format: string;
  status: string;
  errorMessage: string | null;
  scheduledFor: string | null;
  createdAt: string;
  completedAt: string | null;
  generatedBy?: { id: string; firstName: string; lastName: string } | null;
}

export interface EngagementScore {
  id: string;
  employeeId: string;
  period: string;
  overallScore: number;
  eNps: number | null;
  workLifeBalance: number | null;
  growthOpportunity: number | null;
  managerEffectiveness: number | null;
  workloadBalance: number | null;
  source: string;
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
    jobTitle: string | null;
    department: { id: string; name: string } | null;
  };
}

export interface Overview {
  employees: number;
  openAlerts: number;
  openSurveys: number;
  openActionItems: number;
  submittedResponses: number;
  generatedAt: string;
}

export interface TrendPoint {
  period: string;
  sampleSize: number;
  overall: number | null;
  eNps: number | null;
  workLifeBalance: number | null;
  growthOpportunity: number | null;
  managerEffectiveness: number | null;
  workloadBalance: number | null;
}

export interface DepartmentAnalytics {
  departmentId: string;
  name: string;
  code: string;
  headcount: number;
  averageEngagement: number | null;
  eNps: number | null;
  riskLevels: Record<string, number>;
  openAlerts: number;
}

export interface PaginatedMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  [key: string]: string | number | boolean;
}

// ===========================================================================
// AI Intelligence
//
// Every trend figure is `number | null` and every series carries a
// `suppressed` flag. The pairing is deliberate: `null` means "no data", while
// `suppressed: true` means "data exists, but this group is below the privacy
// threshold". A chart that conflated the two would render a group of two as a
// genuine score.
// ===========================================================================

export type SentimentClass = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';

export type SentimentMethod = 'AI' | 'LEXICON' | 'UNSCORED';

export type SentimentSource =
  | 'FEEDBACK'
  | 'SURVEY_RESPONSE'
  | 'SURVEY_COMMENT'
  | 'CHECK_IN_NOTE'
  | 'CHAT_MESSAGE';

export type EngagementTheme =
  | 'WORKLOAD'
  | 'MANAGEMENT'
  | 'TEAM'
  | 'LEARNING'
  | 'CAREER_GROWTH'
  | 'WORK_ENVIRONMENT';

export type EngagementFactorKey = 'SURVEY_RESPONSES' | 'FEEDBACK_SENTIMENT' | 'ACTIVITY_DATA';

export type ActivitySignalKey =
  | 'LEARNING_HOURS'
  | 'ABSENCE_DAYS'
  | 'RECOGNITION_RECEIVED'
  | 'FEEDBACK_GIVEN'
  | 'GOALS_COMPLETED';

export type AnalyticsLevel = 'EMPLOYEE' | 'TEAM' | 'DEPARTMENT' | 'ORGANISATION';

export interface SentimentTrendPoint {
  period: string;
  sampleSize: number;
  suppressed: boolean;
  positive: number | null;
  neutral: number | null;
  negative: number | null;
  /** Mean polarity in [-1, 1]. */
  polarity: number | null;
  /** Classified by a configured model, rather than the local lexicon. */
  aiAssisted: number;
  lexiconOnly: number;
  bySource: Record<string, number>;
}

export interface SentimentTrends {
  series: SentimentTrendPoint[];
  totals: { analysed: number; aiAssisted: number; lexicon: number };
  /** Minimum group size below which figures are suppressed. */
  threshold: number;
  periodRange: { from: string; to: string };
}

export interface ThemeTrendPoint {
  theme: EngagementTheme;
  label: string;
  /** Share of analysed texts mentioning the theme, in [0, 1]. */
  share: number | null;
  mentions: number;
  sampleSize: number;
  suppressed: boolean;
  averageConfidence: number | null;
}

export interface ThemeTrendPeriod {
  period: string;
  sampleSize: number;
  suppressed: boolean;
  themes: ThemeTrendPoint[];
}

export interface ThemeTrends {
  series: ThemeTrendPeriod[];
  threshold: number;
  periodRange: { from: string; to: string };
}

export interface EngagementTrendPoint {
  period: string;
  /** Mean engagement on 0-100, or null when unavailable or suppressed. */
  value: number | null;
  sampleSize: number;
  suppressed: boolean;
  averageConfidence: number | null;
  method: string | null;
  factorBreakdown: { key: string; score: number | null; sampleSize: number }[];
}

/**
 * Requesting a TEAM/DEPARTMENT/ORGANISATION level returns the materialised
 * domain rows instead, which carry a different shape: averages across groups
 * rather than one per-employee score, plus a breakdown by theme.
 */
/**
 * Requesting a TEAM/DEPARTMENT/ORGANISATION level returns the materialised
 * domain rows instead. They carry a different shape - averages across groups
 * rather than one per-employee score - so the extra fields are modelled as
 * optional on the same point type. `engagement` is the domain-level score and
 * `value` the per-employee one; a caller reads whichever matches its level.
 */
export type EngagementSeriesPoint = EngagementTrendPoint & {
  engagement: number | null;
  polarity: number | null;
  groups: number;
  suppressedGroups: number;
};

export interface EngagementTrends {
  series: EngagementSeriesPoint[];
  threshold: number;
  level?: AnalyticsLevel;
  periodRange: { from: string; to: string };
}

export interface EmployeeFactor {
  key: string;
  weight: number;
  score: number | null;
  contribution: number;
  sampleSize: number;
  enabled: boolean;
  explanation: string | null;
}

export interface EmployeeEngagement {
  employeeId: string;
  name: string;
  jobTitle: string | null;
  department: string | null;
  departmentId: string | null;
  overallScore: number | null;
  confidence: number | null;
  method: string | null;
  calculatedAt: string | null;
  factors: EmployeeFactor[];
  sentiment: Record<SentimentClass, number>;
}

export interface RecentAnalysis {
  id: string;
  sourceType: SentimentSource;
  sourceId: string;
  period: string;
  label: SentimentClass;
  score: number;
  confidence: number | null;
  method: SentimentMethod;
  provider: string | null;
  model: string | null;
  excerpt: string | null;
  analyzedAt: string;
  employee: { id: string; firstName: string; lastName: string; department: { name: string } | null } | null;
  themes: { theme: string; label: string; confidence: number; evidence: string | null }[];
}

export interface FactorConfig {
  key: EngagementFactorKey;
  label: string;
  description: string;
  explain: string;
  weight: number;
  enabled: boolean;
  overridden: boolean;
  source: 'DEFAULT' | 'OVERRIDDEN';
}

export interface ActivitySignalRule {
  key: ActivitySignalKey;
  label: string;
  unit: string;
  direction: 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER';
  description: string;
  lowAnchor: number;
  highAnchor: number;
}

export interface FactorConfiguration {
  factors: FactorConfig[];
  definitions: Record<EngagementFactorKey, { label: string; description: string; explain: string }>;
  activitySignals: Record<ActivitySignalKey, ActivitySignalRule>;
}

export interface ActivitySignal {
  id: string;
  employeeId: string;
  period: string;
  signalKey: ActivitySignalKey;
  value: number;
  unit: string;
  source: string;
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  note: string | null;
  employee?: { id: string; firstName: string; lastName: string };
}

export interface AnalysisRunSummary {
  analysed: number;
  skipped: number;
  failed: number;
  bySource: Record<string, { analysed: number; skipped: number; failed: number }>;
  provider: string;
  /** False means the lexicon produced these results, not a model. */
  providerConfigured: boolean;
  ranAt: string;
}

export interface RefreshSummary {
  period: string;
  analysis: AnalysisRunSummary;
  scores: { scored: number; skipped: number };
  domains: { rows: number };
}

// ---------------------------------------------------------------------------
// Daily employee feedback
// ---------------------------------------------------------------------------

export type DailyAnswerType = 'RATING' | 'YES_NO' | 'MULTIPLE_CHOICE' | 'SHORT_TEXT';

export interface DailyQuestionView {
  id: string;
  prompt: string;
  answerType: DailyAnswerType;
  options: string[];
  helpText: string | null;
  position: number;
  savedAnswer: string | null;
}

/** The employee's view of today's pulse. */
export interface DailyPulseToday {
  responseDate: string;
  isActive: boolean;
  allowResubmission: boolean;
  /** False once submitted, unless HR has enabled resubmission. */
  canSubmit: boolean;
  alreadySubmitted: boolean;
  questionCount: number;
  questions: DailyQuestionView[];
submittedAt: string | null;
  hasWrittenFeedback: boolean;
  hasAnonymousFeedback: boolean;
  /** Whether today's questions were model-written or drawn from the curated bank. */
  questionSource: DailyQuestionSetSource;
  /** The provider and model behind `questionSource`, when one was used. */
  questionSourceModel: string | null;
}

export interface DailyAnswerInput {
  questionId: string;
  numericValue?: number;
  textValue?: string;
  selectedOptions?: string[];
}

export interface DailySubmissionResult {
  responseDate: string;
  answerCount: number;
}

export interface FeedbackHistoryEntry {
  feedbackDate: string;
  hasAnonymous: boolean;
  questionCount: number;
  createdAt: string;
}

export interface DailyParticipation {
  responseDate: string;
  eligible: number;
  submitted: number;
  /** Null when there are no eligible employees, not zero. */
  participationRate: number | null;
}

export interface WrittenFeedbackItem {
  id: string;
  category: string;
  content: string;
  createdAt: string;
  isAnonymous: boolean;
  /** Null whenever the caller may not be told who wrote it. */
  author: { id: string; name: string } | null;
}

export interface MyFeedback {
  written: Array<{
    id: string;
    category: string;
    content: string;
    status: string;
    createdAt: string;
  }>;
  /** Anonymous submissions are returned as dates only, never content. */
  anonymous: Array<{ submittedDate: string }>;
}

export type InsightSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type InsightDirection = 'UP' | 'DOWN' | 'FLAT';

export interface AiInsight {
  id: string;
  level: string;
  targetKey: string;
  targetName: string;
  insightType: string;
  subject: string;
  headline: string;
  detail: string;
  direction: InsightDirection;
  severity: InsightSeverity;
  evidenceSize: number;
  windowStart: string;
  windowEnd: string;
  createdAt: string;
}

export interface DashboardMetric {
  key: string;
  label: string;
  /** Null means "not enough data"; the UI renders a dash, never a zero. */
  value: number | null;
  unit: 'percent' | 'score' | 'count' | 'days';
  hint: string;
}

export interface DashboardSummary {
  role: UserRole;
  scopeLabel: string;
  windowStart: string;
  windowEnd: string;
  metrics: DashboardMetric[];
  sentiment: { positive: number; neutral: number; negative: number; sampleSize: number } | null;
  topThemes: Array<{ theme: string; label: string; count: number }>;
  /** Dense daily series; a null score is a real gap, not a missing point. */
  trend: Array<{ date: string; score: number | null }>;
  insights: AiInsight[];
  isEmpty: boolean;
}

export interface DailyScore {
  scoreDate: string;
  overallScore: number;
  questionScore: number | null;
  feedbackScore: number | null;
  trendScore: number | null;
}

export interface PulseQuestionAdmin extends DailyQuestionView {
  isActive: boolean;
}

/** How a day's questions came into being. */
export type DailyQuestionSetSource = 'GEMINI' | 'BANK';

export interface DailyQuestionSetQuestion {
  id: string;
  prompt: string;
  answerType: DailyAnswerType;
  helpText: string | null;
  position: number;
  topic: string | null;
}

export interface DailyQuestionSet {
  id: string;
  responseDate: string;
  source: DailyQuestionSetSource;
  /** The provider and model, when one wrote the set. */
  model: string | null;
  /** Why the bank was used instead of the model, when it was. */
  note: string | null;
  questions: DailyQuestionSetQuestion[];
}

/** One employee's answers to a day's frozen set. */
export interface DailyPulseResponseDetail {
  id: string;
  submittedAt: string;
  /** The row-level numeric average, as the engagement score records it. */
  summaryValue: number | null;
  employee: {
    id: string;
    name: string;
    jobTitle: string | null;
    department: string | null;
  };
  answers: Array<{
    questionId: string;
    prompt: string;
    answerType: DailyAnswerType;
    position: number;
    numericValue: number | null;
    textValue: string | null;
  }>;
}

export interface DailyPulseResponses {
  responseDate: string;
  responses: DailyPulseResponseDetail[];
}

export interface PulseConfig {
  id: string;
  questionsPerDay: number;
  allowResubmission: boolean;
  isActive: boolean;
  opensAtHour: number;
  updatedAt: string;
}
