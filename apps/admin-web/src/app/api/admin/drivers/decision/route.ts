import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const { profileId, decision } = await request.json();

    if (!profileId || !['approved', 'rejected'].includes(decision)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { error } = await supabase
      .from('drivers')
      .update({
        verification_status: decision,
        verified_badge: decision === 'approved',
        is_available: decision === 'approved',
      })
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
