-- Add sync columns to rooms table
ALTER TABLE public.rooms 
ADD COLUMN IF NOT EXISTS video_id text,
ADD COLUMN IF NOT EXISTS current_video_time float8 DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_playing boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if sync-relevant columns changed
    IF (OLD.video_id IS DISTINCT FROM NEW.video_id OR 
        OLD.current_video_time IS DISTINCT FROM NEW.current_video_time OR 
        OLD.is_playing IS DISTINCT FROM NEW.is_playing) THEN
        NEW.updated_at = now();
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create a trigger to call the function
DROP TRIGGER IF EXISTS tr_rooms_updated_at ON public.rooms;
CREATE TRIGGER tr_rooms_updated_at
    BEFORE UPDATE ON public.rooms
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();
