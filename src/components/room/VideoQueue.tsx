import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useStore } from '../../store';
import { Play, Trash2, ExternalLink } from 'lucide-react';
import { YoutubeBrowser } from '../youtube/YoutubeBrowser';
import './VideoQueue.css';

interface QueueItem {
  id: string;
  video_url: string;
  title: string;
  thumbnail: string;
  channel: string;
  user_id: string;
}

export function VideoQueue({ roomId, isHost }: { roomId: string, isHost: boolean }) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const user = useStore(state => state.user);

  useEffect(() => {
    // Fetch initial queue
    const fetchQueue = async () => {
      const { data, error } = await supabase
        .from('room_queue')
        .select('*')
        .eq('room_id', roomId)
        .eq('played', false)
        .order('created_at', { ascending: true });

      if (!error && data) {
        setQueue(data);
      }
    };
    fetchQueue();

    // Subscribe to queue changes
    const channel = supabase.channel(`queue:${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_queue', filter: `room_id=eq.${roomId}` }, () => {
        fetchQueue();
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [roomId]);

  const removeQueueItem = async (id: string) => {
    await supabase.from('room_queue').delete().eq('id', id);
  };

  const getYoutubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url?.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const forcePlay = async (item: QueueItem) => {
    if (!isHost) return;
    
    const vId = getYoutubeId(item.video_url);

    // Play immediately sets it as current video in rooms, and marks played
    await supabase.from('rooms').update({ 
      video_url: item.video_url,
      video_id: vId,
      current_video_time: 0,
      is_playing: true
    }).eq('id', roomId);
    await supabase.from('room_queue').update({ played: true }).eq('id', item.id);
  };

  return (
    <div className="queue-container">
      <div className="queue-header">
        <div className="flex items-center justify-between w-full">
          <h3 className="text-secondary text-sm">Fila de Reprodução ({queue.length})</h3>
          <button 
            className="btn btn-secondary text-xs py-1 px-3 flex items-center gap-1"
            onClick={() => setIsBrowserOpen(true)}
          >
            <ExternalLink size={12} /> Navegar YouTube
          </button>
        </div>
      </div>
      
      {isBrowserOpen && (
        <YoutubeBrowser 
          mode="queue"
          roomId={roomId}
          onClose={() => setIsBrowserOpen(false)}
        />
      )}

      <div className="queue-list">
        {queue.length === 0 ? (
          <div className="empty-queue text-secondary">A fila está vazia. Adicione vídeos na aba Busca!</div>
        ) : (
          queue.map((item) => (
            <div key={item.id} className="queue-item">
              <img src={item.thumbnail} alt="thumb" className="queue-thumb" />
              <div className="queue-details">
                <span className="queue-title">{item.title}</span>
                <span className="queue-channel">{item.channel}</span>
              </div>
              <div className="queue-actions">
                {isHost && (
                  <button className="btn-icon" onClick={() => forcePlay(item)} title="Tocar Imediatamente">
                    <Play size={16} />
                  </button>
                )}
                {(isHost || item.user_id === user?.id) && (
                  <button className="btn-icon text-error" onClick={() => removeQueueItem(item.id)} title="Remover">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
