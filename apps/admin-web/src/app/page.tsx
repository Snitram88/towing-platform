'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type MetricSet = {
  totalBookings: number;
  pendingDrivers: number;
  approvedDrivers: number;
  activeBookings: number;
  completedBookings: number;
};

type Driver = {
  profile_id: string;
  verification_status: string;
  documents_status: string;
  verified_badge: boolean;
  is_online: boolean;
  is_available: boolean;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url?: string | null;
  rating_average?: number | null;
  rating_count?: number | null;
};

type Booking = {
  id: string;
  booking_status: string;
  payment_status: string;
  quoted_amount: number;
  pickup_address: string;
  drop_address: string;
  created_at: string;
  customer_name: string;
  customer_email: string | null;
  driver_id: string | null;
  driver_name: string | null;
  vehicle_type_name: string;
};

type DashboardPayload = {
  metrics: MetricSet;
  pendingDrivers: Driver[];
  approvedDrivers: Driver[];
  bookings: Booking[];
  stale?: boolean;
  fetchedAt?: string | null;
  cachedAt?: string | null;
};

const ACTIVE_STATUSES = [
  'searching_driver',
  'driver_assigned',
  'driver_en_route',
  'driver_arrived',
  'in_service',
];

const pageWrap: React.CSSProperties = {
  minHeight: '100vh',
  background:
    'linear-gradient(180deg, #06111f 0%, #0b1220 42%, #eef4ff 42%, #eef4ff 100%)',
  color: '#0f172a',
  padding: '28px 20px 48px',
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

const container: React.CSSProperties = {
  maxWidth: 1440,
  margin: '0 auto',
};

const heroCard: React.CSSProperties = {
  background: 'linear-gradient(135deg, #0b1220 0%, #0f2a47 55%, #1d4ed8 100%)',
  borderRadius: 28,
  padding: 28,
  color: '#ffffff',
  boxShadow: '0 24px 70px rgba(2, 6, 23, 0.26)',
  marginBottom: 22,
};

const metricGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 16,
  marginTop: 22,
};

const metricCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.12)',
  borderRadius: 20,
  padding: 18,
  border: '1px solid rgba(255,255,255,0.14)',
};

const whiteCard: React.CSSProperties = {
  background: '#ffffff',
  borderRadius: 24,
  padding: 22,
  boxShadow: '0 14px 36px rgba(15, 23, 42, 0.08)',
};

const cardGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 18,
  alignItems: 'start',
};

const actionButton = (background: string, color = '#ffffff'): React.CSSProperties => ({
  border: 'none',
  borderRadius: 12,
  padding: '10px 14px',
  fontWeight: 800,
  cursor: 'pointer',
  background,
  color,
});

function chip(bg: string, color: string): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: 999,
    padding: '8px 12px',
    fontWeight: 800,
    fontSize: 12,
    background: bg,
    color,
  };
}

function bookingStatusChip(status: string) {
  switch (status) {
    case 'completed':
      return chip('#dcfce7', '#166534');
    case 'driver_en_route':
    case 'driver_arrived':
    case 'in_service':
      return chip('#dbeafe', '#1d4ed8');
    case 'driver_assigned':
    case 'searching_driver':
      return chip('#fef3c7', '#b45309');
    case 'canceled_by_admin':
    case 'canceled_by_driver':
    case 'canceled_by_customer':
      return chip('#fee2e2', '#b91c1c');
    default:
      return chip('#e2e8f0', '#334155');
  }
}

function onlineChip(isOnline: boolean, isAvailable: boolean) {
  if (isOnline && isAvailable) return chip('#dcfce7', '#166534');
  if (isOnline && !isAvailable) return chip('#dbeafe', '#1d4ed8');
  return chip('#e2e8f0', '#334155');
}

function onlineLabel(isOnline: boolean, isAvailable: boolean) {
  if (isOnline && isAvailable) return 'Online • Available';
  if (isOnline && !isAvailable) return 'Online • Busy';
  return 'Offline';
}

