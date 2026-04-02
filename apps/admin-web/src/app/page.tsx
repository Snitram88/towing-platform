'use client';

import { useEffect, useMemo, useState } from 'react';

type MetricSet = {
  totalBookings: number;
  pendingDrivers: number;
  approvedDrivers: number;
  activeBookings: number;
  completedBookings: number;
};

type PendingDriver = {
  profile_id: string;
  verification_status: string;
  verified_badge: boolean;
  is_online: boolean;
  is_available: boolean;
  full_name: string;
  email: string | null;
  phone: string | null;
};

type ApprovedDriver = PendingDriver;

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
  pendingDrivers: PendingDriver[];
  approvedDrivers: ApprovedDriver[];
  bookings: Booking[];
};

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
  maxWidth: 1280,
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
  gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
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
  gridTemplateColumns: '1.1fr 1.6fr',
  gap: 18,
  alignItems: 'start',
};

const tableWrap: React.CSSProperties = {
  overflowX: 'auto',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: 0.8,
  color: '#64748b',
  padding: '0 0 14px',
  borderBottom: '1px solid #e2e8f0',
};

const tdStyle: React.CSSProperties = {
  padding: '14px 0',
  borderBottom: '1px solid #f1f5f9',
  verticalAlign: 'top',
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

const subtleButton: React.CSSProperties = {
  ...actionButton('#eff6ff', '#1d4ed8'),
};

const sectionTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 22,
  fontWeight: 800,
  color: '#0f172a',
};

const muted: React.CSSProperties = {
  color: '#64748b',
  fontSize: 14,
};

const chipStyle = (bg: string, color: string): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: 999,
  padding: '8px 12px',
  fontWeight: 800,
  fontSize: 12,
  background: bg,
  color,
});

function bookingStatusChip(status: string) {
  switch (status) {
    case 'completed':
      return chipStyle('#dcfce7', '#166534');
    case 'driver_en_route':
    case 'driver_arrived':
    case 'in_service':
      return chipStyle('#dbeafe', '#1d4ed8');
    case 'driver_assigned':
    case 'searching_driver':
      return chipStyle('#fef3c7', '#b45309');
    case 'canceled_by_admin':
      return chipStyle('#fee2e2', '#b91c1c');
    default:
      return chipStyle('#e2e8f0', '#334155');
  }
}

