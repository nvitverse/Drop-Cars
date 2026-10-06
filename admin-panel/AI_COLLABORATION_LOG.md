# AI Collaboration & Change Log

This file is read by **Claude (Session 1 & 2)** and **Antigravity** to know the latest changes made across parallel sessions.

---

### Recent Changes (2026-10-01)

1. **Hourly Rentals Custom Duration & Presets** (`create-booking.tsx`):
   - Presets updated to `5h / 50km` and `8h / 80km`.
   - Added `Custom / Manual` duration option with real-time 10 km/hr auto calculation.
   - Default hourly tariffs aligned (Driver: ₹250, Vendor Extra: ₹50, Addon KM: ₹25, Vendor Extra Addon KM: ₹5).

2. **Booking Cards Direct Cancellation** (`(tabs)/orders.tsx`):
   - Added direct `[ Cancel ]` button on Live / Unassigned / Assigned / Running booking cards.
   - Connected to `CancelReasonModal` with wallet hold auto-refund.
   - Admin role authorization check relaxed to include all operational staff/admins.
   - Added `[ Delete ]` button on Cancelled/Expired cards for Owner.
   - Preserved floating round `+` FAB (`zIndex: 999, bottom: 24/32, right: 18`).

3. **Multi-Session Safety Rule**:
   - Strictly surgical line-by-line edits only. No file-level overwrites.
