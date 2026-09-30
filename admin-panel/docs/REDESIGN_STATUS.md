# Drop Cars Admin App — Redesign Status Matrix

Total Screens: 89  
Design System: `@/components/ui` (Compact layout, <=8-10px border radius, 1px hairline borders, responsive theme tokens: light, dark, 5 accent colors, 44px min touch targets).

---

## 1. Bookings & Operations
| Screen | Before | Status | Notes |
| :--- | :--- | :--- | :--- |
| `(tabs)/orders.tsx` | Custom RN StyleSheet | ✅ Redesigned | Tab order list with filter pills, status badges, cancel modal role check, permanent delete modal |
| `create-booking.tsx` | Old Form / Raw Inputs | ✅ Redesigned | Multi-step booking creator with pricing calculation, validation, theme modals |
| `quote-estimate.tsx` | Raw RN views | ✅ Redesigned | Fare estimation and tariff breakdowns |
| `trip-detail.tsx` | Custom StyleSheet | ✅ Redesigned | Detailed trip telemetry, timeline, driver assignment, billing breakdown |
| `website-booking-approvals.tsx` | Raw RN views | ✅ Redesigned | Manual verification and approval queue for web bookings with Card, StatusPill, Btn, EmptyState |
| `savaari-bookings.tsx` | Raw RN views | ✅ Redesigned | Aggregator / Savaari integration orders management with Card, StatusPill, EmptyState |

---

## 2. Enquiries & Communication
| Screen | Before | Status | Notes |
| :--- | :--- | :--- | :--- |
| `enquiries.tsx` | Raw cards / hardcoded alerts | ✅ Redesigned | Web enquiries stream, missed tab, response time rating (5★ scale), call/WA CTA |
| `(tabs)/chats.tsx` | Raw chat list | ✅ Redesigned | Live customer & driver chat hub with voice notes |
| `chats.tsx` | Redirect alias | ✅ Redesigned | Router redirect to `/(tabs)/chats` |
| `(tabs)/leads.tsx` | Redirect alias | ✅ Redesigned | Router redirect to `/enquiries` |

---

## 3. People, Fleet & Drivers
| Screen | Before | Status | Notes |
| :--- | :--- | :--- | :--- |
| `(tabs)/fleet-hub.tsx` | Legacy list | ✅ Redesigned | Quick fleet dashboard with stats and status pills |
| `(tabs)/customers.tsx` | Raw list | ✅ Redesigned | Customer database with search and segment tabs |
| `customer-detail.tsx` | Raw views | ✅ Redesigned | Profile, booking history, password reset, delete account |
| `(tabs)/vendors.tsx` | Raw list | ✅ Redesigned | Vendor listing with balance and status actions |
| `vendor-detail.tsx` | Raw views | ✅ Redesigned | Vendor fleet, commission, documents, bank details with Card, StatusPill, Btn |
| `(tabs)/vehicle-owners.tsx` | Raw list | ✅ Redesigned | Vehicle owner directory and vehicles linked |
| `fleet-owner-detail.tsx` | Raw views | ✅ Redesigned | Fleet owner profile, attached cars, driver payouts with tabbed Card, StatusPill, Btn |
| `(tabs)/cars.tsx` | Raw list | ✅ Redesigned | Vehicle inventory, inspection and status filters |
| `(tabs)/our-fleet.tsx` | Raw list | ✅ Redesigned | Dedicated company fleet inventory and availability with Card, StatusPill |
| `find-driver.tsx` | Raw views | ✅ Redesigned | Driver discovery, nearest driver search, radius filter with Card, StatusPill, Segmented |
| `assign-car.tsx` | Raw views | ✅ Redesigned | Car-to-driver assignment modal and workflow with Card, StatusPill, Btn |
| `car-substitution-requests.tsx` | Raw list | ✅ Redesigned | Car change request management |
| `car-models.tsx` | Raw list | ✅ Redesigned | Car make/model library management |
| `new-car-year.tsx` | Raw form | ✅ Redesigned | Car year mapping definition |
| `(tabs)/vacant-cities.tsx` | Raw list | ✅ Redesigned | Supply/demand gap analysis by city |
| `our-fleet-requests.tsx` | Raw list | ✅ Redesigned | Vehicle attachment requests for our fleet with Card, StatusPill, Btn |

