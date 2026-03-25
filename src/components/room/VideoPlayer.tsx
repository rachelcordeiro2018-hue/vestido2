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

    window.onYouTubeIframeAPIReady = () => {
      setIsApiReady(true);
    };
  }, []);

  // 2. Busca inicial do banco
  useEffect(() => {
    if (!roomId) return;

    if (roomData && !roomState) {
      setRoomState(roomData);
    }

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

    fetchInitial();
  }, [roomId]);

  // 3. Socket / Supabase Broadcast
  useEffect(() => {
    if (!roomId) return;

    // Conecta via Sockets do Supabase (Broadcast sem pesar o banco)
    const channel = supabase.channel(`room_sync_${roomId}`);
    channelRef.current = channel;

    if (!isHost) {
      // Visitante ESCUTA o Host
      channel.on('broadcast', { event: 'player_sync' }, (payload) => {
        const data = payload.payload;
        syncPlayerFromSocket(data);
      });
    }

    channel.subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [roomId, isHost, isPlayerReady]);

  // 4. Inicializa o Player
  useEffect(() => {
    if (!isApiReady || !roomState?.video_id || playerRef.current) return;

    const initPlayer = () => {
      if (!containerRef.current) return;
      
      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId: roomState.video_id,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: roomState.is_playing ? 1 : 0,
          controls: 1, 
          disablekb: isHost ? 0 : 1,
          rel: 0,
          modestbranding: 1,
          enablejsapi: 1
        },
        events: {
          onReady: () => {
            console.log('YouTube Player Ready - via Socket');
            setIsPlayerReady(true);
            
            // Se for visitante, busca um primeiro update de alinhamento com o initial state
            if (!isHost && roomState) {
               syncPlayerFromSocket({
                 video_id: roomState.video_id,
                 current_video_time: roomState.current_video_time,
                 is_playing: roomState.is_playing
               });
            }
          },
          onStateChange: (event: any) => {
            if (!isHost || isRemoteChange.current) return;
            // Identifica se o host parou, rodou ou travou carregando (Buffering)
            const isPlaying = event.data === window.YT.PlayerState.PLAYING;
            const isPaused = event.data === window.YT.PlayerState.PAUSED;
            const isBuffering = event.data === window.YT.PlayerState.BUFFERING;
            
            if (isPlaying) {
              broadcastState(true);
            } else if (isPaused || isBuffering) {
              // Quando o host "pausa" ou entra em "carregamento infinito", enviamos FALSE
              // para forçar que o visitante pare também, sem ficar pulando ou buscando tempo!
              broadcastState(false); 
            }
          },
          onError: (e: any) => {
            console.error('YouTube Player Error:', e.data);
          }
        }
      });
    };

    initPlayer();

    return () => {
      if (playerRef.current && playerRef.current.destroy) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [isApiReady, roomState?.video_id]);

  // 5. Host emite via Socket
  const broadcastState = (playingOverride?: boolean) => {
    if (!isHost || !playerRef.current || !channelRef.current || !isPlayerReady) return;
    
    // Pega estado atual
    const pState = playerRef.current.getPlayerState();
    const isPlaying = playingOverride !== undefined 
      ? playingOverride 
      : (pState === window.YT.PlayerState.PLAYING);
    
    const currentTime = playerRef.current.getCurrentTime() || 0;
    const currentVideoId = playerRef.current.getVideoData ? playerRef.current.getVideoData().video_id : roomState?.video_id;

    // Dispara msg no websocket!
    channelRef.current.send({
      type: 'broadcast',
      event: 'player_sync',
      payload: {
        video_id: currentVideoId,
        current_video_time: currentTime,
        is_playing: isPlaying
      }
    });
  };

  // Host: loop enviando posição atualizando o socket (A cada ~1.5s) para sync granular
  useEffect(() => {
    if (!isHost) return;
    const intervalId = setInterval(() => {
        broadcastState();
    }, 1500);
    return () => clearInterval(intervalId);
  }, [isHost, isPlayerReady]);

  // Host: atualiza no banco só de vez em quando (ex: 10s) para novos entrantes
  useEffect(() => {
    if (!isHost) return;
    const dbIntervalId = setInterval(() => {
      if (!playerRef.current || !isPlayerReady) return;
      const pState = playerRef.current.getPlayerState();
      const isPlaying = pState === window.YT.PlayerState.PLAYING;
      const t = playerRef.current.getCurrentTime();
      
      supabase.from('rooms').update({
        is_playing: isPlaying,
        current_video_time: t
      }).eq('id', roomId);
      
    }, 10000);
    return () => clearInterval(dbIntervalId);
  }, [isHost, isPlayerReady, roomId]);

  // 6. Visitante reage ao Socket
  const syncPlayerFromSocket = (data: any) => {
    if (isHost || !playerRef.current || !isPlayerReady) return;

    // A. Trocou de vídeo?
    const currentVideoId = playerRef.current.getVideoData ? playerRef.current.getVideoData().video_id : null;
    if (data.video_id && data.video_id !== currentVideoId) {
      isRemoteChange.current = true;
      playerRef.current.loadVideoById(data.video_id, data.current_video_time || 0);
      setRoomState((prev: any) => ({ ...prev, video_id: data.video_id }));
      setTimeout(() => { isRemoteChange.current = false; }, 1000);
      return;
    }

    // B. Tempo alvo sem atrasos baseados em latência falha de Data
    const targetTime = data.current_video_time;

    // C. Pausa / Play
    const playerState = playerRef.current.getPlayerState();
    const isLikelyPlaying = playerState === window.YT.PlayerState.PLAYING || playerState === window.YT.PlayerState.BUFFERING;

    if (data.is_playing && !isLikelyPlaying) {
      isRemoteChange.current = true;
      playerRef.current.playVideo();
      setTimeout(() => { isRemoteChange.current = false; }, 500);
    } else if (!data.is_playing && playerState !== window.YT.PlayerState.PAUSED) {
      isRemoteChange.current = true;
      playerRef.current.pauseVideo();
      setTimeout(() => { isRemoteChange.current = false; }, 500);
    }

    // D. Corrige Posição (Drift)
    // Usamos 4.0 segundos de tolerância para não causar saltos bruscos se as maquinas demorarem processar.
    const currentTime = playerRef.current.getCurrentTime();
    const diff = Math.abs(currentTime - targetTime);

    // Evita dar "seek" se o YouTube já estiver carregando o vídeo (Buffering)
    if (playerState !== window.YT.PlayerState.BUFFERING && diff > 4.0) {
      isRemoteChange.current = true;
      // Adiciona 0.5s para compensar o tempo do vídeo ir até o jogador e ele carregar.
      playerRef.current.seekTo(targetTime + 0.5, true);
      setTimeout(() => { isRemoteChange.current = false; }, 1000);
    }
  };

  // Visitante interage a primeira vez para liberar som/video bloqueado pelo navegador
  const handleGuestInteraction = () => {
    setNeedsInteraction(false);
    if (playerRef.current && isPlayerReady) {
      playerRef.current.playVideo();
    }
  };

  return (
    <div className="player-wrapper">
      <div className="yt-iframe-container">
        <div ref={containerRef}></div>
      </div>
      
      {!isHost && needsInteraction && (
        <div className="guest-join-overlay" onClick={handleGuestInteraction}>
          <div className="join-content">
            <div className="pulse-button">
              <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <p>Clique para entrar na sessão e sincronizar (Sockets)</p>
          </div>
        </div>
      )}

      {!isHost && !needsInteraction && (
        <div className="guest-overlay">
          <div className="guest-badge">Sincronizado via Sockets Realtime ⚡</div>
        </div>
      )}
    </div>
  );
}

