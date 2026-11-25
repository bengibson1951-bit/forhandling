import { handleConfig } from '../_shared/handlers.js';

Deno.serve((req) => handleConfig(req, Deno.env.toObject()));