---

## 4. Documents & Verification
| Screen | Before | Status | Notes |
| :--- | :--- | :--- | :--- |
| `documents-review-queue.tsx` | Raw cards | ✅ Redesigned | Pending driver/vendor documents review queue |
| `account-documents.tsx` | Raw views | ✅ Redesigned | Driver KYC & license verification UI |
| `car-documents.tsx` | Raw views | ✅ Redesigned | RC, Insurance, Permit & Fitness verification UI |
| `face-audit.tsx` | Raw views | ✅ Redesigned | Driver selfie/face verification audit |
| `profile-edit-queue.tsx` | Raw list | ✅ Redesigned | Driver/vendor profile updates review |
| `review-tasks.tsx` | Raw list | ✅ Redesigned | General pending verification tasks |

---

## 5. Accounts, Wallet & Finance
| Screen | Before | Status | Notes |
| :--- | :--- | :--- | :--- |
| `(tabs)/accounts.tsx` | Raw views | ✅ Redesigned | Accounts hub, balance sheet, daily collections |
| `(tabs)/wallet.tsx` | Raw views | ✅ Redesigned | Owner-only wallet balance adjustment and financial ledger |
| `(tabs)/transfers.tsx` | Raw views | ✅ Redesigned | Bank transfers and settlement queue |
| `billing.tsx` | Raw views | ✅ Redesigned | Invoicing and ledger overview |
| `cash-audit.tsx` | Raw views | ✅ Redesigned | Driver cash-in-hand collection audit |
| `gst-invoices.tsx` | Raw views | ✅ Redesigned | B2B & customer GST invoice generator |
| `coupons.tsx` | Raw views | ✅ Redesigned | Promo codes and discount management |
| `payout-requests.tsx` | Raw views | ✅ Redesigned | Driver/vendor payout withdrawal approvals |
| `refund-requests.tsx` | Raw views | ✅ Redesigned | Customer trip refund requests |

---

## 6. Settings, Configuration & Alarms
| Screen | Before | Status | Notes |
| :--- | :--- | :--- | :--- |
| `(tabs)/settings.tsx` | Raw list | ✅ Redesigned | Settings hub with role-based permission hiding |
| `alarm-settings.tsx` | Raw inputs | ✅ Redesigned | Owner-only enquiry alarm configuration with time schedules |
| `fare-rules.tsx` | Raw views | ✅ Redesigned | Dynamic pricing, minimum fare & waiting charges |
| `cities.tsx` | Raw list | ✅ Redesigned | Active service cities and district zones |
| `banners.tsx` | Raw list | ✅ Redesigned | Customer app banners management |
| `notification-settings.tsx` | Raw form | ✅ Redesigned | Push notification triggers & template controls |
| `email-settings.tsx` | Raw form | ✅ Redesigned | SMTP and email notification settings |
| `app-content.tsx` | Raw form | ✅ Redesigned | Terms, privacy, about us, FAQ copy editor |
| `assignment-priority-settings.tsx` | Raw form | ✅ Redesigned | Auto-dispatch driver matching priority weights |
| `maps-api-keys.tsx` | Raw form | ✅ Redesigned | Google Maps / MapmyIndia API key rotators |
| `blocked-ips.tsx` | Raw list | ✅ Redesigned | IP blocking and anti-fraud firewall |
| `announcements.tsx` | Raw list | ✅ Redesigned | Driver & vendor broadcast announcements |
| `system-config.tsx` | Raw form | ✅ Redesigned | Global system variables |
| `system-health.tsx` | Raw stats | ✅ Redesigned | API latency, server uptime, database health |
| `tariffs.tsx` | Raw table | ✅ Redesigned | One-way & round-trip tariff pricing grid |
| `route-distances.tsx` | Raw table | ✅ Redesigned | Intercity distance matrix & default toll data |
| `serviceable-cities.tsx` | Raw list | ✅ Redesigned | Allowed pickup and drop zones |
| `referral-settings.tsx` | Raw form | ✅ Redesigned | Driver & customer referral reward rules |
| `referral-claims.tsx` | Raw list | ✅ Redesigned | Referral bonus redemption queue |
| `referral-history.tsx` | Raw list | ✅ Redesigned | Referral reward audit log |
| `website-integrations.tsx` | Raw form | ✅ Redesigned | Webhook endpoints and API tokens |
| `(tabs)/password.tsx` | Raw inputs | ✅ Redesigned | Admin password & PIN reset |

