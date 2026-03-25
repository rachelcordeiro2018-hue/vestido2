-- Function to extract youtube id from url in postgres
CREATE OR REPLACE FUNCTION extract_youtube_id(url TEXT) 
RETURNS TEXT AS $$
DECLARE
    video_id TEXT;
BEGIN
    -- Match standard watch?v= format
    video_id := substring(url from 'v=([a-zA-Z0-9_-]{11})');
    
    -- If not found, match youtu.be/ format
    IF video_id IS NULL THEN
        video_id := substring(url from 'youtu.be/([a-zA-Z0-9_-]{11})');
    END IF;
    
    -- If not found, match embed/ format
    IF video_id IS NULL THEN
        video_id := substring(url from 'embed/([a-zA-Z0-9_-]{11})');
    END IF;

    RETURN video_id;
END;
$$ LANGUAGE plpgsql;

-- Update existing rooms
UPDATE public.rooms 
SET video_id = extract_youtube_id(video_url)
WHERE video_id IS NULL AND video_url IS NOT NULL;
