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

  const [isApiReady, setIsApiReady] = useState(false);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [hostAbsent, setHostAbsent] = useState(false); 
  const [roomState, setRoomState] = useState<any>(roomData || null);
  const [needsInteraction, setNeedsInteraction] = useState(!isHost);

  const handleAbsentClick = () => {
    setHostAbsent(false);
    if (playerRef.current && playerRef.current.playVideo) {
      playerRef.current.playVideo();
    }
  };

  const handleJoinClick = () => {
    setNeedsInteraction(false);
    if (playerRef.current && playerRef.current.playVideo) {
      playerRef.current.playVideo();
    }
  };

  useEffect(() => {
    const handleVisibility = () => { 
      isTabHidden.current = document.hidden;
      if (isHost && channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'host_status',
          payload: { absent: document.hidden }
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    
    if (window.YT && window.YT.Player) {
      setIsApiReady(true);
    } else {
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(tag);
      window.onYouTubeIframeAPIReady = () => setIsApiReady(true);
    }
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isHost]);

  useEffect(() => {
    if (!roomId) return;
    const fetchInit = async () => {
      const { data } = await supabase.from('rooms').select('*').eq('id', roomId).single();
      if (data) setRoomState(data);
    };
    fetchInit();
  }, [roomId]);

  useEffect(() => {
    if (roomData?.video_id && isPlayerReady && playerRef.current) {
      let curr = "";
      try { curr = playerRef.current.getVideoData().video_id; } catch(e){}
      if (roomData.video_id !== curr) {
        isRemoteChange.current = true;
        playerRef.current.loadVideoById(roomData.video_id, 0);
        setRoomState((prev: any) => ({ ...prev, video_id: roomData.video_id }));
        setTimeout(() => { isRemoteChange.current = false; }, 2500);
      }
    }
  }, [roomData?.video_id, isPlayerReady]);

  const broadcast = (playing: boolean) => {
    if (!isHost || !playerRef.current || !channelRef.current || isRemoteChange.current) return;
    if (isTabHidden.current && !playing) return;

    const currentVid = roomData?.video_id || roomState?.video_id;
    if (!currentVid) return;

    channelRef.current.send({
      type: 'broadcast',
      event: 'player_sync',
      payload: {
        video_id: currentVid,
        current_video_time: playerRef.current.getCurrentTime() || 0,
        is_playing: playing,
        sentAt: Date.now()
      }
    });
  };

  useEffect(() => {
    if (!isHost || !isPlayerReady) return;
    const intervalId = setInterval(() => {
      if (!isTabHidden.current && playerRef.current && playerRef.current.getPlayerState() === 1) {
        broadcast(true);
      }
    }, 3000); 
    return () => clearInterval(intervalId);
  }, [isHost, isPlayerReady, roomData?.video_id, roomState?.video_id]);

  useEffect(() => {
    if (!roomId) return;
    const ch = supabase.channel(`room_sync_${roomId}`);
    channelRef.current = ch;
    
    if (!isHost) {
      ch.on('broadcast', { event: 'host_status' }, ({ payload }) => {
        setHostAbsent(payload.absent);
      });

      ch.on('broadcast', { event: 'player_sync' }, ({ payload }) => {
        if (isRemoteChange.current || !playerRef.current || !playerRef.current.getCurrentTime) return;
        
        let cid = "";
        try { cid = playerRef.current.getVideoData().video_id; } catch(e){}
        if (payload.video_id !== cid) {
          isRemoteChange.current = true;
          playerRef.current.loadVideoById(payload.video_id, payload.current_video_time);
          setTimeout(() => { isRemoteChange.current = false; }, 2500);
          return;
        }

        hostPausedRef.current = !payload.is_playing;
        
        const myState = playerRef.current.getPlayerState();
        if (payload.is_playing && myState !== 1 && myState !== 3) {
          playerRef.current.playVideo();
        } else if (!payload.is_playing && myState === 1 && !hostAbsent) {
          playerRef.current.pauseVideo();
        }

        const targetTime = payload.current_video_time + ((Date.now() - payload.sentAt) / 1000);
        if (Math.abs(playerRef.current.getCurrentTime() - targetTime) > 5 && myState !== 3) {
          isRemoteChange.current = true;
          playerRef.current.seekTo(targetTime, true);
          setTimeout(() => { isRemoteChange.current = false; }, 1500);
        }
      });
    }
    
    ch.subscribe();
    return () => { ch.unsubscribe(); };
  }, [roomId, isHost, isPlayerReady, hostAbsent]);

  useEffect(() => {
    if (!isApiReady || !roomState?.video_id || playerRef.current) return;
    playerRef.current = new window.YT.Player(containerRef.current, {
      videoId: roomState.video_id,
      width: '100%',
      height: '100%',
      playerVars: { autoplay: 1, controls: 1, enablejsapi: 1, playsinline: 1 },
      events: {
        onReady: () => setIsPlayerReady(true),
        onStateChange: (e: any) => {
          if (isHost && !isRemoteChange.current) {
            if (e.data === 1) broadcast(true);
            if (e.data === 2 && !isTabHidden.current) broadcast(false);
            if (e.data === 0 && onEnded) onEnded();
          }
          if (!isHost && !isRemoteChange.current && e.data === 2 && !hostPausedRef.current && !hostAbsent) {
            playerRef.current.playVideo();
          }
        }
      }
    });
    return () => {
      if (playerRef.current && playerRef.current.destroy) {
        playerRef.current.destroy();
      }
      playerRef.current = null;
    };
  }, [isApiReady, roomState?.video_id, hostAbsent]);

  return (
    <div className="player-wrapper">
      <div className="yt-iframe-container">
        <div ref={containerRef}></div>
      </div>
      
      {!isHost && hostAbsent && (
        <div className="host-absent-overlay" onClick={handleAbsentClick}>
          <div className="absent-content">
            <p>O Host ficou ausente.</p>
            <button className="absent-play-button" type="button">
              Dar play para continuar vendo
            </button>
          </div>
        </div>
      )}

      {!isHost && needsInteraction && (
        <div className="guest-join-overlay" onClick={handleJoinClick}>
          <div className="join-content">
            <div className="pulse-button">
              <svg viewBox="0 0 24 24" fill="currentColor" width="40" height="40">
                <path d="M8