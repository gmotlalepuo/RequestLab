import { SupabaseRepository } from '@/src/data/supabaseRepo';
import { createClient } from './supabase/client';

let repository: SupabaseRepository | undefined;
export const getRepository = () => (repository ??= new SupabaseRepository(createClient()));
