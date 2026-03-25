import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useStore } from '../../store';
import { Send, Smile, Mic, MicOff, Phone, PhoneOff, User as UserIcon } from 'lucide-react';
import { format } from 'date-fns';
import Peer from 'peerjs';
import type { MediaConnection } from 'peerjs';
import './LiveChat.css';

interface Message {
  id: string;
  content: string;
  user_id: string;
  created_at: string;
  profiles: { name: string; avatar_url: string };
}

interface RemoteStream {
  peerId: string;
  stream: MediaStream;
}

export function LiveChat({ roomId }: { roomId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [voiceParticipants, setVoiceParticipants] = useState<{name: string, peerId: string, isMuted?: boolean}[]>([]);
  const user = useStore(state => state.user);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Voice Chat Refs
  const peerRef = useRef<Peer | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const callsRef = useRef<Map<string, MediaConnection>>(new Map());
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);

  // Cleanup on unmount or voice exit
  const stopVoice = () => {
    setIsVoiceActive(false);
    setIsMuted(false);
    
    // Stop local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    // Close all active calls
    callsRef.current.forEach(call => call.close());
    callsRef.current.clear();

    // Destroy peer
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }

    setRemoteStreams([]);
  };

  const channelRef = useRef<any>(null);

  const toggleMute = () => {
    if (localStreamRef.current) {
      const newMuted = !isMuted;
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !newMuted;
      });
      setIsMuted(newMuted);
    }
  };

  // Separate effect to track presence updates when muted or active state changes
  useEffect(() => {
    if (isVoiceActive && channelRef.current && user && peerRef.current) {
      channelRef.current.track({
        name: user.name || 'Vitor',
        peerId: peerRef.current.id,
        userId: user.id,
        isMuted: isMuted,
        active: true
      });
    }
  }, [isMuted, isVoiceActive, user]);

  const toggleVoice = async () => {
    if (isVoiceActive) {
      stopVoice();
      return;
    }

    try {
      // 1. Get audio stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;

      // 2. Initialize PeerJS
      const peer = new Peer(user?.id || 'anonymous-' + Math.random().toString(36).substr(2, 9), {
        debug: 1,
      });

      peerRef.current = peer;

      peer.on('open', (id) => {
        console.log('Peer ID is ' + id);
        setIsVoiceActive(true);
      });

      // Handle incoming calls
      peer.on('call', (call) => {
        console.log('Receiving call from: ', call.peer);
        call.answer(stream);
        setupCallListeners(call);
      });

      peer.on('error', (err) => {
        console.error('Peer error:', err);
      });

    } catch (err) {
      console.error('Failed to get local stream', err);
      alert('Não foi possível acessar seu microfone.');
    }
  };

  const setupCallListeners = (call: MediaConnection) => {
    call.on('stream', (remoteStream) => {
      console.log('Adding remote stream from: ', call.peer);
      setRemoteStreams(prev => {
        if (prev.find(s => s.peerId === call.peer)) return prev;
        return [...prev, { peerId: call.peer, stream: remoteStream }];
      });
    });

    call.on('close', () => {
      setRemoteStreams(prev => prev.filter(s => s.peerId !== call.peer));
      callsRef.current.delete(call.peer);
    });

    callsRef.current.set(call.peer, call);
  };

  // Sync Voice Presence via Supabase
  useEffect(() => {
    if (!user) return;

    const voiceChannel = supabase.channel(`voice_presence:${roomId}`, {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    channelRef.current = voiceChannel;

    voiceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = voiceChannel.presenceState();
        const activePeers = Object.values(state).map((p: any) => ({
          name: p[0].name,
          peerId: p[0].peerId,
          userId: p[0].userId,
          isMuted: p[0].isMuted
        }));
        
        setVoiceParticipants(activePeers);

        // If I am active, call new people
        if (isVoiceActive && peerRef.current && localStreamRef.current) {
          activePeers.forEach(p => {
            if (p.userId !== user.id && !callsRef.current.has(p.peerId)) {
                if (user.id < p.userId) {
                    console.log('Calling peer: ', p.peerId);
                    const call = peerRef.current!.call(p.peerId, localStreamRef.current!);
                    setupCallListeners(call);
                }
            }
          });
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && isVoiceActive && peerRef.current) {
          await voiceChannel.track({
            name: user.name || 'Vitor',
            peerId: peerRef.current.id,
            userId: user.id,
            isMuted: isMuted,
            active: true
          });
        }
      });

    return () => { 
      channelRef.current = null;
      voiceChannel.unsubscribe(); 
    };
  }, [roomId, isVoiceActive, user]);

  useEffect(() => {
    // Cleanup on unmount
    return () => stopVoice();
  }, []);

  useEffect(() => {
    // Fetch existing messages
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*, profiles:users(name, avatar_url)')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })
        .limit(50);

      if (!error && data) {
        setMessages(data as any);
        scrollToBottom();
      }
    };

    fetchMessages();

    // Subscribe to new messages
    const channel = supabase.channel(`room_messages:${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
        async (payload) => {
          const { data } = await supabase.from('users').select('name, avatar_url').eq('id', payload.new.user_id).single();
          const newMsg = { ...payload.new, profiles: data } as Message;
          setMessages(prev => [...prev, newMsg]);
          scrollToBottom();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [roomId]);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user) return;

    const messageToSend = newMessage;
    setNewMessage('');
    
    const { error } = await supabase
      .from('messages')
      .insert([{ content: messageToSend, room_id: roomId, user_id: user.id }]);

    if (error) {
      console.error('Error sending message:', error);
      alert('Erro ao enviar mensagem');
      setNewMessage(messageToSend);
    }
  };

  return (
    <div className="live-chat">
      <div className="chat-voice-header">
        <div className="voice-info">
          <div className={`voice-status ${isVoiceActive ? 'activepulse' : ''}`}>
            {isVoiceActive ? (isMuted ? <MicOff size={16} /> : <Mic size={16} />) : <MicOff size={16} />}
          </div>
          <div className="voice-text">
            <h4>Canal de Voz</h4>
            <div className="voice-participants-list">
              {voiceParticipants.length === 0 ? (
                <span className="text-secondary text-xs">Vazio</span>
              ) : (
                voiceParticipants.map(p => (
                  <div key={p.peerId} className="participant-badge" title={p.name}>
                    <UserIcon size={10} /> 
                    {p.name}
                    {p.isMuted && <MicOff size={10} className="text-error" style={{ marginLeft: '4px' }} />}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        <div className="voice-controls">
          {isVoiceActive && (
            <button 
              className={`btn-icon voice-mute-btn ${isMuted ? 'muted' : ''}`}
              onClick={toggleMute}
              title={isMuted ? "Desmutar" : "Mutar"}
            >
              {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
          )}
          <button 
            className={`btn-voice-toggle ${isVoiceActive ? 'active' : ''}`}
            onClick={toggleVoice}
          >
            {isVoiceActive ? <PhoneOff size={18} /> : <Phone size={18} />}
            {isVoiceActive ? 'Sair' : 'Entrar'}
          </button>
        </div>
      </div>

      {/* Hidden Audio Players for voice chat */}
      <div className="voice-audio-elements" style={{ display: 'none' }}>
        {remoteStreams.map(rs => (
          <AudioPlayer key={rs.peerId} stream={rs.stream} />
        ))}
      </div>

      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="empty-chat text-secondary">A sala está silenciosa. Seja o primeiro a falar!</div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.user_id === user?.id;
            return (
              <div key={msg.id} className={`message ${isMe ? 'message-me' : 'message-other'}`}>
                {!isMe && (
                  <img 
                    src={msg.profiles?.avatar_url || 'https://ui-avatars.com/api/?name=User&background=random'} 
                    alt="avatar" 
                    className="message-avatar" 
                  />
                )}
                <div className="message-content-wrapper">
                  {!isMe && <span className="message-author">{msg.profiles?.name || 'User'}</span>}
                  <div className="message-bubble">
                    {msg.content}
                  </div>
                  <span className="message-time">
                    {format(new Date(msg.created_at), 'HH:mm')}
                  </span>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-form" onSubmit={sendMessage}>
        <div className="input-wrapper">
          <input
            type="text"
            className="input chat-input"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Digite algo..."
          />
          <button type="button" className="btn-icon emoji-btn">
            <Smile size={20} className="text-secondary" />
          </button>
        </div>
        <button type="submit" className="btn-icon send-btn" disabled={!newMessage.trim()}>
          <Send size={20} />
        </button>
      </form>
    </div>
  );
}

// Simple internal component to handle audio stream attachment
function AudioPlayer({ stream }: { stream: MediaStream }) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.srcObject = stream;
    }
  }, [stream]);

  return <audio ref={audioRef} autoPlay />;
}
