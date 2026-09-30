# Frontend Implementation Guide - Document Verification System

This guide provides a complete frontend implementation for the admin document verification system.

## Overview

The admin can:
1. View all accounts
2. Click on an account to see all documents
3. View each document one by one
4. Verify or reject each document individually

## API Endpoints

### 1. Get All Documents for an Account
```
GET /api/admin/accounts/{account_id}/documents?account_type={type}
```

**Response:**
```json
{
  "account_id": "uuid",
  "account_type": "vendor|vehicle_owner|driver",
  "account_name": "John Doe",
  "account_documents": [
    {
      "document_id": "account_aadhar",
      "document_type": "aadhar",
      "document_name": "Aadhar Card",
      "image_url": "https://...",
      "status": "PENDING|VERIFIED|INVALID",
      "uploaded_at": "2025-01-01T10:00:00Z",
      "car_id": null,
      "car_name": null,
      "car_number": null
    }
  ],
  "car_documents": [
    {
      "document_id": "car_123_rc_front",
      "document_type": "rc_front",
      "document_name": "RC Front - Toyota Camry",
      "image_url": "https://...",
      "status": "PENDING",
      "uploaded_at": "2025-01-01T10:00:00Z",
      "car_id": "uuid",
      "car_name": "Toyota Camry",
      "car_number": "MH-12-AB-1234"
    }
  ],
  "total_documents": 7,
  "pending_count": 3,
  "verified_count": 2,
  "invalid_count": 2
}
```

### 2. Update Document Status
```
PATCH /api/admin/accounts/{account_id}/documents/{document_id}/status?account_type={type}&status={status}
```

**Query Parameters:**
- `account_type`: vendor|vehicle_owner|driver
- `status`: PENDING|VERIFIED|INVALID

**Response:**
```json
{
  "message": "Document status updated successfully",
  "document_id": "account_aadhar",
  "document_type": "aadhar",
  "new_status": "VERIFIED"
}
```

## React/Next.js Implementation

### 1. Account List Component

```tsx
// components/AccountList.tsx
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

interface Account {
  id: string;
  name: string;
  account_type: string;
  account_status: string;
}

export default function AccountList() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/admin/accounts', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      setAccounts(data.accounts);
    } catch (error) {
      console.error('Error fetching accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAccountClick = (accountId: string, accountType: string) => {
    router.push(`/admin/accounts/${accountId}/documents?account_type=${accountType}`);
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="account-list">
      <h1>All Accounts</h1>
      <div className="accounts-grid">
        {accounts.map((account) => (
          <div
            key={account.id}
            className="account-card"
            onClick={() => handleAccountClick(account.id, account.account_type)}
          >
            <h3>{account.name}</h3>
            <p>Type: {account.account_type}</p>
            <p>Status: {account.account_status}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 2. Document Verification Component

```tsx
// components/DocumentVerification.tsx
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

interface DocumentItem {
  document_id: string;
  document_type: string;
  document_name: string;
  image_url: string | null;
  status: string;
  uploaded_at: string;
  car_id?: string | null;
  car_name?: string | null;
  car_number?: string | null;
}

interface DocumentsResponse {
  account_id: string;
  account_type: string;
  account_name: string;
  account_documents: DocumentItem[];
  car_documents: DocumentItem[];
  total_documents: number;
  pending_count: number;
  verified_count: number;
  invalid_count: number;
}

