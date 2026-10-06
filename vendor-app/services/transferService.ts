import { getRequestTransferUrl, getCheckBalanceUrl, getTransferHistoryUrl, getTransferStatisticsUrl } from '../config/api';

export interface TransferRequest {
  amount: number;
}

export interface BalanceResponse {
  vendor_id: string;
  wallet_balance: number;
  bank_balance: number;
  total_balance: number;
}

export interface TransferTransaction {
  id: string;
  vendor_id: string;
  requested_amount: number;
  wallet_balance_before: number;
  bank_balance_before: number;
  wallet_balance_after: number | null;
  bank_balance_after: number | null;
  status: 'Pending' | 'Approved' | 'Rejected';
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TransferHistoryResponse {
  transactions: TransferTransaction[];
  total_count: number;
}

export interface TransferStatistics {
  total_approved: number;
  total_rejected: number;
  total_pending: number;
  total_transferred: number;
}

export interface TransferRequestResponse {
  id: string;
  vendor_id: string;
  requested_amount: number;
  wallet_balance_before: number;
  bank_balance_before: number;
  wallet_balance_after: number | null;
  bank_balance_after: number | null;
  status: 'Pending' | 'Approved' | 'Rejected';
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

class TransferService {
  private async makeRequest<T>(
    url: string,
    options: RequestInit = {}
  ): Promise<T> {
    try {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Transfer service error:', error);
      throw error;
    }
  }

  async requestTransfer(amount: number, authToken: string): Promise<TransferRequestResponse> {
    const url = getRequestTransferUrl();
    return this.makeRequest<TransferRequestResponse>(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({ amount }),
    });
  }

  async checkBalance(authToken: string): Promise<BalanceResponse> {
    const url = getCheckBalanceUrl();
    return this.makeRequest<BalanceResponse>(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`,
      },
    });
  }

  async getTransferHistory(
    authToken: string,
    skip: number = 0,
    limit: number = 100
  ): Promise<TransferHistoryResponse> {
    const url = `${getTransferHistoryUrl()}?skip=${skip}&limit=${limit}`;
    return this.makeRequest<TransferHistoryResponse>(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`,
      },
    });
  }

  async getTransferStatistics(authToken: string): Promise<TransferStatistics> {
    const url = getTransferStatisticsUrl();
    return this.makeRequest<TransferStatistics>(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`,
      },
    });
  }
}

export const transferService = new TransferService();
