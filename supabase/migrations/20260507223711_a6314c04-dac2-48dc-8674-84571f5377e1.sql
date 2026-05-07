
DROP POLICY IF EXISTS "send private to friends" ON public.private_messages;

CREATE POLICY "send private to friends" ON public.private_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'accepted'
        AND ((f.requester_id = auth.uid() AND f.addressee_id = private_messages.recipient_id)
          OR (f.addressee_id = auth.uid() AND f.requester_id = private_messages.recipient_id))
    )
  );

DROP FUNCTION IF EXISTS public.are_friends(uuid, uuid);
