import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const { profileId, decision } = await request.json();

    if (!profileId || !['approved', 'rejected', 'pending'].includes(decision)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { error } = await supabase
      .from('drivers')
      .update({
        documents_status: decision,
        is_online: decision === 'approved' ? undefined : false,
        is_available: decision === 'approved' ? undefined : false,
      })
      .eq('profile_id', profileId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Document decision failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Document decision failed' },
      { status: 500 }
    );
  }
}
