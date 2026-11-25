import { handleTts } from '../_shared/handlers.js';

Deno.serve((req) => handleTts(req, Deno.env.toObject()));
