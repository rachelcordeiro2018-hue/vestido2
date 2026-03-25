-- Create Room Queue Table
CREATE TABLE public.room_queue (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id uuid REFERENCES public.rooms(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  video_url text NOT NULL,
  title text NOT NULL,
  thumbnail text,
  channel text,
  played boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Turn on RLS
ALTER TABLE public.room_queue ENABLE ROW LEVEL SECURITY;

-- Policies for room_queue
CREATE POLICY "Queues are viewable by everyone" ON public.room_queue FOR SELECT USING (true);
CREATE POLICY "Authenticated users can add to queue" ON public.room_queue FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Host can delete from queue" ON public.room_queue FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.rooms WHERE id = room_id AND host_id = auth.uid()) OR user_id = auth.uid()
);
CREATE POLICY "Host can update queue" ON public.room_queue FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.rooms WHERE id = room_id AND host_id = auth.uid())
);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_queue;
