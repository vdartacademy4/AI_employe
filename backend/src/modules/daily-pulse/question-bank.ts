import { QUESTION_TOPIC_LABELS, type DailyAnswerType, type QuestionTopic } from '../../core/enums';

/**
 * One reviewed question the generator may draw on.
 *
 * `key` is the stable identity used for anti-repetition. It must never change
 * for a given prompt: rotation decisions are recorded by key, so renaming one
 * silently makes an old question look unused.
 */
export interface BankQuestion {
  key: string;
  prompt: string;
  answerType: DailyAnswerType;
  topic: QuestionTopic;
  /** Optional second line under the question, shown only when it earns its place. */
  helpText?: string;
}

/**
 * How a day's five questions are composed.
 *
 * The mix is fixed rather than left to the generator because the scoring model
 * depends on it. `RATING` and `YES_NO` produce the numeric values that
 * `daily-score.calculator` averages into the engagement score, and exactly one
 * `SHORT_TEXT` guarantees there is prose to run through sentiment analysis
 * without depending on the employee choosing to also write a comment. Three
 * numeric plus one numeric plus one text keeps the numbers meaningful - four out
 * of five answers still carry a signal - while never handing back five numbers
 * and nothing to read.
 */
export interface DailyQuestionShape {
  rating: number;
  yesNo: number;
  shortText: number;
}

/** The composition every daily set must satisfy. */
export const DAILY_QUESTION_SHAPE: DailyQuestionShape = {
  rating: 3,
  yesNo: 1,
  shortText: 1,
};

/**
 * The fallback question pool.
 *
 * This is the safety net, not the product. A configured Gemini writes each
 * day's questions; this bank exists so an outage, a missing key or a rate limit
 * degrades the pulse rather than breaking it. It is therefore deliberately
 * broad - several prompts per topic - because rotation has to have somewhere to
 * rotate to.
 *
 * Two rules govern every entry:
 *  - one idea per question, phrased in plain language an employee can answer in
 *    a few seconds without translating it into HR terminology;
 *  - no question that asks an employee to diagnose, justify or rank colleagues.
 *    A daily pulse measures experience, it does not conduct an investigation.
 *
 * `MULTIPLE_CHOICE` is absent by design: it needs an option list, which makes
 * bank entries longer and less likely to be answered well, and the shape above
 * does not use it. Gemini may still propose it, and the validator accepts it.
 */
