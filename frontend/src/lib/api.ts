/**
 * Typed endpoint bindings, one function per API operation.
 *
 * Pages call these rather than assembling URLs, so a backend route change is a
 * single-file edit and every request keeps the response envelope shape.
 */
import { request, requestWithMeta } from './api-client';
import type {
  ActionItem,
  ActivitySignal,
  AiProviderInfo,
  Alert,
  AnalysisRunSummary,
  AnalyticsLevel,
  CheckIn,
  CheckInStatus,
  CheckInSummary,
  Conversation,
  ConversationKind,
  Department,
  DepartmentAnalytics,
  Employee,
  EmployeeEngagement,
  EngagementFactorKey,
  EngagementScore,
  EngagementTrends,
  FactorConfig,
  Feedback,
  FeedbackStatus,
  MeResponse,
  ManagerAssignment,
  Message,
  Overview,
  PaginatedMeta,
  PrivacySettings,
  QuestionType,
  RecentAnalysis,
  RefreshSummary,
  Report,
  RiskPrediction,
  SentimentSource,
  SentimentTrends,
  Session,
  Survey,
  SurveyResponse,
  ThemeTrends,
  TrendPoint,
  DailyAnswerInput,
  DailyParticipation,
  DailyPulseToday,
  DailyScore,
  DailySubmissionResult,
  FeedbackHistoryEntry,
  WrittenFeedbackItem,
  MyFeedback,
  AiInsight,
  DashboardSummary,
  DailyQuestionSet,
  DailyPulseResponses,
  DailyQuestionBreakdown,
  DailyTrends,
  PulseQuestionAdmin,
  PulseConfig,
} from '@/types';

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const authApi = {
  login: (email: string, password: string) =>
    request<Session>('/auth/login', { method: 'POST', body: { email, password } }),

  register: (input: { email: string; password: string; firstName: string; lastName: string }) =>
    request<Session>('/auth/register', { method: 'POST', body: input }),

  me: () => request<MeResponse>('/auth/me'),

  logout: (refreshToken: string) =>
    request<void>('/auth/logout', { method: 'POST', body: { refreshToken } }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>('/auth/me/change-password', {
      method: 'POST',
      body: { currentPassword, newPassword },
    }),
};

// ---------------------------------------------------------------------------
// AI chat
// ---------------------------------------------------------------------------

export interface SendMessageResult {
  userMessage: Message;
  assistantMessage: Message;
  degraded: boolean;
}

export const aiApi = {
  provider: () => request<AiProviderInfo>('/ai/provider'),

  usage: () => request<{ provider: string; model: string; feature: string | null; calls: number; totalTokens: number }[]>('/ai/usage'),

  listConversations: (kind?: ConversationKind) =>
    requestWithMeta<Conversation[]>('/ai/conversations', {
      query: { kind, pageSize: 50 },
    }),

  createConversation: (input: { title: string; kind: ConversationKind }) =>
    request<Conversation>('/ai/conversations', { method: 'POST', body: input }),

  getConversation: (id: string) => request<Conversation>(`/ai/conversations/${id}`),

  sendMessage: (id: string, content: string) =>
    request<SendMessageResult>(`/ai/conversations/${id}/messages`, {
      method: 'POST',
      body: { content },
    }),

  updateConversation: (id: string, input: { title?: string; isArchived?: boolean }) =>
    request<Conversation>(`/ai/conversations/${id}`, { method: 'PATCH', body: input }),

  archiveConversation: (id: string) =>
    request<Conversation>(`/ai/conversations/${id}/archive`, { method: 'PATCH' }),
};

// ---------------------------------------------------------------------------
// Check-ins
// ---------------------------------------------------------------------------

export const checkInsApi = {
  status: () => request<CheckInStatus>('/check-ins/status'),

  submit: (input: { mood: number; energy?: number | null; workload?: number | null; note?: string | null; period?: string }) =>
    request<CheckIn>('/check-ins', { method: 'POST', body: input }),

  myHistory: () => request<CheckIn[]>('/check-ins/my'),

  summary: (params?: { period?: string; departmentId?: string }) =>
    request<CheckInSummary>('/check-ins/summary', { query: params }),

  list: (params?: { period?: string; page?: number; pageSize?: number }) =>
    requestWithMeta<CheckIn[]>('/check-ins', { query: params }),
};

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export interface CreateFeedbackInput {
  title?: string | null;
  content: string;
  category: string;
  isAnonymous: boolean;
  visibility?: string;
}

export const feedbackApi = {
  list: (params?: { status?: FeedbackStatus; category?: string; page?: number; pageSize?: number }) =>
    requestWithMeta<Feedback[]>('/feedback', { query: params }),

  mine: () => requestWithMeta<Feedback[]>('/feedback/mine', { query: { pageSize: 50 } }),

  create: (input: CreateFeedbackInput) => request<Feedback>('/feedback', { method: 'POST', body: input }),

  update: (id: string, input: { status?: FeedbackStatus; category?: string }) =>
    request<Feedback>(`/feedback/${id}`, { method: 'PATCH', body: input }),

  summary: () =>
    request<{
      byCategory: { key: string; count: number }[];
      byStatus: { key: string; count: number }[];
      bySentiment: { key: string; count: number }[];
    }>('/feedback/summary'),
};

// ---------------------------------------------------------------------------
// Surveys
// ---------------------------------------------------------------------------

export interface SurveyAnswersPayload {
  surveyId: string;
  answers: { questionId: string; valueText?: string | null; valueNumber?: number | null }[];
  submit: boolean;
}

export const surveysApi = {
  list: (params?: { status?: string; page?: number; pageSize?: number }) =>
    requestWithMeta<Survey[]>('/surveys', { query: params }),

  getById: (id: string) => request<Survey>(`/surveys/${id}`),

  myResponse: (id: string) => request<SurveyResponse | null>(`/surveys/${id}/my-response`),

  submitResponse: (input: SurveyAnswersPayload) =>
    request<SurveyResponse>('/surveys/responses', { method: 'POST', body: input }),

  create: (input: {
    title: string;
    description?: string | null;
    type: string;
    audience: string;
    isAnonymous: boolean;
    questions: {
      prompt: string;
      type: QuestionType;
      isRequired: boolean;
      options?: string[];
      description?: string | null;
    }[];
  }) => request<Survey>('/surveys', { method: 'POST', body: input }),

  changeStatus: (id: string, status: string) =>
    request<Survey>(`/surveys/${id}/status`, { method: 'PATCH', body: { status } }),

  results: (id: string) =>
    request<{
      surveyId: string;
      responseCount: number;
      questions: {
        questionId: string;
        prompt: string;
        type: string;
        answerCount: number;
        average: number | null;
        distribution: Record<string, number> | null;
        comments?: string[];
      }[];
    }>(`/surveys/${id}/results`),
};

// ---------------------------------------------------------------------------
// Organisation
// ---------------------------------------------------------------------------

export const departmentsApi = {
  list: () => request<Department[]>('/departments'),
  hierarchy: () => request<Department[]>('/departments/hierarchy'),
  get: (id: string) => request<Department>(`/departments/${id}`),
};

export const employeesApi = {
  list: (params?: {
    search?: string;
    departmentId?: string;
    status?: string;
    employmentType?: string;
    page?: number;
    pageSize?: number;
    sortBy?: 'lastName' | 'hireDate' | 'createdAt';
    sortOrder?: 'asc' | 'desc';
  }) => requestWithMeta<Employee[]>('/employees', { query: params }),

  me: () => request<Employee>('/employees/me'),

  get: (id: string) => request<Employee>(`/employees/${id}`),

  managers: (params?: { departmentId?: string; employeeId?: string; includeEnded?: boolean }) =>
    request<ManagerAssignment[]>('/employees/managers', { query: params }),
};

// ---------------------------------------------------------------------------
// Engagement, risk, alerts, actions
// ---------------------------------------------------------------------------

export const engagementApi = {
  list: (params?: { period?: string; limit?: number }) =>
    request<EngagementScore[]>('/engagement', { query: params }),

  trends: (params?: { months?: number; departmentId?: string }) =>
    request<{ months: number; series: TrendPoint[] }>('/engagement/trends', { query: params }),

  distribution: () => request<{ label: string; count: number }[]>('/engagement/distribution'),
};

export const riskApi = {
  list: (params?: { riskLevel?: string; departmentId?: string; page?: number; pageSize?: number }) =>
    requestWithMeta<RiskPrediction[]>('/risk', { query: params }),

  forEmployee: (employeeId: string) => request<RiskPrediction[]>(`/risk/employee/${employeeId}`),

  run: (input?: { departmentId?: string | null; horizonDays?: number }) =>
    request<{ modelVersion: string; evaluated: number; predictions: RiskPrediction[]; generatedAt: string }>(
      '/risk/run',
      { method: 'POST', body: input ?? {} },
    ),
};

export const alertsApi = {
  list: (params?: { status?: string; page?: number; pageSize?: number }) =>
    requestWithMeta<Alert[]>('/alerts', { query: params }),

  counts: () => request<{ severity: string; status: string; count: number }[]>('/alerts/counts'),

  update: (id: string, input: { status?: string; assignedToId?: string | null }) =>
    request<Alert>(`/alerts/${id}`, { method: 'PATCH', body: input }),
};

export const actionItemsApi = {
  list: (params?: { status?: string; assignedToMe?: boolean; page?: number; pageSize?: number }) =>
    requestWithMeta<ActionItem[]>('/action-items', { query: params }),

  create: (input: { title: string; description?: string | null; priority?: string; dueDate?: string | null }) =>
    request<ActionItem>('/action-items', { method: 'POST', body: input }),

  update: (id: string, input: { status?: string; priority?: string; title?: string }) =>
    request<ActionItem>(`/action-items/${id}`, { method: 'PATCH', body: input }),
};

// ---------------------------------------------------------------------------
// AI Intelligence
// ---------------------------------------------------------------------------

export interface TrendRange {
  months?: number;
  employeeId?: string;
  // The query builder takes a plain record, so this needs an index signature.
  [key: string]: string | number | boolean | null | undefined;
}

export const intelligenceApi = {
  sentimentTrends: (params?: TrendRange) =>
    request<SentimentTrends>('/intelligence/trends/sentiment', { query: params }),

  themeTrends: (params?: TrendRange) =>
    request<ThemeTrends>('/intelligence/trends/themes', { query: params }),

  /**
   * Returns per-employee trends, or domain-level aggregates when `level` is a
   * team/department/organisation view. Both arrive as one point type; read
   * `value` for the per-employee score and `engagement` for the domain one.
   */
  engagementTrends: (params?: TrendRange) =>
    request<EngagementTrends>('/intelligence/trends/engagement', { query: params }),

  domainScores: (params?: { period?: string; level?: AnalyticsLevel; employeeId?: string }) =>
    request<
      {
        period: string;
        domain: AnalyticsLevel;
        domainKey: string;
        domainName: string;
        dimension: string;
        value: number | null;
        sampleSize: number;
        suppressed: boolean;
      }[]
    >('/intelligence/domain-scores', { query: params }),

  employeeBreakdown: (params?: { period?: string; employeeId?: string }) =>
    request<EmployeeEngagement[]>('/intelligence/employees', { query: params }),

  employeeDetail: (id: string, params?: { period?: string }) =>
    request<EmployeeEngagement>(`/intelligence/employees/${id}`, { query: params }),

  recentAnalyses: (params?: { limit?: number; source?: SentimentSource; employeeId?: string }) =>
    request<RecentAnalysis[]>('/intelligence/analyses', { query: params }),

  factors: () => request<{ factors: FactorConfig[]; definitions: Record<string, { label: string; description: string; explain: string }>; activitySignals: Record<string, unknown> }>('/intelligence/factors'),

  updateFactor: (key: EngagementFactorKey, input: { weight?: number; enabled?: boolean; description?: string }) =>
    request<FactorConfig>(`/intelligence/factors/${key}`, { method: 'PATCH', body: input }),

  signals: (params?: { period?: string; employeeId?: string; approvalStatus?: string }) =>
    request<ActivitySignal[]>('/intelligence/signals', { query: params }),

  recordSignal: (input: {
    employeeId: string;
    period: string;
    signalKey: string;
    value: number;
    unit?: string;
    source?: string;
    note?: string;
  }) => request<ActivitySignal>('/intelligence/signals', { method: 'POST', body: input }),

  approveSignal: (id: string, input: { status: string; note?: string }) =>
    request<ActivitySignal>(`/intelligence/signals/${id}/approval`, { method: 'PATCH', body: input }),

  calculate: (params?: { period?: string; employeeId?: string }) =>
    request<{ period: string; scope: string; results: { scored: number; skipped: number }[] }>(
      '/intelligence/calculate',
      { method: 'POST', query: params },
    ),

  /** Re-classifies text only; does not score or aggregate. */
  analyse: (input?: { sources?: SentimentSource[]; limitPerSource?: number; reanalyze?: boolean }) =>
    request<AnalysisRunSummary>('/intelligence/analyse', { method: 'POST', body: input ?? {} }),

  /** Analysis + employee scoring + domain aggregates for one period. */
  refresh: (input: { period: string; reanalyze?: boolean; limitPerSource?: number }) =>
    request<RefreshSummary>('/intelligence/run', { method: 'POST', body: input }),
};

// ---------------------------------------------------------------------------
// Analytics, reports, settings
// ---------------------------------------------------------------------------

export const analyticsApi = {
  overview: (params?: { months?: number; departmentId?: string }) =>
    request<Overview>('/analytics/overview', { query: params }),

  byDepartment: () =>
    request<{ departments: DepartmentAnalytics[]; available: boolean }>('/analytics/by-department'),

  headcount: () =>
    request<{
      total: number;
      active: number;
      terminated: number;
      tenureDistribution: { label: string; count: number }[];
      byEmploymentType: Record<string, number>;
    }>('/analytics/headcount'),
};

export const reportsApi = {
  list: (params?: { page?: number; pageSize?: number }) =>
    requestWithMeta<Report[]>('/reports', { query: params }),

  catalogue: () => request<Record<string, string>>('/reports/catalogue'),

  generate: (input: { type: string; format?: string; title?: string }) =>
    request<{ report: Report; payload: { kind: string; rows: unknown[]; summary: Record<string, unknown> } }>(
      '/reports',
      { method: 'POST', body: input },
    ),

  remove: (id: string) => request<void>(`/reports/${id}`, { method: 'DELETE' }),
};

export const settingsApi = {
  privacy: () =>
    request<{ settings: PrivacySettings; overridden: string[] }>('/settings/privacy'),

  updatePrivacy: (settings: PrivacySettings) =>
    request<{ settings: PrivacySettings }>('/settings/privacy', {
      method: 'PATCH',
      body: settings,
    }),
};

export const adminApi = {
  stats: () => request<Record<string, number>>('/admin/stats'),
  system: () =>
    request<{
      environment: string;
      apiPrefix: string;
      databaseProvider: string;
      ai: AiProviderInfo;
      totalPermissions: number;
      uptimeSeconds: number;
      nodeVersion: string;
    }>('/admin/system'),

  roleMatrix: () =>
    request<{ role: string; permissions: string[]; total: number }[]>('/admin/role-matrix'),
};

// ---------------------------------------------------------------------------
// Daily employee feedback
// ---------------------------------------------------------------------------

export const dailyPulseApi = {
  /** The five questions for today, plus whether this employee may still submit. */
  today: () => request<DailyPulseToday>('/daily-pulse/today'),

  /**
   * Submits one day's answers. The server rejects a duplicate with a 409
   * unless HR has enabled resubmission, so the client never sends a flag to
   * override that decision.
   */
  submit: (payload: {
    responseDate?: string;
    answers: DailyAnswerInput[];
    writtenFeedback: { category: string; content: string };
    anonymousFeedback?: { category: string; content: string };
  }) => request<DailySubmissionResult>('/daily-pulse/submit', { method: 'POST', body: payload }),

  myHistory: () => request<FeedbackHistoryEntry[]>('/daily-pulse/my'),

  participation: (params?: { date?: string }) =>
    request<DailyParticipation>('/daily-pulse/participation', { query: params }),

  /** The role-appropriate dashboard: employee, manager, HR or admin. */
  dashboard: () => request<DashboardSummary>('/daily-pulse/dashboard'),

  myScore: (params?: { date?: string }) =>
    request<DailyScore | null>('/daily-pulse/my/score', { query: params }),

  insights: () => request<AiInsight[]>('/daily-pulse/insights'),

  dismissInsight: (id: string) =>
    request<{ id: string; dismissed: boolean }>(`/daily-pulse/insights/${id}/dismiss`, {
      method: 'POST',
    }),

  listFeedback: (params?: {
    startDate?: string;
    endDate?: string;
    departmentId?: string;
    teamId?: string;
    page?: number;
    pageSize?: number;
  }) => request<WrittenFeedbackItem[]>('/daily-pulse/feedback', { query: params }),

  myFeedback: () => request<MyFeedback>('/daily-pulse/feedback/mine'),

  // HR/Admin configuration.
  listQuestions: () => request<PulseQuestionAdmin[]>('/daily-pulse/questions'),

  createQuestion: (payload: {
    prompt: string;
    answerType: string;
    options?: string[];
    helpText?: string;
    position: number;
    isActive?: boolean;
  }) => request<PulseQuestionAdmin>('/daily-pulse/questions', { method: 'POST', body: payload }),

  updateQuestion: (
    id: string,
    payload: Partial<{
      prompt: string;
      answerType: string;
      options: string[];
      helpText: string;
      position: number;
      isActive: boolean;
    }>,
  ) => request<PulseQuestionAdmin>(`/daily-pulse/questions/${id}`, { method: 'PATCH', body: payload }),

  getConfig: () => request<PulseConfig>('/daily-pulse/config'),

  updateConfig: (payload: { isActive?: boolean }) =>
    request<PulseConfig>('/daily-pulse/config', { method: 'PATCH', body: payload }),

  /** Per-question results across a date range. HR/Admin only. */
  questionBreakdown: (params?: { startDate?: string; endDate?: string }) =>
    request<DailyQuestionBreakdown>('/daily-pulse/questions/breakdown', { query: params }),

  /** Per-day participation and mean score across a date range. HR/Admin only. */
  trends: (params?: { startDate?: string; endDate?: string }) =>
    request<DailyTrends>('/daily-pulse/trends', { query: params }),

  /** Every employee's answers to one day's frozen set. HR/Admin only. */
  responses: (params?: { date?: string }) =>
    request<DailyPulseResponses>('/daily-pulse/responses', { query: params }),

  /** The questions of one day, generating them on first access. */
  questionSet: (params?: { date?: string }) =>
    request<DailyQuestionSet>('/daily-pulse/questions/set', { query: params }),

  /** Recent days, so HR can see the rotation and re-roll a date. */
  recentQuestionSets: (params?: { limit?: number }) =>
    request<DailyQuestionSet[]>('/daily-pulse/questions/sets', { query: params }),

  /**
   * Replaces a day's questions. Refused once anybody has answered, because
   * their stored answers must keep matching the wording they were shown.
   */
  regenerateQuestionSet: (params: { date?: string }) =>
    request<DailyQuestionSet>('/daily-pulse/questions/set/regenerate', {
      method: 'POST',
      query: params,
    }),
};

export type { PaginatedMeta };
