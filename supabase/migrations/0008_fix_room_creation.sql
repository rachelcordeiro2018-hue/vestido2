-- Migration to allow users to insert their own profile
-- This is a fallback in case the auth trigger fails
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'users' AND policyname = 'Users can insert their own profile'
    ) THEN
        CREATE POLICY "Users can insert their own profile" ON public.users 
        FOR INSERT WITH CHECK (auth.uid() = id);
    END IF;
END
$$;

-- Also ensure the privacy column exists in rooms (it should already be there but just in case)
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS privacy text DEFAULT 'public';