---

## 7. Staff & Team Management
| Screen | Before | Status | Notes |
| :--- | :--- | :--- | :--- |
| `staff-management.tsx` | Raw views | ✅ Redesigned | Staff member directory, roles & active status |
| `staff-activity.tsx` | Raw log list | ✅ Redesigned | Action log and audit trail for staff |
| `staff-performance.tsx` | Raw stats | ✅ Redesigned | Conversion rate, call metrics, response speed |
| `staff-roles.tsx` | Raw form | ✅ Redesigned | Role definitions and fine-grained permissions |
| `staff-daily-records.tsx` | Raw list | ✅ Redesigned | Shift clock-in/out and duty timesheet |
| `staff-daily-record.tsx` | Raw detail | ✅ Redesigned | Staff daily summary detail |
| `staff-tasks.tsx` | Redirect alias | ✅ Redesigned | Router redirect to `/(tabs)/tasks` |
| `team-hub.tsx` | Raw cards | ⚠️ In Progress | Shift handover and team broadcast board (external/unlinked) |

---

## 8. CRM, Insights & Analytics
| Screen | Before | Status | Notes |
| :--- | :--- | :--- | :--- |
| `crm.tsx` | Raw views | ✅ Redesigned | Customer lead pipeline and follow-up CRM |
| `analytics.tsx` | Raw charts | ✅ Redesigned | Revenue, trips, growth and cancellation metrics |
| `customer-insights.tsx` | Raw stats | ✅ Redesigned | Repeat usage, average spend, churn signals |
| `live-map.tsx` | Raw webview | ✅ Redesigned | Realtime driver GPS tracking map |
| `emergency-bids.tsx` | Raw list | ✅ Redesigned | Urgent unassigned trip broadcast bids |
| `ai-automation-logs.tsx` | Raw log list | ✅ Redesigned | AI auto-assignment & notification webhook logs |
| `ratings-analytics.tsx` | Raw ratings | ✅ Redesigned | Driver & customer rating distribution analysis |
| `(tabs)/logs.tsx` | Raw log list | ✅ Redesigned | System & audit logs viewer |
| `(tabs)/profile-reviews.tsx` | Raw list | ✅ Redesigned | Driver profile picture & detail change reviews |
| `(tabs)/tasks.tsx` | Custom cards | ✅ Redesigned | Admin daily checklist & verification tasks |
| `(tabs)/index.tsx` | Custom dashboard | ✅ Redesigned | Executive dashboard, KPIs, quick actions |
| `profile.tsx` | Custom cards | ✅ Redesigned | Admin profile, shift status, theme selector |
| `index.tsx` | Redirect | ✅ Redesigned | Entry redirect to `/(tabs)` |
| `login.tsx` | Raw inputs | ✅ Redesigned | Premium branded login screen with theme tokens |
| `+not-found.tsx` | Raw text | ✅ Redesigned | 404 error screen with theme tokens |
| `_layout.tsx` | Navigation stack | ✅ Configured | Root layout with ThemeProvider and toast |
| `(tabs)/_layout.tsx` | Tab bar | ✅ Redesigned | Premium tab bar with theme tokens and role gating |
