import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

interface FeriaItem {
  id: string;
  titulo: string;
  turno: string;
  fecha: string | null;
}

interface FreqItem {
  valor: string;
  fi: number;
  hi: number;
  pct: number;
  Fi: number;
  Hi: number;
}

interface DashboardPregunta {
  pregunta_texto: string;
  posicion: number;
  tipo_label: string;
  es_numerica: boolean;
  n_respuestas: number;
  media: number | null;
  mediana: number | null;
  moda_valor: string | null;
  moda_frecuencia: number | null;
  varianza: number | null;
  desv_estandar: number | null;
  desv_media: number | null;
  coef_variacion: number | null;
  rango: number | null;
  minimo: number | null;
  maximo: number | null;
  q1: number | null;
  q3: number | null;
  iqr: number | null;
  sesgo: number | null;
  curtosis: number | null;
  error_estandar: number | null;
  ic_inf_95: number | null;
  ic_sup_95: number | null;
  frecuencias: FreqItem[];
}

interface GrupoConteo { grupo: string; conteo: number; }

interface DashboardData {
  titulo: string;
  turno: string;
  fecha: string | null;
  total_respuestas: number;
  total_encuestas: number;
  respuestas_por_grupo: GrupoConteo[];
  preguntas: DashboardPregunta[];
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private http = inject(HttpClient);

  getFerias(): Observable<FeriaItem[]> {
    return this.http.get<FeriaItem[]>('/api/dashboard/ferias');
  }

  getDashboard(feriaId: string): Observable<DashboardData> {
    return this.http.get<DashboardData>(`/api/estudios/${feriaId}/dashboard`);
  }
}
