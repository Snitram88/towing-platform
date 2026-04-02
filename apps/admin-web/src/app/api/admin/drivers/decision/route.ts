import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const { profileId, decision } = await request.json();

    if (!profileId || !['approved', 'rejected'].includes(decision)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: driverRow, error: fetchError } = await supabase
      .from('drivers')
      .select('profile_id, is_online, documents_submitted, document_status')
      .eq('profile_id', profileId)
      .single();

    if (fetchError) throw fetchError;

    if (decision === 'approved' && !driverRow.documents_submitted) {
      return NextResponse.json(
        { error: 'Driver documents must be submitted before approval.' },
        { status: 400 }
      );
    }

    const payload =
      decision === 'approved'
        ? {
            verification_status: 'approved',
            document_status: 'approved',
            verified_badge: true,
            is_available: Boolean(driverRow.is_online),
          }
        : {
            verification_status: 'rejected',
            document_status: driverRow.documents_submitted ? 'rejected' : 'not_submitted',
            verified_badge: false,
            is_online: false,
            is_available: false,
          };

    const { error } = await supabase
      .from('drivers')
      .update(payload)
      .eq('profile_id', profileId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Driver decision failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Driver decision failed' },
      { status: 500 }
    );
  }
}
