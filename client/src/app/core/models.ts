export interface User {
  id: string;
  email: string;
  display_name: string;
  role: 'superuser' | 'admin' | 'user' | 'encuestador';
}

export interface Survey {
  id: string;
  title: string;
  description: string;
  group?: string | null;
  group_id?: string | null;
  group_label?: string | null;
  status: 'draft' | 'active' | 'paused' | 'closed';
  created_at: string;
  response_count?: number;
  mode_code?: string | null;
  mode_label?: string | null;
  mode_description?: string | null;
  requires_correct_answer?: boolean;
  grades_answers?: boolean;
}

export interface SurveyMode {
  code: string;
  label: string;
  description: string;
  requires_correct_answer: boolean;
  grades_answers: boolean;
}

export interface Question {
  id: string;
  position: number;
  prompt: string;
  question_type: string;
  question_type_label: string;
  is_numeric: boolean;
  allows_multiple: boolean;
  options: QuestionOption[];
  min_value: number | null;
  max_value: number | null;
  correct_value?: number | null;
}

export interface QuestionOption {
  id: string;
  label: string;
  position: number;
  is_correct?: boolean;
}

export interface SubmissionResult {
  show_result: boolean;
  reveal_correct_answers: boolean;
  grades_answers: boolean;
  mode_label: string | null;
  score_percent: number | null;
  graded_questions: number;
  questions: {
    questionId: string;
    prompt: string;
    scorePercent: number | null;
    correctAnswer: number | string[] | null;
  }[];
}

export interface QuestionType {
  code: string;
  label: string;
  is_numeric: boolean;
  allows_multiple: boolean;
  min_options: number;
}

export interface SurveyDetail extends Survey {
  creator_id: string;
  updated_at: string;
  questions: Question[];
}

export interface ReportQuestion {
  questionId: string;
  prompt: string;
  questionTypeLabel: string;
  isNumeric: boolean;
  universe: number;
  mean: number | null;
  median: number | null;
  mode: number | null;
  value_range: number | null;
  maximum: number | null;
  minimum: number | null;
  coefficient_of_variation: number | null;
  variance: number | null;
  standard_deviation: number | null;
  frequencies: { value: string; frequency: number }[];
}

export interface Group {
  id: string;
  nombre: string;
  etiqueta: string;
  icono: string;
  orden: number;
  activo: boolean;
}

export interface RespondentGroup {
  value: string;
  label: string;
}

export interface RespondentTarget extends RespondentGroup {
  target_count: number;
}

export interface StudySurvey {
  id: string;
  title: string;
  group: string;
  group_id: string | null;
  target_count: number | null;
  etiqueta: string;
  icono: string;
  orden: number;
  status: 'draft' | 'active' | 'paused' | 'closed';
  response_count: number;
  mode_code: string | null;
  mode_label: string | null;
}

export interface Study {
  id: string;
  title: string;
  description: string;
  shift: 'mañana' | 'noche';
  date: string | null;
  status: 'borrador' | 'activo' | 'cerrado';
  created_at: string;
  response_count?: number;
}

export interface StudyDetail extends Study {
  surveys: StudySurvey[];
  totalResponses: number;
  respondentTargets: RespondentTarget[];
}

export interface SurveyReport {
  survey: Survey;
  summary: {
    response_count: number;
    participants_count: number;
    judges_count: number;
    exhibitors_count: number;
  };
  questions: ReportQuestion[];
}
