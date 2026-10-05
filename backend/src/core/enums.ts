/**
 * Canonical value sets for every enum-like column in the Prisma schema.
 *
 * SQLite has no native enum type, so these unions are the single source of
 * truth: the Prisma schema stores Strings, these types narrow them at compile
 * time, and `z.enum` (see each module's `*.schemas.ts`) validates them at the
 * HTTP boundary. Moving to PostgreSQL means converting these lists into
 * `enum` blocks in the schema - the runtime behaviour stays identical.
 */

export const USER_ROLES = ['EMPLOYEE', 'MANAGER', 'HR', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['ACTIVE', 'INVITED', 'SUSPENDED', 'DEACTIVATED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const EMPLOYEE_STATUSES = [
  'ACTIVE',
  'ON_LEAVE',
  'ONBOARDING',
  'OFFBOARDING',
  'TERMINATED',
] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const EMPLOYMENT_TYPES = [
  'FULL_TIME',
  'PART_TIME',
  'CONTRACTOR',
  'INTERN',
  'TEMPORARY',
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const MANAGER_SCOPES = ['DIRECT_REPORT', 'DEPARTMENT_HEAD'] as const;
export type ManagerScope = (typeof MANAGER_SCOPES)[number];

export const SURVEY_TYPES = ['PULSE', 'ENGAGEMENT', 'ONBOARDING', 'EXIT', 'CUSTOM'] as const;
export type SurveyType = (typeof SURVEY_TYPES)[number];

export const SURVEY_STATUSES = ['DRAFT', 'SCHEDULED', 'OPEN', 'CLOSED', 'ARCHIVED'] as const;
export type SurveyStatus = (typeof SURVEY_STATUSES)[number];

export const SURVEY_AUDIENCES = ['ALL', 'DEPARTMENT', 'MANAGERS', 'CUSTOM'] as const;
export type SurveyAudience = (typeof SURVEY_AUDIENCES)[number];

export const QUESTION_TYPES = [
  'LIKERT_5',
  'LIKERT_10',
  'SCALE_1_5',
  'SINGLE_CHOICE',
  'MULTI_CHOICE',
  'FREE_TEXT',
  'YES_NO',
  'NUMERIC',
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const RESPONSE_STATUSES = ['IN_PROGRESS', 'SUBMITTED', 'ABANDONED'] as const;
export type ResponseStatus = (typeof RESPONSE_STATUSES)[number];

export const FEEDBACK_CATEGORIES = [
  'GENERAL',
  'RECOGNITION',
  'WORKLOAD',
  'MANAGEMENT',
  'COMPENSATION',
  'CULTURE',
  'DEVELOPMENT',
  'WELLBEING',
  'TECHNICAL',
] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_STATUSES = [
  'SUBMITTED',
  'IN_REVIEW',
  'ACKNOWLEDGED',
  'ACTIONED',
  'CLOSED',
  'REJECTED',
] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_VISIBILITIES = ['HR_ONLY', 'HR_AND_MANAGER', 'ANONYMOUS_POOL'] as const;
export type FeedbackVisibility = (typeof FEEDBACK_VISIBILITIES)[number];

export const FEEDBACK_CHANNELS = ['PORTAL', 'MANAGER', 'AI_CHAT', 'API'] as const;
export type FeedbackChannel = (typeof FEEDBACK_CHANNELS)[number];

export const SENTIMENT_LABELS = ['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'MIXED'] as const;
export type SentimentLabel = (typeof SENTIMENT_LABELS)[number];

export const SCORE_SOURCES = ['SURVEY', 'MANUAL', 'AI_INFERRED', 'IMPORT'] as const;
export type ScoreSource = (typeof SCORE_SOURCES)[number];

export const RISK_LEVELS = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const ALERT_TYPES = [
  'RISK_ESCALATION',
  'ENGAGEMENT_DROP',
  'SURVEY_CLOSING',
  'FEEDBACK_ESCALATION',
  'THRESHOLD_BREACH',
  'SYSTEM',
] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

export const ALERT_SEVERITIES = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const ALERT_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED'] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export const ACTION_ITEM_STATUSES = ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'] as const;
export type ActionItemStatus = (typeof ACTION_ITEM_STATUSES)[number];

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const REPORT_TYPES = [
  'ENGAGEMENT',
  'RISK',
  'TURNOVER',
  'SURVEY_SUMMARY',
  'FEEDBACK_DIGEST',
  'DEPARTMENT_COMPARISON',
  'CUSTOM',
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_FORMATS = ['JSON', 'CSV', 'PDF'] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

export const REPORT_STATUSES = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const MESSAGE_ROLES = ['user', 'assistant', 'system'] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

/**
 * Conversation kinds keep separate chat surfaces in one history table: an
 * employee can have an open wellbeing conversation and several unrelated
 * questions without them bleeding into each other's context.
 */
export const CONVERSATION_KINDS = ['CHAT', 'CHECK_IN', 'FEEDBACK'] as const;
export type ConversationKind = (typeof CONVERSATION_KINDS)[number];

/**
 * Providers registered in `modules/ai/providers/provider.factory.ts`.
 *
 * `null`  - no inference; reports "not configured" rather than inventing content.
 * `http`  - any OpenAI-compatible `/chat/completions` endpoint.
 * `gemini`- Google's Gemini `generateContent` API (native shape, not OpenAI-compatible).
 */
export const AI_PROVIDER_IDS = ['null', 'http', 'gemini'] as const;
export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

// ===========================================================================
// AI Intelligence: sentiment, themes and engagement scoring
// ===========================================================================

/**
 * The three sentiment classes the NLP pipeline reports.
 *
 * `SENTIMENT_LABELS` above also allows `MIXED` for hand-entered values, but the
 * analyser only ever emits these three: a two-sided statement is scored by its
 * dominant pole and mixedness is carried by the numeric `score`, which is what
 * makes a "mostly positive with a serious complaint" item trend correctly
 * instead of being thrown into a dead-middle bucket.
 */
export const SENTIMENT_CLASSES = ['POSITIVE', 'NEUTRAL', 'NEGATIVE'] as const;
export type SentimentClass = (typeof SENTIMENT_CLASSES)[number];

/**
 * The engagement themes the product tracks.
 *
 * This is a closed set: an unrecognised theme is a product decision, not a
 * modelling accident, and must be added deliberately. The first six came from
 * the initial intelligence module; the daily-feedback work added communication,
 * compensation, work-life balance and technical issues, because those are the
 * subjects employees actually raise in a daily pulse and folding them into
 * "work environment" made that theme unacceptably vague.
 */
export const ENGAGEMENT_THEMES = [
  'WORKLOAD',
  'MANAGEMENT',
  'TEAM',
  'LEARNING',
  'CAREER_GROWTH',
  'WORK_ENVIRONMENT',
  'COMMUNICATION',
  'COMPENSATION',
  'WORK_LIFE_BALANCE',
  'TECHNICAL_ISSUES',
] as const;
export type EngagementTheme = (typeof ENGAGEMENT_THEMES)[number];

export const THEME_LABELS: Record<EngagementTheme, string> = {
  WORKLOAD: 'Workload',
  MANAGEMENT: 'Management',
  TEAM: 'Team',
  LEARNING: 'Learning',
  CAREER_GROWTH: 'Career Growth',
  WORK_ENVIRONMENT: 'Work Environment',
  COMMUNICATION: 'Communication',
  COMPENSATION: 'Compensation',
  WORK_LIFE_BALANCE: 'Work-Life Balance',
  TECHNICAL_ISSUES: 'Technical Issues',
};

/**
 * Where a piece of analysed text came from. Stored so a sentiment figure can
 * always be traced back to the exact record it describes, and so the analytics
 * layer can break results down by channel.
 */
export const SENTIMENT_SOURCES = [
  'FEEDBACK',
  'SURVEY_RESPONSE',
  'SURVEY_COMMENT',
  'CHECK_IN_NOTE',
  'CHAT_MESSAGE',
  // Written feedback from the daily pulse. `ATTRIBUTED` and `ANONYMOUS` are
  // separate sources rather than one source with a flag, so a query for
  // "attributed feedback" cannot accidentally include anonymous rows.
  'DAILY_FEEDBACK',
  'ANONYMOUS_FEEDBACK',
  /**
   * The free-text answer an employee gave to one of the five daily questions.
   * A separate source from DAILY_FEEDBACK so that "the written comment" and
   * "the answer to today's open question" can be counted and compared
   * independently, and so idempotency is keyed on the answer row itself.
   */
  'DAILY_ANSWER',
] as const;
export type SentimentSource = (typeof SENTIMENT_SOURCES)[number];

/**
 * How a sentiment label was produced.
 *
 * `AI` means a configured model classified it. `LEXICON` means the deterministic
 * local analyser produced it, and `UNSCORED` means there was not enough text to
 * classify. Keeping the method on every row is what stops a lexicon result from
 * being presented to an HR user as if a model had read it.
 */
export const SENTIMENT_METHODS = ['AI', 'LEXICON', 'UNSCORED'] as const;
export type SentimentMethod = (typeof SENTIMENT_METHODS)[number];

/**
 * Engagement score inputs. Weights are configurable per installation, but the
 * factor set is fixed so a score is always explainable as the same three
 * published components.
 */
export const ENGAGEMENT_FACTOR_KEYS = [
  'SURVEY_RESPONSES',
  'FEEDBACK_SENTIMENT',
  'ACTIVITY_DATA',
] as const;
export type EngagementFactorKey = (typeof ENGAGEMENT_FACTOR_KEYS)[number];

/**
 * Approved activity signals an organisation may choose to contribute.
 *
 * These are deliberately coarse, monthly and opt-in per employee. The platform
 * does not capture keystrokes, screen time, message content or location: the
 * engagement model is only allowed to use signals an organisation has
 * explicitly approved and an employee has been told about.
 */
export const ACTIVITY_SIGNAL_KEYS = [
  'LEARNING_HOURS',
  'ABSENCE_DAYS',
  'RECOGNITION_RECEIVED',
  'FEEDBACK_GIVEN',
  'GOALS_COMPLETED',
] as const;
export type ActivitySignalKey = (typeof ACTIVITY_SIGNAL_KEYS)[number];

/**
 * Aggregation levels for the analytics API. `TEAM` is resolved per principal
 * from their management records; the other levels are explicit.
 */
export const ANALYTICS_LEVELS = ['EMPLOYEE', 'TEAM', 'DEPARTMENT', 'ORGANISATION'] as const;
export type AnalyticsLevel = (typeof ANALYTICS_LEVELS)[number];

/**
 * The measurement axis a domain score describes: the overall engagement index,
 * one of the three sentiment classes, or one of the six themes.
 */
export const ANALYTICS_DIMENSIONS = [
  'ENGAGEMENT',
  'SENTIMENT_POSITIVE',
  'SENTIMENT_NEUTRAL',
  'SENTIMENT_NEGATIVE',
  // Mean polarity in [-1, 1]. Kept separate from the label shares because a
  // rising positive share can still hide a worsening average.
  'SENTIMENT_POLARITY',
  ...ENGAGEMENT_THEMES,
] as const;
export type AnalyticsDimension = (typeof ANALYTICS_DIMENSIONS)[number];

/** Review state for a signal before it may influence a score. */
export const ACTIVITY_APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type ActivityApprovalStatus = (typeof ACTIVITY_APPROVAL_STATUSES)[number];

// ===========================================================================
// Daily employee feedback
// ===========================================================================

/**
 * Answer types an employee can give to a daily question.
 *
 * `RATING` is deliberately separate from `LIKERT_5`: a rating carries a 1-5
 * scale, a Likert question carries its own label pairs, and a daily pulse needs
 * to average the first without knowing the wording of the second.
 */
export const DAILY_ANSWER_TYPES = ['RATING', 'YES_NO', 'MULTIPLE_CHOICE', 'SHORT_TEXT'] as const;
export type DailyAnswerType = (typeof DAILY_ANSWER_TYPES)[number];

/**
 * Where a day's five questions came from.
 *
 * This is recorded rather than inferred so that an HR reader can tell a
 * generated question from a reviewed one, and so that a Gemini outage shows up
 * in the data as `BANK` instead of being passed off as a normal day. The
 * generator always produces exactly five questions either way: the fallback is
 * a change of provenance, never a change of behaviour.
 */
export const QUESTION_SET_SOURCES = ['GEMINI', 'BANK'] as const;
export type QuestionSetSource = (typeof QUESTION_SET_SOURCES)[number];

/**
 * What a daily question is about.
 *
 * Deliberately separate from `ENGAGEMENT_THEMES`. The engagement themes are an
 * analytics dimension: they drive `EngagementDomainScore` rows and insight
 * generation, and changing that set would silently move published numbers.
 * These topics are only the rotation axis for question selection, so they are
 * free to match what a daily pulse actually asks about - satisfaction,
 * recognition, stress - without disturbing the engagement model.
 */
export const QUESTION_TOPICS = [
  'SATISFACTION',
  'ENGAGEMENT',
  'WORKLOAD',
  'MOTIVATION',
  'MANAGER_SUPPORT',
  'WORK_ENVIRONMENT',
  'STRESS',
  'COLLABORATION',
  'RECOGNITION',
  'OVERALL_EXPERIENCE',
] as const;
export type QuestionTopic = (typeof QUESTION_TOPICS)[number];

export const QUESTION_TOPIC_LABELS: Record<QuestionTopic, string> = {
  SATISFACTION: 'Satisfaction',
  ENGAGEMENT: 'Engagement',
  WORKLOAD: 'Workload',
  MOTIVATION: 'Motivation',
  MANAGER_SUPPORT: 'Manager Support',
  WORK_ENVIRONMENT: 'Work Environment',
  STRESS: 'Stress & Wellbeing',
  COLLABORATION: 'Collaboration',
  RECOGNITION: 'Recognition',
  OVERALL_EXPERIENCE: 'Overall Experience',
};

/**
 * The subject an employee chose for their own written feedback.
 *
 * Free text is analysed for sentiment and themes regardless of this field, so
 * the category is a routing aid for HR rather than an input to the score.
 */
export const FEEDBACK_KINDS = [
  'SUGGESTION',
  'CONCERN',
  'WORK_ISSUE',
  'TEAM',
  'MANAGER',
  'WORKPLACE_EXPERIENCE',
  'GENERAL',
] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

/**
 * What a stored insight is about.
 *
 * Each maps to a comparison the engine can actually make from stored rows, so
 * the category is a promise that the evidence supports the claim.
 */
export const INSIGHT_TYPES = [
  'WORKLOAD_CHANGE',
  'SENTIMENT_CHANGE',
  'THEME_SURGE',
  'PARTICIPATION_DROP',
  'ENGAGEMENT_DECLINE',
  'POSITIVE_MOMENTUM',
] as const;
export type InsightType = (typeof INSIGHT_TYPES)[number];

/** How much attention an insight warrants in the UI. */
export const INSIGHT_SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'] as const;
export type InsightSeverity = (typeof INSIGHT_SEVERITIES)[number];

/** Direction of a change an insight describes. */
export const INSIGHT_DIRECTIONS = ['UP', 'DOWN', 'FLAT'] as const;
export type InsightDirection = (typeof INSIGHT_DIRECTIONS)[number];
