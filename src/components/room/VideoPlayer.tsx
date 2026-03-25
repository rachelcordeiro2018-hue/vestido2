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
  const [isApiReady, setIsApiReady] = useState(false);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const lastSyncRef = useRef<number>(0);
  const receivedAtRef = useRef<number>(Date.now()); // Local time when the last update was received
  const isRemoteChange = useRef<boolean>(false);
  const [roomState, setRoomState] = useState<any>(roomData || null);
  const [needsInteraction, setNeedsInteraction] = useState(!isHost);

  // 1. YouTube Iframe API Loader
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

  // 2. Initial State & Subscription
  useEffect(() => {
    if (!roomId) return;

    if (roomData && !roomState) {
      setRoomState(roomData);
      receivedAtRef.current = Date.now();
    }

    const fetchInitial = async () => {
      const { data } = await supabase
        .from('rooms')
        .select('video_id, current_video_time, is_playing, updated_at')
        .eq('id', roomId)
        .single();
      
      if (data) {
        setRoomState((prev: any) => ({ ...prev, ...data }));
        receivedAtRef.current = Date.now();
      }
    };

    fetchInitial();

    const channel = supabase.channel(`room_sync:${roomId}`)
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'rooms', 
        filter: `id=eq.${roomId}` 
      }, (payload) => {
        // Evitar loop infinito: não atualizar se a mudança veio de nós mesmos 
        // mas aqui estamos apenas recebendo, o 'setRoomState' vai triggar o sync
        setRoomState(payload.new);
        receivedAtRef.current = Date.now();
      })
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [roomId]);

  // 3. Player Initialization
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
            console.log('YouTube Player Ready');
            setIsPlayerReady(true);
            syncPlayerWithState(roomState, true);
          },
          onStateChange: (event: any) => {
            if (!isHost) return;
            if (isRemoteChange.current) return;

            // 1 = PLAYING, 2 = PAUSED
            const isPlaying = event.data === window.YT.PlayerState.PLAYING;
            const isPaused = event.data === window.YT.PlayerState.PAUSED;
            
            if (isPlaying || isPaused) {
              const currentTime = playerRef.current.getCurrentTime();
              updateDbState(isPlaying, currentTime);
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

  // 4. Sync Mechanism
  const syncPlayerWithState = (state: any, forceSeek = false) => {
    if (!playerRef.current || !isPlayerReady) return;

    // A. Video ID Check
    const currentVideoId = playerRef.current.getVideoData ? playerRef.current.getVideoData().video_id : null;
    if (state.video_id && state.video_id !== currentVideoId) {
      isRemoteChange.current = true;
      playerRef.current.loadVideoById(state.video_id, state.current_video_time || 0);
      setTimeout(() => { isRemoteChange.current = false; }, 1000);
      return;
    }

    // B. Calculate Latency Correction (Relative to arrival)
    const now = Date.now();
    const timeSinceArrival = (now - receivedAtRef.current) / 1000;
    
    // O tempo alvo no player é o tempo do banco + o que passou desde que recebemos o dado
    const targetTime = state.is_playing 
      ? state.current_video_time + Math.max(0, timeSinceArrival) 
      : state.current_video_time;

    // C. Sync Play/Pause
    const playerState = playerRef.current.getPlayerState();
    const isLikelyPlaying = playerState === window.YT.PlayerState.PLAYING || playerState === window.YT.PlayerState.BUFFERING;

    if (state.is_playing && !isLikelyPlaying) {
      isRemoteChange.current = true;
      playerRef.current.playVideo();
      setTimeout(() => { isRemoteChange.current = false; }, 500);
    } else if (!state.is_playing && playerState !== window.YT.PlayerState.PAUSED) {
      isRemoteChange.current = true;
      playerRef.current.pauseVideo();
      setTimeout(() => { isRemoteChange.current = false; }, 500);
    }

    // D. Drift Correction (seekTo)
    const currentTime = playerRef.current.getCurrentTime();
    const diff = Math.abs(currentTime - targetTime);
    
    // Evitar seek se estiver carregando ou se a diferença for pequena
    // Aumentamos o limiar para 3 segundos para evitar "pulos" constantes por drift de relógio
    if (playerState !== window.YT.PlayerState.BUFFERING && (forceSeek || diff > 3.0)) {
      isRemoteChange.current = true;
      playerRef.current.seekTo(targetTime, true);
      setTimeout(() => { isRemoteChange.current = false; }, 1000);
    }
  };

  const handleGuestInteraction = () => {
    setNeedsInteraction(false);
    if (playerRef.current && isPlayerReady) {
      playerRef.current.playVideo();
      // Force sync immediately after first interaction
      if (roomState) syncPlayerWithState(roomState, true);
    }
  };

  // Trigger sync on roomState update from Supabase
  useEffect(() => {
    if (roomState && isPlayerReady && !isHost) {
      syncPlayerWithState(roomState);
    }
  }, [roomState, isPlayerReady, isHost]);

  // 5. Host DB Update
  const updateDbState = async (isPlaying: boolean, currentTime: number) => {
    if (!isHost) return;
    
    const now = Date.now();
    // Cooldown de 500ms para evitar spam
    if (now - lastSyncRef.current < 500) return; 

    lastSyncRef.current = now;

    await supabase.from('rooms').update({
      is_playing: isPlaying,
      current_video_time: currentTime,
      updated_at: new Date().toISOString()
    }).eq('id', roomId);
  };

  // 6. Periodic Drift Correction (Every 3 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isPlayerReady || !playerRef.current) return;

      if (isHost) {
        const pState = playerRef.current.getPlayerState();
        const isPlaying = pState === window.YT.PlayerState.PLAYING || pState === window.YT.PlayerState.BUFFERING;
        const currentTime = playerRef.current.getCurrentTime();
        updateDbState(isPlaying, currentTime);
      } else if (roomState) {
        // Clientes corrigem o delay comparando com o banco
        syncPlayerWithState(roomState);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isHost, isPlayerReady, roomState]);

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
            <p>Clique para entrar na sessão e sincronizar</p>
          </div>
        </div>
      )}

      {!isHost && !needsInteraction && (
        <div className="guest-overlay">
          <div className="guest-badge">Sincronizado com o Host</div>
        </div>
      )}
    </div>
  );
}
