-- Policy to allow a specific admin email to delete any room
CREATE POLICY "Admins can delete any room" ON public.rooms
FOR DELETE
USING (
  auth.jwt() ->> 'email' = 'linuxweb2021@gmail.com'
);

-- Also allow the host to delete their own room if not already allowed
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'rooms' AND policyname = 'Only host can delete room'
    ) THEN
        CREATE POLICY "Only host can delete room" ON public.rooms FOR DELETE USING (auth.uid() = host_id);
    END IF;
END
$$;
