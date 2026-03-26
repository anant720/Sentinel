import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AuthService } from '../../../lib/services/auth.service';
import { useAuthStore } from '../../../lib/store';
import api from '../../../lib/api';

function PwStrength({ password }: { password: string }) {
  const score = password.length === 0 ? 0
    : password.length < 6 ? 1
    : password.length < 10 ? 2
    : /[A-Z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password) ? 4
    : 3;
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  const cls = ['', 'active-1', 'active-2', 'active-3', 'active-4'];
  return (
    <div>
      <div className="pw-strength">
        {[1,2,3,4].map(i => (
          <div key={i} className={`pw-strength-seg ${i <= score ? cls[score] : ''}`} />
        ))}
      </div>
      {score > 0 && <div className="text-label-sm" style={{ marginTop: 4 }}>{labels[score]}</div>}
    </div>
  );
}

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { setAccessToken, setUser, setE2eeEnabled, setMasterKey } = useAuthStore();
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setLoading(true); setError('');
    try {
      // Backend returns { access_token, user, message }
      const result = await AuthService.acceptInvite({ invite_token: token!, full_name: fullName, password });

      const accessToken = result?.access_token || result?.accessToken;
      if (accessToken) {
        // Auto-login: store token, fetch full profile, then redirect to dashboard
        setAccessToken(accessToken);

        // Derive master key and set E2EE (invited accounts are always v2/E2EE)
        const { CryptoService } = await import('../../../lib/services/crypto.service');
        const email = result?.user?.email || '';
        const masterKey = await CryptoService.deriveMasterKey(password, email);
        setMasterKey(masterKey);
        setE2eeEnabled(true);

        // Fetch full user profile using the new token
        const { data: meResponse } = await api.get('/auth/me');
        const user = meResponse?.user || meResponse;
        setUser(user);

        setSuccess(true);
        setTimeout(() => navigate('/dashboard'), 1500);
      } else {
        // Fallback: no token returned — just go to login
        setSuccess(true);
        setTimeout(() => navigate('/login'), 2500);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to activate account.');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#020408', display: 'flex', position: 'relative', overflow: 'hidden' }}>
      <div className="scan-line" />

      {/* Left */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '64px' }}>
        <div className="flex items-center gap-3" style={{ marginBottom: 48 }}>
          <div style={{ width: 48, height: 48, background: 'var(--primary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 24px rgba(77,142,255,0.4)' }}>
            <span className="material-icons" style={{ fontSize: 28, color: '#002e6a' }}>shield</span>
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.5rem', letterSpacing: '0.08em', color: 'var(--on-surface)' }}>SENTINEL</span>
        </div>

        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 700, color: 'var(--on-surface)', marginBottom: 12 }}>
          Welcome to<br /><span style={{ color: 'var(--primary)' }}>Sentinel</span>
        </h1>
        <p style={{ color: 'var(--on-surface-variant)', marginBottom: 40, maxWidth: 380, lineHeight: 1.6 }}>
          You've been invited to join a Sentinel security operations platform. Complete your account setup to get started.
        </p>

        {[
          { icon: 'lock', text: 'Protected by E2EE' },
          { icon: 'radar', text: 'Real-time threat monitoring' },
          { icon: 'admin_panel_settings', text: 'Role-based access control' },
        ].map(item => (
          <div key={item.text} className="flex items-center gap-3" style={{ marginBottom: 12 }}>
            <span className="material-icons" style={{ fontSize: 16, color: 'var(--secondary)' }}>{item.icon}</span>
            <span style={{ fontSize: '0.875rem', color: 'var(--on-surface-variant)' }}>{item.text}</span>
          </div>
        ))}
      </div>

      {/* Right */}
      <div style={{ width: 440, display: 'flex', alignItems: 'center', padding: '40px 48px', background: 'rgba(24,28,34,0.6)', backdropFilter: 'blur(24px)', borderLeft: '1px solid rgba(66,71,84,0.25)' }}>
        <div style={{ width: '100%' }}>
          <div className="text-overline" style={{ marginBottom: 6 }}>Sentinel Security</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--on-surface)', marginBottom: 4 }}>Activate Your Account</h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)', marginBottom: 28 }}>Set up your security credentials to proceed.</p>

          {success ? (
            <div style={{ padding: '20px', background: 'rgba(78,222,163,0.08)', border: '1px solid rgba(78,222,163,0.2)', textAlign: 'center' }}>
              <span className="material-icons" style={{ fontSize: 32, color: 'var(--secondary)', display: 'block', marginBottom: 8 }}>check_circle</span>
              <p style={{ color: 'var(--secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>ACCOUNT ACTIVATED — Entering dashboard...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 12, padding: '6px 10px', background: 'var(--surface-container-lowest)', border: '1px solid rgba(66,71,84,0.2)' }}>
                <div className="text-label-sm" style={{ marginBottom: 2 }}>Invite Token</div>
                <div className="mono" style={{ fontSize: '0.6875rem', color: 'var(--outline)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{token}</div>
              </div>

              <div className="t-input-wrap" style={{ marginBottom: 16 }}>
                <label className="t-input-label">Full Name</label>
                <input className="t-input" placeholder="Your full name" value={fullName} onChange={e => setFullName(e.target.value)} required />
              </div>
              <div className="t-input-wrap" style={{ marginBottom: 4 }}>
                <label className="t-input-label">Create Password</label>
                <input type="password" className="t-input" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
              </div>
              <PwStrength password={password} />

              <div className="t-input-wrap" style={{ marginBottom: 20, marginTop: 16 }}>
                <label className="t-input-label">Confirm Password</label>
                <input type="password" className="t-input" placeholder="••••••••" value={confirm} onChange={e => setConfirm(e.target.value)} required />
              </div>

              {error && (
                <div style={{ marginBottom: 16, padding: '8px 12px', background: 'rgba(147,0,10,0.15)', border: '1px solid rgba(255,180,171,0.2)' }}>
                  <p style={{ fontSize: '0.75rem', color: 'var(--error)', fontFamily: 'var(--font-mono)', margin: 0 }}>{error}</p>
                </div>
              )}

              <button type="submit" className="btn btn-primary w-full" disabled={loading}
                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', letterSpacing: '0.08em', marginTop: 8 }}>
                {loading ? 'CREATING ENCRYPTED ACCOUNT...' : 'ACTIVATE ACCOUNT'}
              </button>
            </form>
          )}
          <p className="mono" style={{ fontSize: '0.5rem', color: 'var(--outline)', marginTop: 16, textAlign: 'center', letterSpacing: '0.06em' }}>
            PASSWORD HASHED CLIENT-SIDE · NEVER TRANSMITTED IN PLAIN TEXT
          </p>
        </div>
      </div>
    </div>
  );
}
