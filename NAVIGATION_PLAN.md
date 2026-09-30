# Admin App: Pudhu Navigation Plan (draft, approval-ku)

Ippo code-la edhuvum maatha padala. Idhu thaan plan. Neenga OK sonna piragu thaan build.

Rule: **Enna sambandhamo, adhu adhukkulla thaan irukkanum. Fleet-ku sambandham na panam-um Fleet-kulla.**

## Bottom tabs
`Home | Bookings | Chats | Fleet | More`

Bookings tab-kulla mela switch: `[ CRM | Operations ]` (rendu mattum).
Default = Operations. Adhan mudhal card = **Live Bookings**, so bookings 1 tap-la kedaikkum.

---

## 1. HOME: "ippove enna seyyanum" tiles (link mattum, copy illa)
| Tile | Pogum screen |
|---|---|
| Leads on-time response (countdown, red aagum) | `enquiries` |
| Fleet activation requests | `documents-review-queue` |
| Wallet and payout requests | `payout-requests` |
| Booking approvals | `website-booking-approvals` |
| Unassigned bookings | `orders` (unassigned filter) |
| Refund requests | `refund-requests` |
| Unread chats | Chats tab |
| Innaikku To-do | `tasks` |
| Owner-ku: SOS alerts | (**screen illa**, keezha paarunga) |

Home-kulla irukkuradhu: `(tabs)/index` (dashboard), `(tabs)/tasks`, `profile`.

---

## 2. BOOKINGS

### Operations segment
| Screen | Note |
|---|---|
| `(tabs)/orders` | Live Bookings (mudhal card) |
| `create-booking`, `quote-estimate` | pudhu booking / quote |
| `trip-detail` | oru trip-oda full details |
| `emergency-bids` | driver illaadha urgent trips |
| `live-map` | live driver map |
| `website-booking-approvals` | website booking approve |
| `savaari-bookings` | Savaari monitor |
| `vendor-bookings` | vendor bookings |
| `find-driver`, `assign-car`, `car-substitution-requests` | dispatch tools |
| `gst-invoices` | company-level invoices |

### CRM segment
| Screen | Note |
|---|---|
| `enquiries`, `(tabs)/leads`, `crm` | **Rendu lead inbox irukku, onnaakkanum** |
| `(tabs)/customers`, `customer-detail`, `customer-insights` | customer list, detail, repeat/churn |
| `refund-requests` | customer refunds |
| `coupons`, `banners` | customer offers |
| `referral-settings`, `referral-history` | customer referral |
| `analytics` | growth / revenue |
| `website-integrations`, `app-content` | website and app content |
| Customer chat button | Chats tab-ai "Customer" filter-oda thirakkum |

---

## 3. CHATS (bottom tab)
Chips: `All | Customer | Fleet owner | Driver | Duty driver | Vendor | Booking chats`
Screens: `(tabs)/chats` (`chats` redirect).
Customer / Fleet screens-la irukkura "chat" button = idhe chat, filter-oda. Rendu system illa.

---

## 4. FLEET: fleet sambandhapatta ellame, panam-um serthu
| Section | Screens |
|---|---|
| Fleet owners | `(tabs)/vehicle-owners`, `fleet-owner-detail` |
| Drivers | `find-driver` (driver lookup), `(tabs)/accounts` |
| Duty drivers / Own fleet | `own-fleet`, `(tabs)/our-fleet`, `our-fleet-requests`, `(tabs)/password` (duty driver password reset) |
| Vendors | `(tabs)/vendors`, `vendor-detail` |
| Cars | `(tabs)/cars`, `car-documents`, `car-models`, `new-car-year` |
| **Activation requests** | `documents-review-queue`, `account-documents`, `face-audit`, `profile-edit-queue`, `(tabs)/profile-reviews`, `review-tasks` |
| **Wallet and payments** | `(tabs)/wallet`, `payout-requests`, `(tabs)/transfers`, `cash-audit`, `billing`, `referral-claims` |
| Quality | `ratings-analytics` (driver part) |
| Supply gap | `(tabs)/vacant-cities` |
| Fleet announcements | `announcements` (driver and vendor broadcast) |
| Stats strip | `(tabs)/fleet-hub` (mela: drivers online, cars verified) |
| Fleet chat button | Chats tab, Fleet filters |

---

## 5. MORE (adikkadi thodaadhadhu, owner-heavy)
| Group | Screens |
|---|---|
| Pricing and rules | `tariffs`, `fare-rules`, `route-distances`, `cities`, `serviceable-cities`, `assignment-priority-settings` |
| Alerts and channels | `notification-settings`, `email-settings`, `alarm-settings`, `maps-api-keys` |
| Team | `staff-management`, `staff-roles`, `staff-activity`, `staff-performance`, `staff-daily-records`, `staff-daily-record`, `team-hub`, `staff-tasks` |
| Platform | `system-config`, `system-health`, `blocked-ips`, `ai-automation-logs`, `data-archive`, `(tabs)/logs`, `(tabs)/settings` (old hub, retire) |
| Account | `profile`, `login` |

---

## Gaps and decisions
1. **SOS admin screen illa.** Backend-la `/sos/alerts` irukku, aana admin app-la screen illa. Add pannanum (Home tile-ku thevai). Adhukku munnaadi backend endpoint-ku auth podanum (ARCHITECTURE_REVIEW.md, C4).
2. **Rendu inbox (enquiries + crm)** onnaakkanum. Edhu master nu neenga sollanum.
3. **Shared screens** (`ratings-analytics`, referral, `announcements`) rendu side-kkum sambandham. Naan oru idathula vechu, matra idathula link koduthirukken. Neenga marukkalaam.
4. **Duty driver** = own-fleet driver thaanaa nu confirm pannunga.
5. **Chat role tag**: backend messages-la customer/driver/vendor/duty tag irukkaanu nan verify pannala. Illana add pannanum.
6. `(tabs)/accounts` "Accounts hub" nu peyar, ulle driver/vendor/owner search-um company balance sheet-um kalandhirukku. Fleet-la vachirukken. Company balance sheet paguthiyai Operations-ku maathalaam.
