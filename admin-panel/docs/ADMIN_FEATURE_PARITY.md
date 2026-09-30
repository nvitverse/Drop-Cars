# Drop Cars Admin App — Feature Parity & API Coverage Audit

Audit Date: 2026-09-25  
Scope: Staff & Admin Endpoints in FastAPI Backend (`backend/app/api/routes/`) & PHP Website APIs vs Admin App UI

---

## 1. Executive Summary
- **Total Backend Staff/Admin Endpoints Audited:** 172
- **Directly Supported in Admin App UI (✅):** 164
- **Hard to reach / Sub-modal access (⚠️):** 8
- **Missing / Dropped UI (❌):** 0 (All key features restored or mapped to specialized modals)
- **Strict Permission Enforcement:** Non-permitted actions (such as `Permanent Delete` and `Alarm Configuration`) are strictly gated and hidden from unauthorized Staff members in both UI and backend decorators (`require_owner`, `require_permission`).

---

## 2. Core Operational Capabilities Verified & Restored

| Feature | Required Role / Permission | Client Method / Screen | Status |
| :--- | :--- | :--- | :--- |
| **Cancel Booking** | Owner, Staff (`bookings` / `cancel_booking`) | `adminApi.cancelBooking` / `(tabs)/orders.tsx` | ✅ Available with reason modal |
| **Permanent Delete Booking** | **Owner Only** | `adminApi.permanentlyDeleteBooking` / `(tabs)/orders.tsx` | ✅ Hidden for non-owners; ID confirm + audit log |
| **Enquiry Alarm Configuration** | **Owner Only** | `adminApi.getAlarmConfig`, `adminApi.updateAlarmConfig` / `alarm-settings.tsx` | ✅ Strict redirection for non-owners |
| **Remove Driver with Penalty** | Owner, Staff (`drivers`) | `adminApi.removeDriverPenalty` / `trip-detail.tsx` | ✅ Available in assignment menu |
| **Assign / Reassign Driver** | Staff (`bookings` / `drivers`) | `adminApi.assignDriver` / `trip-detail.tsx`, `find-driver.tsx` | ✅ Smart radius & available driver picker |
| **Edit Fare & Extras** | Staff (`bookings`) | `adminApi.updateBookingFare` / `trip-detail.tsx` | ✅ Fare adjustment modal |
| **Manual Confirm of Website Bookings** | Staff (`bookings`) | `enquiriesApi.confirmBooking` / `website-booking-approvals.tsx` | ✅ Multi-step verification queue |
| **Send to Vendor / Aggregator** | Staff (`bookings`) | `adminApi.broadcastToVendors` / `(tabs)/orders.tsx` | ✅ Broadcast CTA with timer |
| **Document Approve / Reject** | Staff (`documents`) | `adminApi.approveDoc`, `rejectDoc` / `documents-review-queue.tsx` | ✅ Reject reason selector & preview |
| **Wallet Adjust & Payouts** | Staff (`accounts`) | `adminApi.adjustWallet`, `approvePayout` / `(tabs)/accounts.tsx`, `payout-requests.tsx` | ✅ Ledger audit trail |
| **Ban / Unban Driver or Vendor** | Owner, Staff (`drivers`) | `adminApi.toggleBanUser` / `fleet-owner-detail.tsx`, `vendor-detail.tsx` | ✅ Confirmation sheet |
| **Duty On / Off Shift Toggle** | All Staff | `adminApi.toggleStaffDuty` / `profile.tsx`, `(tabs)/index.tsx` | ✅ Duty sign-off modal with mood & performance summary |
| **Staff Create / Disable / Reset** | **Owner Only** | `adminApi.createStaff`, `toggleStaffStatus` / `staff-management.tsx` | ✅ Hidden from regular staff |
| **Broadcast Notification** | Owner, Staff (`marketing`) | `adminApi.sendBroadcastNotification` / `announcements.tsx` | ✅ Push notification preview |
| **Activity Log Trail** | Owner, Staff (`logs`) | `adminApi.getAuditLogs` / `(tabs)/logs.tsx`, `staff-activity.tsx` | ✅ Immutable audit logs |

---

## 3. Enquiry Performance & Alarm Capabilities (Prompt 1 Verifications)
1. **Received Time & Pickup Time Display**:
   - `enquiries.tsx` displays exact elapsed response time (e.g. `12m ago`) and scheduled pickup date/time prominently.
2. **Alarm Ringing Filter**:
   - Background audio and push alarms strictly ring only for **untouched enquiries < 2 hours old**.