export default function DocumentVerification() {
  const router = useRouter();
  const { account_id, account_type } = router.query;
  
  const [documents, setDocuments] = useState<DocumentsResponse | null>(null);
  const [currentDocIndex, setCurrentDocIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (account_id && account_type) {
      fetchDocuments();
    }
  }, [account_id, account_type]);

  const fetchDocuments = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(
        `/api/admin/accounts/${account_id}/documents?account_type=${account_type}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      const data = await response.json();
      setDocuments(data);
    } catch (error) {
      console.error('Error fetching documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateDocumentStatus = async (documentId: string, status: string) => {
    setUpdating(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(
        `/api/admin/accounts/${account_id}/documents/${documentId}/status?account_type=${account_type}&status=${status}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      
      if (response.ok) {
        // Refresh documents
        await fetchDocuments();
        alert('Document status updated successfully');
      } else {
        alert('Failed to update document status');
      }
    } catch (error) {
      console.error('Error updating document:', error);
      alert('Error updating document status');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) return <div>Loading documents...</div>;
  if (!documents) return <div>No documents found</div>;

  // Combine all documents
  const allDocuments = [...documents.account_documents, ...documents.car_documents];
  const currentDocument = allDocuments[currentDocIndex];

  if (!currentDocument) {
    return <div>No documents to display</div>;
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'VERIFIED': return 'green';
      case 'INVALID': return 'red';
      case 'PENDING': return 'orange';
      default: return 'gray';
    }
  };

  return (
    <div className="document-verification">
      <div className="header">
        <button onClick={() => router.back()}>← Back to Accounts</button>
        <h1>{documents.account_name} - Document Verification</h1>
        <div className="stats">
          <span>Total: {documents.total_documents}</span>
          <span style={{ color: 'orange' }}>Pending: {documents.pending_count}</span>
          <span style={{ color: 'green' }}>Verified: {documents.verified_count}</span>
          <span style={{ color: 'red' }}>Invalid: {documents.invalid_count}</span>
        </div>
      </div>

      <div className="document-viewer">
        <div className="document-info">
          <h2>{currentDocument.document_name}</h2>
          {currentDocument.car_name && (
            <p>Car: {currentDocument.car_name} ({currentDocument.car_number})</p>
          )}
          <p>Type: {currentDocument.document_type}</p>
          <p>Status: 
            <span style={{ color: getStatusColor(currentDocument.status), fontWeight: 'bold' }}>
              {currentDocument.status}
            </span>
          </p>
          <p>Uploaded: {new Date(currentDocument.uploaded_at).toLocaleDateString()}</p>
        </div>

        <div className="document-image">
          {currentDocument.image_url ? (
            <img 
              src={currentDocument.image_url} 
              alt={currentDocument.document_name}
              style={{ maxWidth: '100%', maxHeight: '600px' }}
            />
          ) : (
            <div>No image available</div>
          )}
        </div>

        <div className="document-actions">
          <button
            onClick={() => updateDocumentStatus(currentDocument.document_id, 'VERIFIED')}
            disabled={updating || currentDocument.status === 'VERIFIED'}
            className="btn-verify"
          >
            ✓ Verify
          </button>
          <button
            onClick={() => updateDocumentStatus(currentDocument.document_id, 'INVALID')}
            disabled={updating || currentDocument.status === 'INVALID'}
            className="btn-reject"
          >
            ✗ Reject
          </button>
          <button
            onClick={() => updateDocumentStatus(currentDocument.document_id, 'PENDING')}
            disabled={updating || currentDocument.status === 'PENDING'}
            className="btn-pending"
          >
            ⏳ Set Pending
          </button>
        </div>

        <div className="document-navigation">
          <button
            onClick={() => setCurrentDocIndex(Math.max(0, currentDocIndex - 1))}
            disabled={currentDocIndex === 0}
          >
            ← Previous
          </button>
          <span>
            Document {currentDocIndex + 1} of {allDocuments.length}
          </span>
          <button
            onClick={() => setCurrentDocIndex(Math.min(allDocuments.length - 1, currentDocIndex + 1))}
            disabled={currentDocIndex === allDocuments.length - 1}
          >
            Next →
          </button>
        </div>
      </div>

      <div className="document-list">
        <h3>All Documents</h3>
        <div className="documents-grid">
          {allDocuments.map((doc, index) => (
            <div
              key={doc.document_id}
              className={`document-thumbnail ${index === currentDocIndex ? 'active' : ''}`}
              onClick={() => setCurrentDocIndex(index)}
            >
              <div className="thumbnail-status" style={{ backgroundColor: getStatusColor(doc.status) }}>
                {doc.status}
              </div>
              <p>{doc.document_name}</p>
              {doc.car_name && <small>{doc.car_name}</small>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

### 3. CSS Styles

```css
/* styles/document-verification.css */
.document-verification {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 2px solid #eee;
}

.stats {
  display: flex;
  gap: 20px;
}

.stats span {
  padding: 5px 15px;
  background: #f5f5f5;
  border-radius: 5px;
  font-weight: bold;
}

.document-viewer {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 30px;
  margin-bottom: 40px;
}

.document-info {
  background: #f9f9f9;
  padding: 20px;
  border-radius: 8px;
  height: fit-content;
}

.document-info h2 {
  margin-top: 0;
  color: #333;
}

.document-info p {
  margin: 10px 0;
  color: #666;
}

.document-image {
  text-align: center;
  background: #fff;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.document-image img {
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.document-actions {
  grid-column: 1 / -1;
  display: flex;
  gap: 15px;
  justify-content: center;
  padding: 20px;
  background: #f9f9f9;
  border-radius: 8px;
}

.document-actions button {
  padding: 12px 30px;
  border: none;
  border-radius: 6px;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-verify {
  background: #4CAF50;
  color: white;
}

.btn-verify:hover:not(:disabled) {
  background: #45a049;
}

.btn-reject {
  background: #f44336;
  color: white;
}

.btn-reject:hover:not(:disabled) {
  background: #da190b;
}

.btn-pending {
  background: #ff9800;
  color: white;
}

.btn-pending:hover:not(:disabled) {
  background: #e68900;
}

.document-actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.document-navigation {
  grid-column: 1 / -1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  background: #f9f9f9;
  border-radius: 8px;
}

.document-navigation button {
  padding: 10px 20px;
  border: 1px solid #ddd;
  background: white;
  border-radius: 6px;
  cursor: pointer;
}

.document-navigation button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.document-list {
  margin-top: 40px;
}

.documents-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 15px;
  margin-top: 20px;
}

.document-thumbnail {
  background: white;
  border: 2px solid #ddd;
  border-radius: 8px;
  padding: 15px;
  cursor: pointer;
  transition: all 0.3s;
  text-align: center;
}

.document-thumbnail:hover {
  border-color: #4CAF50;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0,0,0,0.1);
}

.document-thumbnail.active {
  border-color: #4CAF50;
  background: #f0f8f0;
}

.thumbnail-status {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  color: white;
  font-size: 12px;
  font-weight: bold;
  margin-bottom: 10px;
}

.account-list {
  padding: 20px;
}

.accounts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
  margin-top: 20px;
}

.account-card {
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.3s;
}

.account-card:hover {
  border-color: #4CAF50;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  transform: translateY(-2px);
}
```

## Vue.js Implementation

```vue
<!-- components/DocumentVerification.vue -->
<template>
  <div class="document-verification">
    <div class="header">
      <button @click="$router.back()">← Back</button>
      <h1>{{ documents?.account_name }} - Documents</h1>
      <div class="stats">
        <span>Total: {{ documents?.total_documents }}</span>
        <span style="color: orange">Pending: {{ documents?.pending_count }}</span>
        <span style="color: green">Verified: {{ documents?.verified_count }}</span>
        <span style="color: red">Invalid: {{ documents?.invalid_count }}</span>
      </div>
    </div>

    <div class="document-viewer" v-if="currentDocument">
      <div class="document-info">
        <h2>{{ currentDocument.document_name }}</h2>
        <p v-if="currentDocument.car_name">
          Car: {{ currentDocument.car_name }} ({{ currentDocument.car_number }})
        </p>
        <p>Status: 
          <span :style="{ color: getStatusColor(currentDocument.status) }">
            {{ currentDocument.status }}
          </span>
        </p>
      </div>

      <div class="document-image">
        <img 
          v-if="currentDocument.image_url"
          :src="currentDocument.image_url" 
          :alt="currentDocument.document_name"
        />
      </div>

      <div class="document-actions">
        <button 
          @click="updateStatus('VERIFIED')"
          :disabled="updating || currentDocument.status === 'VERIFIED'"
          class="btn-verify"
        >
          ✓ Verify
        </button>
        <button 
          @click="updateStatus('INVALID')"
          :disabled="updating || currentDocument.status === 'INVALID'"
          class="btn-reject"
        >
          ✗ Reject
        </button>
      </div>

      <div class="document-navigation">
        <button @click="previousDoc" :disabled="currentIndex === 0">← Previous</button>
        <span>Document {{ currentIndex + 1 }} of {{ allDocuments.length }}</span>
        <button @click="nextDoc" :disabled="currentIndex === allDocuments.length - 1">Next →</button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      documents: null,
      currentIndex: 0,
      loading: true,
      updating: false
    };
  },
  computed: {
    allDocuments() {
      if (!this.documents) return [];
      return [...this.documents.account_documents, ...this.documents.car_documents];
    },
    currentDocument() {
      return this.allDocuments[this.currentIndex];
    }
  },
  async mounted() {
    await this.fetchDocuments();
  },
  methods: {
    async fetchDocuments() {
      const accountId = this.$route.params.account_id;
      const accountType = this.$route.query.account_type;
      const token = localStorage.getItem('admin_token');
      
      const response = await fetch(
        `/api/admin/accounts/${accountId}/documents?account_type=${accountType}`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      this.documents = await response.json();
      this.loading = false;
    },
    async updateStatus(status) {
      this.updating = true;
      const accountId = this.$route.params.account_id;
      const accountType = this.$route.query.account_type;
      const token = localStorage.getItem('admin_token');
      
      await fetch(
        `/api/admin/accounts/${accountId}/documents/${this.currentDocument.document_id}/status?account_type=${accountType}&status=${status}`,
        {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      
      await this.fetchDocuments();
      this.updating = false;
    },
    getStatusColor(status) {
      const colors = {
        VERIFIED: 'green',
        INVALID: 'red',
        PENDING: 'orange'
      };
      return colors[status] || 'gray';
    },
    previousDoc() {
      if (this.currentIndex > 0) this.currentIndex--;
    },
    nextDoc() {
      if (this.currentIndex < this.allDocuments.length - 1) this.currentIndex++;
    }
  }
};
</script>
```

## Key Features

1. **Document Navigation**: Previous/Next buttons to view documents one by one
2. **Status Indicators**: Color-coded status badges (Green=Verified, Red=Invalid, Orange=Pending)
3. **Quick Actions**: Verify/Reject buttons for each document
4. **Document Thumbnails**: Grid view of all documents for quick navigation
5. **Statistics**: Display counts of pending, verified, and invalid documents
6. **Car Information**: Show car details for car documents

## Testing

Use the Postman guide to test the APIs, then integrate with your frontend framework of choice.

