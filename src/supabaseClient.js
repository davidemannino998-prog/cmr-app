import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://zoesqlpavxhbmfmxtbzw.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvZXNxbHBhdnhoYm1mbXh0Ynp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MjM0MzksImV4cCI6MjA5NzE5OTQzOX0.eb8JXnnlTFwZsyb-dW9r-E6vxt-Bd688Vei9B1XtQEs'

export const supabase = createClient(supabaseUrl, supabaseKey)
