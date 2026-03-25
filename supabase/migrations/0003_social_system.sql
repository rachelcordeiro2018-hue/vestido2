-- Migration: Social App System (Friends, DMs, Albums, Notifications)

-- 0. Update Users Table with Bio
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS bio text;

-- 1. Create Friends Table
CREATE TABLE IF NOT EXISTS public.friends (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.users(id) NOT NULL,
    friend_id uuid REFERENCES public.users(id) NOT NULL,
    status text DEFAULT 'pending'::text, -- 'pending', 'accepted', 'blocked'
    created_at timestamp WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, friend_id)
);

-- 2. Create Albums & Photos
CREATE TABLE IF NOT EXISTS public.albums (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.users(id) NOT NULL,
    title text NOT NULL,
    created_at timestamp WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.photos (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    album_id uuid REFERENCES public.albums(id) ON DELETE CASCADE,
    user_id uuid REFERENCES public.users(id) NOT NULL,
    url text NOT NULL,
    created_at timestamp WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Create Direct Messages
CREATE TABLE IF NOT EXISTS public.direct_messages (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    sender_id uuid REFERENCES public.users(id) NOT NULL,
    receiver_id uuid REFERENCES public.users(id) NOT NULL,
    content text,
    media_url text,
    type text DEFAULT 'text'::text, -- 'text', 'image', 'audio'
    created_at timestamp WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Create Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.users(id) NOT NULL,
    sender_id uuid REFERENCES public.users(id) NOT NULL,
    type text NOT NULL, -- 'friend_request', 'message', 'accepted'
    content text NOT NULL,
    is_read boolean DEFAULT false,
    created_at timestamp WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for all new tables
ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Polices for Friends (Users can see their own friendships)
CREATE POLICY "Users can see their own friends" ON public.friends
    FOR SELECT USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "Users can manage their own friend requests" ON public.friends
    FOR ALL USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Policies for Messages (Only sender and receiver)
CREATE POLICY "Users can see their own DMs" ON public.direct_messages
    FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can send DMs" ON public.direct_messages
    FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Fotos inseriveis pelo dono" ON public.photos
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Fotos deletaveis pelo dono" ON public.photos
    FOR DELETE USING (auth.uid() = user_id);

-- Storage Buckets: Run these in Supabase Console
-- insert into storage.buckets (id, name, public) values ('social-app', 'social-app', true);
