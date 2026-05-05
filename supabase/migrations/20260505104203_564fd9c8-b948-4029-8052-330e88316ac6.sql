CREATE POLICY "players move their companion" ON public.npcs
FOR UPDATE TO authenticated
USING (id = (SELECT companion_npc_id FROM public.profiles WHERE id = auth.uid()))
WITH CHECK (id = (SELECT companion_npc_id FROM public.profiles WHERE id = auth.uid()));