export const QUESTION_BANK: readonly BankQuestion[] = [
  // --- Satisfaction ---------------------------------------------------------
  {
    key: 'sat.rating.today',
    prompt: 'How satisfied are you with your work today?',
    answerType: 'RATING',
    topic: 'SATISFACTION',
  },
  {
    key: 'sat.rating.role',
    prompt: 'How satisfied are you with your role at the moment?',
    answerType: 'RATING',
    topic: 'SATISFACTION',
  },
  {
    key: 'sat.rating.progress',
    prompt: 'How satisfied are you with the progress you are making in your role?',
    answerType: 'RATING',
    topic: 'SATISFACTION',
  },
  {
    key: 'sat.yesno.expectations',
    prompt: 'Are you meeting the expectations set for your role this week?',
    answerType: 'YES_NO',
    topic: 'SATISFACTION',
  },
  {
    key: 'sat.text.improve',
    prompt: 'What is one thing that would make your work more satisfying?',
    answerType: 'SHORT_TEXT',
    topic: 'SATISFACTION',
    helpText: 'A sentence or two is plenty.',
  },
  {
    key: 'sat.rating.tools',
    prompt: 'Do you have what you need to do your job well?',
    answerType: 'RATING',
    topic: 'SATISFACTION',
  },

  // --- Engagement -----------------------------------------------------------
  {
    key: 'eng.rating.engaged',
    prompt: 'How engaged did you feel at work today?',
    answerType: 'RATING',
    topic: 'ENGAGEMENT',
  },
  {
    key: 'eng.yesno.focused',
    prompt: 'Did you feel focused on meaningful work today?',
    answerType: 'YES_NO',
    topic: 'ENGAGEMENT',
  },
  {
    key: 'eng.rating.purpose',
    prompt: 'How connected do you feel to what the organisation is trying to achieve?',
    answerType: 'RATING',
    topic: 'ENGAGEMENT',
  },
  {
    key: 'eng.text.what-engages',
    prompt: 'What part of your work felt most engaging today, if any?',
    answerType: 'SHORT_TEXT',
    topic: 'ENGAGEMENT',
  },
  {
    key: 'eng.yesno.busy-meaningful',
    prompt: 'Was your time today spent on work that matters?',
    answerType: 'YES_NO',
    topic: 'ENGAGEMENT',
  },
  {
    key: 'eng.rating.contribution',
    prompt: 'How much do you feel your work contributes to the team?',
    answerType: 'RATING',
    topic: 'ENGAGEMENT',
  },

  // --- Workload -------------------------------------------------------------
  {
    key: 'wlm.rating.workload',
    prompt: 'How manageable was your workload today?',
    answerType: 'RATING',
    topic: 'WORKLOAD',
    helpText: '1 is overloaded, 5 is comfortable.',
  },
  {
    key: 'wlm.rating.pace',
    prompt: 'How was the pace of your work today?',
    answerType: 'RATING',
    topic: 'WORKLOAD',
  },
  {
    key: 'wlm.yesno.deadline-pressure',
    prompt: 'Were you under unrealistic time pressure today?',
    answerType: 'YES_NO',
    topic: 'WORKLOAD',
  },
  {
    key: 'wlm.rating.busy',
    prompt: 'How busy were you today?',
    answerType: 'RATING',
    topic: 'WORKLOAD',
    helpText: '1 was quiet, 5 was nonstop.',
  },
  {
    key: 'wlm.text.worst-task',
    prompt: 'What was the most demanding part of your workload today?',
    answerType: 'SHORT_TEXT',
    topic: 'WORKLOAD',
  },
  {
    key: 'wlm.yesno.ended-on-time',
    prompt: 'Were you able to finish your main tasks by the end of the day?',
    answerType: 'YES_NO',
    topic: 'WORKLOAD',
  },

  // --- Motivation -----------------------------------------------------------
  {
    key: 'mot.rating.motivated',
    prompt: 'How motivated did you feel at work today?',
    answerType: 'RATING',
    topic: 'MOTIVATION',
  },
  {
    key: 'mot.yesno.look-forward',
    prompt: 'Are you looking forward to the work you have tomorrow?',
    answerType: 'YES_NO',
    topic: 'MOTIVATION',
  },
  {
    key: 'mot.text.motivates',
    prompt: 'What motivates you most in your work?',
    answerType: 'SHORT_TEXT',
    topic: 'MOTIVATION',
  },
  {
    key: 'mot.rating.energised',
    prompt: 'How energised did your work leave you feeling today?',
    answerType: 'RATING',
    topic: 'MOTIVATION',
  },
  {
    key: 'mot.yesno.worth-it',
    prompt: 'Do you feel the effort you put in is worthwhile?',
    answerType: 'YES_NO',
    topic: 'MOTIVATION',
  },
  {
    key: 'mot.text.demotivates',
    prompt: 'What drains your motivation at work?',
    answerType: 'SHORT_TEXT',
    topic: 'MOTIVATION',
  },

  // --- Manager support ------------------------------------------------------
  {
    key: 'mgr.rating.support',
    prompt: 'How supported did you feel by your manager today?',
    answerType: 'RATING',
    topic: 'MANAGER_SUPPORT',
  },
  {
    key: 'mgr.yesno.help',
    prompt: 'Could you ask your manager for help today if you needed to?',
    answerType: 'YES_NO',
    topic: 'MANAGER_SUPPORT',
  },
  {
    key: 'mgr.rating.feedback',
    prompt: 'How useful do you find the feedback you get from your manager?',
    answerType: 'RATING',
    topic: 'MANAGER_SUPPORT',
  },
  {
    key: 'mgr.text.support-change',
    prompt: 'What would better support from your manager look like?',
    answerType: 'SHORT_TEXT',
    topic: 'MANAGER_SUPPORT',
  },
  {
    key: 'mgr.yesno.priority',
    prompt: 'Do you understand what is most important in your work right now?',
    answerType: 'YES_NO',
    topic: 'MANAGER_SUPPORT',
  },
  {
    key: 'mgr.rating.listened',
    prompt: 'Do you feel comfortable raising a concern with your manager?',
    answerType: 'RATING',
    topic: 'MANAGER_SUPPORT',
  },

  // --- Work environment -----------------------------------------------------
  {
    key: 'env.rating.environment',
    prompt: 'How would you rate your working environment today?',
    answerType: 'RATING',
    topic: 'WORK_ENVIRONMENT',
  },
  {
    key: 'env.yesno.safe',
    prompt: 'Did you feel comfortable and welcome in your workplace today?',
    answerType: 'YES_NO',
    topic: 'WORK_ENVIRONMENT',
  },
  {
    key: 'env.rating.remote-setup',
    prompt: 'How well does your setup support you getting your work done?',
    answerType: 'RATING',
    topic: 'WORK_ENVIRONMENT',
  },
  {
    key: 'env.text.change-environment',
    prompt: 'What is one change to your work environment that would help you?',
    answerType: 'SHORT_TEXT',
    topic: 'WORK_ENVIRONMENT',
  },
  {
    key: 'env.yesno.resources',
    prompt: 'Did you have the tools and space you needed today?',
    answerType: 'YES_NO',
    topic: 'WORK_ENVIRONMENT',
  },
  {
    key: 'env.rating.rules',
    prompt: 'How clear are the ways of working expected of you?',
    answerType: 'RATING',
    topic: 'WORK_ENVIRONMENT',
  },

  // --- Stress & wellbeing ---------------------------------------------------
  {
    key: 'str.rating.stress',
    prompt: 'How manageable did today feel, in terms of stress?',
    answerType: 'RATING',
    topic: 'STRESS',
    helpText: '1 was very stressful, 5 was relaxed.',
  },
  {
    key: 'str.yesno.overwhelmed',
    prompt: 'Did anything today leave you feeling overwhelmed?',
    answerType: 'YES_NO',
    topic: 'STRESS',
  },
  {
    key: 'str.rating.energy',
    prompt: 'How was your energy at the end of today?',
    answerType: 'RATING',
    topic: 'STRESS',
  },
  {
    key: 'str.yesno.boundaries',
    prompt: 'Were you able to switch off from work at the end of the day?',
    answerType: 'YES_NO',
    topic: 'STRESS',
  },
  {
    key: 'str.text.support-needed',
    prompt: 'Is there anything affecting your wellbeing that work could help with?',
    answerType: 'SHORT_TEXT',
    topic: 'STRESS',
  },
  {
    key: 'str.rating.balance',
    prompt: 'How is work balancing against the rest of your life at the moment?',
    answerType: 'RATING',
    topic: 'STRESS',
  },

  // --- Collaboration --------------------------------------------------------
  {
    key: 'col.rating.team',
    prompt: 'How well did you work with your team today?',
    answerType: 'RATING',
    topic: 'COLLABORATION',
  },
  {
    key: 'col.yesno.help-colleagues',
    prompt: 'Did anyone help you when you needed it today?',
    answerType: 'YES_NO',
    topic: 'COLLABORATION',
  },
  {
    key: 'col.rating.included',
    prompt: 'How included did you feel in your team today?',
    answerType: 'RATING',
    topic: 'COLLABORATION',
  },
  {
    key: 'col.text.communication',
    prompt: 'What is one thing your team could communicate better?',
    answerType: 'SHORT_TEXT',
    topic: 'COLLABORATION',
  },
  {
    key: 'col.yesno.heard',
    prompt: 'Did you feel heard when you shared an update today?',
    answerType: 'YES_NO',
    topic: 'COLLABORATION',
  },
  {
    key: 'col.rating.cross-team',
    prompt: 'How well do you work with other teams outside yours?',
    answerType: 'RATING',
    topic: 'COLLABORATION',
  },

  // --- Recognition ----------------------------------------------------------
  {
    key: 'rec.yesno.recognised',
    prompt: 'Did you feel recognised for your work today?',
    answerType: 'YES_NO',
    topic: 'RECOGNITION',
  },
  {
    key: 'rec.rating.recognised',
    prompt: 'How recognised do you feel for the work you do?',
    answerType: 'RATING',
    topic: 'RECOGNITION',
  },
  {
    key: 'rec.text.what-recognition',
    prompt: 'What kind of recognition would mean the most to you?',
    answerType: 'SHORT_TEXT',
    topic: 'RECOGNITION',
  },
  {
    key: 'rec.yesno.proud',
    prompt: 'Are you proud of something you accomplished today?',
    answerType: 'YES_NO',
    topic: 'RECOGNITION',
  },
  {
    key: 'rec.rating.value',
    prompt: 'How valued do you feel for what you contribute?',
    answerType: 'RATING',
    topic: 'RECOGNITION',
  },
  {
    key: 'rec.text.noticed',
    prompt: 'Is there work of yours that has gone unrecognised?',
    answerType: 'SHORT_TEXT',
    topic: 'RECOGNITION',
  },

  // --- Overall experience ---------------------------------------------------
  {
    key: 'ovr.rating.day',
    prompt: 'How would you rate your day at work overall?',
    answerType: 'RATING',
    topic: 'OVERALL_EXPERIENCE',
  },
  {
    key: 'ovr.yesno.proud-workplace',
    prompt: 'Would you recommend this workplace to someone else?',
    answerType: 'YES_NO',
    topic: 'OVERALL_EXPERIENCE',
  },
  {
    key: 'ovr.text.anything',
    prompt: 'Is there anything you would like HR or your manager to know?',
    answerType: 'SHORT_TEXT',
    topic: 'OVERALL_EXPERIENCE',
    helpText: 'Anything at all - a compliment, a concern or an idea.',
  },
  {
    key: 'ovr.text.today-one-thing',
    prompt: 'What is the one thing you would change about today if you could?',
    answerType: 'SHORT_TEXT',
    topic: 'OVERALL_EXPERIENCE',
  },
  {
    key: 'ovr.rating.work-life',
    prompt: 'How would you rate your overall experience of working here?',
    answerType: 'RATING',
    topic: 'OVERALL_EXPERIENCE',
  },
  {
    key: 'ovr.yesno.stay',
    prompt: 'Are you planning to stay with the organisation over the next year?',
    answerType: 'YES_NO',
    topic: 'OVERALL_EXPERIENCE',
  },
];

/**
 * Comparison form of a prompt, used to decide whether a question has been asked
 * recently.
 *
 * Wording drifts between sources - Gemini paraphrases, HR edits a row - so
 * repeat detection cannot compare raw strings. Reducing to lowercase
 * alphanumeric words keeps "How was your workload today?" and "how was your
 * workload today" identical while still separating genuinely different
 * questions about the same topic.
 */
export function normalisePrompt(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

/** Questions the bank can supply for a topic, in declaration order. */
export function bankQuestionsFor(topic: QuestionTopic): BankQuestion[] {
  return QUESTION_BANK.filter((question) => question.topic === topic);
}

/** Human-readable topic name, for prompts and the HR view. */
export function topicLabel(topic: QuestionTopic): string {
  return QUESTION_TOPIC_LABELS[topic];
}