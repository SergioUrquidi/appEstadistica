import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { User } from './models';

interface LoginResponse {
  token: string;
  user: User;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<User | null>(null);

  constructor(private readonly http: HttpClient) {}

  get token(): string | null {
    return sessionStorage.getItem('access_token');
  }

  async initialize(): Promise<void> {
    if (!this.token) return;
    try {
      this.user.set(await firstValueFrom(this.http.get<User>('/api/me')));
    } catch {
      this.logout();
    }
  }

  async login(email: string, password: string): Promise<void> {
    const result = await firstValueFrom(
      this.http.post<LoginResponse>('/api/auth/login', { email, password }),
    );
    sessionStorage.setItem('access_token', result.token);
    this.user.set(result.user);
  }

  logout(): void {
    sessionStorage.removeItem('access_token');
    this.user.set(null);
  }
}