function titleize(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function Page() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const loadDashboard = async () => {
    setLoading(true);
    const response = await fetch('/api/admin/dashboard', { cache: 'no-store' });
    const json = await response.json();

    if (!response.ok) {
      throw new Error(json.error || 'Dashboard load failed');
    }

    setData(json);
    setLoading(false);
  };

  useEffect(() => {
    loadDashboard().catch((error) => {
      console.error(error);
      setLoading(false);
      alert(error.message || 'Dashboard load failed');
    });
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

  const runAction = async (key: string, url: string, body: Record<string, unknown>) => {
    try {
      setBusyKey(key);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || 'Action failed');
      }

      await loadDashboard();
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : 'Action failed');
    } finally {
      setBusyKey(null);
    }
  };

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
              <p style={{ marginTop: 12, marginBottom: 0, color: '#dbeafe', maxWidth: 720, lineHeight: 1.6 }}>
                This is the real ops control center for the towing platform. Approve drivers, assign bookings,
                and move jobs through their service lifecycle.
              </p>
            </div>

            <div>
              <button
                onClick={() => loadDashboard().catch((error) => alert(error.message))}
                style={actionButton('#ffffff', '#0f172a')}
              >
                Refresh dashboard
              </button>
            </div>
          </div>

          <div style={metricGrid}>
            <div style={metricCard}>
              <div style={{ color: '#dbeafe', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Total bookings</div>
              <div style={{ fontSize: 34, fontWeight: 900 }}>{metrics.totalBookings}</div>
            </div>
            <div style={metricCard}>
              <div style={{ color: '#dbeafe', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Pending drivers</div>
              <div style={{ fontSize: 34, fontWeight: 900 }}>{metrics.pendingDrivers}</div>
            </div>
            <div style={metricCard}>
              <div style={{ color: '#dbeafe', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Approved drivers</div>
              <div style={{ fontSize: 34, fontWeight: 900 }}>{metrics.approvedDrivers}</div>
            </div>
            <div style={metricCard}>
              <div style={{ color: '#dbeafe', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Active jobs</div>
              <div style={{ fontSize: 34, fontWeight: 900 }}>{metrics.activeBookings}</div>
            </div>
            <div style={metricCard}>
              <div style={{ color: '#dbeafe', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Completed jobs</div>
              <div style={{ fontSize: 34, fontWeight: 900 }}>{metrics.completedBookings}</div>
            </div>
          </div>
        </section>

        <div style={cardGrid}>
          <section style={whiteCard}>
            <div style={{ marginBottom: 18 }}>
              <h2 style={sectionTitle}>Driver approvals</h2>
              <p style={muted}>Approve or reject pending drivers before they can receive live towing assignments.</p>
            </div>

            {loading ? (
              <p style={muted}>Loading drivers...</p>
            ) : !data || data.pendingDrivers.length === 0 ? (
              <p style={muted}>No pending or rejected drivers right now.</p>
            ) : (
              <div style={tableWrap}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Driver</th>
                      <th style={thStyle}>Contact</th>
                      <th style={thStyle}>Status</th>
                      <th style={thStyle}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.pendingDrivers.map((driver) => (
                      <tr key={driver.profile_id}>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 800, color: '#0f172a' }}>{driver.full_name}</div>
                          <div style={muted}>Profile ID: {driver.profile_id.slice(0, 8)}...</div>
                        </td>
                        <td style={tdStyle}>
                          <div>{driver.email || 'No email'}</div>
                          <div style={muted}>{driver.phone || 'No phone'}</div>
                        </td>
                        <td style={tdStyle}>
                          <span style={bookingStatusChip(driver.verification_status)}>
                            {titleize(driver.verification_status)}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            <button
                              style={actionButton('#16a34a')}
                              disabled={busyKey === `approve-${driver.profile_id}`}
                              onClick={() =>
                                runAction(
                                  `approve-${driver.profile_id}`,
                                  '/api/admin/drivers/decision',
                                  { profileId: driver.profile_id, decision: 'approved' }
                                )
                              }
                            >
                              Approve
                            </button>
                            <button
                              style={actionButton('#ef4444')}
                              disabled={busyKey === `reject-${driver.profile_id}`}
                              onClick={() =>
                                runAction(
                                  `reject-${driver.profile_id}`,
                                  '/api/admin/drivers/decision',
                                  { profileId: driver.profile_id, decision: 'rejected' }
                                )
                              }
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section style={whiteCard}>
            <div style={{ marginBottom: 18 }}>
              <h2 style={sectionTitle}>Bookings operations</h2>
              <p style={muted}>Assign approved drivers and move jobs through operational statuses.</p>
            </div>

            {loading ? (
              <p style={muted}>Loading bookings...</p>
            ) : !data || data.bookings.length === 0 ? (
              <p style={muted}>No bookings found yet.</p>
            ) : (
              <div style={{ display: 'grid', gap: 14 }}>
                {data.bookings.map((booking) => (
                  <div
                    key={booking.id}
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: 20,
                      padding: 18,
                      background: '#fcfdff',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 16,
                        alignItems: 'flex-start',
                        flexWrap: 'wrap',
                        marginBottom: 14,
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', marginBottom: 4 }}>
                          {booking.vehicle_type_name}
                        </div>
                        <div style={muted}>
                          {booking.customer_name} • {new Date(booking.created_at).toLocaleString()}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <span style={bookingStatusChip(booking.booking_status)}>
                          {titleize(booking.booking_status)}
                        </span>
                        <span style={chipStyle('#eff6ff', '#1d4ed8')}>
                          ${Number(booking.quoted_amount).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, textTransform: 'uppercase', color: '#64748b', fontWeight: 800, marginBottom: 4 }}>
                        Pickup
                      </div>
                      <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>{booking.pickup_address}</div>

                      <div style={{ fontSize: 12, textTransform: 'uppercase', color: '#64748b', fontWeight: 800, marginBottom: 4 }}>
                        Dropoff
                      </div>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{booking.drop_address}</div>
                    </div>

                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
                      <div style={chipStyle('#f8fafc', '#334155')}>
                        Customer: {booking.customer_name}
                      </div>
                      <div style={chipStyle('#f8fafc', '#334155')}>
                        Driver: {booking.driver_name || 'Unassigned'}
                      </div>
                      <div style={chipStyle('#f8fafc', '#334155')}>
                        Payment: {titleize(booking.payment_status)}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <select
                        defaultValue=""
                        style={{
                          minWidth: 240,
                          borderRadius: 14,
                          border: '1px solid #cbd5e1',
                          padding: '12px 14px',
                          fontWeight: 700,
                          color: '#0f172a',
                          background: '#ffffff',
                        }}
                        onChange={(event) => {
                          const driverId = event.target.value;
                          if (!driverId) return;

                          runAction(
                            `assign-${booking.id}`,
                            '/api/admin/bookings/assign',
                            { bookingId: booking.id, driverId }
                          );
                        }}
                      >
                        <option value="">Assign approved driver</option>
                        {data.approvedDrivers
                          .filter((driver) => driver.is_available)
                          .map((driver) => (
                            <option key={driver.profile_id} value={driver.profile_id}>
                              {driver.full_name} {driver.is_online ? '• online' : '• offline'}
                            </option>
                          ))}
                      </select>

                      <select
                        defaultValue=""
                        style={{
                          minWidth: 220,
                          borderRadius: 14,
                          border: '1px solid #cbd5e1',
                          padding: '12px 14px',
                          fontWeight: 700,
                          color: '#0f172a',
                          background: '#ffffff',
                        }}
                        onChange={(event) => {
                          const status = event.target.value;
                          if (!status) return;

                          runAction(
                            `status-${booking.id}`,
                            '/api/admin/bookings/status',
                            { bookingId: booking.id, status }
                          );
                        }}
                      >
                        <option value="">Change booking status</option>
                        <option value="searching_driver">Searching driver</option>
                        <option value="driver_assigned">Driver assigned</option>
                        <option value="driver_en_route">Driver en route</option>
                        <option value="driver_arrived">Driver arrived</option>
                        <option value="in_service">In service</option>
                        <option value="completed">Completed</option>
                        <option value="canceled_by_admin">Canceled by admin</option>
                      </select>

                      <button
                        style={subtleButton}
                        onClick={() => loadDashboard().catch((error) => alert(error.message))}
                      >
                        Refresh row
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
