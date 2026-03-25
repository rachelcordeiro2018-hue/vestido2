import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useStore } from '../store';
import { Send, Image, Mic, X, Trash2, ArrowLeft, MessageCircle, StopCircle, Play, Pause } from 'lucide-react';
import { format } from 'date-fns';
import './ChatCenter.css';

function AudioMessage({ url }: { url: string }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div className="custom-audio-player">
      <button className="play-btn-dm" onClick={togglePlay}>
        {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
      </button>
      <div className="audio-visualizer-dm">
        <div className="visualizer-bar"></div>
        <div className="visualizer-bar"></div>
        <div className="visualizer-bar"></div>
        <div className="visualizer-bar"></div>
      </div>
      <audio 
        ref={audioRef} 
        src={url} 
        onEnded={() => setIsPlaying(false)} 
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />
    </div>
  );
}

export function ChatCenter() {
  const { friendId } = useParams();
  const user = useStore(state => state.user);
  const [friends, setFriends] = useState<any[]>([]);
  const [selectedFriend, setSelectedFriend] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) fetchFriends();
  }, [user]);

  useEffect(() => {
    if (friendId && friends.length > 0) {
      const friend = friends.find(f => f.id === friendId);
      if (friend) setSelectedFriend(friend);
    }
  }, [friendId, friends]);

  useEffect(() => {
    if (selectedFriend) {
      fetchMessages();
      const channel = supabase.channel(`dm:${selectedFriend.id}`)
        .on('postgres_changes', { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'direct_messages',
          filter: `or(and(sender_id.eq.${user?.id},receiver_id.eq.${selectedFriend.id}),and(sender_id.eq.${selectedFriend.id},receiver_id.eq.${user?.id}))`
        }, (payload) => {
          setMessages(prev => [...prev, payload.new]);
          scrollToBottom();
        })
        .subscribe();
      
      return () => { channel.unsubscribe(); };
    }
  }, [selectedFriend]);

  const fetchFriends = async () => {
    const { data } = await supabase.from('friends')
      .select('*, friend:friend_id(id, name, avatar_url), me:user_id(id, name, avatar_url)')
      .eq('status', 'accepted')
      .or(`user_id.eq.${user?.id},friend_id.eq.${user?.id}`);
    
    if (data) {
      setFriends(data.map(f => f.user_id === user?.id ? f.friend : f.me));
    }
  };

  const fetchMessages = async () => {
    const { data } = await supabase.from('direct_messages')
      .select('*')
      .or(`and(sender_id.eq.${user?.id},receiver_id.eq.${selectedFriend.id}),and(sender_id.eq.${selectedFriend.id},receiver_id.eq.${user?.id})`)
      .order('created_at', { ascending: true });
    
    if (data) {
      setMessages(data);
      scrollToBottom();
    }
  };

  const sendMessage = async (content?: string, mediaUrl?: string, type: 'text' | 'image' | 'audio' = 'text') => {
    if (!user || !selectedFriend) return;
    if (!content && !mediaUrl) return;

    const { error } = await supabase.from('direct_messages').insert([{
      sender_id: user.id,
      receiver_id: selectedFriend.id,
      content,
      media_url: mediaUrl,
      type
    }]);

    if (error) {
      console.error('Erro ao enviar mensagem:', error);
      alert('Erro ao enviar mensagem no banco de dados. Verifique a tabela direct_messages.');
    } else {
      setNewMessage('');
      setAudioBlob(null);
      scrollToBottom();
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // Audio Recording Logic
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      
      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setAudioBlob(blob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
    } catch (err) {
      alert('Permissão de microfone negada');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  const sendAudio = async () => {
    if (!audioBlob || !user) {
      console.warn('Sem áudio ou usuário para enviar');
      return;
    }
    
    const fileName = `voice-${Date.now()}.webm`;
    const filePath = `chat-media/audio/${fileName}`;
    
    console.log('Iniciando upload de áudio:', filePath);

    const { error: uploadError } = await supabase.storage
      .from('social-app')
      .upload(filePath, audioBlob, { contentType: 'audio/webm' });

    if (uploadError) {
      console.error('Erro no upload de áudio:', uploadError);
      alert('Falha ao subir áudio: ' + uploadError.message);
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('social-app')
      .getPublicUrl(filePath);

    console.log('Upload concluído, enviando DM com URL:', publicUrl);
    await sendMessage(undefined, publicUrl, 'audio');
  };

  const handleImageUpload = async (e: any) => {
    const file = e.target.files[0];
    if (!file || !user) return;
    
    const fileName = `img-${Date.now()}.${file.name.split('.').pop()}`;
    const filePath = `chat-media/images/${fileName}`;
    
    const { error } = await supabase.storage.from('social-app').upload(filePath, file);
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('social-app').getPublicUrl(filePath);
      sendMessage(undefined, publicUrl, 'image');
    }
  };

  const playAudioBlob = () => {
    if (audioBlob) {
      const url = URL.createObjectURL(audioBlob);
      const audio = new Audio(url);
      audio.play();
    }
  };

  return (
    <div className="chat-center">
      {/* Sidebar - Friends List */}
      <div className={`chat-sidebar ${selectedFriend ? 'hidden-mobile' : ''}`}>
        <div className="chat-sidebar-header">
          <h3>Mensagens</h3>
        </div>
        <div className="chat-friends-list">
          {friends.map(friend => (
            <div 
              key={friend.id} 
              className={`chat-friend-item ${selectedFriend?.id === friend.id ? 'active' : ''}`}
              onClick={() => setSelectedFriend(friend)}
            >
              <img src={friend.avatar_url || 'https://ui-avatars.com/api/?name=' + friend.name} alt="avatar" />
              <div className="chat-friend-info">
                <h4>{friend.name}</h4>
                <p className="text-secondary text-xs">Clique para conversar</p>
              </div>
            </div>
          ))}
          {friends.length === 0 && <p className="text-center p-8 text-secondary text-sm">Adicione amigos para começar a conversar!</p>}
        </div>
      </div>

      {/* Main Chat Area */}
      {selectedFriend ? (
        <div className="chat-window">
          <div className="chat-window-header">
            <button className="chat-back-btn" onClick={() => setSelectedFriend(null)}><ArrowLeft size={24} /></button>
            <img src={selectedFriend.avatar_url || 'https://ui-avatars.com/api/?name=' + selectedFriend.name} alt="avatar" />
            <div className="chat-window-info">
              <h4>{selectedFriend.name}</h4>
              <span className="online-indicator">Online</span>
            </div>
          </div>

          <div className="chat-messages-scroll">
            {messages.map((msg, i) => {
              const isMe = msg.sender_id === user?.id;
              return (
                <div key={i} className={`chat-message-bubble ${isMe ? 'me' : 'other'}`}>
                  {msg.type === 'text' && <p>{msg.content}</p>}
                  {msg.type === 'image' && <img src={msg.media_url} alt="Shared" className="chat-image-preview" />}
                  {msg.type === 'audio' && <AudioMessage url={msg.media_url} />}
                  <span className="chat-timestamp">{format(new Date(msg.created_at), 'HH:mm')}</span>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input-area">
            {audioBlob ? (
              <div className="audio-preview-bar">
                <button className="btn-icon text-error" onClick={() => setAudioBlob(null)} title="Excluir"><Trash2 size={20} /></button>
                <div className="audio-blob-info">
                  <button className="btn-icon text-primary" onClick={playAudioBlob} title="Ouvir"><Play size={20} /></button>
                  <span>Áudio pronto</span>
                </div>
                <button className="btn-icon text-accent" onClick={sendAudio} title="Enviar"><Send size={20} /></button>
              </div>
            ) : isRecording ? (
              <div className="audio-recording-bar">
                <div className="recorder-pulse"></div>
                <span className="record-time">{Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}</span>
                <span className="record-label">Gravando...</span>
                <div className="recorder-actions">
                  <button className="btn-icon text-error" onClick={() => { stopRecording(); setTimeout(() => setAudioBlob(null), 10); }} title="Cancelar"><X size={24} /></button>
                  <button className="btn-icon text-success" onClick={stopRecording} title="Parar e Enviar"><StopCircle size={24} /></button>
                </div>
              </div>
            ) : (
              <>
                <label className="btn-icon-label">
                  <Image size={22} className="text-secondary" />
                  <input type="file" hidden accept="image/*" onChange={handleImageUpload} />
                </label>
                <button className="btn-icon" onClick={startRecording}><Mic size={22} className="text-secondary" /></button>
                <input 
                  type="text" 
                  placeholder="Mensagem..." 
                  className="chat-text-input"
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage(newMessage)}
                />
                <button className="btn-icon btn-send-private" onClick={() => sendMessage(newMessage)} disabled={!newMessage.trim()}>
                  <Send size={22} />
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="chat-empty-container desktop-only">
          <MessageCircle size={64} className="text-secondary mb-4 opacity-20" />
          <p className="text-secondary">Selecione um amigo para iniciar uma conversa secreta.</p>
        </div>
      )}
    </div>
  );
}
