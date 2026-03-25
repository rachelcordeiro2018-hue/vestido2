-- Create Function to get server time for clock synchronization
CREATE OR REPLACE FUNCTION public.get_server_time()
RETURNS timestamp with time zone AS $$
BEGIN
  RETURN now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
