import React from 'react';
import SatelliteHeatmap from '../components/SatelliteHeatmap';
import RouteAQI from '../components/RouteAQI';

const SatelliteView = () => {
  return (
    <div className="page-shell mesh-bg">
      <div className="admin-main">
        <header style={{ marginBottom: '32px' }}>
          <h1 className="gradient-text" style={{ fontSize: '36px', fontWeight: 900, marginBottom: '8px' }}>
            Satellite Intelligence
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '16px', maxWidth: '800px' }}>
            Real-time satellite NO₂ monitoring and street-level air quality routing. 
            Navigate safely with hyperlocal pollution data powered by Google Earth Engine.
          </p>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
          <RouteAQI />
          <SatelliteHeatmap />
          
          <div className="glass" style={{ padding: '24px', borderRadius: '24px' }}>
            <h3 style={{ marginTop: 0 }}>Understanding Satellite NO₂ Data</h3>
            <p style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--text-muted)' }}>
              Nitrogen Dioxide (NO₂) is a primary air pollutant resulting from vehicle emissions and industrial activities. 
              The <strong>Sentinel-5 Precursor (S5P)</strong> satellite provides Near Real-Time (NRTI) measurements of 
              NO₂ vertical column density.
            </p>
            <ul style={{ fontSize: '14px', lineHeight: 2, color: 'var(--text-muted)' }}>
              <li><strong>Scale:</strong> Measurements are in mol/m². Typical urban values range from 5e-5 to 5e-4.</li>
              <li><strong>Temporal Lag:</strong> Satellite data usually has a lag of 3-6 hours for processing.</li>
              <li><strong>Cloud Cover:</strong> Heavy clouds may obstruct sensors; in such cases, the system falls back to ground-station features.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SatelliteView;