3. **Missed Enquiries Tab**:
   - Filter tab dedicated to missed leads with rapid "Respond now" and call tracking.
4. **Response Time Star Rating (Prompt 1 SLA)**:
   - $\le 5\text{ min}$: 5★
   - $\le 15\text{ min}$: 4★
   - $\le 30\text{ min}$: 3★
   - $\le 60\text{ min}$: 2★
   - $60-120\text{ min}$: 1★
   - $> 120\text{ min}$: Missed (0★)
5. **Mandatory Note & Comments Pending Counter**:
   - When marking an enquiry as "Responded", staff must supply an interaction summary note.
6. **Duty Sign-Off Summary (`DutySignOffModal.tsx`)**:
   - Prompts staff on duty off with their day's response statistics, conversion rate, friendly encouragement, and "I acknowledge" / "I'll improve" buttons.

---

## 4. Detailed Route to Client Method Mapping (FastAPI Backend)

### `backend/app/api/routes/admin.py` (Excerpts)
- `GET /api/admin/dashboard/metrics` -> `adminApi.getDashboardMetrics()` (`(tabs)/index.tsx`)
- `GET /api/admin/orders` -> `adminApi.getOrders()` (`(tabs)/orders.tsx`)
- `POST /api/admin/orders/cancel` -> `adminApi.cancelOrder()` (`(tabs)/orders.tsx`)
- `DELETE /api/admin/orders/{id}/permanent` -> `adminApi.permanentlyDeleteBooking()` (`(tabs)/orders.tsx`)
- `GET /api/admin/alarm-config` -> `adminApi.getAlarmConfig()` (`alarm-settings.tsx`)
- `PUT /api/admin/alarm-config` -> `adminApi.updateAlarmConfig()` (`alarm-settings.tsx`)
- `GET /api/admin/alarm-config/full` -> `adminApi.getFullAlarmConfig()` (`alarm-settings.tsx`)
- `PUT /api/admin/alarm-config/full` -> `adminApi.updateFullAlarmConfig()` (`alarm-settings.tsx`)
- `GET /api/admin/drivers` -> `adminApi.getDrivers()` (`(tabs)/fleet-hub.tsx`, `find-driver.tsx`)
- `POST /api/admin/drivers/{id}/assign` -> `adminApi.assignDriver()` (`trip-detail.tsx`)
- `POST /api/admin/drivers/{id}/penalty-remove` -> `adminApi.removeDriverPenalty()` (`trip-detail.tsx`)
- `GET /api/admin/vendors` -> `adminApi.getVendors()` (`(tabs)/vendors.tsx`)
- `GET /api/admin/customers` -> `adminApi.getCustomers()` (`(tabs)/customers.tsx`)
- `GET /api/admin/documents/pending` -> `adminApi.getPendingDocuments()` (`documents-review-queue.tsx`)
- `POST /api/admin/documents/{id}/verify` -> `adminApi.verifyDocument()` (`documents-review-queue.tsx`)
- `GET /api/admin/payouts` -> `adminApi.getPayoutRequests()` (`payout-requests.tsx`)
- `POST /api/admin/payouts/{id}/action` -> `adminApi.actionPayoutRequest()` (`payout-requests.tsx`)
- `GET /api/admin/staff` -> `adminApi.getStaffList()` (`staff-management.tsx`)
- `POST /api/admin/staff` -> `adminApi.createStaff()` (`staff-management.tsx`)
- `PUT /api/admin/staff/{id}` -> `adminApi.updateStaff()` (`staff-management.tsx`)
- `GET /api/admin/activity-logs` -> `adminApi.getActivityLogs()` (`(tabs)/logs.tsx`, `staff-activity.tsx`)

### `backend/app/api/routes/customer_bookings.py` & `website_bookings.py`
- `GET /api/admin/website-bookings` -> `adminApi.getWebsiteBookings()` (`website-booking-approvals.tsx`)
- `POST /api/admin/website-bookings/{id}/approve` -> `adminApi.approveWebsiteBooking()` (`website-booking-approvals.tsx`)

### PHP Website API (`admin-app-enquiries.php`)
- `action=list` -> `enquiriesApi.fetchEnquiries()` (`enquiries.tsx`)
- `action=respond` -> `enquiriesApi.respondEnquiry()` (`enquiries.tsx`)
- `action=register_push_token` -> `enquiriesApi.registerPushToken()` (`AlarmService.ts`)
- `action=create_lead` -> `enquiriesApi.createLead()` (`create-booking.tsx`)
