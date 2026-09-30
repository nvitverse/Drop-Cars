import React, { createContext, useContext, useState, useEffect } from 'react';
import { Booking } from '@/types/booking';
import * as Notifications from 'expo-notifications';
import { 
  sendBookingAcceptedNotification, 
  sendNewBookingNotification,
  sendBookingCompletedNotification 
} from '@/services/notifications';

interface BookingContextType {
  bookings: Booking[];
  availableBookings: Booking[];
  createBooking: (booking: Omit<Booking, 'id' | 'createdAt' | 'status'>) => void;
  acceptBooking: (bookingId: string, driverInfo: any) => void;
  updateBookingStatus: (bookingId: string, status: Booking['status']) => void;
  assignBookingToDriver: (bookingId: string, driverId: string) => void;
  broadcastBooking: (bookingId: string) => void;
}

const BookingContext = createContext<BookingContextType | undefined>(undefined);

// Dummy bookings data
const initialBookings: Booking[] = [
  {
    id: '1',
    vendorId: '1',
    customerName: 'Sarah Johnson',
    customerPhone: '9876543220',
    pickupLocation: 'Connaught Place, Delhi',
    dropLocation: 'India Gate, Delhi',
    driverPricing: {
      fare: 150,
      distance: 8.5,
      estimatedTime: '25 mins'
    },
    vendorPricing: {
      customerAmount: 200,
      commission: 50
    },
    status: 'pending',
    createdAt: '2024-01-15T10:30:00Z'
  },
  {
    id: '2',
    vendorId: '1',
    driverId: '2',
    customerName: 'Raj Patel',
    customerPhone: '9876543221',
    pickupLocation: 'Karol Bagh, Delhi',
    dropLocation: 'Lajpat Nagar, Delhi',
    driverPricing: {
      fare: 120,
      distance: 6.2,
      estimatedTime: '18 mins'
    },
    vendorPricing: {
      customerAmount: 160,
      commission: 40
    },
    status: 'accepted',
    assignedDriver: {
      name: 'Mike Driver',
      phone: '9876543211',
      carDetails: {
        name: 'Swift Dzire',
        type: 'Sedan',
        number: 'DL 12 AB 1234'
      }
    },
    createdAt: '2024-01-15T09:15:00Z',
    acceptedAt: '2024-01-15T09:20:00Z'
  },
  {
    id: '3',
    vendorId: '1',
    driverId: '2',
    customerName: 'Priya Sharma',
    customerPhone: '9876543222',
    pickupLocation: 'Rajouri Garden, Delhi',
    dropLocation: 'Dwarka Sector 21, Delhi',
    driverPricing: {
      fare: 180,
      distance: 12.3,
      estimatedTime: '35 mins'
    },
    vendorPricing: {
      customerAmount: 240,
      commission: 60
    },
    status: 'completed',
    assignedDriver: {
      name: 'Mike Driver',
      phone: '9876543211',
      carDetails: {
        name: 'Swift Dzire',
        type: 'Sedan',
        number: 'DL 12 AB 1234'
      }
    },
    createdAt: '2024-01-14T16:45:00Z',
    acceptedAt: '2024-01-14T16:50:00Z',
    completedAt: '2024-01-14T17:25:00Z'
  }
];

export function BookingProvider({ children }: { children: React.ReactNode }) {
  const [bookings, setBookings] = useState<Booking[]>(initialBookings);
  const [availableBookings, setAvailableBookings] = useState<Booking[]>([]);

  const createBooking = async (bookingData: Omit<Booking, 'id' | 'createdAt' | 'status'>) => {
    const newBooking: Booking = {
      ...bookingData,
      id: Math.random().toString(),
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    
    setBookings(prev => [newBooking, ...prev]);
    
    // Send notification to drivers about new booking
    await sendNewBookingNotification(
      newBooking.driverPricing.fare,
      newBooking.driverPricing.distance
    );
  };

  const acceptBooking = async (bookingId: string, driverInfo: any) => {
    setBookings(prev => prev.map(booking => 
      booking.id === bookingId 
        ? { 
            ...booking, 
            status: 'accepted' as const,
            assignedDriver: driverInfo,
            acceptedAt: new Date().toISOString()
          }
        : booking
    ));

    setAvailableBookings(prev => prev.filter(b => b.id !== bookingId));

    // Send notification to vendor
    const booking = bookings.find(b => b.id === bookingId);
    if (booking) {
      await sendBookingAcceptedNotification(driverInfo.name, booking.customerName);
    }
  };

  const updateBookingStatus = async (bookingId: string, status: Booking['status']) => {
    setBookings(prev => prev.map(booking => 
      booking.id === bookingId 
        ? { 
            ...booking, 
            status,
            ...(status === 'completed' && { completedAt: new Date().toISOString() })
          }
        : booking
    ));

    // Send completion notification
    if (status === 'completed') {
      const booking = bookings.find(b => b.id === bookingId);
      if (booking) {
        await sendBookingCompletedNotification(
          booking.customerName, 
          booking.driverPricing.fare
        );
      }
    }
  };

  const assignBookingToDriver = (bookingId: string, driverId: string) => {
    setBookings(prev => prev.map(booking => 
      booking.id === bookingId 
        ? { ...booking, driverId, status: 'assigned' as const }
        : booking
    ));
  };

  const broadcastBooking = (bookingId: string) => {
    const booking = bookings.find(b => b.id === bookingId);
    if (booking) {
      setAvailableBookings(prev => [booking, ...prev]);
    }
  };

  return (
    <BookingContext.Provider value={{
      bookings,
      availableBookings,
      createBooking,
      acceptBooking,
      updateBookingStatus,
      assignBookingToDriver,
      broadcastBooking
    }}>
      {children}
    </BookingContext.Provider>
  );
}

export function useBooking() {
  const context = useContext(BookingContext);
  if (context === undefined) {
    throw new Error('useBooking must be used within a BookingProvider');
  }
  return context;
}