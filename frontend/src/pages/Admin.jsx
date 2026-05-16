import React, { useState, useEffect } from 'react';
import axios from 'axios';
import PageHeader from '../components/PageHeader';
import { useToast } from '../context/ToastContext';

const StatCard = ({ title, value, icon, color }) => (
  <div className="glass animate-slide-up" style={{ padding: '24px', borderRadius: '20px', borderLeft: `6px solid ${color}` }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <div style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>{title}</div>
        <div style={{ fontSize: '32px', fontWeight: 900, marginTop: '8px' }}>{value}</div>
      </div>
      <div style={{ fontSize: '32px' }}>{icon}</div>
    </div>
  </div>
);

const Admin = () => {
  const [stats, setStats] = useState({ users: 0, reports: 0, verified_reports: 0, active_anomalies: 0 });
  const [pendingReports, setPendingReports] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  const fetchData = async () => {
    try {
      const [sRes, rRes, uRes] = await Promise.all([
        axios.get('/api/admin/stats'),
        axios.get('/api/admin/reports/pending'),
        axios.get('/api/admin/users')
      ]);
      setStats(sRes.data);
      setPendingReports(rRes.data);
      setUsers(uRes.data);
    } catch (e) {
      addToast("Failed to fetch admin data", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleVerify = async (reportId) => {
    try {
      await axios.post('/api/admin/reports/verify', { id: reportId });
      addToast("Report verified successfully", "success");
      fetchData(); // Refresh
    } catch (e) {
      addToast("Verification failed", "error");
    }
  };

  if (loading) return <div className="page-shell"><div className="admin-main">Loading Admin Panel...</div></div>;

  return (
    <div className="page-shell mesh-bg">
      <div className="admin-main">
        <PageHeader title="🛡️ Administrative Control" subtitle="System oversight and community moderation" />

        {/* Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '40px' }}>
          <StatCard title="Total Users" value={stats.users} icon="👥" color="#3b82f6" />
          <StatCard title="Total Reports" value={stats.reports} icon="📝" color="#f59e0b" />
          <StatCard title="Verified Reports" value={stats.verified_reports} icon="✅" color="#22c55e" />
          <StatCard title="Active Anomalies" value={stats.active_anomalies} icon="🚨" color="#ef4444" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '30px' }}>
          {/* Moderation Queue */}
          <div className="glass" style={{ padding: '24px', borderRadius: '24px' }}>
            <h3 style={{ marginTop: 0, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              ⚖️ Moderation Queue <span style={{ fontSize: '12px', background: 'var(--blue)', color: 'white', padding: '2px 8px', borderRadius: '10px' }}>{pendingReports.length} Pending</span>
            </h3>
            {pendingReports.length === 0 ? (
              <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '40px' }}>No pending reports to moderate.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {pendingReports.map(report => (
                  <div key={report.id} style={{ padding: '16px', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '14px' }}>{report.incident_type} @ {report.lat.toFixed(3)}, {report.lon.toFixed(3)}</div>
                      <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>{report.description || "No description provided."}</div>
                      <div style={{ fontSize: '11px', marginTop: '8px' }}>
                        <span style={{ color: 'var(--muted)' }}>Reported by:</span> {report.user_id} • <span style={{ color: 'var(--muted)' }}>Severity:</span> {report.severity}/5
                      </div>
                    </div>
                    <button onClick={() => handleVerify(report.id)} className="btn-primary" style={{ padding: '8px 16px', fontSize: '12px' }}>Verify</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* User Directory */}
          <div className="glass" style={{ padding: '24px', borderRadius: '24px' }}>
            <h3 style={{ marginTop: 0, marginBottom: '20px' }}>👥 User Directory</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {users.map(user => (
                <div key={user.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
                    {user.email.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>{user.email}</div>
                    <div style={{ fontSize: '10px', color: user.is_verified ? '#22c55e' : '#f97316' }}>
                      {user.is_verified ? "Verified" : "Pending Verification"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Admin;
