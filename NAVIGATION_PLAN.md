# Admin App: Pudhu Navigation Plan (draft, approval-ku)

Ippo code-la edhuvum maatha padala. Idhu thaan plan. Neenga OK sonna piragu thaan build.

Rule: **Enna sambandhamo, adhu adhukkulla thaan irukkanum. Fleet-ku sambandham na panam-um Fleet-kulla.**

## Bottom tabs
`Home | Bookings | Chats | Fleet | More`

Bookings tab-kulla mela switch: `[ CRM | Operations ]` (rendu mattum).
Default = Operations. Adhan mudhal card = **Live Bookings**, so bookings 1 tap-la kedaikkum.

---

## 1. HOME: "ippove enna seyyanum" tiles (link mattum, copy illa)
Priority order (mela irundhu keezha). Ovvoru tile-layum count + "romba neram kaathirukkuradhu evlo" kaattanum.

| # | Tile | Pogum screen |
|---|---|---|
| 0 | **SOS** (active-a irundha mattum, ellathukkum mela, alarm-oda) | SOS screen (pudhusu, section 6) |
| 1 | **Leads on-time response** (countdown, red aagum) | `enquiries` |
| 2 | Booking approvals | `website-booking-approvals` |
| 2 | Unassigned bookings | `orders` (unassigned filter) |
| 2 | Unread chats | Chats tab |
| 3 | Fleet activation requests | `documents-review-queue` |
| 4 | Wallet and payout requests | `payout-requests` |
| 4 | Refund requests | `refund-requests` |
| 4 | Other requests (profile edits, car substitution) | `profile-edit-queue`, `car-substitution-requests` |
| - | Innaikku To-do | `tasks` |

Ovvoru group-kulla, adhigama kaathirukkuradhu mela varum.

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
| **Duty drivers** (working drivers, fleet owner add pannuvaanga) | Ovvoru fleet-kulla, andha fleet-oda cars-oda serndhu (`fleet-owner-detail`). Bulk search: keezha section 4 |
| Company own fleet | `own-fleet`, `(tabs)/our-fleet`, `our-fleet-requests` |
| Password reset | `(tabs)/password` |
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

### Bulk search and actions (Fleet-kulla oru thani section)
Drivers, duty drivers, vendors, fleet owners ellaraiyum oru search-la thedi, select panni bulk action (notify, block, activate, export).
Ippo irukkura `(tabs)/accounts` "Search all accounts" adhaiye base-a use pannalaam.

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
1. **SOS admin screen illa** (design section 6). Backend-la `/sos/alerts` irukku, aana admin app-la screen illa. Add pannanum (Home tile-ku thevai). Adhukku munnaadi backend endpoint-ku auth podanum (ARCHITECTURE_REVIEW.md, C4).
2. **Rendu inbox (enquiries + crm)** onnaakkanum. **MUDIVU: backend master.** Website DB (Hostinger) chinna buffer mattum, retry-oda backend-ku anuppum. Munnaadi backend CRM API-ku auth podanum.
3. **Shared screens** (`ratings-analytics`, referral, `announcements`) rendu side-kkum sambandham. Naan oru idathula vechu, matra idathula link koduthirukken. Neenga marukkalaam.
4. **Duty driver** = own-fleet driver thaanaa nu confirm pannunga.
5. **Chat role tag**: backend messages-la customer/driver/vendor/duty tag irukkaanu nan verify pannala. Illana add pannanum.
6. `(tabs)/accounts` "Accounts hub" nu peyar, ulle driver/vendor/owner search-um company balance sheet-um kalandhirukku. Fleet-la vachirukken. Company balance sheet paguthiyai Operations-ku maathalaam.

---

## 6. Fleet-kulla swap and login (design, build pannala)

### A. Model
- Duty driver oru fleet owner-ukku sonthama (`CarDriver.vehicle_owner_id`, mandatory). Car-um appadiye (`CarDetails.vehicle_owner_id`).
- Ippo car number / licence / phone duplicate na hard error varum. Adhai swap flow-kku maathanum.

### B. Car swap (already vera fleet-la irukkura car)
1. Pudhu fleet owner car number podurar.
2. System: "Idhu vera fleet-la irukku. Swap kekkalaama?" (**owner peyar, phone kaattakoodadhu**, "****" mattum).
3. OTP **andha car ippo irukkura fleet owner-ukku** pogum (push + SMS/email).
4. Pudhu owner andha OTP-ai type panna, car maarum.

### C. Driver swap (duty driver vera fleet-la irukkaan)
1. Pudhu owner licence number podurar. "Already fleet-la irukkaan. Swap kekkalaama?"
2. OTP **driver-ku** pogum: driver app-la Duty driver section login aagi irundha pop-up-la kaattum. Illana SMS.
3. Pudhu owner type panna driver maarum. Pazhaya owner-ukku notification.

### D. Swap safety (idhu illana misuse aagum)
- **Active trip / pending payout / settlement irundha swap block.**
- Driver wallet, rating, subscription driver-oda pogum. Pazhaya trips pazhaya fleet-la report-la irukkum.
- OTP: 6 digit, 10 nimisham, oru thadava mattum, 5 thappu try-kku lock, rate limit.
- Ovvoru swap-um audit record (yaar, evvalavu neram, edhu, entha OTP).
- Owner phone illana / OTP varala na: **admin override** (reason-oda).
- Suggestion: OTP-ai munnadhu "owner" (car), "driver" (driver)-ku anuppuradhu enn purithal. Neenga vera maadhiri ninaichaa sollunga.

### E. Thappaa login panna auto-redirect
Duty driver, fleet owner login-la poyi login panna:
1. Password sariyaa iruntha (mattravar table-la), app: "Ungal account Duty driver-la irukku, angae kondu pogiren".
2. Auto-a sariyaana screen-ku maathi, **avan type panna phone number-ai mattum** fill pannum.
3. ⚠️ Security: sariyaana password/OTP-ku piragu thaan sollanum. "Indha number driver-a irukku"nu login aagaadhavanukku solli vitta, yaarum account-ai check pannalaam.
- Ippove `signin-as-owner` irukku (owner-ai driver-a maatha). Adhaiye rendu vazhi-yum panniyaakkalam.

---

## 7. SOS (idea)
Ippo backend-la `/sos/alert` irukku aana **auth illa, customer-ku mattum, admin screen illa**.

1. **Yaar trigger pannalaam:** customer (live-trip), driver / duty driver, fleet owner.
2. **Button:** periya SOS, 3 second pidichaal mattum (thappaa amukkaadhu), 10 second cancel window (PIN).
3. **Enna anuppum:** trip id, GPS, driver + car details, customer phone, live tracking link. Active irukkura varai 10 second-ku oru thadava location.
4. **Staff ellai:** Home-la mela red tile + alarm (ippo irukkura enquiry alarm-ai reuse). 60 second ack aagala na owner + 2nd staff-ku call/WhatsApp/SMS.
5. **Customer-oda emergency contact-ku** tracking link SMS. "Call 112" button.
6. **Admin screen:** map, customer/driver call button, timeline, status (`ACTIVE > ACKNOWLEDGED > RESOLVED / FALSE_ALARM`), notes.
7. **Mudhal fix:** endpoint-ku auth, `GET /sos/alerts` admin-ku mattum (ARCHITECTURE_REVIEW.md C4).
8. Later: night ride "neenga OK-aa?" check-in, route deviation alert.
