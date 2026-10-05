import { type DailyAnswerType, type QuestionTopic } from '../../core/enums';

/**
 * The 20-question bank every daily set is drawn from.
 *
 * `key` is the stable identity used for rotation and for answering history. It
 * must never change for a given prompt: rotation is recorded by key, so
 * renaming one silently makes the question look like it has never been asked.
 */
export interface BankQuestion {
  key: string;
  prompt: string;
  answerType: DailyAnswerType;
  topic: QuestionTopic;
}

/**
 * How many questions one employee answers per day.
 *
 * Fixed by the product specification, and the scoring model is defined against
 * exactly five answers, so it is a constant rather than a setting.
 */
export const QUESTIONS_PER_DAY = 5;

/**
 * The shortest interval, in days, between two uses of the same question.
 *
 * There are 20 questions and 5 are asked per day, so the bank is exhausted
 * exactly every 4 days. A question is therefore used once per 4-day cycle and
 * never on consecutive days - which is a stronger guarantee than merely
 * preferring unused questions.
 */
export const DAYS_PER_CYCLE = 4;

/**
 * The full bank, in the order the specification lists it.
 *
 * The types are chosen per question rather than at random so that each day's
 * five are guaranteed to contain enough numeric answers to score: the
 * engagement score averages `RATING` and `YES_NO`, and a day of five yes/no
 * questions would produce a number that means nothing.
 */
export const QUESTION_BANK: readonly BankQuestion[] = [
  {
    key: 'work-satisfaction',
    prompt: 'How satisfied are you with your work today?',
    answerType: 'RATING',
    topic: 'SATISFACTION',
  },
  {
    key: 'work-meaning',
    prompt: 'How meaningful do you find your current work?',
    answerType: 'RATING',
    topic: 'ENGAGEMENT',
  },
  {
    key: 'task-motivation',
    prompt: 'Do you feel motivated to complete your daily tasks?',
    answerType: 'RATING',
    topic: 'MOTIVATION',
  },
  {
    key: 'role-satisfaction',
    prompt: 'Are you satisfied with your current role and responsibilities?',
    answerType: 'RATING',
    topic: 'SATISFACTION',
  },
  {
    key: 'workload-manageable',
    prompt: 'How manageable is your current workload?',
    answerType: 'RATING',
    topic: 'WORKLOAD',
  },
  {
    key: 'time-to-complete',
    prompt: 'Do you have enough time to complete your assigned work?',
    answerType: 'YES_NO',
    topic: 'WORKLOAD',
  },
  {
    key: 'work-life-balance',
    prompt: 'Are you able to maintain a healthy work-life balance?',
    answerType: 'YES_NO',
    topic: 'STRESS',
  },
  {
    key: 'workload-stress',
    prompt: 'Do you feel stressed because of your workload?',
    answerType: 'RATING',
    topic: 'STRESS',
  },
  {
    key: 'team-support',
    prompt: 'Do you feel supported by your team members?',
    answerType: 'RATING',
    topic: 'COLLABORATION',
  },
  {
    key: 'manager-communication',
    prompt: 'How comfortable are you communicating with your manager?',
    answerType: 'RATING',
    topic: 'MANAGER_SUPPORT',
  },
  {
    key: 'manager-guidance',
    prompt: 'Does your manager provide enough guidance when needed?',
    answerType: 'YES_NO',
    topic: 'MANAGER_SUPPORT',
  },
  {
    key: 'ideas-valued',
    prompt: 'Do you feel your ideas and opinions are valued by your team?',
    answerType: 'YES_NO',
    topic: 'COLLABORATION',
  },
  {
    key: 'work-environment-rating',
    prompt: 'How would you rate the overall work environment?',
    answerType: 'RATING',
    topic: 'WORK_ENVIRONMENT',
  },
  {
    key: 'raise-concerns',
    prompt: 'Do you feel comfortable expressing your concerns at work?',
    answerType: 'YES_NO',
    topic: 'OVERALL_EXPERIENCE',
  },
  {
    key: 'colleague-respect',
    prompt: 'Do you feel respected by your colleagues?',
    answerType: 'RATING',
    topic: 'COLLABORATION',
  },
  {
    key: 'positive-environment',
    prompt: 'Do you feel the company provides a positive working environment?',
    answerType: 'YES_NO',
    topic: 'WORK_ENVIRONMENT',
  },
  {
    key: 'learning-growth',
    prompt: 'Are you satisfied with the learning and growth opportunities available to you?',
    answerType: 'RATING',
    topic: 'MOTIVATION',
  },
  {
    key: 'recognition',
    prompt: 'Do you feel recognized for your contributions?',
    answerType: 'RATING',
    topic: 'RECOGNITION',
  },
  {
    key: 'career-growth',
    prompt: 'Do you see opportunities for career growth within the company?',
    answerType: 'RATING',
    topic: 'RECOGNITION',
  },
  {
    key: 'improvement-suggestion',
    prompt: 'Is there anything the company could improve to make your work experience better?',
    answerType: 'SHORT_TEXT',
    topic: 'OVERALL_EXPERIENCE',
  },
] as const;

/** The prompts in this bank, used to check for duplicates. */
export const BANK_PROMPTS: readonly string[] = QUESTION_BANK.map((question) => question.prompt);

/** True when a question carries an answer that contributes to a numeric score. */
export function isScorable(question: Pick<BankQuestion, 'answerType'>): boolean {
  return question.answerType === 'RATING' || question.answerType === 'YES_NO';
}