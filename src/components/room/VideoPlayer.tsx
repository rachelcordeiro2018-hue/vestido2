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

export function VideoPlayer({ roomId, isHost, roomData }: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const channelRef = useRef<any>(null);

  const [isApiReady, setIsApiReady] = useState(false);
  const [isPlayerReady, setIsPlayerReady] = useState(false);

  const isRemoteChange = useRef(false);
  const [roomState, setRoomState] = useState<any>(roomData || null);
  const [needsInteraction, setNeedsInteraction] = useState(!isHost);

  useEffect(() => {
    if (window.YT && window.YT.Player) {
      setIsApiReady(true);
      return;
    }

    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    document.body.appendChild(tag);

    window.onYouTubeIframeAPIReady = () => {
      setIsApiReady(true);
    };
  }, []);

  useEffect(() => {
    if (!roomId) return;

    const fetchInitial = async () => {
      const { data } = await supabase
        .from('rooms')
        .select('video_id, current_video_time, is_playing')
        .eq('id', roomId)
        .single();

      if (data) {
        setRoomState(data);
      }
    };

    fetchInitial();
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;

    const channel = supabase.channel(`room_sync_${roomId}`);
    channelRef.current = channel;

    if (!isHost) {
      channel.on('broadcast', { event: 'player_sync' }, (payload) => {
        syncPlayerFromSocket(payload.payload);
      });
    }

    channel.subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [roomId, isHost, isPlayerReady]);

  useEffect(() => {
    if (!isApiReady || !roomState?.video_id || playerRef.current) return;

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
          setIsPlayerReady(true);

          if (!isHost && roomState) {
            syncPlayerFromSocket({
              video_id: roomState.video_id,
              current_video_time: roomState.current_video_time,
              is_playing: roomState.is_playing,
              sentAt: Date.now()
            });
          }
        },

        onStateChange: (event: any) => {
          if (!isHost || isRemoteChange.current) return;

          const isPlaying = event.data === window.YT.PlayerState.PLAYING;
          const isPaused = event.data === window.YT.PlayerState.PAUSED;

          if (isPlaying || isPaused) {
            broadcastState(isPlaying);
          }
        }
      }
    });

    return () => {
      if (playerRef.current?.destroy) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [isApiReady, roomState?.video_id]);

  const broadcastState = (playingOverride?: boolean) => {
    if (!isHost || !playerRef.current || !channelRef.current || !isPlayerReady) return;

    const pState = playerRef.current.getPlayerState();

    const isPlaying = playingOverride !== undefined
      ? playingOverride
      : pState === window.YT.PlayerState.PLAYING;

    channelRef.current.send({
      type: 'broadcast',
      event: 'player_sync',
      payload: {
        video_id: roomState.video_id,
        current_video_time: playerRef.current.getCurrentTime(),
        is_playing: isPlaying,
        sentAt: Date.now()
      }
    });
  };

  useEffect(() => {
    if (!isHost) return;

    const interval = setInterval(() => {
      if (
        playerRef.current &&
        playerRef.current.getPlayerState() === window.YT.PlayerState.PLAYING
      ) {
        broadcastState();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isHost, isPlayerReady]);

  useEffect(() => {
    if (!isHost) return;

    const dbInterval = setInterval(() => {
      if (!playerRef.current) return;

      supabase.from('rooms').update({
        current_video_time: playerRef.current.getCurrentTime(),
        is_playing: playerRef.current.getPlayerState() === window.YT.PlayerState.PLAYING
      }).eq('id', roomId);

    }, 10000);

    return () => clearInterval(dbInterval);
  }, [isHost, isPlayerReady]);

  const syncPlayerFromSocket = (data: any) => {
    if (isHost || !playerRef.current || !isPlayerReady) return;

    const latency = (Date.now() - data.sentAt) / 1000;
    const targetTime = data.current_video_time + latency;

    const currentTime = playerRef.current.getCurrentTime();
    const diff = Math.abs(currentTime - targetTime);

    const playerState = playerRef.current.getPlayerState();
    const isPlaying = playerState === window.YT.PlayerState.PLAYING;

    if (data.is_playing && !isPlaying) {
      isRemoteChange.current = true;
      playerRef.current.playVideo();
      setTimeout(() => {
        isRemoteChange.current = false;
      }, 300);
    }

    if (!data.is_playing && isPlaying) {
      isRemoteChange.current = true;
      playerRef.current.pauseVideo();
      setTimeout(() => {
        isRemoteChange.current = false;
      }, 300);
    }

    if (diff > 5) {
      isRemoteChange.current = true;
      playerRef.current.seekTo(targetTime, true);
      setTimeout(() => {
        isRemoteChange.current = false;
      }, 500);
    }
  };

  const handleGuestInteraction = () => {
    setNeedsInteraction(false);
    if (playerRef.current) {
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
          Clique para entrar na sessão
        </div>
      )}
    </div>
  );
}