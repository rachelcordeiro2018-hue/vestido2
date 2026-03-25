import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { useStore } from './store';
import { Navbar } from './components/layout/Navbar';
import { Login } from './pages/Login';
import { Home } from './pages/Home';
import { Room } from './pages/Room';
import './index.css'; // Main css

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, initialized } = useStore();
  
  // Wait for initial auth check to avoid premature redirects
  if (!initialized) {
    return (
      <div className="flex items-center justify-center p-20">
        <div className="pulse-loader"></div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

import { Profile } from './pages/Profile';
import { Friends } from './pages/Friends';
import { ChatCenter } from './pages/ChatCenter';

function App() {
  const { setUser, setInitialized } = useStore();

  useEffect(() => {
    // Initial check
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email ?? '',
          name: session.user.user_metadata?.full_name,
          avatar_url: session.user.user_metadata?.avatar_url
        });
      }
      setInitialized(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email ?? '',
          name: session.user.user_metadata?.full_name,
          avatar_url: session.user.user_metadata?.avatar_url
        });
      } else {
        setUser(null);
      }
      setInitialized(true);
    });

    return () => subscription.unsubscribe();
  }, [setUser]);

  return (
    <BrowserRouter>
      <Navbar />
      <main className="container wrapper pt-4 pb-8">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
          <Route path="/room/:id" element={<ProtectedRoute><Room /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/friends" element={<ProtectedRoute><Friends /></ProtectedRoute>} />
          <Route path="/chat/:friendId?" element={<ProtectedRoute><ChatCenter /></ProtectedRoute>} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}

export default App;
