import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthService } from '../../../lib/services/auth.service';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const isSessionError = params.get('error') === 'session_terminated';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      // AuthService.login now: (1) authenticates, (2) sets token, (3) fetches /auth/me, (4) sets user
      await AuthService.login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Authentication failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#020408', display: 'flex', position: 'relative', overflow: 'hidden'
    }}>
      <div className="scan-line" />

      {/* Left Panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', padding: '64px', minWidth: 0 }}>
        <div className="flex items-center gap-3" style={{ marginBottom: 32 }}>
          <div style={{ width: 48, height: 48, background: 'var(--primary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 24px rgba(77,142,255,0.4)' }}>
            <span className="material-icons" style={{ fontSize: 28, color: '#002e6a' }}>shield</span>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.5rem', color: 'var(--on-surface)', letterSpacing: '0.08em' }}>SENTINEL</div>
            <div className="text-overline" style={{ marginTop: 2 }}>v26.3.3 — Production</div>
          </div>
        </div>

        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', fontWeight: 700, lineHeight: 1.2, color: 'var(--on-surface)', marginBottom: 12 }}>
          Identity Threat<br /><span style={{ color: 'var(--primary)' }}>Detection & Response</span>
        </h1>
        <p style={{ fontFamily: 'var(--font-body)', color: 'var(--on-surface-variant)', fontSize: '0.9375rem', maxWidth: 400, lineHeight: 1.6, marginBottom: 40 }}>
          A zero-trust security operations platform with real-time threat intelligence, end-to-end encryption, and behavioral anomaly detection.
        </p>

        {[
          { icon: 'lock', text: 'End-to-End Encrypted (AES-256-GCM)' },
          { icon: 'bolt', text: 'Real-Time Threat Intelligence' },
          { icon: 'verified_user', text: 'Zero-Trust Architecture' },
        ].map(item => (
          <div key={item.text} className="flex items-center gap-3" style={{ marginBottom: 12 }}>
            <span className="material-icons" style={{ fontSize: 16, color: 'var(--secondary)' }}>{item.icon}</span>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--on-surface-variant)' }}>{item.text}</span>
          </div>
        ))}

        <div className="flex gap-8" style={{ marginTop: 48 }}>
          {[['2.4k', 'Threats Blocked'], ['99.9%', 'Uptime'], ['< 1ms', 'Detection Latency']].map(([val, lbl]) => (
            <div key={lbl}>
              <div className="mono" style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary)' }}>{val}</div>
              <div className="text-label-sm" style={{ marginTop: 2 }}>{lbl}</div>
            </div>
          ))}
        </div>

        <div className="mono" style={{ fontSize: '0.5rem', color: 'var(--outline)', marginTop: 48, letterSpacing: '0.1em' }}>
          ENCRYPTION: AES-256-GCM &nbsp;|&nbsp; THREAT SCAN: ACTIVE &nbsp;|&nbsp; LATENCY: 14MS
        </div>
      </div>

      {/* Right Panel — Login Card */}
      <div style={{ width: 440, display: 'flex', alignItems: 'center', padding: '40px 48px', background: 'rgba(24,28,34,0.6)', backdropFilter: 'blur(24px)', borderLeft: '1px solid rgba(66,71,84,0.25)' }}>
        <div style={{ width: '100%' }}>
          {isSessionError && (
            <div style={{ marginBottom: 20, padding: '10px 14px', background: 'rgba(147,0,10,0.2)', border: '1px solid rgba(255,180,171,0.2)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span className="material-icons" style={{ fontSize: 14, color: 'var(--error)', marginTop: 2 }}>warning</span>
              <p style={{ fontSize: '0.75rem', color: 'var(--error)', fontFamily: 'var(--font-mono)', margin: 0 }}>
                SESSION TERMINATED — Concurrent session or token hijacking detected.
              </p>
            </div>
          )}

          <div className="text-overline" style={{ marginBottom: 6 }}>Sentinel Security</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.375rem', fontWeight: 700, color: 'var(--on-surface)', marginBottom: 6 }}>Command Center Access</h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)', marginBottom: 32 }}>Authenticate to establish secure tunnel.</p>

          <form onSubmit={handleLogin}>
            <div className="t-input-wrap" style={{ marginBottom: 20 }}>
              <label className="t-input-label">Email Address</label>
              <input
                type="email"
                id="email"
                className="t-input"
                placeholder="operator@org.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="t-input-wrap" style={{ marginBottom: 8 }}>
              <label className="t-input-label">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  id="password"
                  className="t-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  style={{ paddingRight: 32 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(s => !s)}
                  style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--outline)', padding: 0 }}
                >
                  <span className="material-icons" style={{ fontSize: 18 }}>{showPw ? 'visibility_off' : 'visibility'}</span>
                </button>
              </div>
            </div>

            {error && (
              <div style={{ marginBottom: 16, marginTop: 12, padding: '8px 12px', background: 'rgba(147,0,10,0.15)', border: '1px solid rgba(255,180,171,0.2)' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--error)', fontFamily: 'var(--font-mono)', margin: 0 }}>{error}</p>
              </div>
            )}

            <button
              type="submit"
              id="login-submit"
              className="btn btn-primary w-full"
              disabled={loading}
              style={{ marginTop: 24, letterSpacing: '0.08em', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}
            >
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                  <span className="material-icons" style={{ fontSize: 14, animation: 'spin 1s linear infinite' }}>refresh</span>
                  AUTHENTICATING...
                </span>
              ) : 'AUTHENTICATE'}
            </button>
          </form>

          <p className="mono" style={{ fontSize: '0.5rem', color: 'var(--outline)', marginTop: 20, textAlign: 'center', letterSpacing: '0.08em' }}>
            DEVICE FINGERPRINTING ACTIVE · PASSWORDS HASHED CLIENT-SIDE
          </p>
        </div>
      </div>
    </div>
  );
}
