import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { supabase } from '../lib/supabase';
import { Camera, Edit2, Grid, Folder, Plus, Trash2, Check, X } from 'lucide-react';
import './Profile.css';

export function Profile() {
  const user = useStore(state => state.user);
  const [profile, setProfile] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [newBio, setNewBio] = useState('');
  const [newName, setNewName] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (user) {
      fetchProfile();
      fetchPhotos();
    }
  }, [user]);

  const fetchProfile = async () => {
    const { data } = await supabase.from('users').select('*').eq('id', user?.id).single();
    if (data) {
      setProfile(data);
      setNewBio(data.bio || '');
      setNewName(data.name || '');
    }
  };

  const fetchPhotos = async () => {
    const { data } = await supabase.from('photos').select('*').eq('user_id', user?.id).order('created_at', { ascending: false });
    if (data) setPhotos(data);
  };

  const setUser = useStore(state => state.setUser);

  const updateProfile = async () => {
    const { error } = await supabase.from('users').update({ 
      bio: newBio,
      name: newName
    }).eq('id', user?.id);

    if (!error) {
      setIsEditing(false);
      if (user) {
        setUser({ ...user, name: newName });
      }
      fetchProfile();
    }
  };

  const handleFileUpload = async (e: any, isAvatar: boolean = false) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setUploading(true);
    
    const file = e.target.files[0];
    const fileExt = file.name.split('.').pop();
    const fileName = `${user?.id}-${Math.random()}.${fileExt}`;
    const filePath = isAvatar ? `avatars/${fileName}` : `albums/${fileName}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from('social-app')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('social-app')
        .getPublicUrl(filePath);

      if (isAvatar) {
        // Update user profile picture
        const { error: updateError } = await supabase
          .from('users')
          .update({ avatar_url: publicUrl })
          .eq('id', user?.id);
        
        if (updateError) throw updateError;
        
        // Update local store
        if (user) {
          setUser({ ...user, avatar_url: publicUrl });
        }
        fetchProfile();
      } else {
        // Add to photos table (Album)
        await supabase.from('photos').insert([{
          user_id: user?.id,
          url: publicUrl
        }]);
        fetchPhotos();
      }
    } catch (err) {
      console.error(err);
      alert('Erro no upload');
    } finally {
      setUploading(false);
    }
  };

  const deletePhoto = async (id: string) => {
    if (!window.confirm('Excluir esta foto permanentemente?')) return;
    
    const { error } = await supabase.from('photos').delete().eq('id', id);
    
    if (error) {
      console.error('Erro ao excluir:', error);
      alert('Erro ao excluir a foto. Verifique se você tem permissão no banco de dados.');
    } else {
      fetchPhotos();
    }
  };

  if (!profile) return <div className="p-8 text-center">Carregando perfil...</div>;

  return (
    <div className="profile-page animate-fade-in">
      <div className="profile-header">
        <div className="profile-avatar-section">
          <div className="profile-avatar-container">
            <img 
              src={profile.avatar_url || 'https://ui-avatars.com/api/?name=User&background=random'} 
              alt="Avatar" 
              className="profile-avatar-large" 
            />
            <label className="avatar-upload-label">
              {uploading ? <div className="spinner-sm"></div> : <Camera size={20} />}
              <input type="file" hidden accept="image/*" onChange={(e) => handleFileUpload(e, true)} disabled={uploading} />
            </label>
          </div>
        </div>

        <div className="profile-info-section">
          <div className="profile-top-row">
            {isEditing ? (
              <input 
                type="text" 
                className="input-name-edit" 
                value={newName} 
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Seu nome"
              />
            ) : (
              <h2 className="profile-name">{profile.name}</h2>
            )}
            <button className="btn-secondary btn-sm" onClick={() => setIsEditing(!isEditing)}>
              {isEditing ? <X size={16} /> : <Edit2 size={16} />} 
              {isEditing ? 'Cancelar' : 'Editar Perfil'}
            </button>
          </div>

          <div className="profile-stats">
            <div className="stat-item"><strong>{photos.length}</strong> publicações</div>
            <div className="stat-item"><strong>0</strong> amigos</div>
          </div>

          <div className="profile-bio-container">
            {isEditing ? (
              <div className="edit-bio-wrapper">
                <textarea 
                  className="bio-textarea" 
                  value={newBio} 
                  onChange={(e) => setNewBio(e.target.value)}
                  placeholder="Conte algo sobre você..."
                />
                <button className="btn-primary btn-sm" onClick={updateProfile}>
                  <Check size={16} /> Salvar Bio
                </button>
              </div>
            ) : (
              <p className="profile-bio">{profile.bio || 'Adicione uma bio ao seu perfil!'}</p>
            )}
          </div>
        </div>
      </div>

      <div className="profile-tabs">
        <div className="profile-tab active"><Grid size={18} /> Publicações</div>
        <div className="profile-tab"><Folder size={18} /> Álbuns</div>
      </div>

      <div className="photo-gallery">
        <label className="upload-card">
          <div className="upload-content">
            {uploading ? <div className="pulse-loader"></div> : <Plus size={32} />}
            <span>Nova Foto</span>
          </div>
          <input type="file" hidden multiple accept="image/*" onChange={(e) => handleFileUpload(e, false)} disabled={uploading} />
        </label>

        {photos.map(photo => (
          <div key={photo.id} className="gallery-card group">
            <img src={photo.url} alt="Gallery" className="gallery-photo" loading="lazy" />
            <div className="gallery-overlay">
              <button className="btn-delete" onClick={() => deletePhoto(photo.id)}>
                <Trash2 size={20} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
