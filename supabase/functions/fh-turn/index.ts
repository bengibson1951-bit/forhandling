import { handleTurn } from '../_shared/handlers.js';

Deno.serve((req) => handleTurn(req, Deno.env.toObject()));
