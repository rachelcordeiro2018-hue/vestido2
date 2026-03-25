import { useRef, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import './VideoPlayer.css';

interface VideoPlayerProps {
  roomId: string;
  isHost: boolean;
  roomData?: any;
  onEnded?: () => void;
}

declare global {
  interface Window {
    onYouTubeIframeAPIReady: () => void;
    YT: any;
  }
}

export function VideoPlayer({ roomId, isHost, roomData, onEnded }: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const channelRef = useRef<any>(null);

  const [isApiReady, setIsApiReady] = useState(false);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [hostPaused, setHostPaused] = useState(false); 
  
  const isRemoteChange = useRef<boolean>(false);
  const [roomState, setRoomState] = useState<any>(roomData || null);
  const [needsInteraction, setNeedsInteraction] = useState(!isHost);

  // 1. Carrega API do YouTube
  useEffect(() => {
    if (window.YT && window.YT.Player) {
      setIsApiReady(true);
      return;
    }
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    window.onYouTubeIframeAPIReady = () => setIsApiReady(true);
  }, []);

  // 2. Busca inicial do banco e atualização por Props
  useEffect(() => {
    if (!roomId) return;

    const fetchInitial = async () => {
      const { data } = await supabase
        .from('rooms')
        .select('video_id, current_video_time, is_playing')
        .eq('id', roomId)
        .single();
      
      if (data) {
        setRoomState((prev: any) => ({ ...prev, ...data }));
      }
    };

    if (!roomState) {
      fetchInitial();
    }
  }, [roomId]);

  // Se o componente Pai (Room) mandar um video_id novo, atuamos nele:
  useEffect(() => {
    if (roomData && roomState && roomData.video_id !== roomState.video_id) {
      setRoomState((prev: any) => ({ ...prev, video_id: roomData.video_id, current_video_time: roomData.current_video_time || 0 }));
      if (playerRef.current && isPlayerReady) {
        playerRef.current.loadVideoById(roomData.video_id, roomData.current_video_time || 0);
        if (roomData.is_playing) playerRef.current.playVideo();
      }
    }
  }, [roomData?.video_id]);

  // 3. Canal Realtime (Supabase)
  useEffect(() => {
    if (!roomId) return;
    const channel = supabase.channel(`room_sync_${roomId}`, {
      config: { broadcast: { ack: false, self: false } }
    });
    channelRef.current = channel;

    if (!isHost) {
      channel.on('broadcast', { event: 'player_sync' }, ({ payload }) => {
        syncPlayerFromSocket(payload);
      });
    }

    channel.subscribe();
    return () => { channel.unsubscribe(); };
  }, [roomId, isHost, isPlayerReady]);

  // 3. Inicializa o Player
  useEffect(() => {
    if (!isApiReady || !roomState?.video_id || playerRef.current) return;

    playerRef.current = new window.YT.Player(containerRef.current, {
      videoId: roomState.video_id,
      width: '100%',
      height: '100%',
      playerVars: {
        autoplay: roomState.is_playing ? 1 : 0,
        controls: 1, // Habilitado para todos poderem mexer no VOLUME
        disablekb: isHost ? 0 : 1, // Desabilita teclado para visitantes (espaço não pausa)
        rel: 0,
        modestbranding: 1,
        enablejsapi: 1
      },
      events: {
        onReady: () => {
          setIsPlayerReady(true);
          if (!isHost && roomState) {
             syncPlayerFromSocket({ ...roomState, sentAt: Date.now() });
          }
        },
        onStateChange: (event: any) => {
          // LÓGICA PARA O HOST
          if (isHost && !isRemoteChange.current) {
            if (event.data === window.YT.PlayerState.PLAYING) {
              broadcastState(true);
            } else if (event.data === window.YT.PlayerState.PAUSED) {
              broadcastState(false);
            }
            return;
          }

          // LÓGICA PARA O VISITANTE (BLOQUEIO DE PAUSA MANUAL)
          if (!isHost && !isRemoteChange.current) {
            // Se o visitante pausar mas o Host estiver em modo PLAY (hostPaused = false)
            if (event.data === window.YT.PlayerState.PAUSED && !hostPaused) {
              playerRef.current.playVideo(); // Força o play novamente
            }
          }
        }
      }
    });

    return () => {
      if (playerRef.current?.destroy) playerRef.current.destroy();
    };
  }, [isApiReady, roomState?.video_id, hostPaused]); // Dependência hostPaused importante aqui

  // 4. Função de Broadcast (Host -> Visitantes)
  const broadcastState = (playingOverride?: boolean) => {
    if (!isHost || !playerRef.current || !channelRef.current || !isPlayerReady) return;
    
    const pState = playerRef.current.getPlayerState();
    const isPlaying = playingOverride !== undefined 
      ? playingOverride 
      : (pState === window.YT.PlayerState.PLAYING);
    
    channelRef.current.send({
      type: 'broadcast',
      event: 'player_sync',
      payload: {
        video_id: playerRef.current.getVideoData().video_id,
        current_video_time: playerRef.current.getCurrentTime(),
        is_playing: isPlaying,
        sentAt: Date.now()
      }
    });
  };

  // Loop de Sync Granular (Host)
  useEffect(() => {
    if (!isHost || !isPlayerReady) return;
    const interval = setInterval(() => {
      const pState = playerRef.current?.getPlayerState();
      if (pState === window.YT.PlayerState.PLAYING) {
        broadcastState(true);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [isHost, isPlayerReady]);

  // 5. Lógica de Sincronização (Visitante)
  const syncPlayerFromSocket = (data: any) => {
    if (isHost || !playerRef.current || !isPlayerReady || isRemoteChange.current) return;

    const player = playerRef.current;
    const playerState = player.getPlayerState();
    
    setHostPaused(!data.is_playing);

    // REGRA PARA O PAUSE (Vindo do Host)
    if (data.is_playing === false) {
      if (playerState !== window.YT.PlayerState.PAUSED) {
        isRemoteChange.current = true;
        player.pauseVideo();
        setTimeout(() => { isRemoteChange.current = false; }, 800);
      }
      return; 
    }

    // REGRA PARA O PLAY (Vindo do Host)
    if (data.is_playing && (playerState === window.YT.PlayerState.PAUSED || playerState === window.YT.PlayerState.CUED)) {
      isRemoteChange.current = true;
      player.playVideo();
      setTimeout(() => { isRemoteChange.current = false; }, 800);
    }

    // Ajuste de Drift (Tempo)
    const latency = (Date.now() - data.sentAt) / 1000;
    const adjustedTime = data.current_video_time + (latency > 0 && latency < 4 ? latency : 0);
    const currentTime = player.getCurrentTime();
    const diff = Math.abs(currentTime - adjustedTime);

    if (diff > 3.0 && playerState !== window.YT.PlayerState.BUFFERING) {
      isRemoteChange.current = true;
      player.seekTo(adjustedTime, true);
      setTimeout(() => { isRemoteChange.current = false; }, 1000);
    }
  };

  const handleGuestInteraction = () => {
    setNeedsInteraction(false);
    if (playerRef.current) playerRef.current.playVideo();
  };

  return (
    <div className="player-wrapper">
      <div className="yt-iframe-container">
        <div ref={containerRef}></div>
      </div>

      {!isHost && !needsInteraction && hostPaused && (
        <div className="host-status-overlay">
          <div className="status-badge pause-alert">
            <span className="icon">II</span>
            Host pausou o vídeo
          </div>
        </div>
      )}

      {!isHost && needsInteraction && (
        <div className="guest-join-overlay" onClick={handleGuestInteraction}>
          <div className="join-content">
            <div className="pulse-button">
              <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <p>Clique para sincronizar com a sala</p>
          </div>
        </div>
      )}
    </div>
  );
}