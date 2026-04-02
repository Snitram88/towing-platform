import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const allowedStatuses = [
  'searching_driver',
  'driver_assigned',
  'driver_en_route',
  'driver_arrived',
  'in_service',
  'completed',
  'canceled_by_admin',
];

export async function POST(request: NextRequest) {
  try {
    const { bookingId, status } = await request.json();

    if (!bookingId || !allowedStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: currentBooking, error: currentError } = await supabase
      .from('bookings')
      .select('id, driver_id')
      .eq('id', bookingId)
      .single();

    if (currentError) throw currentError;

    const { error: bookingError } = await supabase
      .from('bookings')
      .update({
        booking_status: status,
      })
      .eq('id', bookingId);

    if (bookingError) throw bookingError;

    if (currentBooking?.driver_id && ['completed', 'canceled_by_admin'].includes(status)) {
      const { error: driverError } = await supabase
        .from('drivers')
        .update({
          is_available: true,
          is_online: true,
        })
        .eq('profile_id', currentBooking.driver_id);

      if (driverError) throw driverError;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Booking status update failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Booking status update failed' },
      { status: 500 }
    );
  }
}
