import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mpokwlhvvzflfvzvmyop.supabase.co';
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wb2t3bGh2dnpmbGZ2enZteW9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyOTc0MTAsImV4cCI6MjA4OTg3MzQxMH0.At-n5zc_ScgArNIBFolF-8H4cj_A8qKKw0juqELdXcA";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkRoomsTable() {
  // We can't query information_schema with anon key usually, 
  // but we can try to insert a dummy record and see the error or check columns via select.
  
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Check Error:', error);
  } else {
    console.log('Sample Room Data:', data[0]);
    // Check if privacy exists and its value
    if (data[0]) {
        console.log('Privacy value type:', typeof data[0].privacy);
    }
  }
}

checkRoomsTable();
