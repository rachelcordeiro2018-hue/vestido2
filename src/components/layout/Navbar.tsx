import { Link, useNavigate } from 'react-router-dom';
import { Menu, Users, User as UserIcon, MessageCircle, Bell } from 'lucide-react';
import { useStore } from '../../store';
import { supabase } from '../../lib/supabase';
import './Navbar.css';

export function Navbar() {
  const { user, setUser } = useStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <div className="navbar-content">
        <div className="navbar-left">
          {user ? (
            <Link to="/profile" className="avatar-wrapper tooltip-wrapper">
              <img src={user.avatar_url || 'https://ui-avatars.com/api/?name=User&background=random'} alt="Profile" className="avatar" />
              <div className="status-indicator"></div>
              <div className="tooltip-content" onClick={(e) => { e.preventDefault(); handleLogout(); }}>Sair da conta</div>
            </Link>
          ) : (
            <Link to="/login" className="btn-icon">
              <UserIcon size={24} />
            </Link>
          )}
          <button className="btn-icon menu-btn">
            <Menu size={28} color="#cbd5e1" />
          </button>
        </div>

        <div className="navbar-center">
          <Link to="/" className="brand-name">
            RAVE<span>x</span>
          </Link>
        </div>
        
        <div className="navbar-right">
          <Link to="/friends" className="btn-icon" title="Amigos">
            <Users size={26} />
          </Link>
          <Link to="/chat" className="btn-icon" title="Mensagens">
            <MessageCircle size={26} />
          </Link>
          <button className="btn-icon" title="Notificações">
            <Bell size={26} />
          </button>
        </div>
      </div>
    </nav>
  );
}
