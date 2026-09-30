import React, { createContext, useCallback, useContext, useMemo, useState, useEffect } from 'react';
import { CarPoolJourney, CarPoolPassenger } from '@/types/booking';
import axiosInstance from '@/app/api/axiosInstance';

interface CarPoolContextValue {
  journeys: CarPoolJourney[];
  fetchJourneys: () => Promise<void>;
  createListingFromBooking: (params: {
    sourceBookingId: string;
    hostName: string;
    hostPhone: string;
    pickupCity: string;
    dropCity: string;
    startDate: string;
    startTime: string;
    carName: string;
    carCategory: string;
    totalSeats: number;
    seatsToShare: number;
    seatFare: number;
    privateFareEquivalent: number;
  }) => Promise<CarPoolJourney>;
  createListing: (journey: Omit<CarPoolJourney, 'id' | 'status'>) => Promise<CarPoolJourney>;
  requestToJoin: (journeyId: string, passenger: Omit<CarPoolPassenger, 'status' | 'requestedAt'>) => Promise<void>;
  approvePassengerRequest: (journeyId: string, passengerId: string) => Promise<void>;
  declinePassengerRequest: (journeyId: string, passengerId: string) => Promise<void>;
  latestHostListing: CarPoolJourney | null;
}

const CarPoolContext = createContext<CarPoolContextValue | undefined>(undefined);

