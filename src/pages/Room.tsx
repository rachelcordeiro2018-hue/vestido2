import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { VideoPlayer } from '../components/room/VideoPlayer';
import { LiveChat } from '../components/room/LiveChat';
import { UserList } from '../components/room/UserList';
import { YoutubeSearch } from '../components/room/YoutubeSearch';
import { VideoQueue } from '../components/room/VideoQueue';
import { useStore } from '../store';
import { Users, MessageSquare, Share2, Search, ListVideo, Check, Trash2 } from 'lucide-react';
import './Room.css';

export function Room() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useStore(state => state.user);
  
  const [room, setRoom] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'chat' | 'users' | 'search' | 'queue'>('chat');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id || !user) return;

    const fetchRoom = async () => {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) {
        alert('Sala não encontrada!');
        navigate('/');
        return;
      }
      setRoom(data);
      setLoading(false);
    };

    fetchRoom();

    const subscription = supabase.channel(`room_update:${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${id}` }, (payload) => {
         // Sync all fields to keep Room state updated
         setRoom((prev: any) => ({ ...prev, ...payload.new }));
      }).subscribe();

    return () => { subscription.unsubscribe(); };
  }, [id, user, navigate]);

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getYoutubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url?.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const handleVideoEnded = async () => {
    if (user?.id !== room.host_id) return;
    const { data } = await supabase.from('room_queue').select('*').eq('room_id', id).eq('played', false).order('created_at', { ascending: true }).limit(1).single();
    if (data) {
      const vId = getYoutubeId(data.video_url);
      await supabase.from('rooms').update({ 
        video_url: data.video_url,
        video_id: vId,
        current_video_time: 0,
        is_playing: true
      }).eq('id', id);
      await supabase.from('room_queue').update({ played: true }).eq('id', data.id);
    }
  };

  const closeRoom = async () => {
    if (!window.confirm('Encerrar esta sala permanentemente para todos?')) return;
    const { error } = await supabase.from('rooms').delete().eq('id', id);
    if (!error) navigate('/');
    else alert('Erro ao encerrar sala.');
  };

  if (loading || !room) {
    return (
      <div className="room-loading">
        <div className="pulse-loader"></div>
        <p>Entrando na sala...</p>
      </div>
    );
  }

  const isHost = user?.id === room.host_id;

  return (
    <div className="room-container animate-fade-in">
      <div className="room-main">
        <div className="video-section">
          <VideoPlayer roomId={id!} isHost={isHost} roomData={room} onEnded={handleVideoEnded} />
        </div>
      </div>

      <div className="room-sidebar glass-panel">
        <div className="sidebar-tabs">
          <button 
            className={`tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            <MessageSquare size={18} /> Chat
          </button>
          <button 
            className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            <Users size={18} />
          </button>
          <button 
            className={`tab-btn ${activeTab === 'search' ? 'active' : ''}`}
            onClick={() => setActiveTab('search')}
          >
            <Search size={18} />
          </button>
          <button 
            className={`tab-btn ${activeTab === 'queue' ? 'active' : ''}`}
            onClick={() => setActiveTab('queue')}
          >
            <ListVideo size={18} />
          </button>
          <button onClick={handleShare} className="tab-btn share-tab-btn" title="Convidar">
            {copied ? <Check size={18} className="text-success" /> : <Share2 size={18} />}
          </button>
          
          {isHost && (
            <button onClick={closeRoom} className="tab-btn text-error" title="Encerrar Sala">
              <Trash2 size={18} />
            </button>
          )}
        </div>
        
        <div className="sidebar-content">
          {activeTab === 'chat' && <LiveChat roomId={id!} />}
          {activeTab === 'users' && <UserList roomId={id!} />}
          {activeTab === 'search' && <YoutubeSearch roomId={id!} />}
          {activeTab === 'queue' && <VideoQueue roomId={id!} isHost={isHost} />}
        </div>
      </div>
    </div>
  );
}
