import { useNavigate } from 'react-router-dom';

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      flexDirection: 'column',
      background: 'var(--background)'
    }}>
      <div className="panel" style={{ maxWidth: 600, width: '100%', padding: '3rem 2rem', textAlign: 'center' }}>
        <div style={{ position: 'relative', marginBottom: '2rem' }}>
          <span className="material-icons" style={{ 
            fontSize: 80, 
            color: '#ef4444',
            filter: 'drop-shadow(0 0 15px rgba(239,68,68,0.5))'
          }}>
            warning_amber
          </span>
        </div>
        
        <h1 style={{ 
          fontSize: '6rem', 
          fontWeight: 900, 
          color: 'var(--on-surface)',
          margin: 0,
          lineHeight: 1,
          letterSpacing: '-0.05em'
        }}>
          404
        </h1>
        
        <div className="mono" style={{ 
          color: '#ef4444',
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.2)',
          padding: '6px 12px',
          borderRadius: 4,
          display: 'inline-block',
          marginTop: '1.5rem',
          marginBottom: '2rem',
          fontSize: '0.75rem',
          fontWeight: 700,
          letterSpacing: '0.05em'
        }}>
          ERR_RESOURCE_NOT_FOUND
        </div>

        <h2 style={{ fontSize: '1.5rem', color: 'var(--on-surface)', marginBottom: '1rem' }}>
          Sector Unreachable
        </h2>
        <p style={{ color: 'var(--on-surface-variant)', marginBottom: '2.5rem', lineHeight: 1.6 }}>
          The requested administrative vector does not exist in the current namespace. 
          Please return to the active monitoring dashboard or verify the resource identifier.
        </p>

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <button 
            className="btn btn-primary" 
            onClick={() => navigate('/')}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <span className="material-icons" style={{ fontSize: 18 }}>dashboard</span>
            RETURN TO DASHBOARD
          </button>
          <button 
            className="btn btn-ghost" 
            onClick={() => navigate(-1)}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <span className="material-icons" style={{ fontSize: 18 }}>arrow_back</span>
            PREVIOUS VECTOR
          </button>
        </div>
      </div>
    </div>
  );
}
