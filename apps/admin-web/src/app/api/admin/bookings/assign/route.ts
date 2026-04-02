import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const { bookingId, driverId } = await request.json();

    if (!bookingId || !driverId) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { error: bookingError } = await supabase
      .from('bookings')
      .update({
        driver_id: driverId,
        booking_status: 'driver_assigned',
      })
      .eq('id', bookingId);

    if (bookingError) throw bookingError;

    const { error: driverError } = await supabase
      .from('drivers')
      .update({
        is_available: false,
      })
      .eq('profile_id', driverId);

    if (driverError) throw driverError;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Booking assignment failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Booking assignment failed' },
      { status: 500 }
    );
  }
}
