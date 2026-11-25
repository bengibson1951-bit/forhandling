import { handleDebrief } from '../_shared/handlers.js';

Deno.serve((req) => handleDebrief(req, Deno.env.toObject()));
