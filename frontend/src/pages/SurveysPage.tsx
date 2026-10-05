import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icons } from '@/components/icons';
import {
  Badge,
  Button,
  Callout,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
} from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { surveysApi } from '@/lib/api';
import { ApiError } from '@/lib/api-client';
import { formatDate, titleCase } from '@/lib/format';
import type { Survey, SurveyQuestion } from '@/types';

const QUESTION_TYPE_LABELS: Record<string, string> = {
  LIKERT_5: 'Rating (1-5)',
  LIKERT_10: 'Rating (1-10)',
  SCALE_1_5: 'Agreement scale',
  SINGLE_CHOICE: 'Single choice',
  MULTI_CHOICE: 'Multiple choice',
  FREE_TEXT: 'Free text',
  YES_NO: 'Yes / No',
  NUMERIC: 'Number',
};

interface AnswerDraft {
  text: string;
  number: string;
  selected: string[];
}

type AnswerMap = Record<string, AnswerDraft>;

function emptyDraft(): AnswerDraft {
  return { text: '', number: '', selected: [] };
}

function isAnswered(question: SurveyQuestion, draft: AnswerDraft | undefined): boolean {
  if (!draft) return false;
  switch (question.type) {
    case 'FREE_TEXT':
      return draft.text.trim().length > 0;
    case 'NUMERIC':
      return draft.number.trim().length > 0 && Number.isFinite(Number(draft.number));
    case 'MULTI_CHOICE':
      return draft.selected.length > 0;
    case 'SINGLE_CHOICE':
    case 'YES_NO':
      return draft.selected.length > 0;
    default:
      return draft.number.trim().length > 0 && Number.isFinite(Number(draft.number));
  }
}

function toNumericAnswer(question: SurveyQuestion, draft: AnswerDraft): number | null {
  const max = question.type === 'LIKERT_10' ? 10 : 5;
  if (question.type === 'SINGLE_CHOICE' || question.type === 'YES_NO') {
    // Choice options are stored as text; the index is the score for rating types.
    const index = question.options.indexOf(draft.selected[0] ?? '');
    return index >= 0 ? index + 1 : null;
  }
  if (question.type === 'MULTI_CHOICE') return draft.selected.length;
  if (question.type === 'NUMERIC') return draft.number ? Number(draft.number) : null;
  const value = Number(draft.number);
  return Number.isFinite(value) ? Math.min(Math.max(value, 1), max) : null;
}

