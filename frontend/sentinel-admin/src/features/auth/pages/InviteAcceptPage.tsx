import { Shield, User, Lock, Eye, EyeOff, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AuthService } from '../../../lib/services/auth.service';
import { useAuthStore } from '../../../lib/store';

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const navigate = useNavigate();
  const { setUser, setAuthenticated, setAccessToken, logout } = useAuthStore();

  // Clear existing session on mount to prevent session pollution
  useEffect(() => {
    logout();
  }, [logout]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);

    try {
      const data = await AuthService.acceptInvite({
        invite_token: token || '',
        full_name: fullName,
        password: password,
      });

      setIsSuccess(true);
      
      // Auto-login after success
      setAccessToken(data.access_token);
      setUser(data.user);
      setAuthenticated(true);
      
      // Redirect after a short delay to show success state
      setTimeout(() => {
        navigate('/');
      }, 2000);
    } catch (err: any) {
      console.error('Failed to accept invitation:', err);
      setError(err.response?.data?.message || 'Failed to accept invitation. The link may be expired or invalid.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-[#05080f] flex items-center justify-center p-4 relative overflow-hidden">
        <div 
          className="absolute inset-0 opacity-20 bg-cover bg-center"
          style={{ backgroundImage: 'url("/invitation-bg.png")' }}
        />
        <div className="w-full max-w-[440px] space-y-8 animate-in fade-in zoom-in duration-700 relative z-10 text-center">
          <div className="inline-flex p-4 bg-emerald-500/20 rounded-full border border-emerald-500/30 shadow-2xl shadow-emerald-500/20 mb-4">
            <CheckCircle2 className="text-emerald-500" size={48} />
          </div>
          <h1 className="text-3xl font-bold text-white">Welcome Aboard!</h1>
          <p className="text-gray-400">Your account has been created and verified. Redirecting you to the command center...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#05080f] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Dynamic Background */}
      <div 
        className="absolute inset-0 opacity-30 bg-cover bg-center animate-pulse duration-[10s]"
        style={{ backgroundImage: 'url("/invitation-bg.png")' }}
      />
      
      <div className="w-full max-w-[440px] space-y-8 animate-in fade-in zoom-in duration-700 relative z-10">
        
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 bg-primary/10 rounded-2xl border border-primary/20 shadow-2xl shadow-primary/10 mb-2">
            <Shield className="text-primary" size={32} />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-white">Join Organization</h1>
          <p className="text-sm text-gray-500 font-medium">Create your secure identity for Sentinel Core</p>
        </div>

        <form onSubmit={handleSubmit} className="glass-panel p-8 space-y-6 bg-gradient-to-b from-white/[0.02] to-transparent relative overflow-hidden">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3 text-red-500 text-xs animate-in slide-in-from-top-2">
              <AlertCircle size={16} />
              <p className="font-medium">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">Full name</label>
              <div className="relative group">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-primary transition-colors" size={16} />
                <input 
                  type="text" 
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full bg-[#03050a] border border-white/5 rounded-lg py-3 pl-10 pr-4 text-xs focus:ring-1 focus:ring-primary/50 outline-none transition-all text-gray-300"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">Secure Password</label>
              <div className="relative group">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-primary transition-colors" size={16} />
                <input 
                  type={showPassword ? 'text' : 'password'} 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#03050a] border border-white/5 rounded-lg py-3 pl-10 pr-12 text-xs focus:ring-1 focus:ring-primary/50 outline-none transition-all text-gray-300 tracking-widest"
                  required
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">Confirm Password</label>
              <div className="relative group">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-primary transition-colors" size={16} />
                <input 
                  type={showPassword ? 'text' : 'password'} 
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-[#03050a] border border-white/5 rounded-lg py-3 pl-10 pr-12 text-xs focus:ring-1 focus:ring-primary/50 outline-none transition-all text-gray-300 tracking-widest"
                  required
                />
              </div>
            </div>
          </div>

          <button 
            type="submit"
            disabled={isLoading}
            className="w-full py-4 bg-primary text-white rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-primary/90 transition-all shadow-xl shadow-primary/20 hover:translate-y-[-1px] active:translate-y-[1px] flex items-center justify-center gap-2"
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : 'Complete Registration'}
          </button>
        </form>

        <div className="text-center">
          <p className="text-[10px] text-gray-600 font-bold uppercase tracking-[0.2em] leading-relaxed">
            By joining, you agree to the organizational security policies.<br />
            Encrypted session established
          </p>
        </div>

      </div>
      
      {/* Background decoration elements */}
      <div className="fixed top-0 right-0 p-10 flex flex-col items-end text-[10px] font-mono text-gray-800 pointer-events-none select-none">
        <span>FRM: INV_ACCEPT</span>
        <span>AUTH: PENDING_TRUST</span>
        <span>ENC: AES-256-GCM</span>
      </div>
    </div>
  );
}
