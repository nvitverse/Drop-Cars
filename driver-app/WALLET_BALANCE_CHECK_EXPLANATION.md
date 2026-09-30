# Wallet Balance Check - How "Accept Booking" Button is Enabled/Disabled

## Overview
The "Accept Booking" button in `BookingCard.tsx` is enabled/disabled based on wallet balance availability. The logic ensures that Vehicle Owners have sufficient balance to accept new bookings after accounting for reserved funds for future rides.

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  index.tsx (Parent Component)                                │
│                                                               │
│  1. Calculate Available Balance:                             │
│     - Get current wallet balance                             │
│     - Subtract reserved amount for future rides              │
│     - Result: availableBalance                               │
│                                                               │
│  2. For each order, check:                                   │
│     - Get charges_to_deduct (if available)                   │
│     - OR use estimated_price (fallback)                      │
│     - Compare: availableBalance >= amountToCheck             │
│                                                               │
│  3. Pass disabled prop to BookingCard:                       │
│     disabled = !canAcceptOrder(order)                        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  BookingCard.tsx (Child Component)                           │
│                                                               │
│  - Receives disabled prop from parent                        │
│  - Button shows "Insufficient Balance" when disabled         │
│  - Button shows "Accept Booking" when enabled                │
└─────────────────────────────────────────────────────────────┘
```

## Code Breakdown

### 1. Wallet Balance Calculation (index.tsx:90-93)

```typescript
// Compute available balance after reserving future rides' estimated totals
const reservedForFuture = (futureRides || []).reduce((sum, r) => sum + Number((r as any).total_fare ?? 0), 0);
const currentWallet = Number(dashboardData?.user_info?.wallet_balance ?? balance ?? 0);
const availableBalance = Math.max(0, currentWallet - reservedForFuture);
```

**What it does:**
- Calculates total reserved amount for all future/accepted rides
- Gets current wallet balance from dashboard data or wallet context
- Computes available balance = wallet balance - reserved amount
- Ensures available balance never goes below 0

### 2. Order Acceptance Check (index.tsx:94-100)

```typescript
const canAcceptOrder = (order: PendingOrder) => {
  const chargesToDeduct = Number((order as any).charges_to_deduct ?? 0);
  const totalFare = Number(order.estimated_price ?? 0);
  // Use charges_to_deduct if available, otherwise fall back to total fare
  const amountToCheck = chargesToDeduct > 0 ? chargesToDeduct : totalFare;
  return availableBalance >= amountToCheck;
};
```

**What it does:**
- Gets the amount that will be deducted from wallet (`charges_to_deduct`)
- Falls back to `estimated_price` if `charges_to_deduct` is 0 or not available
- Returns `true` if available balance is sufficient, `false` otherwise

### 3. Button Disable Logic (index.tsx:1142)

```typescript
<BookingCard
  ...
  disabled={!canAcceptOrder(order) || processingOrderId === order.order_id.toString()}
  loading={processingOrderId === order.order_id.toString()}
/>
```

**What it does:**
- Button is disabled if:
  - `canAcceptOrder(order)` returns `false` (insufficient balance)
  - OR order is currently being processed
- Button shows loading state when order is being processed

### 4. Button Display (BookingCard.tsx:727-746)

```typescript
<TouchableOpacity
  style={[dynamicStyles.acceptButton, disabled && dynamicStyles.disabledButton]}
  onPress={handleAcceptPress}
  disabled={disabled || loading}
>
  <Text>
    {disabled ? 'Insufficient Balance' : 'Accept Booking'}
  </Text>
</TouchableOpacity>
```

**What it does:**
- Shows "Insufficient Balance" when `disabled` is `true`
- Shows "Accept Booking" when `disabled` is `false`
- Applies disabled styling (gray background) when disabled

### 5. Additional Safety Check (index.tsx:738-750)

```typescript
const handleAcceptBooking = (order: PendingOrder) => {
  if (!canAcceptOrder(order)) {
    Alert.alert(
      'Insufficient Balance',
      'Not enough available balance after reserving for your future rides. Add money to accept this booking.',
      [{ text: 'Add Money', onPress: () => router.push('/(tabs)/wallet') }]
    );
    return;
  }
  acceptBooking(order);
};
```

**What it does:**
- Double-checks balance before accepting (safety net)
- Shows alert if balance is insufficient
- Provides direct link to wallet page to add money

## Example Scenarios

### Scenario 1: Sufficient Balance
- Current Wallet: ₹10,000
- Reserved for Future Rides: ₹3,000
- Available Balance: ₹7,000
- Order Amount: ₹5,000
- **Result: Button ENABLED** ✅ (7000 >= 5000)

### Scenario 2: Insufficient Balance
- Current Wallet: ₹10,000
- Reserved for Future Rides: ₹8,000
- Available Balance: ₹2,000
- Order Amount: ₹5,000
- **Result: Button DISABLED** ❌ (2000 < 5000)

### Scenario 3: Using charges_to_deduct
- Current Wallet: ₹10,000
- Reserved for Future Rides: ₹0
- Available Balance: ₹10,000
- Order estimated_price: ₹8,000
- Order charges_to_deduct: ₹7,500
- **Result: Button ENABLED** ✅ (uses 7500, and 10000 >= 7500)

## Key Points

1. **Reserved Amount**: The system reserves funds for future/accepted rides to prevent over-booking
2. **Priority**: `charges_to_deduct` takes priority over `estimated_price` for balance check
3. **Real-time**: Balance is checked dynamically for each order card
4. **User Feedback**: Clear messaging ("Insufficient Balance") and direct action (link to wallet)
5. **Safety**: Double-check before actual acceptance to prevent race conditions

## Data Sources

- **Wallet Balance**: `dashboardData.user_info.wallet_balance` (from API)
- **Future Rides**: `futureRides` array from DashboardContext
- **Order Amount**: `order.charges_to_deduct` or `order.estimated_price` from API

## Related Files

- `app/(tabs)/index.tsx` - Main dashboard with balance calculation
- `components/BookingCard.tsx` - Booking card component with button
- `contexts/DashboardContext.tsx` - Provides futureRides data
- `contexts/WalletContext.tsx` - Provides wallet balance data