function titleize(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function bookingMatchesQuery(booking: Booking, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  return [
    booking.customer_name,
    booking.driver_name || '',
    booking.pickup_address,
    booking.drop_address,
    booking.vehicle_type_name,
    booking.booking_status,
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

function connectionChip(stale: boolean, failedRefreshCount: number) {
  if (failedRefreshCount > 0 && stale) return chip('#fef3c7', '#b45309');
  if (failedRefreshCount > 0) return chip('#fee2e2', '#b91c1c');
  return chip('#dcfce7', '#166534');
}

function connectionLabel(stale: boolean, failedRefreshCount: number) {
  if (failedRefreshCount > 0 && stale) return 'Using cached snapshot';
  if (failedRefreshCount > 0) return 'Connection unstable';
  return 'Live connection healthy';
}

function initialsFromName(name?: string | null, fallback = 'D') {
  const safe = (name || '').trim();
  if (!safe) return fallback;

  const parts = safe.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function ratingLabel(count: number) {
  return `${count} rating${count === 1 ? '' : 's'}`;
}

function RatingStars({ value }: { value: number }) {
  const rounded = Math.round(value);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          style={{
            color: '#f59e0b',
            fontSize: 16,
            lineHeight: 1,
          }}
        >
          {star <= rounded ? '★' : '☆'}
        </span>
      ))}
    </div>
  );
}

function DriverAvatar({
  name,
  avatarUrl,
  size = 56,
}: {
  name?: string | null;
  avatarUrl?: string | null;
  size?: number;
}) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name || 'Driver avatar'}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          objectFit: 'cover',
          background: '#e2e8f0',
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 900,
        fontSize: size >= 56 ? 18 : 14,
        flexShrink: 0,
      }}
    >
      {initialsFromName(name, 'D')}
    </div>
  );
}

