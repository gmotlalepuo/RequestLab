import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { LocalRepository } from './localRepo';
import { Repository } from './repository';
import { SupabaseRepository } from './supabaseRepo';

export const storageMode: 'supabase' | 'local' = isSupabaseConfigured
  ? 'supabase'
  : 'local';

export const repo: Repository =
  isSupabaseConfigured && supabase
    ? new SupabaseRepository(supabase)
    : new LocalRepository();
