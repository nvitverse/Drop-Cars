import * as Notifications from 'expo-notifications';

export interface NotificationData {
  title: string;
  body: string;
  data?: any;
}

export const sendLocalNotification = async (notification: NotificationData) => {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: notification.title,
        body: notification.body,
        data: notification.data || {},
      },
      trigger: null,
    });
  } catch (error) {
    console.error('Error sending notification:', error);
  }
};

export const sendBookingAcceptedNotification = async (driverName: string, customerName: string) => {
  await sendLocalNotification({
    title: 'Booking Accepted!',
    body: `Driver ${driverName} accepted the booking for ${customerName}`,
    data: { type: 'booking_accepted' }
  });
};

export const sendBookingCompletedNotification = async (customerName: string, amount: number) => {
  await sendLocalNotification({
    title: 'Trip Completed!',
    body: `Trip for ${customerName} completed. ₹${amount} earned.`,
    data: { type: 'trip_completed' }
  });
};

export const sendWalletLowBalanceNotification = async (currentBalance: number, minBalance: number) => {
  await sendLocalNotification({
    title: 'Low Wallet Balance',
    body: `Your balance is ₹${currentBalance}. Add funds to continue accepting bookings (Min: ₹${minBalance})`,
    data: { type: 'wallet_low' }
  });
};

export const sendNewBookingNotification = async (fare: number, distance: number) => {
  await sendLocalNotification({
    title: 'New Booking Available!',
    body: `₹${fare} for ${distance}km trip. Accept now!`,
    data: { type: 'new_booking' }
  });
};