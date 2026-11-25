import { handleStt } from '../_shared/handlers.js';

Deno.serve((req) => handleStt(req, Deno.env.toObject()));
