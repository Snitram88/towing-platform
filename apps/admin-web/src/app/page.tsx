import { createClient } from '@supabase/supabase-js';

type VehicleType = {
  id: string;
  name: string;
  tonnage_min: number;
  tonnage_max: number;
  base_fare: number;
};

const modules = [
  { title: 'Driver verification', subtitle: 'Approve documents and activate operators' },
  { title: 'Dispatch operations', subtitle: 'Monitor bookings, assignments, and cancellation states' },
  { title: 'Pricing controls', subtitle: 'Manage base fare, per-km pricing, and cancellation rules' },
  { title: 'Wallet & payouts', subtitle: 'Track customer payments and driver earnings flow' },
];

const timeline = [
  'Foundation schema connected to live Supabase',
  'Premium customer and driver UI shells upgraded',
  'Admin dashboard moved to an operations-grade layout',
  'Next: auth, onboarding, booking, and dispatch state machine',
];

export default async function HomePage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase
    .from('vehicle_types')
    .select('id, name, tonnage_min, tonnage_max, base_fare')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  const vehicleTypes = (data ?? []) as VehicleType[];

  const stats = [
    { label: 'Vehicle classes', value: String(vehicleTypes.length).padStart(2, '0') },
    { label: 'Active drivers', value: '00' },
    { label: 'Trips today', value: '00' },
    { label: 'Revenue today', value: '$0.00' },
  ];

  return (
    <main
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at top, rgba(37,99,235,0.16), transparent 28%), linear-gradient(180deg, #050B14 0%, #09111F 45%, #0B1220 100%)',
        color: '#fff',
        padding: '28px 22px 60px',
        fontFamily: 'Inter, Arial, sans-serif',
      }}
    >
      <div style={{ maxWidth: 1240, margin: '0 auto', display: 'grid', gap: 22 }}>
        <section
          style={{
            background: 'linear-gradient(135deg, rgba(17,24,39,0.94), rgba(10,37,64,0.92))',
            border: '1px solid rgba(148,163,184,0.12)',
            borderRadius: 28,
            padding: 28,
            boxShadow: '0 18px 40px rgba(2,6,23,0.28)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 18,
              alignItems: 'flex-start',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ maxWidth: 680 }}>
              <p
                style={{
                  color: '#7dd3fc',
                  fontWeight: 800,
                  margin: '0 0 10px',
                  textTransform: 'uppercase',
                  letterSpacing: 1.2,
                  fontSize: 12,
                }}
              >
                Towing operations center
              </p>

              <h1 style={{ fontSize: 44, lineHeight: 1.05, margin: '0 0 12px', fontWeight: 800 }}>
                Premium admin dashboard foundation
              </h1>

              <p style={{ color: '#cbd5e1', fontSize: 17, lineHeight: 1.7, margin: 0 }}>
                This is the operations-grade UI shell for the towing platform. It uses a premium,
                action-first layout inspired by modern ride-hailing control systems.
              </p>
            </div>

            <div
              style={{
                padding: '12px 16px',
                borderRadius: 999,
                background: error ? 'rgba(239,68,68,0.14)' : 'rgba(34,197,94,0.14)',
                color: error ? '#fca5a5' : '#86efac',
                fontWeight: 800,
                alignSelf: 'flex-start',
              }}
            >
              {error ? 'Supabase connection issue' : 'Live Supabase connected'}
            </div>
          </div>
        </section>

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
          }}
        >
          {stats.map((stat) => (
            <div
              key={stat.label}
              style={{
                background: 'rgba(255,255,255,0.98)',
                color: '#0f172a',
                borderRadius: 24,
                padding: 22,
                boxShadow: '0 18px 32px rgba(2,6,23,0.16)',
              }}
            >
              <div style={{ fontSize: 30, fontWeight: 800, marginBottom: 8 }}>{stat.value}</div>
              <div style={{ color: '#64748b', fontSize: 14, fontWeight: 700 }}>{stat.label}</div>
            </div>
          ))}
        </section>

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: '1.35fr 1fr',
            gap: 18,
          }}
        >
          <div
            style={{
              background: 'rgba(255,255,255,0.98)',
              color: '#0f172a',
              borderRadius: 28,
              padding: 24,
              boxShadow: '0 18px 32px rgba(2,6,23,0.16)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                gap: 12,
                marginBottom: 18,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <h2 style={{ margin: '0 0 6px', fontSize: 28 }}>Towing classes</h2>
                <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>
                  Live data from the vehicle_types table
                </p>
              </div>

              {!error ? (
                <div
                  style={{
                    background: '#dcfce7',
                    color: '#166534',
                    padding: '8px 12px',
                    borderRadius: 999,
                    fontWeight: 800,
                    fontSize: 12,
                  }}
                >
                  Connected
                </div>
              ) : null}
            </div>

            {error ? (
              <div style={{ color: '#b91c1c', fontWeight: 800, fontSize: 16 }}>
                Connection error: {error.message}
              </div>
            ) : vehicleTypes.length === 0 ? (
              <div style={{ color: '#475569', fontWeight: 700, fontSize: 16 }}>
                No towing classes found.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 14 }}>
                {vehicleTypes.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      borderRadius: 22,
                      padding: 18,
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 14,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>{item.name}</div>
                      <div style={{ color: '#64748b', fontWeight: 700, fontSize: 13 }}>
                        Capacity {item.tonnage_min}t - {item.tonnage_max}t
                      </div>
                    </div>

                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: 999,
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        fontWeight: 800,
                        fontSize: 13,
                      }}
                    >
                      Base fare ${Number(item.base_fare).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gap: 18 }}>
            <div
              style={{
                background: 'rgba(255,255,255,0.98)',
                color: '#0f172a',
                borderRadius: 28,
                padding: 24,
                boxShadow: '0 18px 32px rgba(2,6,23,0.16)',
              }}
            >
              <h2 style={{ margin: '0 0 16px', fontSize: 24 }}>Operations modules</h2>
              <div style={{ display: 'grid', gap: 12 }}>
                {modules.map((module) => (
                  <div
                    key={module.title}
                    style={{
                      borderRadius: 20,
                      padding: 16,
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>{module.title}</div>
                    <div style={{ color: '#64748b', fontSize: 14, lineHeight: 1.6 }}>
                      {module.subtitle}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                background: 'linear-gradient(135deg, rgba(17,24,39,0.98), rgba(15,23,42,0.98))',
                color: '#ffffff',
                borderRadius: 28,
                padding: 24,
                boxShadow: '0 18px 32px rgba(2,6,23,0.22)',
              }}
            >
              <h2 style={{ margin: '0 0 14px', fontSize: 24 }}>Build timeline</h2>
              <div style={{ display: 'grid', gap: 12 }}>
                {timeline.map((item, index) => (
                  <div key={item} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 999,
                        background: 'rgba(37,99,235,0.18)',
                        color: '#93c5fd',
                        display: 'grid',
                        placeItems: 'center',
                        fontWeight: 800,
                        flexShrink: 0,
                      }}
                    >
                      {index + 1}
                    </div>
                    <div style={{ color: '#cbd5e1', lineHeight: 1.6 }}>{item}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
