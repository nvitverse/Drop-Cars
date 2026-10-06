import { apiService } from './api';

export interface TrainingRule {
  id: string;
  question?: string;
  triggers: string[];
  category: string;
  response_en: string;
  response_ta: string;
  suggestions?: string[];
  follow_up_prompt?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ChatLogItem {
  id: number | string;
  created_at: string;
  query: string;
  response: string;
  category: string;
  confidence: number;
  language: string;
}

export interface AISettings {
  ai_mode: 'RULE_BASED' | 'HYBRID_LLM';
  has_api_key: boolean;
  masked_api_key?: string;
  operator_name: string;
  is_enabled: boolean;
}

export const aiTrainingApi = {
  async getRules(): Promise<{ count: number; rules: TrainingRule[] }> {
    return apiService.makeRequest('/ai-training/rules');
  },

  async createRule(payload: {
    question?: string;
    triggers: string[];
    response_en: string;
    response_ta: string;
    category?: string;
    suggestions?: string[];
    follow_up_prompt?: string;
  }): Promise<{ success: boolean; rule: TrainingRule }> {
    return apiService.makeRequest('/ai-training/rules', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateRule(
    ruleId: string,
    updates: Partial<TrainingRule>
  ): Promise<{ success: boolean; rule: TrainingRule }> {
    return apiService.makeRequest(`/ai-training/rules/${ruleId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async deleteRule(ruleId: string): Promise<{ success: boolean }> {
    return apiService.makeRequest(`/ai-training/rules/${ruleId}`, {
      method: 'DELETE',
    });
  },

  async seedFaqs(): Promise<{ success: boolean; message: string }> {
    return apiService.makeRequest('/ai-training/seed', {
      method: 'POST',
    });
  },

  async getLogs(limit = 40): Promise<{ count: number; logs: ChatLogItem[] }> {
    return apiService.makeRequest(`/ai-training/logs?limit=${limit}`);
  },

  async correctLog(payload: {
    query: string;
    correct_reply: string;
    category?: string;
    language?: string;
    question?: string;
  }): Promise<{ success: boolean; message: string; rule: TrainingRule }> {
    return apiService.makeRequest('/ai-training/correct-log', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getSettings(): Promise<AISettings> {
    return apiService.makeRequest('/ai-training/settings');
  },

  async updateSettings(payload: {
    ai_mode?: string;
    api_key?: string;
    operator_name?: string;
    is_enabled?: boolean;
  }): Promise<{ success: boolean; message: string }> {
    return apiService.makeRequest('/ai-training/settings', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async resetSession(sessionId = 'admin_simulator'): Promise<{ success: boolean }> {
    return apiService.makeRequest('/ai-training/reset-session', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId }),
    });
  },

  async testChat(
    message: string,
    language: 'ta' | 'en' = 'ta',
    sessionId = 'admin_simulator',
    reset = false
  ): Promise<{
    success: boolean;
    engine: string;
    reply: string;
    category: string;
    suggestions: string[];
    matched_trigger?: string;
    session_id?: string;
  }> {
    return apiService.makeRequest('/ai-training/test-chat', {
      method: 'POST',
      body: JSON.stringify({ message, language, session_id: sessionId, reset }),
    });
  },
};

