/**
 * Production API Client for NestJS API (@ne-crm/api)
 * Enables Next.js Web App to communicate with NestJS backend in production.
 */

export const IS_PRODUCTION_API = process.env.USE_PRODUCTION_API === 'true';
export const API_BASE_URL = process.env.NESTJS_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000/api';

export type ApiError = {
  statusCode: number;
  message: string | string[];
  error?: string;
};

export class ProductionApiClient {
  private baseUrl: string;

  constructor(baseUrl = API_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async request<T>(endpoint: string, token: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${token}`);
    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorBody: ApiError | null = null;
      try {
        errorBody = await response.json();
      } catch {
        // non-json response
      }
      const message = Array.isArray(errorBody?.message)
        ? errorBody.message.join(', ')
        : errorBody?.message || `API error ${response.status}: ${response.statusText}`;
      throw new Error(message);
    }

    return response.json() as Promise<T>;
  }

  // --- Auth & Me ---
  async getMe(token: string) {
    return this.request<{ id: string; role: 'ADMIN' | 'LEADER' | 'SALES'; displayName: string }>('/me', token);
  }

  // --- Dashboard ---
  async getDashboardSummary(token: string) {
    return this.request<{
      scope: 'sales' | 'all';
      applicationsTotal: number;
      openLeads: number;
      netNe: number;
    }>('/dashboard/summary', token);
  }

  // --- Applications (Leads) ---
  async getApplications(token: string, options: { limit?: number } = {}) {
    const query = options.limit ? `?limit=${options.limit}` : '';
    return this.request<{ items: unknown[]; limit: number }>(`/applications${query}`, token);
  }

  async getApplication(token: string, id: string) {
    return this.request<unknown>(`/applications/${id}`, token);
  }

  // --- Payments ---
  async getPayments(token: string, options: { status?: string; kind?: string; limit?: number } = {}) {
    const params = new URLSearchParams();
    if (options.status) params.set('status', options.status);
    if (options.kind) params.set('kind', options.kind);
    if (options.limit) params.set('limit', String(options.limit));
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<{ items: unknown[]; limit: number }>(`/payments${query}`, token);
  }

  async reviewPayment(token: string, id: string, decision: 'CONFIRMED' | 'REJECTED', reason?: string) {
    return this.request<{ ok: boolean; status: string; eventsCreated?: number }>(`/payments/${id}/review`, token, {
      method: 'POST',
      body: JSON.stringify({ decision, reason }),
    });
  }

  // --- NE Events ---
  async getNeEvents(token: string, options: { delta?: string; limit?: number } = {}) {
    const params = new URLSearchParams();
    if (options.delta) params.set('delta', options.delta);
    if (options.limit) params.set('limit', String(options.limit));
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<{ items: unknown[]; limit: number }>(`/ne-events${query}`, token);
  }

  // --- CTV ---
  async getCtvs(token: string) {
    return this.request<{ items: unknown[] }>('/ctv', token);
  }

  async createCtv(token: string, data: { displayName: string; phone?: string; ownerSalesId?: string }) {
    return this.request<{ id: string; ok: boolean }>('/ctv', token, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async transferCtv(token: string, id: string, ownerSalesId: string) {
    return this.request<{ ok: boolean }>('/ctv/' + id + '/transfer', token, {
      method: 'PATCH',
      body: JSON.stringify({ ownerSalesId }),
    });
  }

  // --- Admin ---
  async getAdminUsers(token: string) {
    return this.request<unknown[]>('/admin/users', token);
  }

  async getAdminAudit(token: string, options: { limit?: number } = {}) {
    const query = options.limit ? `?limit=${options.limit}` : '';
    return this.request<unknown[]>(`/admin/audit${query}`, token);
  }
}

export const productionApiClient = new ProductionApiClient();
