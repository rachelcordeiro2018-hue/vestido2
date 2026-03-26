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
  const [hostPaused, setHostPaused] = useState(false);
  const [hostAbsent, setHostAbsent] = useState(false); 
  const [roomState, setRoomState] = useState<any>(roomData || null);
  const [needsInteraction, setNeedsInteraction] = useState(!isHost);

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
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [isHost]);

  useEffect(() => {
    if (!roomId) return;
    const fetchInit = async () => {
      const { data } = await supabase.from('rooms').select('*').eq('id', roomId).single();
      if (data) setRoomState(data);
    };
    fetchInit();
  }, [roomId]);

  useEffect(()