import { Shield, Mail, Lock, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthService } from '../../../lib/services/auth.service';
import { useAuthStore } from '../../../lib/store';

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const navigate = useNavigate();
  const { setUser, setAuthenticated, setAccessToken } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const { accessToken, e2ee } = await AuthService.login(email, password);
      // Save the token first so getMe() can use it in its Authorization header
      setAccessToken(accessToken);
      
      // Update E2EE status in store
      useAuthStore.getState().setE2eeEnabled(!!e2ee?.enabled);
      
      // Fetch the real user profile from the backend
      const { user: profile } = await AuthService.getMe();
      setUser(profile);
      setAuthenticated(true);
      navigate('/');
    } catch (err: any) {
      console.error('Login failed:', err);
      setError(err.response?.data?.message || err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#05080f] flex items-center justify-center p-4 selection:bg-primary/30">
      <div className="w-full max-w-[440px] space-y-8 animate-in fade-in zoom-in duration-700">
        
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 bg-primary/10 rounded-2xl border border-primary/20 shadow-2xl shadow-primary/10 mb-2">
            <Shield className="text-primary" size={32} />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-white">Sentinel Admin</h1>
          <p className="text-sm text-gray-500 font-medium">Identity Governance & Intelligence</p>
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
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">Company Email</label>
              <div className="relative group">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-primary transition-colors" size={16} />
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#03050a] border border-white/5 rounded-lg py-3 pl-10 pr-4 text-xs focus:ring-1 focus:ring-primary/50 outline-none transition-all text-gray-300"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">Security Key</label>
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
          </div>

          <button 
            type="submit"
            disabled={isLoading}
            className="w-full py-4 bg-primary text-white rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-primary/90 transition-all shadow-xl shadow-primary/20 hover:translate-y-[-1px] active:translate-y-[1px] flex items-center justify-center gap-2"
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : 'Authorize Access'}
          </button>
        </form>

        <div className="text-center">
          <p className="text-[10px] text-gray-600 font-bold uppercase tracking-[0.2em] leading-relaxed">
            Unauthorized access is strictly monitored and logged.<br />
            Secure session established via hardware trust
          </p>
        </div>

      </div>
      
      {/* Background decoration elements mirroring the screenshots' feel */}
      <div className="fixed top-0 right-0 p-10 flex flex-col items-end text-[10px] font-mono text-gray-800 pointer-events-none select-none">
        <span>FPS: N/A</span>
        <span>GPU UTIL: 0%</span>
        <span>CPU UTIL: 17%</span>
        <span>PCL (av): N/A</span>
      </div>
    </div>
  );
}
