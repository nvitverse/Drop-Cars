# Drop Cars Admin App — Naming & Wording Changes (Prompt 11C)

This document tracks all user-visible wording updates from technical/heavy jargon to plain human and professional wording.

| Old Name (Heavy / Jargon) | New Plain Name | Natural Tone Caption | File / Context |
| :--- | :--- | :--- | :--- |
| Command Center (title) | *(greeting: "Good evening, NV")* | "Here is how the business is doing" | `(tabs)/index.tsx`, `constants/labels.ts` |
| Staff Tasks · "Complete All Tasks" strip | **My tasks** · "Complete all tasks" | "{n} pending today" | `(tabs)/index.tsx` |
| URGENT ACTIONS REQUIRED | **Urgent actions** | — | `(tabs)/index.tsx` |
| Enquiry Leads / Customer Leads | **Enquiries** | "Customers waiting for a call back" | `(tabs)/index.tsx`, `(tabs)/orders.tsx` |
| Upcoming Bookings / Unassigned Dispatch | **Trips without a driver** | "Upcoming, nobody assigned yet" | `(tabs)/index.tsx`, `(tabs)/orders.tsx` |
| QUICK OPERATIONS | **Quick operations** | — | `(tabs)/index.tsx`, `(tabs)/orders.tsx` |
| Team & Operations Command Center / Hub | **Team & duty** | "Daily attendance, own vehicles, trips & salary" | `(tabs)/index.tsx` |
| Emergency Bids | **Urgent bids** | "Trips nobody has taken yet" | `(tabs)/index.tsx`, `(tabs)/orders.tsx` |
| Fleet & Driver Hub | **Drivers & cars** | "Everyone who drives for us" | `(tabs)/index.tsx` |
| Documents KYC Review | **Document checks** | "Licence, RC, insurance" | `(tabs)/index.tsx` |
| Payouts & Settlements | **Payouts** | "Money to pay drivers and vendors" | `(tabs)/index.tsx` |
| GST Invoices & Filings / GST Invoices | **GST invoices** | "Invoices and tax filing" | `(tabs)/index.tsx`, `(tabs)/orders.tsx` |
| Partner & Web Bookings / Web Bookings | **Website bookings** | "Approve and post to drivers" | `(tabs)/index.tsx`, `(tabs)/orders.tsx` |
| Staff Targets & Roles | **Staff & roles** | "Targets, roles and permissions" | `(tabs)/index.tsx` |
| Profile Edit Reviews | **Profile changes** | "Approve name, photo and detail edits" | `(tabs)/index.tsx` |
| Brand Integrations | **Brands & website** | "Connected brands and sites" | `(tabs)/index.tsx` |
| CRM & Growth Ads | **Customers & ads** | "Follow-ups and promotions" | `(tabs)/index.tsx` |
| System Tariffs & Settings | **Rates & settings** | "Fares, cities and app settings" | `(tabs)/index.tsx` |
| Car Substitution | **Car change requests** | "Drivers asking to swap the car" | `(tabs)/orders.tsx` |
| Customer Reviews | **Customer feedback** | "Ratings after trips" | `(tabs)/orders.tsx` |
| All Bookings | **All bookings** | "Every trip, any status" | `(tabs)/orders.tsx` |
| TODAY'S LIVE SNAPSHOT | **Today's live snapshot** | — | `(tabs)/orders.tsx` |
| Active Rides / Total Bookings / Fleet Online / New Customers | **On the road / Bookings today / Cars online / New customers** | — | `(tabs)/orders.tsx`, `(tabs)/index.tsx` |
| OPERATIONS & DISPATCH QUEUES | **Bookings & dispatch** | — | `(tabs)/orders.tsx` |
| COMMAND CENTER (module-grid header) | **Everything else** | — | `(tabs)/index.tsx` |

---

### Preserved Sub-lines & Native Logic
- **Tamil Sub-line**: *"அனைத்து செயல்பாடுகளும் ஒரே இடத்தில்"* is preserved under `Team & duty`.
- **Bottom Tab Names**: `Dashboard`, `Bookings`, `Tasks`, `Chats`, `Fleet` are kept intact.
- **Routes & Permissions**: Unchanged. All navigation paths remain identical.
