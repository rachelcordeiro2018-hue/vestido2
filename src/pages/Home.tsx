import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Mail, Globe, X, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useStore } from '../store';
import './Home.css';

interface Room {
  id: string;
  name: string;
  video_url: string;
  host_id: string;
  created_at: string;
  privacy?: string;
  profiles?: { name: string, avatar_url: string };
}

import { YoutubeBrowser } from '../components/youtube/YoutubeBrowser';
import { WebBrowser } from '../components/web/WebBrowser';

export function Home() {
  const [publicRooms, setPublicRooms] = useState<Room[]>([]);
  const [invitedRooms, setInvitedRooms] = useState<Room[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isWebBrowserOpen, setIsWebBrowserOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'custom' | 'youtube'>('custom');
  const [newRoomName, setNewRoomName] = useState('');
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'private' | 'friends'>('public');
  
  const navigate = useNavigate();
  const user = useStore(state => state.user);

  const isAdmin = user?.email === 'linuxweb2021@gmail.com';

  useEffect(() => {
    const fetchRooms = async () => {
      // 1. Fetch ALL Public Rooms (Always fetch these, even if no user yet)
      const { data: pubData, error: pubError } = await supabase
        .from('rooms')
        .select('*, profiles:users!host_id(name, avatar_url)')
        .or('privacy.eq.public,privacy.is.null') // Include legacy rooms
        .order('created_at', { ascending: false });
      
      if (pubData) {
        setPublicRooms(pubData as any);
      } else if (pubError) {
        console.error('Erro ao buscar salas:', pubError);
      }

      if (!user) {
        setInvitedRooms([]);
        return;
      }

      // 2. Fetch "Friends Only" rooms where host is my friend
      const { data: friendData } = await supabase
        .from('friends')
        .select('user_id, friend_id')
        .eq('status', 'accepted')
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);
      
      const friendIds = friendData?.map(f => f.user_id === user.id ? f.friend_id : f.user_id) || [];

      if (friendIds.length > 0) {
        const { data: privData } = await supabase
          .from('rooms')
          .select('*, profiles:users!host_id(name, avatar_url)')
          .eq('privacy', 'friends')
          .in('host_id', friendIds)
          .order('created_at', { ascending: false });
        
        if (privData) setInvitedRooms(privData as any);
      } else {
        setInvitedRooms([]);
      }
    };

    fetchRooms();
  }, [user]);

  const handleDeleteRoom = async (e: React.MouseEvent, roomId: string) => {
    e.stopPropagation();
    if (!isAdmin) return;
    
    const confirm = window.confirm('Deseja realmente excluir esta sala permanentemente?');
    if (!confirm) return;

    const { error } = await supabase.from('rooms').delete().eq('id', roomId);
    if (!error) {
      setPublicRooms(prev => prev.filter(r => r.id !== roomId));
      setInvitedRooms(prev => prev.filter(r => r.id !== roomId));
    } else {
      alert('Erro ao excluir: ' + error.message);
    }
  };

  const handleOpenModal = (platform: string) => {
    if (!user) {
      alert("Faça login para criar uma sala.");
      navigate('/login');
      return;
    }
    
    if (platform === 'WEB') {
      setIsWebBrowserOpen(true);
      return;
    }

    setModalMode(platform === 'YouTube' ? 'youtube' : 'custom');
    setIsModalOpen(true);
  };

  const getYoutubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url?.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const createRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newRoomName || !newVideoUrl) return;

    const videoId = getYoutubeId(newVideoUrl);

    const { data, error } = await supabase
      .from('rooms')
      .insert([{ 
        name: newRoomName, 
        video_url: newVideoUrl, 
        video_id: videoId,
        host_id: user.id,
        privacy: privacy,
        is_playing: false,
        current_video_time: 0
      }])
      .select()
      .single();

    if (!error && data) {
      navigate(`/room/${data.id}`);
    } else {
      console.error(error);
      alert('Erro ao criar sala: ' + (error?.message || 'Erro desconhecido. No data returned.'));
    }
  };

  const platforms = [
    { name: 'YouTube', icon: <span style={{fontWeight: '900', letterSpacing: '-1px'}}>You<span style={{backgroundColor: '#fff', color: '#1a1e36', padding: '0 4px', borderRadius: '4px', marginLeft: '1px'}}>Tube</span></span> },
    { name: 'WEB', icon: <Globe /> },
  ];

  return (
    <div className="home-container">
      {/* Search Bar */}
      <div className="search-bar-wrapper">
        <Search className="search-icon" size={24} />
        <input 
          type="text" 
          className="search-input" 
          placeholder="procurar um vídeo, série ou filme..." 
        />
      </div>

      {/* Platforms Grid */}
      <div className="platforms-grid">
        {platforms.map(p => (
          <div key={p.name} className="platform-btn" onClick={() => handleOpenModal(p.name)}>
            <div className="platform-icon">{p.icon}</div>
          </div>
        ))}
      </div>

      {/* Categories */}
      <div className="category-section animate-fade-in">
        <div className="category-title">
          <Mail size={22} className="text-secondary" />
          <h2>Por convite</h2>
        </div>
        
        <div className="cards-scroll">
          {invitedRooms.map((room, i) => (
            <div key={`inv-${room.id}`} className="video-card glass-panel" onClick={() => navigate(`/room/${room.id}`)}>
              <div className="video-thumbnail" style={{ backgroundImage: `url(https://picsum.photos/400/300?random=${i + 100})` }}>
                <span className="source-badge">
                  <Globe size={12} /> {room.privacy === 'friends' ? 'AMIGOS' : 'WEB'}
                </span>
                {isAdmin && (
                  <button className="admin-delete-btn" onClick={(e) => handleDeleteRoom(e, room.id)}>
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              <div className="video-details">
                <p className="card-title">{room.name}</p>
                <div className="participants-stack">
                  <img src={room.profiles?.avatar_url || 'https://ui-avatars.com/api/?name=User&background=random&color=fff'} alt="host" title={room.profiles?.name} />
                  <div className="more-guests">Host: {room.profiles?.name}</div>
                </div>
              </div>
            </div>
          ))}
          {invitedRooms.length === 0 && (
            <p className="text-secondary text-sm ml-4">Nenhum convite ou sala de amigos ativa no momento.</p>
          )}
        </div>
      </div>

      <div className="category-section animate-fade-in" style={{ animationDelay: '0.1s' }}>
        <div className="category-title">
          <Globe size={22} className="text-secondary" />
          <h2>Públicas</h2>
        </div>
        
        <div className="cards-scroll" style={{ flexWrap: 'wrap' }}>
          {publicRooms.map((room, i) => (
            <div key={room.id} className="video-card glass-panel public-card" onClick={() => navigate(`/room/${room.id}`)}>
              <div className="video-thumbnail" style={{ backgroundImage: `url(https://picsum.photos/400/300?random=${i})` }}>
                <span className="source-badge">
                  <Globe size={12} /> WEB
                </span>
                {isAdmin && (
                  <button className="admin-delete-btn" onClick={(e) => handleDeleteRoom(e, room.id)}>
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              <div className="video-details">
                <p className="card-title">{room.name}</p>
                <div className="participants-stack">
                  <img src={room.profiles?.avatar_url || 'https://ui-avatars.com/api/?name=User&background=random&color=fff'} alt="host" title={room.profiles?.name} />
                  <div className="more-guests">por {room.profiles?.name}</div>
                </div>
              </div>
            </div>
          ))}
          {publicRooms.length === 0 && (
            <div className="empty-rooms text-secondary">
              Nenhuma sala pública aberta no momento.
            </div>
          )}
        </div>
      </div>

      {/* Create Room Modal & YouTube Browser Overlay */}
      {isModalOpen && modalMode === 'youtube' && (
        <YoutubeBrowser onClose={() => setIsModalOpen(false)} />
      )}
      {isModalOpen && modalMode === 'custom' && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel animate-fade-in">
            <button className="close-modal-btn" onClick={() => setIsModalOpen(false)}>
              <X size={24} />
            </button>
            <h2>Criar Nova Sala</h2>
            <form onSubmit={createRoom} className="create-room-form">
              <div className="form-group">
                <label>Nome da Sala</label>
                <input 
                  type="text" 
                  className="input" 
                  placeholder="Ex: Noite de Cinema"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>URL do Vídeo Inicial</label>
                <input 
                  type="url" 
                  className="input" 
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={newVideoUrl}
                  onChange={(e) => setNewVideoUrl(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Privacidade</label>
                <select 
                  className="input"
                  value={privacy}
                  onChange={(e) => setPrivacy(e.target.value as any)}
                >
                  <option value="public">🌐 Pública (Todos podem ver)</option>
                  <option value="friends">👥 Amigos (Apenas seus amigos)</option>
                  <option value="private">🔒 Privada (Apenas com convite)</option>
                </select>
              </div>
              <button type="submit" className="btn btn-primary w-full mt-4">
                Começar Sessão
              </button>
            </form>
          </div>
        </div>
      )}
      {/* Web Browser Modal */}
      {isWebBrowserOpen && <WebBrowser onClose={() => setIsWebBrowserOpen(false)} />}
    </div>
  );
}
