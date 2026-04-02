import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

type DriverRow = {
  profile_id: string;
  verification_status: string;
  verified_badge: boolean;
  is_online: boolean;
  is_available: boolean;
  created_at?: string | null;
};

type BookingRow = {
  id: string;
  customer_id: string;
  driver_id: string | null;
  vehicle_type_id: string;
  booking_status: string;
  payment_status: string;
  quoted_amount: number;
  pickup_address: string;
  drop_address: string;
  created_at: string;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role?: string | null;
};

type VehicleTypeRow = {
  id: string;
  name: string;
};

export async function GET() {
  try {
    const supabase = createAdminClient();

    const [driversRes, bookingsRes, profilesRes, vehicleTypesRes] = await Promise.all([
      supabase
        .from('drivers')
        .select('profile_id, verification_status, verified_badge, is_online, is_available, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('bookings')
        .select(
          'id, customer_id, driver_id, vehicle_type_id, booking_status, payment_status, quoted_amount, pickup_address, drop_address, created_at'
        )
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('profiles')
        .select('id, full_name, email, phone, role')
        .order('created_at', { ascending: false }),
      supabase
        .from('vehicle_types')
        .select('id, name')
        .order('display_order', { ascending: true }),
    ]);

    if (driversRes.error) throw driversRes.error;
    if (bookingsRes.error) throw bookingsRes.error;
    if (profilesRes.error) throw profilesRes.error;
    if (vehicleTypesRes.error) throw vehicleTypesRes.error;

    const drivers = (driversRes.data ?? []) as DriverRow[];
    const bookings = (bookingsRes.data ?? []) as BookingRow[];
    const profiles = (profilesRes.data ?? []) as ProfileRow[];
    const vehicleTypes = (vehicleTypesRes.data ?? []) as VehicleTypeRow[];

    const profileMap = Object.fromEntries(profiles.map((profile) => [profile.id, profile]));
    const vehicleTypeMap = Object.fromEntries(vehicleTypes.map((item) => [item.id, item.name]));

    const pendingDrivers = drivers
      .filter((driver) => driver.verification_status === 'pending' || driver.verification_status === 'rejected')
      .map((driver) => {
        const profile = profileMap[driver.profile_id];
        return {
          ...driver,
          full_name: profile?.full_name ?? 'Unknown driver',
          email: profile?.email ?? null,
          phone: profile?.phone ?? null,
        };
      });

    const approvedDrivers = drivers
      .filter((driver) => driver.verification_status === 'approved')
      .map((driver) => {
        const profile = profileMap[driver.profile_id];
        return {
          ...driver,
          full_name: profile?.full_name ?? 'Approved driver',
          email: profile?.email ?? null,
          phone: profile?.phone ?? null,
        };
      });

    const enrichedBookings = bookings.map((booking) => {
      const customer = profileMap[booking.customer_id];
      const driver = booking.driver_id ? profileMap[booking.driver_id] : null;

      return {
        ...booking,
        customer_name: customer?.full_name ?? customer?.email ?? 'Customer',
        customer_email: customer?.email ?? null,
        driver_name: driver?.full_name ?? driver?.email ?? null,
        vehicle_type_name: vehicleTypeMap[booking.vehicle_type_id] ?? 'Tow class',
      };
    });

    const metrics = {
      totalBookings: enrichedBookings.length,
      pendingDrivers: pendingDrivers.length,
      approvedDrivers: approvedDrivers.length,
      activeBookings: enrichedBookings.filter((item) =>
        ['searching_driver', 'driver_assigned', 'driver_en_route', 'driver_arrived', 'in_service'].includes(item.booking_status)
      ).length,
      completedBookings: enrichedBookings.filter((item) => item.booking_status === 'completed').length,
    };

    return NextResponse.json({
      metrics,
      pendingDrivers,
      approvedDrivers,
      bookings: enrichedBookings,
    });
  } catch (error) {
    console.error('Dashboard load failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Dashboard load failed' },
      { status: 500 }
    );
  }
}