export default function Page() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [archiveQuery, setArchiveQuery] = useState('');
  const [failedRefreshCount, setFailedRefreshCount] = useState(0);
  const inFlightRef = useRef(false);

  const loadDashboard = async (silent = false) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      const response = await fetch('/api/admin/dashboard', { cache: 'no-store' });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || 'Dashboard load failed');
      }

      setData(json);
      setFailedRefreshCount(0);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log('[admin-dashboard-refresh]', message);

      setFailedRefreshCount((count) => count + 1);

      if (!silent && !data) {
        alert(message);
      }
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard(false);

    const interval = setInterval(() => {
      void loadDashboard(true);
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  const metrics = useMemo(
    () =>
      data?.metrics ?? {
        totalBookings: 0,
        pendingDrivers: 0,
        approvedDrivers: 0,
        activeBookings: 0,
        completedBookings: 0,
      },
    [data]
  );

  const activeBookings = useMemo(
    () => (data?.bookings ?? []).filter((booking) => ACTIVE_STATUSES.includes(booking.booking_status)),
    [data]
  );

  const archiveBookings = useMemo(
    () =>
      (data?.bookings ?? []).filter(
        (booking) =>
          !ACTIVE_STATUSES.includes(booking.booking_status) && bookingMatchesQuery(booking, archiveQuery)
      ),
    [data, archiveQuery]
  );

  const runAction = async (key: string, url: string, body: Record<string, unknown>) => {
    try {
      setBusyKey(key);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || 'Action failed');
      }

      await loadDashboard(true);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Action failed');
    } finally {
      setBusyKey(null);
    }
  };

  const stale = Boolean(data?.stale);

  return (
    <main style={pageWrap}>
      <div style={container}>
        <section style={heroCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  borderRadius: 999,
                  padding: '8px 12px',
                  background: 'rgba(125,211,252,0.12)',
                  color: '#bae6fd',
                  fontSize: 12,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  marginBottom: 14,
                }}
              >
                TowSwift Operations
              </div>
              <h1 style={{ margin: 0, fontSize: 38, lineHeight: 1.05, fontWeight: 900 }}>
                Admin dashboard, driver approval, and live booking control.
              </h1>
              <p style={{ marginTop: 12, marginBottom: 0, color: '#dbeafe', maxWidth: 760, lineHeight: 1.6 }}>
                Auto-refreshes every 15 seconds with cached fallback when the network to Supabase is unstable.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={connectionChip(stale, failedRefreshCount)}>
                {connectionLabel(stale, failedRefreshCount)}
              </span>

              <button
                onClick={() => void loadDashboard(false)}
                style={actionButton('#ffffff', '#0f172a')}
              >
                Refresh now
              </button>
            </div>
          </div>

          <div style={metricGrid}>
            <div style={metricCard}><div>Total bookings</div><div style={{ fontSize: 34, fontWeight: 900 }}>{metrics.totalBookings}</div></div>
            <div style={metricCard}><div>Pending drivers</div><div style={{ fontSize: 34, fontWeight: 900 }}>{metrics.pendingDrivers}</div></div>
            <div style={metricCard}><div>Approved drivers</div><div style={{ fontSize: 34, fontWeight: 900 }}>{metrics.approvedDrivers}</div></div>
            <div style={metricCard}><div>Active jobs</div><div style={{ fontSize: 34, fontWeight: 900 }}>{metrics.activeBookings}</div></div>
            <div style={metricCard}><div>Completed jobs</div><div style={{ fontSize: 34, fontWeight: 900 }}>{metrics.completedBookings}</div></div>
          </div>
        </section>

        <div style={cardGrid}>
          <section style={whiteCard}>
            <h2 style={{ marginTop: 0 }}>Driver approvals</h2>
            <p style={{ color: '#64748b' }}>
              A driver is fully approved only when both account approval and document approval are complete.
            </p>

            {loading ? (
              <p>Loading...</p>
            ) : !data || data.pendingDrivers.length === 0 ? (
              <p style={{ color: '#64748b' }}>No pending drivers right now.</p>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {data.pendingDrivers.map((driver) => {
                  const needsAccountApproval = driver.verification_status !== 'approved';
                  const needsDocsApproval = driver.documents_status !== 'approved';
                  const ratingAverage = Number(driver.rating_average ?? 0);
                  const ratingCount = Number(driver.rating_count ?? 0);

                  return (
                    <div
                      key={driver.profile_id}
                      style={{
                        border: '1px solid #e2e8f0',
                        borderRadius: 18,
                        padding: 16,
                        background: '#fcfdff',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 16,
                          flexWrap: 'wrap',
                          marginBottom: 12,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            gap: 14,
                            alignItems: 'center',
                            flex: 1,
                            minWidth: 240,
                          }}
                        >
                          <DriverAvatar
                            name={driver.full_name}
                            avatarUrl={driver.avatar_url}
                            size={58}
                          />

                          <div style={{ flex: 1 }}>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                flexWrap: 'wrap',
                                marginBottom: 4,
                              }}
                            >
                              <div style={{ fontWeight: 900, fontSize: 16 }}>
                                {driver.full_name}
                              </div>

                              {driver.verified_badge ? (
                                <span style={chip('#dcfce7', '#166534')}>Verified</span>
                              ) : null}
                            </div>

                            <div style={{ color: '#64748b', marginBottom: 4 }}>
                              {driver.email || 'No email'}
                            </div>
                            <div style={{ color: '#64748b', fontSize: 13 }}>
                              {driver.phone || 'No phone'}
                            </div>

                            <div style={{ marginTop: 10 }}>
                              {ratingCount > 0 ? (
                                <>
                                  <RatingStars value={ratingAverage} />
                                  <div
                                    style={{
                                      color: '#475569',
                                      fontSize: 12,
                                      fontWeight: 700,
                                      marginTop: 6,
                                    }}
                                  >
                                    {ratingAverage.toFixed(1)} • {ratingLabel(ratingCount)}
                                  </div>
                                </>
                              ) : (
                                <div
                                  style={{
                                    color: '#94a3b8',
                                    fontSize: 12,
                                    fontWeight: 700,
                                  }}
                                >
                                  No ratings yet
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                        <span style={chip('#fef3c7', '#b45309')}>
                          Account: {titleize(driver.verification_status)}
                        </span>
                        <span style={chip('#ede9fe', '#6d28d9')}>
                          Docs: {titleize(driver.documents_status)}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {needsAccountApproval ? (
                          <button
                            style={actionButton('#16a34a')}
                            disabled={busyKey === `approve-account-${driver.profile_id}`}
                            onClick={() =>
                              runAction(
                                `approve-account-${driver.profile_id}`,
                                '/api/admin/drivers/decision',
                                { profileId: driver.profile_id, decision: 'approved' }
                              )
                            }
                          >
                            Approve account
                          </button>
                        ) : null}

                        {needsDocsApproval ? (
                          <button
                            style={actionButton('#7c3aed')}
                            disabled={busyKey === `approve-docs-${driver.profile_id}`}
                            onClick={() =>
                              runAction(
                                `approve-docs-${driver.profile_id}`,
                                '/api/admin/drivers/documents-decision',
                                { profileId: driver.profile_id, decision: 'approved' }
                              )
                            }
                          >
                            Approve docs
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section style={whiteCard}>
            <h2 style={{ marginTop: 0 }}>Approved drivers live board</h2>
            <p style={{ color: '#64748b' }}>
              This panel reflects who is online, offline, available, or busy.
            </p>

            {loading ? (
              <p>Loading...</p>
            ) : !data || data.approvedDrivers.length === 0 ? (
              <p style={{ color: '#64748b' }}>No fully approved drivers yet.</p>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {data.approvedDrivers.map((driver) => {
                  const ratingAverage = Number(driver.rating_average ?? 0);
                  const ratingCount = Number(driver.rating_count ?? 0);

                  return (
                    <div
                      key={driver.profile_id}
                      style={{
                        border: '1px solid #e2e8f0',
                        borderRadius: 18,
                        padding: 16,
                        background: '#fcfdff',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 14,
                          flexWrap: 'wrap',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            gap: 14,
                            alignItems: 'center',
                            flex: 1,
                            minWidth: 240,
                          }}
                        >
                          <DriverAvatar
                            name={driver.full_name}
                            avatarUrl={driver.avatar_url}
                            size={58}
                          />

                          <div style={{ flex: 1 }}>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                flexWrap: 'wrap',
                                marginBottom: 4,
                              }}
                            >
                              <div style={{ fontWeight: 900, fontSize: 16 }}>
                                {driver.full_name}
                              </div>

                              {driver.verified_badge ? (
                                <span style={chip('#dcfce7', '#166534')}>Verified</span>
                              ) : null}
                            </div>

                            <div style={{ color: '#64748b', marginBottom: 4 }}>
                              {driver.email || 'No email'}
                            </div>

                            <div style={{ color: '#64748b', fontSize: 13, marginBottom: 10 }}>
                              {driver.phone || 'No phone'}
                            </div>

                            {ratingCount > 0 ? (
                              <>
                                <RatingStars value={ratingAverage} />
                                <div
                                  style={{
                                    color: '#475569',
                                    fontSize: 12,
                                    fontWeight: 700,
                                    marginTop: 6,
                                  }}
                                >
                                  {ratingAverage.toFixed(1)} • {ratingLabel(ratingCount)}
                                </div>
                              </>
                            ) : (
                              <div
                                style={{
                                  color: '#94a3b8',
                                  fontSize: 12,
                                  fontWeight: 700,
                                }}
                              >
                                No ratings yet
                              </div>
                            )}
                          </div>
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                            alignItems: 'flex-end',
                            justifyContent: 'center',
                          }}
                        >
                          <span style={onlineChip(driver.is_online, driver.is_available)}>
                            {onlineLabel(driver.is_online, driver.is_available)}
                          </span>
                          <span style={chip('#eff6ff', '#1d4ed8')}>
                            {titleize(driver.verification_status)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <section style={{ ...whiteCard, marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 18 }}>
            <div>
              <h2 style={{ marginTop: 0, marginBottom: 6 }}>Active bookings board</h2>
              <p style={{ color: '#64748b', margin: 0 }}>
                Compact operations cards for live jobs. This is the board your team will watch most.
              </p>
            </div>

            <div style={chip('#dbeafe', '#1d4ed8')}>
              {activeBookings.length} active booking(s)
            </div>
          </div>

          {loading ? (
            <p>Loading...</p>
          ) : activeBookings.length === 0 ? (
            <p style={{ color: '#64748b' }}>No active bookings right now.</p>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
                gap: 16,
              }}
            >
              {activeBookings.map((booking) => (
                <div
                  key={booking.id}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: 22,
                    padding: 18,
                    background: '#fcfdff',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 900 }}>{booking.vehicle_type_name}</div>
                      <div style={{ color: '#64748b' }}>
                        {booking.customer_name} • {new Date(booking.created_at).toLocaleString()}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span style={bookingStatusChip(booking.booking_status)}>
                        {titleize(booking.booking_status)}
                      </span>
                      <span style={chip('#eff6ff', '#1d4ed8')}>
                        ${Number(booking.quoted_amount).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 12, textTransform: 'uppercase', color: '#64748b', fontWeight: 800, marginBottom: 4 }}>
                      Pickup
                    </div>
                    <div style={{ fontWeight: 700, lineHeight: 1.5 }}>{booking.pickup_address}</div>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, textTransform: 'uppercase', color: '#64748b', fontWeight: 800, marginBottom: 4 }}>
                      Dropoff
                    </div>
                    <div style={{ fontWeight: 700, lineHeight: 1.5 }}>{booking.drop_address}</div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <div style={chip('#f8fafc', '#334155')}>Customer: {booking.customer_name}</div>
                    <div style={chip('#f8fafc', '#334155')}>Driver: {booking.driver_name || 'Unassigned'}</div>
                    <div style={chip('#f8fafc', '#334155')}>Payment: {titleize(booking.payment_status)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section style={{ ...whiteCard, marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 18 }}>
            <div>
              <h2 style={{ marginTop: 0, marginBottom: 6 }}>Booking repository</h2>
              <p style={{ color: '#64748b', margin: 0 }}>
                Search through completed, cancelled, and inactive records.
              </p>
            </div>

            <input
              value={archiveQuery}
              onChange={(event) => setArchiveQuery(event.target.value)}
              placeholder="Search customer, driver, address, vehicle, status..."
              style={{
                minWidth: 340,
                maxWidth: 420,
                borderRadius: 14,
                border: '1px solid #cbd5e1',
                padding: '12px 14px',
                fontSize: 14,
                fontWeight: 600,
                outline: 'none',
              }}
            />
          </div>

          {loading ? (
            <p>Loading...</p>
          ) : archiveBookings.length === 0 ? (
            <p style={{ color: '#64748b' }}>No repository records match your search.</p>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: 14,
              }}
            >
              {archiveBookings.map((booking) => (
                <div
                  key={booking.id}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: 18,
                    padding: 16,
                    background: '#ffffff',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                    <div style={{ fontWeight: 800 }}>{booking.vehicle_type_name}</div>
                    <span style={bookingStatusChip(booking.booking_status)}>
                      {titleize(booking.booking_status)}
                    </span>
                  </div>

                  <div style={{ color: '#64748b', fontSize: 13, marginBottom: 10 }}>
                    {booking.customer_name} • {new Date(booking.created_at).toLocaleString()}
                  </div>

                  <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 10 }}>
                    <strong>Pickup:</strong> {booking.pickup_address}
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>
                    <strong>Dropoff:</strong> {booking.drop_address}
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <div style={chip('#f8fafc', '#334155')}>Driver: {booking.driver_name || 'Unassigned'}</div>
                    <div style={chip('#eff6ff', '#1d4ed8')}>${Number(booking.quoted_amount).toFixed(2)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}