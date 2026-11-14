export interface User {
  id: string;
  email: string;
  display_name: string;
  role: 'superuser' | 'admin' | 'user';
}

export interface Survey {
  id: string;
  title: string;
  description: string;
  status: 'draft' | 'active' | 'closed';
  created_at: string;
  response_count?: number;
}

export interface Question {
  id: string;
  position: number;
  prompt: string;
  min_value: number | null;
  max_value: number | null;
}

export interface SurveyDetail extends Survey {
  creator_id: string;
  updated_at: string;
  questions: Question[];
}

export interface ReportQuestion {
  questionId: string;
  prompt: string;
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
  frequencies: { value: number; frequency: number }[];
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
