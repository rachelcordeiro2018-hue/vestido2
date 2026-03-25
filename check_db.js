import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mpokwlhvvzflfvzvmyop.supabase.co';
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wb2t3bGh2dnpmbGZ2enZteW9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyOTc0MTAsImV4cCI6MjA4OTg3MzQxMH0.At-n5zc_ScgArNIBFolF-8H4cj_A8qKKw0juqELdXcA";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkColumns() {
  const { data, error } = await supabase
    .from('rooms')
    .select('video_id, current_video_time, is_playing, updated_at')
    .limit(1);

  if (error) {
    console.error('ERROR RESPONSE:', JSON.stringify(error, null, 2));
  } else {
    console.log('SUCCESS! Columns found.');
  }
}

checkColumns();
