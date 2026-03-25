import { useState } from 'react';
import { Search, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useStore } from '../../store';
import './YoutubeSearch.css';

interface YoutubeResult {
  id: any;
  snippet: {
    title: string;
    channelTitle: string;
    thumbnails: { default: { url: string }, medium: { url: string } };
  };
}

export function YoutubeSearch({ roomId }: { roomId: string }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<YoutubeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const user = useStore(state => state.user);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    const API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;
    
    if (!API_KEY) {
      alert("Chave VITE_YOUTUBE_API_KEY não configurada no arquivo .env");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=${encodeURIComponent(query)}&type=video&key=${API_KEY}`
      );
      const data = await response.json();
      if (data.items) {
        setResults(data.items);
      } else {
        alert("Erro na busca do YouTube. Verifique a API Key.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const addToQueue = async (video: YoutubeResult) => {
    if (!user) return;

    let videoId = '';
    if (typeof video.id === 'string') {
      videoId = video.id;
    } else if (video.id && typeof video.id === 'object') {
      videoId = video.id.videoId || '';
    }

    if (!videoId) {
      alert('Não foi possível obter o ID do vídeo.');
      return;
    }

    const { error } = await supabase.from('room_queue').insert([{
      room_id: roomId,
      user_id: user.id,
      video_url: `https://www.youtube.com/watch?v=${videoId}`,
      title: video.snippet.title,
      thumbnail: video.snippet.thumbnails.medium.url,
      channel: video.snippet.channelTitle
    }]);

    if (error) {
      alert('Erro ao adicionar na fila!');
      console.error(error);
    } else {
      alert('Adicionado com sucesso!');
    }
  };

  return (
    <div className="youtube-search-container">
      <form onSubmit={handleSearch} className="youtube-search-form">
        <div className="input-wrapper">
          <input
            type="text"
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar no YouTube..."
          />
          <button type="submit" className="btn-icon search-submit" disabled={loading}>
            <Search size={20} />
          </button>
        </div>
      </form>

      <div className="youtube-results">
        {loading && <p className="text-secondary text-center">Buscando...</p>}
        {!loading && results.map((result) => (
          <div key={result.id.videoId} className="youtube-result-item">
            <img src={result.snippet.thumbnails.default.url} alt="thumb" className="yt-thumb" />
            <div className="yt-details">
              <h4 className="yt-title" dangerouslySetInnerHTML={{ __html: result.snippet.title }} />
              <span className="yt-channel">{result.snippet.channelTitle}</span>
            </div>
            <button className="btn-icon add-queue-btn" onClick={() => addToQueue(result)}>
              <Plus size={20} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