export function CarPoolProvider({ children }: { children: React.ReactNode }) {
  const [journeys, setJourneys] = useState<CarPoolJourney[]>([]);
  const [latestHostListing, setLatestHostListing] = useState<CarPoolJourney | null>(null);

  const fetchJourneys = useCallback(async () => {
    try {
      const res = await axiosInstance.get('/api/carpool/journeys');
      if (res.data && res.data.journeys) {
        setJourneys(res.data.journeys);
      }
    } catch (err) {
      console.warn('Failed to fetch carpool journeys from backend:', err);
    }
  }, []);

  useEffect(() => {
    fetchJourneys();
  }, [fetchJourneys]);

  const createListingFromBooking = useCallback(async (params: {
    sourceBookingId: string;
    hostName: string;
    hostPhone: string;
    pickupCity: string;
    dropCity: string;
    startDate: string;
    startTime: string;
    carName: string;
    carCategory: string;
    totalSeats: number;
    seatsToShare: number;
    seatFare: number;
    privateFareEquivalent: number;
  }): Promise<CarPoolJourney> => {
    const payload = {
      host_name: params.hostName,
      host_phone: params.hostPhone,
      host_rating: 5.0,
      pickup_city: params.pickupCity,
      drop_city: params.dropCity,
      start_date: params.startDate,
      start_time: params.startTime,
      car_name: params.carName,
      car_category: params.carCategory,
      total_seats: params.totalSeats,
      available_seats: params.seatsToShare,
      seat_fare: params.seatFare,
      private_fare_equivalent: params.privateFareEquivalent,
      source_booking_id: params.sourceBookingId,
      is_customer_hosted: true,
    };

    try {
      const res = await axiosInstance.post('/api/carpool/journeys', payload);
      const created: CarPoolJourney = res.data.journey;
      setJourneys(prev => [created, ...prev]);
      setLatestHostListing(created);
      fetchJourneys();
      return created;
    } catch (err) {
      console.error('Failed to create carpool listing on backend:', err);
      const fallback: CarPoolJourney = {
        id: `cpool_${params.sourceBookingId}`,
        hostName: params.hostName,
        hostPhone: params.hostPhone,
        hostRating: 5.0,
        pickupCity: params.pickupCity,
        dropCity: params.dropCity,
        startDate: params.startDate,
        startTime: params.startTime,
        carName: params.carName,
        carCategory: params.carCategory,
        driverName: params.hostName,
        driverRating: 5.0,
        totalSeats: params.totalSeats,
        availableSeats: params.seatsToShare,
        seatFare: params.seatFare,
        privateFareEquivalent: params.privateFareEquivalent,
        status: 'ACTIVE',
        sourceBookingId: params.sourceBookingId,
        isCustomerHosted: true,
        passengers: [],
      };
      setJourneys(prev => [fallback, ...prev]);
      setLatestHostListing(fallback);
      return fallback;
    }
  }, [fetchJourneys]);

  const createListing = useCallback(async (journey: Omit<CarPoolJourney, 'id' | 'status'>): Promise<CarPoolJourney> => {
    const payload = {
      host_name: journey.hostName,
      host_phone: journey.hostPhone,
      host_rating: journey.hostRating || 5.0,
      pickup_city: journey.pickupCity,
      drop_city: journey.dropCity,
      start_date: journey.startDate,
      start_time: journey.startTime,
      car_name: journey.carName,
      car_category: journey.carCategory,
      total_seats: journey.totalSeats,
      available_seats: journey.availableSeats,
      seat_fare: journey.seatFare,
      private_fare_equivalent: journey.privateFareEquivalent,
      is_customer_hosted: journey.isCustomerHosted ?? true,
    };

    try {
      const res = await axiosInstance.post('/api/carpool/journeys', payload);
      const created: CarPoolJourney = res.data.journey;
      setJourneys(prev => [created, ...prev]);
      setLatestHostListing(created);
      fetchJourneys();
      return created;
    } catch (err) {
      console.error('Failed to create carpool listing on backend:', err);
      const created: CarPoolJourney = { ...journey, id: `cpool_${Date.now()}`, status: 'ACTIVE', passengers: [] };
      setJourneys(prev => [created, ...prev]);
      setLatestHostListing(created);
      return created;
    }
  }, [fetchJourneys]);

  const requestToJoin = useCallback(async (journeyId: string, passenger: Omit<CarPoolPassenger, 'status' | 'requestedAt'>) => {
    try {
      await axiosInstance.post(`/api/carpool/journeys/${journeyId}/request`, {
        passenger_id: passenger.passengerId,
        passenger_name: passenger.passengerName,
        passenger_phone: passenger.passengerPhone,
        seats_requested: passenger.seatsRequested,
      });
      fetchJourneys();
    } catch (err) {
      console.error('Failed to submit seat request to backend:', err);
      setJourneys(prev => prev.map(j => {
        if (j.id !== journeyId) return j;
        const newPassenger: CarPoolPassenger = { ...passenger, status: 'REQUESTED', requestedAt: new Date().toISOString() };
        return { ...j, passengers: [...(j.passengers ?? []), newPassenger] };
      }));
    }
  }, [fetchJourneys]);

  const approvePassengerRequest = useCallback(async (journeyId: string, passengerId: string) => {
    try {
      await axiosInstance.post(`/api/carpool/requests/${passengerId}/approve`);
      fetchJourneys();
    } catch (err) {
      console.error('Failed to approve seat request on backend:', err);
      setJourneys(prev => prev.map(j => {
        if (j.id !== journeyId) return j;
        const targetPassenger = (j.passengers ?? []).find(p => p.passengerId === passengerId || (p as any).requestId === passengerId);
        if (!targetPassenger) return j;
        const seatsToDeduct = targetPassenger.seatsRequested || 1;
        const newAvailable = Math.max(0, j.availableSeats - seatsToDeduct);
        const updatedPassengers = (j.passengers ?? []).map(p =>
          p.passengerId === passengerId || (p as any).requestId === passengerId ? { ...p, status: 'ACCEPTED' as const } : p
        );
        return {
          ...j,
          availableSeats: newAvailable,
          status: newAvailable === 0 ? ('FULL' as const) : j.status,
          passengers: updatedPassengers,
        };
      }));
    }
  }, [fetchJourneys]);

  const declinePassengerRequest = useCallback(async (journeyId: string, passengerId: string) => {
    try {
      await axiosInstance.post(`/api/carpool/requests/${passengerId}/decline`);
      fetchJourneys();
    } catch (err) {
      console.error('Failed to decline seat request on backend:', err);
      setJourneys(prev => prev.map(j => {
        if (j.id !== journeyId) return j;
        const updatedPassengers = (j.passengers ?? []).map(p =>
          p.passengerId === passengerId || (p as any).requestId === passengerId ? { ...p, status: 'DECLINED' as const } : p
        );
        return { ...j, passengers: updatedPassengers };
      }));
    }
  }, [fetchJourneys]);

  const value = useMemo<CarPoolContextValue>(() => ({
    journeys,
    fetchJourneys,
    createListingFromBooking,
    createListing,
    requestToJoin,
    approvePassengerRequest,
    declinePassengerRequest,
    latestHostListing,
  }), [journeys, fetchJourneys, createListingFromBooking, createListing, requestToJoin, approvePassengerRequest, declinePassengerRequest, latestHostListing]);

  return <CarPoolContext.Provider value={value}>{children}</CarPoolContext.Provider>;
}

export function useCarPool() {
  const ctx = useContext(CarPoolContext);
  if (!ctx) throw new Error('useCarPool must be used within a CarPoolProvider');
  return ctx;
}
