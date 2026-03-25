import React, { useState } from 'react';
import { Search, X, Globe, ArrowLeft, ArrowRight, RotateCw, Play } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useStore } from '../../store';
import { useNavigate } from 'react-router-dom';
import './WebBrowser.css';

interface WebBrowserProps {
  onClose: () => void;
}

export function WebBrowser({ onClose }: WebBrowserProps) {
  const [url, setUrl] = useState('https://www.google.com/search?igu=1'); // igu=1 for some google iframe support
  const [inputUrl, setInputUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const user = useStore(state => state.user);
  const navigate = useNavigate();

  const handleGo = (e: React.FormEvent) => {
    e.preventDefault();
    let finalUrl = inputUrl;
    if (!finalUrl.startsWith('http')) {
      finalUrl = `https://www.google.com/search?q=${encodeURIComponent(finalUrl)}&igu=1`;
    }
    setUrl(finalUrl);
  };

  const createRoomWithUrl = async () => {
    if (!user) return;
    const { data, error } = await supabase.from('rooms').insert([{
      name: 'Sessão Web - ' + new URL(url).hostname,
      video_url: url,
      host_id: user.id,
      privacy: 'public'
    }]).select().single();

    if (!error && data) {
      navigate(`/room/${data.id}`);
    } else {
      alert('Tente copiar o link direto do vídeo/filme se possível.');
    }
  };

  return (
    <div className="web-browser-overlay animate-fade-in">
      <div className="web-browser-container glass-panel">
        <div className="web-browser-header">
          <div className="nav-controls">
            <button className="btn-icon" onClick={onClose}><X size={20} /></button>
            <button className="btn-icon"><ArrowLeft size={18} /></button>
            <button className="btn-icon"><ArrowRight size={18} /></button>
            <button className="btn-icon"><RotateCw size={18} /></button>
          </div>
          
          <form onSubmit={handleGo} className="browser-address-bar">
            <Globe size={18} className="text-secondary" />
            <input 
              type="text" 
              placeholder="Pesquisar no Google ou digitar URL..."
              value={inputUrl}
              onChange={e => setInputUrl(e.target.value)}
            />
          </form>

          <button className="btn btn-primary sync-btn" onClick={createRoomWithUrl}>
            <Play size={18} /> Iniciar Sala
          </button>
        </div>

        <div className="browser-view">
          {loading && <div className="browser-loader">Carregando site...</div>}
          <iframe 
            src={url} 
            title="web-view"
            onLoad={() => setLoading(false)}
          />
          
          <div className="browser-warning">
            <p>Se o site carregar em branco, ele bloqueou a visualização. Tente copiar o link direto e usar uma sala personalizada.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