function QuestionInput({
  question,
  draft,
  onChange,
}: {
  question: SurveyQuestion;
  draft: AnswerDraft;
  onChange: (next: AnswerDraft) => void;
}) {
  switch (question.type) {
    case 'FREE_TEXT':
      return (
        <Textarea
          rows={3}
          value={draft.text}
          onChange={(event) => onChange({ ...draft, text: event.target.value })}
          placeholder="Type your answer…"
        />
      );

    case 'NUMERIC':
      return (
        <Input
          type="number"
          value={draft.number}
          onChange={(event) => onChange({ ...draft, number: event.target.value })}
          placeholder="Enter a number"
        />
      );

    case 'SINGLE_CHOICE':
    case 'YES_NO':
      return (
        <div className="space-y-2">
          {question.options.map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-sm transition-colors hover:border-brand-300 hover:bg-brand-50"
            >
              <input
                type="radio"
                name={`question-${question.id}`}
                value={option}
                checked={draft.selected.includes(option)}
                onChange={() => onChange({ ...draft, selected: [option] })}
                className="h-4 w-4 border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-slate-700">{option}</span>
            </label>
          ))}
        </div>
      );

    case 'MULTI_CHOICE':
      return (
        <div className="space-y-2">
          {question.options.map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-sm transition-colors hover:border-brand-300 hover:bg-brand-50"
            >
              <input
                type="checkbox"
                value={option}
                checked={draft.selected.includes(option)}
                onChange={() =>
                  onChange({
                    ...draft,
                    selected: draft.selected.includes(option)
                      ? draft.selected.filter((value) => value !== option)
                      : [...draft.selected, option],
                  })
                }
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-slate-700">{option}</span>
            </label>
          ))}
        </div>
      );

    default: {
      const max = question.type === 'LIKERT_10' ? 10 : 5;
      const current = draft.number ? Number(draft.number) : 0;
      return (
        <div>
          <div className="flex gap-1.5">
            {Array.from({ length: max }, (_, index) => index + 1).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={current === option}
                onClick={() => onChange({ ...draft, number: String(option) })}
                className={`h-10 flex-1 rounded-lg border text-sm font-semibold transition-colors ${
                  current === option
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:bg-brand-50'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-xs text-slate-500">
            <span>Strongly disagree</span>
            <span>Strongly agree</span>
          </div>
        </div>
      );
    }
  }
}

export function SurveysPage() {
  const { can } = useAuth();

  const listQuery = useQuery({
    queryKey: ['surveys', 'list'],
    queryFn: () => surveysApi.list({ pageSize: 50 }),
  });

  const surveys = useMemo(
    () => (listQuery.data?.data ?? []).filter((survey) => survey.status !== 'DRAFT'),
    [listQuery.data],
  );

  const openSurveys = surveys.filter((survey) => survey.status === 'OPEN');
  const closedSurveys = surveys.filter((survey) => survey.status !== 'OPEN');

  return (
    <>
      <PageHeader
        title="Surveys"
        description="Pulse surveys that are open to you, with your submission history kept in one place."
        actions={can('survey:create') ? <Badge>Admin tools available</Badge> : undefined}
      />

      {listQuery.isLoading ? (
        <Card>
          <LoadingState label="Loading surveys" />
        </Card>
      ) : listQuery.isError ? (
        <Card>
          <ErrorState
            message={listQuery.error instanceof ApiError ? listQuery.error.message : undefined}
            onRetry={() => void listQuery.refetch()}
          />
        </Card>
      ) : openSurveys.length === 0 && closedSurveys.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Icons.survey className="h-10 w-10" />}
            title="No surveys yet"
            description="When an administrator publishes a pulse survey it will appear here. Nothing is required from you until then."
          />
        </Card>
      ) : (
        <div className="space-y-8">
          {openSurveys.length > 0 ? (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                Open now
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {openSurveys.map((survey) => (
                  <SurveyCard key={survey.id} survey={survey} />
                ))}
              </div>
            </section>
          ) : null}

          {closedSurveys.length > 0 ? (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                Closed
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {closedSurveys.map((survey) => (
                  <SurveyCard key={survey.id} survey={survey} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}

      {can('survey:create') ? <SurveyComposer /> : null}
    </>
  );
}

function SurveyCard({ survey }: { survey: Survey }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Card>
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-slate-900">{survey.title}</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {titleCase(survey.type)}
              {survey.closesAt ? ` · closes ${formatDate(survey.closesAt)}` : ''}
            </p>
          </div>
          <StatusBadge status={survey.status} />
        </div>

        {survey.description ? (
          <p className="mt-2 line-clamp-2 text-sm text-slate-600">{survey.description}</p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span>
            {survey._count?.questions ?? survey.questions?.length ?? 0} question
            {(survey._count?.questions ?? survey.questions?.length ?? 0) === 1 ? '' : 's'}
          </span>
          {survey.isAnonymous ? (
            <span className="inline-flex items-center gap-1 text-slate-600">
              <Icons.lock className="h-3.5 w-3.5" />
              Anonymous
            </span>
          ) : null}
        </div>
      </div>

      <div className="border-t border-slate-100 px-5 py-3">
        {survey.status === 'OPEN' ? (
          <Button onClick={() => setIsOpen((value) => !value)}>
            {isOpen ? 'Close' : survey._count?.responses ? 'View or update response' : 'Take survey'}
          </Button>
        ) : (
          <p className="text-xs text-slate-500">This survey is closed for responses.</p>
        )}
      </div>

      {isOpen && survey.status === 'OPEN' ? (
        <SurveyRunner survey={survey} onClose={() => setIsOpen(false)} />
      ) : null}
    </Card>
  );
}

function SurveyRunner({ survey, onClose }: { survey: Survey; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ['surveys', survey.id],
    queryFn: () => surveysApi.getById(survey.id),
  });

  const existingQuery = useQuery({
    queryKey: ['surveys', survey.id, 'my-response'],
    queryFn: () => surveysApi.myResponse(survey.id),
  });

  // Pre-fill from a previous response so "update" edits rather than restarts.
  useEffect(() => {
    const response = existingQuery.data;
    if (!response?.answers?.length) return;

    const restored: AnswerMap = {};
    for (const answer of response.answers) {
      const question = detailQuery.data?.questions?.find((item) => item.id === answer.questionId);
      if (!question) continue;
      const current = restored[question.id] ?? emptyDraft();
      restored[question.id] = {
        ...current,
        text: answer.valueText ?? current.text,
        number: answer.valueNumber !== null ? String(answer.valueNumber) : current.number,
        selected: answer.valueText ? [answer.valueText] : current.selected,
      };
    }
    setAnswers(restored);
  }, [existingQuery.data, detailQuery.data]);

  const submit = useMutation({
    mutationFn: (finalSubmit: boolean) =>
      surveysApi.submitResponse({
        surveyId: survey.id,
        submit: finalSubmit,
        answers: (detailQuery.data?.questions ?? []).map((question) => {
          const draft = answers[question.id];
          return {
            questionId: question.id,
            valueText: draft?.text.trim() || (draft?.selected.length ? draft.selected.join(', ') : null),
            valueNumber: draft ? toNumericAnswer(question, draft) : null,
          };
        }),
      }),
    onSuccess: (_response, finalSubmit) => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['surveys'] });
      if (finalSubmit) setSubmitted(true);
    },
    onError: (caught) =>
      setError(caught instanceof ApiError ? caught.message : 'Unable to save your response'),
  });

  const questions = detailQuery.data?.questions ?? [];
  const missingRequired = questions.filter(
    (question) => question.isRequired && !isAnswered(question, answers[question.id]),
  );

  if (detailQuery.isLoading) {
    return <LoadingState label="Loading questions" />;
  }

  if (detailQuery.isError) {
    return (
      <ErrorState
        message={detailQuery.error instanceof ApiError ? detailQuery.error.message : undefined}
        onRetry={() => void detailQuery.refetch()}
      />
    );
  }

  if (submitted) {
    return (
      <div className="space-y-3 px-5 py-6">
        <Callout tone="success" title="Response submitted">
          Thank you. Your answers have been recorded{survey.isAnonymous ? ' anonymously' : ''}.
        </Callout>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  }

  return (
    <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-5">
      {survey.isAnonymous ? (
        <div className="mb-4">
          <Callout tone="info">
            This survey is anonymous. Your name is not attached to your answers, so they cannot be
            edited or traced back to you.
          </Callout>
        </div>
      ) : null}

      <div className="space-y-6">
        {questions.map((question, index) => (
          <div key={question.id}>
            <Field
              label={`${index + 1}. ${question.prompt}`}
              htmlFor={`question-${question.id}`}
              hint={question.description ?? QUESTION_TYPE_LABELS[question.type]}
            >
              <QuestionInput
                question={question}
                draft={answers[question.id] ?? emptyDraft()}
                onChange={(next) => setAnswers((current) => ({ ...current, [question.id]: next }))}
              />
            </Field>
          </div>
        ))}
      </div>

      {error ? (
        <div className="mt-4">
          <Callout tone="danger">{error}</Callout>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        <Button onClick={() => submit.mutate(true)} disabled={submit.isPending || missingRequired.length > 0}>
          {submit.isPending ? 'Submitting…' : 'Submit response'}
        </Button>
        <Button
          variant="secondary"
          onClick={() => submit.mutate(false)}
          disabled={submit.isPending}
        >
          Save draft
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>

      {missingRequired.length > 0 ? (
        <p className="mt-2 text-xs text-slate-500">
          {missingRequired.length} required question{missingRequired.length === 1 ? '' : 's'} still to
          answer before you can submit.
        </p>
      ) : null}
    </div>
  );
}

function SurveyComposer() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('PULSE');
  const [audience, setAudience] = useState('ALL');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [rows, setRows] = useState([{ prompt: '', questionType: 'LIKERT_5', isRequired: true, options: '' }]);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      surveysApi.create({
        title: title.trim(),
        description: description.trim() || null,
        type,
        audience,
        isAnonymous,
        questions: rows
          .filter((row) => row.prompt.trim())
          .map((row) => ({
            prompt: row.prompt.trim(),
            type: row.questionType as never,
            isRequired: row.isRequired,
            options:
              row.questionType === 'SINGLE_CHOICE' || row.questionType === 'MULTI_CHOICE'
                ? row.options
                    .split(',')
                    .map((option) => option.trim())
                    .filter(Boolean)
                : undefined,
          })),
      }),
    onSuccess: () => {
      setOpen(false);
      setTitle('');
      setDescription('');
      setRows([{ prompt: '', questionType: 'LIKERT_5', isRequired: true, options: '' }]);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['surveys'] });
    },
    onError: (caught) => setError(caught instanceof ApiError ? caught.message : 'Unable to create survey'),
  });

  if (!open) {
    return (
      <div className="mt-8">
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <Icons.plus className="h-4 w-4" />
          Create a survey
        </Button>
      </div>
    );
  }

  return (
    <Card className="mt-8">
      <CardHeader
        title="New survey"
        description="Created as a draft. Publish it from the admin endpoints when you are ready."
        actions={
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        }
      />
      <form
        className="space-y-4 px-5 pb-5"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <Field label="Title" htmlFor="survey-title">
          <Input
            id="survey-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
        </Field>

        <Field label="Description" htmlFor="survey-description">
          <Textarea
            id="survey-description"
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type" htmlFor="survey-type">
            <Select id="survey-type" value={type} onChange={(event) => setType(event.target.value)}>
              <option value="PULSE">Pulse</option>
              <option value="ENGAGEMENT">Engagement</option>
              <option value="ONBOARDING">Onboarding</option>
              <option value="EXIT">Exit</option>
            </Select>
          </Field>
          <Field label="Audience" htmlFor="survey-audience">
            <Select
              id="survey-audience"
              value={audience}
              onChange={(event) => setAudience(event.target.value)}
            >
              <option value="ALL">Everyone</option>
              <option value="DEPARTMENT">A department</option>
              <option value="MANAGERS">Managers</option>
            </Select>
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={isAnonymous}
            onChange={(event) => setIsAnonymous(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          Anonymous responses
        </label>

        <div className="space-y-3">
          <p className="label">Questions</p>
          {rows.map((row, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[1fr_11rem_auto]">
              <Input
                value={row.prompt}
                placeholder={`Question ${index + 1}`}
                onChange={(event) =>
                  setRows((current) =>
                    current.map((item, position) =>
                      position === index ? { ...item, prompt: event.target.value } : item,
                    ),
                  )
                }
              />
              <Select
                value={row.questionType}
                onChange={(event) =>
                  setRows((current) =>
                    current.map((item, position) =>
                      position === index ? { ...item, questionType: event.target.value } : item,
                    ),
                  )
                }
              >
                {Object.entries(QUESTION_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
              <Button
                variant="ghost"
                disabled={rows.length === 1}
                onClick={() => setRows((current) => current.filter((_, p) => p !== index))}
                aria-label={`Remove question ${index + 1}`}
              >
                <Icons.trash className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="secondary"
            onClick={() =>
              setRows((current) => [...current, { prompt: '', questionType: 'LIKERT_5', isRequired: true, options: '' }])
            }
          >
            <Icons.plus className="h-4 w-4" />
            Add question
          </Button>
        </div>

        {error ? <Callout tone="danger">{error}</Callout> : null}

        <Button type="submit" disabled={create.isPending || !title.trim()}>
          {create.isPending ? 'Creating…' : 'Create draft survey'}
        </Button>
      </form>
    </Card>
  );
}
