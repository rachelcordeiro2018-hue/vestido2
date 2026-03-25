import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useStore } from '../../store';
import { Mic, MicOff, UserPlus, Send, X } from 'lucide-react';
import './UserList.css';

interface OnlineUser {
  id: string;
  name: string;
  avatar_url: string;
  isHost?: boolean;
}

export function UserList({ roomId }: { roomId: string }) {
  const [users, setUsers] = useState<OnlineUser[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [friends, setFriends] = useState<any[]>([]);
  const currentUser = useStore(state => state.user);
  const [voiceParticipants, setVoiceParticipants] = useState<Map<string, {isMuted: boolean}>>(new Map());

  useEffect(() => {
    if (showInviteModal) fetchFriends();
  }, [showInviteModal]);

  const fetchFriends = async () => {
    const { data } = await supabase.from('friends')
      .select('*, friend:friend_id(id, name, avatar_url), me:user_id(id, name, avatar_url)')
      .eq('status', 'accepted')
      .or(`user_id.eq.${currentUser?.id},friend_id.eq.${currentUser?.id}`);
    
    if (data) {
      setFriends(data.map(f => f.user_id === currentUser?.id ? f.friend : f.me));
    }
  };

  const sendInvite = async (friendId: string) => {
    const inviteLink = window.location.href;
    await supabase.from('direct_messages').insert([{
      sender_id: currentUser?.id,
      receiver_id: friendId,
      content: `Ei! Te convidei para uma sala no RaveX! Clique no link para entrar: ${inviteLink}`,
      type: 'text'
    }]);
    alert('Convite enviado via Chat!');
  };

  useEffect(() => {
    const voiceChannel = supabase.channel(`voice_presence:${roomId}`);
    
    voiceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = voiceChannel.presenceState();
        const voiceMap = new Map();
        Object.values(state).forEach((p: any) => {
          voiceMap.set(p[0].userId, { isMuted: p[0].isMuted });
        });
        setVoiceParticipants(voiceMap);
      })
      .subscribe();

    return () => { voiceChannel.unsubscribe(); };
  }, [roomId]);

  useEffect(() => {
    // Basic presence via Supabase Realtime
    const channel = supabase.channel(`presence:${roomId}`, {
      config: {
        presence: {
          key: currentUser?.id,
        },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const newState = channel.presenceState();
        const onlineUsers = Object.values(newState).map((u: any) => ({
          id: u[0].id,
          name: u[0].name || 'User',
          avatar_url: u[0].avatar_url || 'https://ui-avatars.com/api/?name=User&background=random',
        }));
        
        // Remove duplicates just in case
        const uniqueUsers = Array.from(new Map(onlineUsers.map(item => [item.id, item])).values());
        setUsers(uniqueUsers);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && currentUser) {
          await channel.track({
            id: currentUser.id,
            name: currentUser.name || currentUser.email,
            avatar_url: currentUser.avatar_url,
          });
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [roomId, currentUser]);

  return (
    <div className="user-list">
      <div className="users-header">
        <span className="text-secondary">{users.length} pessoa{users.length !== 1 ? 's' : ''} online</span>
        <button className="btn-invite-friends" onClick={() => setShowInviteModal(true)}>
          <UserPlus size={18} /> Convidar
        </button>
      </div>
      
      <div className="users-container">
        {users.map(u => {
          const vInfo = voiceParticipants.get(u.id);
          const isInVoice = !!vInfo;

          return (
            <div key={u.id} className="user-item">
              <div className="user-info">
                <div className="avatar-wrapper">
                  <img src={u.avatar_url} alt={u.name} className="user-avatar" />
                  <div className={`status-indicator ${isInVoice ? 'voice-active' : ''}`}></div>
                </div>
                <div className="user-name-wrapper">
                  <span className="user-name">{u.name} {u.id === currentUser?.id ? '(Você)' : ''}</span>
                  {isInVoice && (
                    <div className="voice-indicator-icon">
                      {vInfo?.isMuted ? <MicOff size={12} className="text-error" /> : <Mic size={12} className="text-accent" />}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showInviteModal && (
        <div className="invite-modal-overlay animate-fade-in">
          <div className="invite-modal glass-panel">
            <div className="modal-header">
              <h3>Convidar Amigos</h3>
              <button 
                className="btn-icon" 
                onClick={() => setShowInviteModal(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="friends-invite-list">
              {friends.map(f => (
                <div key={f.id} className="friend-invite-item">
                  <div className="friend-info">
                    <img src={f.avatar_url || 'https://ui-avatars.com/api/?name=' + f.name} alt="avatar" />
                    <span>{f.name}</span>
                  </div>
                  <button className="btn-icon text-accent" onClick={() => sendInvite(f.id)}>
                    <Send size={18} />
                  </button>
                </div>
              ))}
              {friends.length === 0 && <p className="empty-text">Você ainda não tem amigos aceitos.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
