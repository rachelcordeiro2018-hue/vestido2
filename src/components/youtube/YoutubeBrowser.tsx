import React, { useState, useEffect } from 'react';
import { Search, Compass, MoreVertical, Home as HomeIcon, PlaySquare, User, X, ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useStore } from '../../store';
import { useNavigate } from 'react-router-dom';
import './YoutubeBrowser.css';

interface YoutubeBrowserProps {
  onClose: () => void;
  mode?: 'create' | 'queue';
  roomId?: string;
}

export function YoutubeBrowser({ onClose, mode = 'create', roomId }: YoutubeBrowserProps) {
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<any>(null);
  const [privacy, setPrivacy] = useState<'public' | 'private' | 'friends'>('public');
  const [roomName, setRoomName] = useState('');
  const user = useStore(state => state.user);
  const navigate = useNavigate();

  const categories = ['Tudo', 'Música', 'Mixes', 'Pop rock', 'Álbuns', 'Música brasileira', 'Ao vivo', 'Jogos'];

  const fetchVideos = async (query?: string) => {
    setLoading(true);
    const API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;
    if (!API_KEY) {
      alert("Chave API não configurada");
      setLoading(false); return;
    }
    try {
      let url = '';
      if (query) {
        url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=20&q=${encodeURIComponent(query)}&type=video&key=${API_KEY}`;
      } else {
        url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&chart=mostPopular&regionCode=BR&maxResults=20&key=${API_KEY}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      setVideos(data.items || []);
    } catch(err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVideos();
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      fetchVideos(searchQuery);
      setIsSearching(false);
    }
  };

  const handleVideoSelect = (video: any) => {
    if (mode === 'queue') {
      executeAddToQueue(video);
    } else {
      setSelectedVideo(video);
      setRoomName(video.snippet.title.substring(0, 50));
    }
  };

  const executeAddToQueue = async (video: any) => {
    if (!user || !roomId) return;
    let videoId = typeof video.id === 'string' ? video.id : (video.id.videoId || video.id.playlistId || '');
    if (!videoId) return;

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const { error } = await supabase.from('room_queue').insert([{
      room_id: roomId,
      user_id: user.id,
      video_url: videoUrl,
      title: video.snippet.title,
      thumbnail: video.snippet.thumbnails.high?.url || video.snippet.thumbnails.medium?.url,
      channel: video.snippet.channelTitle
    }]);

    if (!error) {
      alert('Adicionado à fila!');
      onClose();
    }
  };

  const confirmRoomCreation = async () => {
    if (!user || !selectedVideo) return;
    let videoId = typeof selectedVideo.id === 'string' ? selectedVideo.id : (selectedVideo.id.videoId || selectedVideo.id.playlistId || '');
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    const { data, error } = await supabase.from('rooms').insert([{
      name: roomName,
      video_url: videoUrl,
      video_id: videoId,
      host_id: user.id,
      privacy: privacy,
      current_video_time: 0,
      is_playing: true
    }]).select().single();
    
    if (!error && data) {
      navigate(`/room/${data.id}`);
    } else {
      console.error(error);
      alert(`Erro ao criar sala.`);
    }
  };

  return (
    <div className="yt-browser-overlay animate-fade-in">
      <div className="yt-browser-container">
        
        {/* Header */}
        <div className="yt-header">
          <div className="yt-header-left">
            <button className="yt-icon-btn" onClick={onClose}><X size={24} color="#fff" /></button>
            <img src="https://upload.wikimedia.org/wikipedia/commons/b/b8/YouTube_Logo_2017.svg" alt="YouTube" className="yt-logo" />
          </div>
          <div className="yt-header-right">
            <button className="yt-icon-btn" onClick={() => setIsSearching(!isSearching)}><Search size={24} color="#fff" /></button>
          </div>
        </div>

        {/* Search Bar Overlay */}
        {isSearching && (
          <div className="yt-search-bar animate-fade-in">
            <button className="yt-icon-btn" onClick={() => setIsSearching(false)}><ArrowLeft size={24} color="#fff" /></button>
            <form onSubmit={handleSearchSubmit} className="yt-search-form">
              <input autoFocus type="text" placeholder="Pesquisar no YouTube" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </form>
          </div>
        )}

        {/* Categories */}
        <div className="yt-categories-wrapper">
          <div className="yt-category-btn"><Compass size={20} /></div>
          {categories.map((cat, i) => (
            <div key={cat} className={`yt-category-btn ${i === 0 ? 'active' : ''}`} onClick={() => fetchVideos(cat)}>{cat}</div>
          ))}
        </div>

        {/* Content */}
        <div className="yt-content">
          {loading ? (
            <div className="yt-loading text-secondary text-center mt-8">Carregando vídeos...</div>
          ) : (
            <div className="yt-video-grid">
              {videos.map((v, i) => (
                <div key={i} className="yt-video-card" onClick={() => handleVideoSelect(v)}>
                  <div className="yt-thumbnail-wrapper">
                    <img src={v.snippet.thumbnails.high?.url || v.snippet.thumbnails.medium?.url} alt="thumb" className="yt-thumbnail" />
                    {v.contentDetails?.duration && <span className="yt-duration">Mix</span>}
                  </div>
                  <div className="yt-video-info">
                    <img src={`https://ui-avatars.com/api/?name=${v.snippet.channelTitle}&background=random&color=fff`} alt="channel" className="yt-channel-avatar" />
                    <div className="yt-video-text">
                      <h3 className="yt-video-title" dangerouslySetInnerHTML={{ __html: v.snippet.title }}></h3>
                      <p className="yt-video-meta">
                        {v.snippet.channelTitle} • {v.statistics ? `${formatViews(v.statistics.viewCount)} visualizações` : 'Recomendado'} 
                      </p>
                    </div>
                    <button className="yt-icon-btn yt-more-btn"><MoreVertical size={20} color="#aaa" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Nav */}
        <div className="yt-bottom-nav">
          <div className="yt-nav-item active"><HomeIcon size={24} /><span>Início</span></div>
          <div className="yt-nav-item"><PlaySquare size={24} /><span>Shorts</span></div>
          <div className="yt-nav-item"><User size={24} /><span>Você</span></div>
        </div>

        {/* Create Room Confirmation Modal */}
        {selectedVideo && (
          <div className="yt-confirm-overlay animate-fade-in">
            <div className="yt-confirm-modal glass-panel">
              <h3>Criar Sala</h3>
              <div className="yt-confirm-preview">
                <img src={selectedVideo.snippet.thumbnails.default?.url} alt="thumb" />
                <p>{selectedVideo.snippet.title}</p>
              </div>
              
              <div className="form-group mt-4">
                <label>Nome da Sala</label>
                <input 
                  type="text" 
                  className="input" 
                  value={roomName}
                  onChange={e => setRoomName(e.target.value)}
                />
              </div>

              <div className="form-group mb-4">
                <label>Privacidade</label>
                <select className="input" value={privacy} onChange={e => setPrivacy(e.target.value as any)}>
                  <option value="public">🌐 Pública</option>
                  <option value="friends">👥 Amigos</option>
                  <option value="private">🔒 Privada</option>
                </select>
              </div>

              <div className="yt-confirm-actions">
                <button className="btn btn-secondary" onClick={() => setSelectedVideo(null)}>Cancelar</button>
                <button className="btn btn-primary" onClick={confirmRoomCreation}>Criar Sala</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function formatViews(views: string) {
  const num = parseInt(views);
  if (num >= 1000000) return (num / 1000000).toFixed(1) + ' mi de';
  if (num >= 1000) return (num / 1000).toFixed(0) + ' mil';
  return num.toString();
}
