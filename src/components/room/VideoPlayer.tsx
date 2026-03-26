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
  const isRemoteChange = useRef(false);
  const hostPausedRef = useRef(false);
  const isTabHidden = useRef(false);
  const lastSentVideoId = useRef<string>(""); // Trava para não enviar vídeo antigo

  const [isApiReady, setIsApiReady] = useState(false);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [hostPaused, setHostPaused] = useState(false);
  const [roomState, setRoomState] = useState<any>(roomData || null);
  const [needsInteraction, setNeedsInteraction] = useState(!isHost);

  useEffect(() => {
    const handleVisibility = () => { isTabHidden.current = document.hidden; };
    document.addEventListener('visibilitychange', handleVisibility);
    
    if (window.YT && window.YT.Player) {
      setIsApiReady(true);
    } else {
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(tag);
      window.onYouTubeIframeAPIReady = () => setIsApiReady(true);
    }
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  useEffect(() => {
    if (!roomId) return;
    const fetchInit = async () => {
      const { data } = await supabase.from('rooms').select('*').eq('id', roomId).single();
      if (data) {
        setRoomState(data);
        lastSentVideoId.current = data.video_id;
      }
    };
    fetchInit();
  }, [roomId]);

  // 3. Monitora a troca de vídeo (FILA) - RESET IMEDIATO AQUI
  useEffect(() => {
    if (roomData?.video_id && isPlayerReady && playerRef.current) {
      let curr = "";
      try { curr = playerRef.current.getVideoData().video_id; } catch(e){}
      
      if (roomData.video_id !== curr) {
        isRemoteChange.current = true;
        lastSentVideoId.current = roomData.video_id; // Atualiza a trava antes de carregar
        playerRef.current.loadVideoById(roomData.video_id, 0);
        setRoomState((prev: any) => ({ ...prev, video_id: roomData.video_id }));
        
        setTimeout(() => { isRemoteChange.current = false; }, 2500);
      }
    }
  }, [roomData?.video_id, isPlayerReady]);

  const broadcast = (playing: boolean) => {
    if (!isHost || !playerRef.current || !channelRef.current || isRemoteChange.current) return;
    
    let currentVid = "";
    try { currentVid = playerRef.current.getVideoData().video_id; } catch(e){}

    // SEGURANÇA: Só faz broadcast se o vídeo no player for o mesmo da prop/estado atual
    if (currentVid !== roomData?.video_id && currentVid !== roomState?.video_id) return;

    channelRef.current.send({
      type: 'broadcast',
      event: 'player_sync',
      payload: {
        video_id: currentVid,
        current_video_time: playerRef.current.getCurrentTime(),
        is_playing: playing,
        sentAt: Date.now()
      }
    });
  };

  useEffect(() => {
    if (!isHost || !isPlayerReady) return;
    const i = setInterval(() => {
      if (playerRef.current?.getPlayerState() === 1 && !isRemoteChange.current) {
        broadcast(true);
      }
    }, 3000); 
    return () => clearInterval(i);
  }, [isHost, isPlayerReady, roomData?.video_id, roomState?.video_id]);

  useEffect(() => {
    if (!roomId) return;
    const ch = supabase.channel(`room_sync_${roomId}`);
    channelRef.current = ch;
    
    if (!isHost) {
      ch.on('broadcast', { event: 'player_sync' }, ({ payload }) => {
        if (isRemoteChange.current || !playerRef.current?.getCurrentTime) return;

        let cid = "";
        try { cid = playerRef.current.getVideoData().video_id; } catch(e){}
        
        if (payload.video_id !== cid) {
          isRemoteChange.current = true;
          playerRef.current.loadVideoById(payload.video_id, payload.current_video_time);
          setTimeout(() => { isRemoteChange.current = false; }, 2500);
          return;
        }

        setHostPaused(!payload.is_playing);
        hostPausedRef.current = !payload.is_playing;
        
        const myState = playerRef.current.getPlayerState();
        if (payload.is_playing && myState !== 1 && myState !== 3) {
          playerRef.current.playVideo();
        } else if (!payload.is_playing && myState === 1) {
          playerRef.current.pauseVideo();
        }

        const targetTime = payload.current_video_time + ((Date.now() - payload.sentAt) / 1000);
        const diff = Math.abs(playerRef.current.getCurrentTime() - targetTime);

        if (diff > 5 && myState !== 3) {
          isRemoteChange.current = true;
          playerRef.current.seekTo(targetTime, true);
          setTimeout(() => { isRemoteChange.current = false; }, 1500);
        }
      });
    }
    
    ch.subscribe();
    return () => { ch.unsubscribe(); };
  }, [roomId, isHost, isPlayerReady]);

  useEffect(() => {
    if (!isApiReady || !roomState?.video_id || playerRef.current) return;
    playerRef.current = new window.YT.Player(containerRef.current, {
      videoId: roomState.video_id,
      width: '100%',
      height: '100%',
      playerVars: { autoplay: 1, controls: 1, enablejsapi: 1, rel: 0, modestbranding: 1 },
      events: {
        onReady: () => setIsPlayerReady(true),
        onStateChange: (e: any) => {
          if (isHost && !isRemoteChange.current) {
            if (e.data === 1) broadcast(true);
            if (e.data === 2 && !isTabHidden.current) broadcast(false);
            if (e.data === 0 && onEnded) onEnded();
          }
          if (!isHost && !isRemoteChange.current && e.data === 2 && !hostPausedRef.current) {
            playerRef.current.playVideo();
          }
        }
      }
    });
    return () => {
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, [isApiReady, roomState?.video_id]);

  return (
    <div className="player-wrapper">
      <div className="yt-iframe-container"><div ref={containerRef}></div></div>
      {!isHost && needsInteraction && (
        <div className="guest-join-overlay" onClick={() => { setNeedsInteraction(false); playerRef.current?.playVideo(); }}>
          <div className="join-content"><p>Sincronizar com a Sala</p></div>
        </div>
      )}
    </div>
  );
}