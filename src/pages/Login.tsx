import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useStore } from '../store';
import { Mail, Lock, Play } from 'lucide-react';
import './Login.css';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const navigate = useNavigate();
  const { setUser } = useStore();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.user) {
          setUser({ id: data.user.id, email: data.user.email ?? '' });
          navigate('/');
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.user) {
          setUser({ id: data.user.id, email: data.user.email ?? '' });
          navigate('/');
        }
      }
    } catch (error: any) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });
    if (error) alert(error.message);
  };

  return (
    <div className="login-container">
      <div className="login-card glass-panel animate-fade-in">
        <div className="login-header">
          <div className="btn-icon">
            <Play size={32} className="text-gradient" />
          </div>
          <h1>Bem-vindo ao <span className="text-gradient">RaveX</span></h1>
          <p className="text-secondary">Assista vídeos em perfeita sincronia com amigos</p>
        </div>

        <form onSubmit={handleAuth} className="login-form flex-col gap-4">
          <div className="input-group">
            <Mail className="input-icon" size={20} />
            <input 
              type="email" 
              className="input pl-10" 
              placeholder="Seu email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required 
            />
          </div>
          <div className="input-group">
            <Lock className="input-icon" size={20} />
            <input 
              type="password" 
              className="input pl-10" 
              placeholder="Sua senha" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required 
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Carregando...' : (isSignUp ? 'Criar Conta' : 'Entrar na Festa')}
          </button>
        </form>

        <div className="login-divider">
          <span>ou conecte-se com</span>
        </div>

        <button onClick={handleOAuth} className="btn btn-secondary google-btn">
          <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Google
        </button>

        <p className="login-footer">
          {isSignUp ? 'Já tem uma conta?' : 'Ainda não é membro?'}{' '}
          <span className="toggle-auth" onClick={() => setIsSignUp(!isSignUp)}>
            {isSignUp ? 'Entrar' : 'Criar Conta'}
          </span>
        </p>
      </div>
    </div>
  );
}
