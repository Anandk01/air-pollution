import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const ReportCard = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const downloadCard = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/profile/report-card', {
        headers: { Authorization: `Bearer ${user?.token}` }
      });
      if (!response.ok) throw new Error("Failed to generate card");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `air_quality_report_${new Date().toISOString().split('T')[0]}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      alert('Failed to generate report card. Make sure your profile is complete.');
    } finally {
      setLoading(false);
    }
  };

  const shareWhatsApp = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/profile/report-card', {
        headers: { Authorization: `Bearer ${user?.token}` }
      });
      const blob = await response.blob();
      const file = new File([blob], 'report.png', { type: 'image/png' });
      
      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'My Air Quality Report',
          text: `Check out today's air quality status for my profile!`,
          files: [file]
        });
      } else {
        downloadCard();
      }
    } catch (e) {
      downloadCard();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass" style={{ padding: '24px', borderRadius: '24px', marginTop: '24px' }}>
      <h3 style={{ marginTop: 0 }}>📊 Daily Report Card</h3>
      <p style={{ color: 'var(--muted)', fontSize: '14px' }}>
        Generate a personalized infographic showing your risk levels and health tips. 
        Perfect for sharing on WhatsApp or Instagram Stories.
      </p>
      
      <div style={{ display: 'flex', gap: '12px', marginTop: '20px', flexWrap: 'wrap' }}>
        <button 
          onClick={shareWhatsApp} 
          disabled={loading} 
          className="btn-primary" 
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <span>📱</span> Share on WhatsApp
        </button>
        <button 
          onClick={downloadCard} 
          disabled={loading} 
          className="btn-secondary" 
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <span>📥</span> Download PNG
        </button>
      </div>
      
      {loading && <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--blue)' }}>Generating high-resolution card...</div>}
    </div>
  );
};

export default ReportCard;
