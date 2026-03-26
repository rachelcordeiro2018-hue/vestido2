import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useStore } from '../store';
import { UserPlus, UserCheck, UserX, Search, MessageCircle, MoreVertical, Bell } from 'lucide-react';
import './Friends.css';

export function Friends() {
  const navigate = useNavigate();
  const user = useStore(state => state.user);
  const [activeTab, setActiveTab] = useState<'friends' | 'search' | 'requests'>('friends');
  const [users, setUsers] = useState<any[]>([]);
  const [friends, setFriends] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      fetchFriends();
      fetchRequests();
    }
  }, [user]);

  const fetchFriends = async () => {
    const { data } = await supabase.from('friends')
      .select('*, friend:friend_id(id, name, avatar_url, bio), me:user_id(id, name, avatar_url, bio)')
      .eq('status', 'accepted')
      .or(`user_id.eq.${user?.id},friend_id.eq.${user?.id}`);
    
    if (data) {
      const friendList = data.map(f => f.user_id === user?.id ? f.friend : f.me);
      setFriends(friendList);
    }
  };

  const fetchRequests = async () => {
    const { data } = await supabase.from('friends')
      .select('*, requester:user_id(id, name, avatar_url)')
      .eq('friend_id', user?.id)
      .eq('status', 'pending');
    if (data) setRequests(data);
  };

  const searchUsers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setLoading(true);
    const { data, error } = await supabase.from('users')
      .select('id, name, avatar_url, bio')
      .ilike('name', `%${searchQuery}%`)
      .neq('id', user?.id)
      .limit(20);
    
    if (error) {
      console.error('Erro na busca:', error);
      alert('Houve um erro técnico na busca. Verifique se as tabelas foram criadas no banco de dados.');
    } else if (data) {
      setUsers(data);
    }
    setLoading(false);
  };

  const handleFriendRequest = async (targetId: string) => {
    const { error } = await supabase.from('friends').insert([{
      user_id: user?.id,
      friend_id: targetId,
      status: 'pending'
    }]);

    if (error) {
      console.error('Erro ao adicionar amigo:', error);
      if (error.code === '23505') {
        alert('Você já enviou uma solicitação para esta pessoa!');
      } else {
        alert('Erro ao processar solicitação. Certifique-se de que rodou o SQL da migração 0003 no seu console Supabase.');
      }
    } else {
      alert('Solicitação enviada com sucesso!');
      setActiveTab('friends');
      fetchRequests();
    }
  };

  const respondToRequest = async (requestId: string, status: 'accepted' | 'declined') => {
    if (status === 'declined') {
      await supabase.from('friends').delete().eq('id', requestId);
    } else {
      await supabase.from('friends').update({ status: 'accepted' }).eq('id', requestId);
    }
    fetchFriends();
    fetchRequests();
  };

  return (
    <div className="friends-page animate-fade-in">
      <div className="friends-tabs">
        <button 
          className={`friend-tab-btn ${activeTab === 'friends' ? 'active' : ''}`} 
          onClick={() => setActiveTab('friends')}
        >
          Meus Amigos
        </button>
        <button 
          className={`friend-tab-btn ${activeTab === 'search' ? 'active' : ''}`} 
          onClick={() => setActiveTab('search')}
        >
          Buscar Pessoas
        </button>
        <button 
          className={`friend-tab-btn ${activeTab === 'requests' ? 'active' : ''}`} 
          onClick={() => setActiveTab('requests')}
        >
          Solicitações {requests.length > 0 && <span className="req-count">{requests.length}</span>}
        </button>
      </div>

      <div className="friends-content">
        {activeTab === 'search' && (
          <div className="search-section">
            <form onSubmit={searchUsers} className="search-form-global">
              <Search size={22} className="search-icon-input" />
              <input 
                type="text" 
                placeholder="Pesquisar por nome ou @username" 
                value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)} 
              />
              <button type="submit" className="btn-primary">Buscar</button>
            </form>

            <div className="user-results-grid">
              {users.map(u => (
                <div key={u.id} className="user-search-card">
                  <img src={u.avatar_url || 'https://ui-avatars.com/api/?name=' + u.name} alt="avatar" className="search-avatar" />
                  <div className="search-user-info">
                    <h4>{u.name}</h4>
                    <p className="text-secondary text-xs">{u.bio || 'Membro do RaveX'}</p>
                  </div>
                  <button className="btn-icon add-friend-btn" onClick={() => handleFriendRequest(u.id)}>
                    <UserPlus size={20} />
                  </button>
                </div>
              ))}
              {users.length === 0 && !loading && searchQuery && <div className="text-center p-8 text-secondary">Nenhum usuário encontrado.</div>}
            </div>
          </div>
        )}

        {activeTab === 'friends' && (
          <div className="friend-list-section">
            <div className="friend-grid">
              {friends.map(f => (
                <div key={f.id} className="friend-compact-card">
                  <img src={f.avatar_url || 'https://ui-avatars.com/api/?name=' + f.name} alt="avatar" className="friend-avatar" />
                  <div className="friend-info">
                    <h3>{f.name}</h3>
                    <div className="status-badge online">Online</div>
                  </div>
                  <div className="friend-actions">
                    <button className="btn-icon" onClick={() => navigate('/chat/' + f.id)}><MessageCircle size={20} /></button>
                    <button className="btn-icon"><MoreVertical size={20} /></button>
                  </div>
                </div>
              ))}
              {friends.length === 0 && (
                <div className="empty-state">
                  <UserPlus size={48} className="text-secondary mb-4" />
                  <p>Você ainda não tem amigos. Explore a busca!</p>
                  <button className="btn-secondary mt-4" onClick={() => setActiveTab('search')}>Buscar Novos Amigos</button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'requests' && (
          <div className="requests-section">
            {requests.map(req => (
              <div key={req.id} className="request-card">
                <img src={req.requester.avatar_url || 'https://ui-avatars.com/api/?name=' + req.requester.name} alt="avatar" className="request-avatar" />
                <div className="request-info">
                  <p><strong>{req.requester.name}</strong> enviou uma solicitação de amizade.</p>
                  <span className="text-xs text-secondary">{new Date(req.created_at).toLocaleDateString()}</span>
                </div>
                <div className="request-buttons">
                  <button className="btn-icon btn-accept" onClick={() => respondToRequest(req.id, 'accepted')}><UserCheck size={20} /></button>
                  <button className="btn-icon btn-decline" onClick={() => respondToRequest(req.id, 'declined')}><UserX size={20} /></button>
                </div>
              </div>
            ))}
            {requests.length === 0 && <div className="text-center p-12 text-secondary"><Bell size={32} className="mx-auto mb-2 opacity-30" /> Sem solicitações pendentes.</div>}
          </div>
        )}
      </div>
    </div>
  );
}
